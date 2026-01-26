import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bad(message: string, status = 400) {
  return ok({ error: message }, status);
}

interface VolumeData {
  volume1h: number;
  volumeAvg: number;
  volumeChangePercent: number;
}

async function fetchVolumeData(tokenMint: string): Promise<VolumeData | null> {
  try {
    // Fetch from DexScreener
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const pair = data?.pairs?.[0];
    
    if (!pair) return null;

    // Get volume metrics
    const volume1h = pair.volume?.h1 || 0;
    const volume24h = pair.volume?.h24 || 0;
    
    // Calculate hourly average from 24h volume
    const volumeAvg = volume24h / 24;
    
    // Calculate percentage change from average
    const volumeChangePercent = volumeAvg > 0 
      ? ((volume1h - volumeAvg) / volumeAvg) * 100 
      : 0;

    return {
      volume1h,
      volumeAvg,
      volumeChangePercent,
    };
  } catch (e) {
    console.error(`Volume fetch failed for ${tokenMint}:`, e);
    return null;
  }
}

async function fetchSolPrice(): Promise<number> {
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  try {
    const res = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", {
      headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
    });
    const json = await res.json();
    const price = json?.data?.['So11111111111111111111111111111111111111112']?.price;
    if (price) return Number(price);
  } catch (e) {
    console.error("Jupiter SOL price failed:", e);
  }
  return 180; // Fallback default
}

async function fetchTokenPrice(tokenMint: string): Promise<number | null> {
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${tokenMint}`, {
      headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
    });
    const json = await res.json();
    const price = json?.data?.[tokenMint]?.price;
    if (price) return Number(price);
  } catch (e) {
    console.error(`Jupiter price fetch failed for ${tokenMint}:`, e);
  }
  
  // Fallback to DexScreener
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      const pair = data?.pairs?.[0];
      if (pair?.priceUsd) return Number(pair.priceUsd);
    }
  } catch (e) {
    console.error(`DexScreener price fetch failed for ${tokenMint}:`, e);
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[flipit-deep-order-monitor] Starting deep (volume-based) order check...");

    // Mark expired orders first
    const now = new Date().toISOString();
    const { data: expiredOrders } = await supabase
      .from("flip_limit_orders")
      .update({ status: "expired" })
      .eq("status", "watching")
      .eq("monitoring_mode", "deep")
      .lt("expires_at", now)
      .select("id, token_symbol");

    if (expiredOrders && expiredOrders.length > 0) {
      console.log(`Expired ${expiredOrders.length} deep limit order(s)`);
    }

    // Get all active deep monitoring limit orders
    const { data: orders, error: ordersErr } = await supabase
      .from("flip_limit_orders")
      .select("*")
      .eq("status", "watching")
      .eq("monitoring_mode", "deep")
      .gt("expires_at", now);

    if (ordersErr) {
      console.error("Failed to fetch deep limit orders:", ordersErr);
      return bad("Failed to fetch deep limit orders");
    }

    if (!orders || orders.length === 0) {
      return ok({ message: "No active deep limit orders", executed: [] });
    }

    console.log(`Monitoring ${orders.length} deep limit order(s)`);

    const solPrice = await fetchSolPrice();
    const executed: unknown[] = [];

    // Check each order for volume trigger
    for (const order of orders) {
      const volumeData = await fetchVolumeData(order.token_mint);
      
      if (!volumeData) {
        console.log(`No volume data for ${order.token_mint}`);
        continue;
      }

      const { volumeChangePercent } = volumeData;
      const triggerDelta = order.volume_trigger_delta || 50; // Default 50%
      const direction = order.volume_direction || 'rise';

      console.log(`Order ${order.id}: volume change=${volumeChangePercent.toFixed(1)}%, trigger=${triggerDelta}%, direction=${direction}`);

      // Check if volume meets trigger criteria
      const isTriggered = direction === 'rise'
        ? volumeChangePercent >= triggerDelta
        : volumeChangePercent <= -triggerDelta;

      if (isTriggered) {
        console.log(`DEEP BUY TRIGGERED for ${order.token_mint}! Volume ${direction}: ${volumeChangePercent.toFixed(1)}%`);

        try {
          // Get current price for the buy
          const currentPrice = await fetchTokenPrice(order.token_mint);
          if (!currentPrice) {
            console.log(`Cannot get price for ${order.token_mint}, skipping execution`);
            continue;
          }

          const buyAmountUsd = order.buy_amount_sol * solPrice;

          console.log(`Executing deep buy: ${order.buy_amount_sol} SOL ($${buyAmountUsd.toFixed(2)}) at $${currentPrice}`);

          // Create new position via flipit-execute
          const { data: buyResult, error: buyError } = await supabase.functions.invoke("flipit-execute", {
            body: {
              action: "buy",
              tokenMint: order.token_mint,
              walletId: order.wallet_id,
              buyAmountUsd: buyAmountUsd,
              displayPriceUsd: currentPrice,
              targetMultiplier: order.target_multiplier,
              slippageBps: order.slippage_bps,
              priorityFeeMode: order.priority_fee_mode,
            }
          });

          if (buyError) throw new Error(buyError.message);
          if (buyResult?.error) throw new Error(buyResult.error);

          const newPositionId = buyResult?.position?.id;
          const signature = buyResult?.position?.buy_signature;

          // Update limit order as executed
          await supabase
            .from("flip_limit_orders")
            .update({
              status: "executed",
              executed_at: new Date().toISOString(),
              executed_position_id: newPositionId || null,
            })
            .eq("id", order.id);

          executed.push({
            orderId: order.id,
            positionId: newPositionId,
            tokenMint: order.token_mint,
            tokenSymbol: order.token_symbol,
            volumeChange: volumeChangePercent,
            direction,
            buyAmountSol: order.buy_amount_sol,
            buyAmountUsd,
            signature,
          });

          console.log(`Deep buy executed for ${order.token_mint}: position ${newPositionId}`);

          // Send email notification if configured
          if (order.notification_email) {
            try {
              await supabase.functions.invoke("send-email-notification", {
                body: {
                  to: order.notification_email,
                  subject: `🌊 Volume ${direction === 'rise' ? 'Surge' : 'Dump'} Triggered: ${order.token_symbol || order.token_mint.slice(0, 8)}`,
                  title: "Deep Limit Buy Executed!",
                  message: `
<strong>Token:</strong> ${order.token_name || order.token_symbol || "Unknown"} (${order.token_symbol || order.token_mint.slice(0, 8)})

<strong>Trigger Details:</strong>
• Volume Change: <strong>${volumeChangePercent.toFixed(1)}%</strong> (${direction})
• Trigger Threshold: ${triggerDelta}%
• Amount: <strong>${order.buy_amount_sol.toFixed(4)} SOL ($${buyAmountUsd.toFixed(2)} USD)</strong>
• Target: <strong>${order.target_multiplier}x</strong>

Your volume-based limit order has been successfully executed!
                  `,
                  type: "success",
                  metadata: {
                    tokenMint: order.token_mint,
                    actionUrl: signature ? `https://solscan.io/tx/${signature}` : null,
                    actionText: "View Transaction",
                    chartUrl: `https://dexscreener.com/solana/${order.token_mint}`,
                  }
                }
              });
              console.log("Deep buy notification email sent");
            } catch (emailErr) {
              console.error("Failed to send deep buy notification email:", emailErr);
            }
          }

        } catch (buyErr: unknown) {
          console.error(`Failed to execute deep buy for order ${order.id}:`, buyErr);
        }
      }
    }

    return ok({
      message: `Monitored ${orders.length} deep limit order(s)`,
      executed,
      expiredCount: expiredOrders?.length || 0,
      checkedAt: new Date().toISOString()
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("FlipIt deep order monitor error:", message);
    return bad(message, 500);
  }
});
