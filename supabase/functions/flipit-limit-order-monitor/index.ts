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

async function fetchTokenPrices(tokenMints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  // Batch fetch from Jupiter (up to 100 at a time)
  const chunks = [];
  for (let i = 0; i < tokenMints.length; i += 100) {
    chunks.push(tokenMints.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const ids = chunk.join(",");
      const res = await fetch(`https://price.jup.ag/v6/price?ids=${ids}`);
      const json = await res.json();
      
      for (const mint of chunk) {
        const price = json?.data?.[mint]?.price;
        if (price) {
          prices[mint] = Number(price);
        }
      }
    } catch (e) {
      console.error("Jupiter batch price fetch failed:", e);
    }
  }

  // For any missing prices, try DexScreener
  const missing = tokenMints.filter(m => !prices[m]);
  for (const mint of missing) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      if (res.ok) {
        const data = await res.json();
        const pair = data?.pairs?.[0];
        if (pair?.priceUsd) {
          prices[mint] = Number(pair.priceUsd);
        }
      }
    } catch (e) {
      console.error(`DexScreener price fetch failed for ${mint}:`, e);
    }
  }

  return prices;
}

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch("https://price.jup.ag/v6/price?ids=SOL");
    const json = await res.json();
    const price = json?.data?.SOL?.price;
    if (price) return Number(price);
  } catch (e) {
    console.error("Jupiter SOL price failed:", e);
  }
  
  // Fallback to CoinGecko
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const json = await res.json();
    if (json?.solana?.usd) return Number(json.solana.usd);
  } catch (e) {
    console.error("CoinGecko SOL price failed:", e);
  }
  
  return 180; // Fallback default
}

async function sendTweet(supabase: any, tweetData: {
  type: 'buy' | 'sell' | 'rebuy' | 'limit_buy';
  tokenSymbol: string;
  tokenName?: string;
  entryPrice?: number;
  targetMultiplier?: number;
  amountSol?: number;
  txSignature?: string;
}) {
  try {
    console.log("Sending tweet for:", tweetData.type, tweetData.tokenSymbol);
    const { data, error } = await supabase.functions.invoke("flipit-tweet", {
      body: tweetData
    });
    if (error) {
      console.error("Tweet failed:", error);
    } else {
      console.log("Tweet sent successfully:", data?.tweet_id);
    }
    return data;
  } catch (e) {
    console.error("Tweet error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[flipit-limit-order-monitor] Starting limit order check...");

    // Mark expired orders first
    const now = new Date().toISOString();
    const { data: expiredOrders, error: expireErr } = await supabase
      .from("flip_limit_orders")
      .update({ status: "expired" })
      .eq("status", "watching")
      .lt("expires_at", now)
      .select("id, token_symbol");

    if (expireErr) {
      console.error("Failed to expire orders:", expireErr);
    } else if (expiredOrders && expiredOrders.length > 0) {
      console.log(`Expired ${expiredOrders.length} limit order(s)`);
    }

    // Get all active watching limit orders
    const { data: orders, error: ordersErr } = await supabase
      .from("flip_limit_orders")
      .select("*")
      .eq("status", "watching")
      .gt("expires_at", now);

    if (ordersErr) {
      console.error("Failed to fetch limit orders:", ordersErr);
      return bad("Failed to fetch limit orders");
    }

    if (!orders || orders.length === 0) {
      return ok({ message: "No active limit orders", prices: {}, executed: [] });
    }

    console.log(`Monitoring ${orders.length} limit order(s)`);

    // Get unique token mints
    const tokenMints = [...new Set(orders.map(o => o.token_mint))];

    // Fetch all prices
    const prices = await fetchTokenPrices(tokenMints);
    const solPrice = await fetchSolPrice();
    console.log("Fetched prices:", prices, "SOL:", solPrice);

    const executed: any[] = [];

    // Check each order for trigger
    for (const order of orders) {
      const currentPrice = prices[order.token_mint];
      if (!currentPrice) {
        console.log(`No price available for ${order.token_mint}`);
        continue;
      }

      const { buy_price_min_usd, buy_price_max_usd, buy_amount_sol, target_multiplier, slippage_bps, priority_fee_mode } = order;

      console.log(`Order ${order.id}: current=${currentPrice}, range=[${buy_price_min_usd}, ${buy_price_max_usd}]`);

      // Check if price is within the buy range
      if (currentPrice >= buy_price_min_usd && currentPrice <= buy_price_max_usd) {
        console.log(`LIMIT BUY TRIGGERED for ${order.token_mint}! Current: $${currentPrice} is within range [$${buy_price_min_usd}, $${buy_price_max_usd}]`);

        try {
          // Convert SOL to USD for the buy
          const buyAmountUsd = buy_amount_sol * solPrice;
          const newTargetPrice = currentPrice * target_multiplier;

          console.log(`Executing limit buy: ${buy_amount_sol} SOL ($${buyAmountUsd.toFixed(2)}) at $${currentPrice}, target ${target_multiplier}x`);

          // Create new position via flipit-execute
          const { data: buyResult, error: buyError } = await supabase.functions.invoke("flipit-execute", {
            body: {
              action: "buy",
              tokenMint: order.token_mint,
              walletId: order.wallet_id,
              buyAmountUsd: buyAmountUsd,
              targetMultiplier: target_multiplier,
              slippageBps: slippage_bps,
              priorityFeeMode: priority_fee_mode,
            }
          });

          if (buyError) {
            throw new Error(buyError.message);
          }

          if (buyResult?.error) {
            throw new Error(buyResult.error);
          }

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
            triggerPrice: currentPrice,
            buyAmountSol: buy_amount_sol,
            buyAmountUsd: buyAmountUsd,
            targetMultiplier: target_multiplier,
            signature,
          });

          console.log(`Limit buy executed for ${order.token_mint}: position ${newPositionId}`);

          // Send email notification
          if (order.notification_email) {
            try {
              await supabase.functions.invoke("send-email-notification", {
                body: {
                  to: order.notification_email,
                  subject: `🎯 Limit Buy Triggered: ${order.token_symbol || order.token_mint.slice(0, 8)} @ $${currentPrice.toFixed(8)}`,
                  title: "Limit Buy Order Executed!",
                  message: `
<strong>Token:</strong> ${order.token_name || order.token_symbol || "Unknown"} (${order.token_symbol || order.token_mint.slice(0, 8)})

<strong>Order Details:</strong>
• Trigger Price: <strong>$${currentPrice.toFixed(8)}</strong>
• Buy Range: $${buy_price_min_usd.toFixed(8)} - $${buy_price_max_usd.toFixed(8)}
• Amount: <strong>${buy_amount_sol.toFixed(4)} SOL ($${buyAmountUsd.toFixed(2)} USD)</strong>
• Target: <strong>$${newTargetPrice.toFixed(8)} (${target_multiplier}x)</strong>

Your limit order has been successfully executed and a new position has been created!
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
              console.log("Limit buy notification email sent");
            } catch (emailErr) {
              console.error("Failed to send limit buy notification email:", emailErr);
            }
          }

          // Send tweet (fire and forget)
          await sendTweet(supabase, {
            type: 'limit_buy',
            tokenSymbol: order.token_symbol || 'TOKEN',
            tokenName: order.token_name,
            entryPrice: currentPrice,
            targetMultiplier: target_multiplier,
            amountSol: buy_amount_sol,
            txSignature: signature,
          });

        } catch (buyErr: any) {
          console.error(`Failed to execute limit buy for order ${order.id}:`, buyErr);
          
          // Update order with error but keep watching (will retry next check)
          await supabase
            .from("flip_limit_orders")
            .update({
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);
        }
      }
    }

    return ok({
      message: `Monitored ${orders.length} limit order(s)`,
      prices,
      solPrice,
      executed,
      expiredCount: expiredOrders?.length || 0,
      checkedAt: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("FlipIt limit order monitor error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
