import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { broadcastToBlackBox } from "../_shared/telegram-broadcast.ts";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('flipit-limit-order-monitor');

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

  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  for (const chunk of chunks) {
    try {
      const ids = chunk.join(",");
      const res = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`, {
        headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
      });
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
  
  // Fallback to CoinGecko with API key authentication
  try {
    const apiKey = Deno.env.get('COINGECKO_API_KEY');
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { headers });
    const json = await res.json();
    if (json?.solana?.usd) return Number(json.solana.usd);
  } catch (e) {
    console.error("CoinGecko SOL price failed:", e);
  }
  
  return 180; // Fallback default
}

async function sendTweet(supabase: any, tweetData: {
  type: 'buy' | 'sell' | 'rebuy' | 'limit_buy';
  tokenMint?: string;
  tokenSymbol: string;
  tokenName?: string;
  twitterUrl?: string;
  positionId?: string;
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

async function sendTelegramAlert(supabase: any, alertData: {
  tokenSymbol: string;
  tokenMint: string;
  triggerPrice: number;
  priceRange: { min: number; max: number };
  amountSol: number;
  amountUsd: number;
  targetMultiplier: number;
  alertOnly: boolean;
}) {
  const alertType = alertData.alertOnly ? '🔔 ALERT ONLY' : '🎯 LIMIT BUY EXECUTED';
  const message = `${alertType}

**Token:** ${alertData.tokenSymbol}
**Mint:** \`${alertData.tokenMint.slice(0, 8)}...${alertData.tokenMint.slice(-4)}\`

**Trigger Price:** $${alertData.triggerPrice.toFixed(8)}
**Buy Range:** $${alertData.priceRange.min.toFixed(8)} - $${alertData.priceRange.max.toFixed(8)}
**Amount:** ${alertData.amountSol.toFixed(4)} SOL (~$${alertData.amountUsd.toFixed(2)})
**Target:** ${alertData.targetMultiplier}x

📊 [DexScreener](https://dexscreener.com/solana/${alertData.tokenMint})`;

  try {
    const results = await broadcastToBlackBox(supabase, message);
    const success = results.some(r => r.success);
    if (success) {
      console.log('[Limit Order] Telegram alert sent to BLACKBOX');
    }
    return success;
  } catch (e) {
    console.warn('[Limit Order] Telegram broadcast exception:', e);
    return false;
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

    // Get all active watching limit orders (TIGHT mode only - fast 2s checks)
    const { data: orders, error: ordersErr } = await supabase
      .from("flip_limit_orders")
      .select("*")
      .eq("status", "watching")
      .or("monitoring_mode.eq.tight,monitoring_mode.is.null") // Tight mode or legacy orders without mode
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
    const alertsOnly: any[] = [];

    // Check each order for trigger
    for (const order of orders) {
      const currentPrice = prices[order.token_mint];
      if (!currentPrice) {
        console.log(`No price available for ${order.token_mint}`);
        continue;
      }

      const { buy_price_min_usd, buy_price_max_usd, buy_amount_sol, target_multiplier, slippage_bps, priority_fee_mode, alert_only, notify_telegram_group, notification_email } = order;

      console.log(`Order ${order.id}: current=${currentPrice}, range=[${buy_price_min_usd}, ${buy_price_max_usd}], alert_only=${alert_only}`);

      // Check if price is within the buy range
      if (currentPrice >= buy_price_min_usd && currentPrice <= buy_price_max_usd) {
        console.log(`LIMIT ORDER TRIGGERED for ${order.token_mint}! Current: $${currentPrice} is within range [$${buy_price_min_usd}, $${buy_price_max_usd}]`);

        const buyAmountUsd = buy_amount_sol * solPrice;
        const newTargetPrice = currentPrice * target_multiplier;

        // If alert_only is true, just send notifications without executing the buy
        if (alert_only) {
          console.log(`ALERT ONLY mode: Sending notifications without executing buy for ${order.token_mint}`);

          // Update limit order status to 'alerted'
          await supabase
            .from("flip_limit_orders")
            .update({
              status: "alerted",
              executed_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          alertsOnly.push({
            orderId: order.id,
            tokenMint: order.token_mint,
            tokenSymbol: order.token_symbol,
            triggerPrice: currentPrice,
            buyAmountSol: buy_amount_sol,
            buyAmountUsd: buyAmountUsd,
            targetMultiplier: target_multiplier,
            alertOnly: true,
          });

          // Send email notification for alert-only
          if (notification_email) {
            try {
              await supabase.functions.invoke("send-email-notification", {
                body: {
                  to: notification_email,
                  subject: `🔔 Limit Order Alert: ${order.token_symbol || order.token_mint.slice(0, 8)} @ $${currentPrice.toFixed(8)}`,
                  title: "Limit Order Conditions Met!",
                  message: `
<strong>🔔 ALERT ONLY - No Buy Executed</strong>

<strong>Token:</strong> ${order.token_name || order.token_symbol || "Unknown"} (${order.token_symbol || order.token_mint.slice(0, 8)})

<strong>Trigger Details:</strong>
• Current Price: <strong>$${currentPrice.toFixed(8)}</strong>
• Buy Range: $${buy_price_min_usd.toFixed(8)} - $${buy_price_max_usd.toFixed(8)}
• Configured Amount: <strong>${buy_amount_sol.toFixed(4)} SOL ($${buyAmountUsd.toFixed(2)} USD)</strong>
• Target Would Be: <strong>$${newTargetPrice.toFixed(8)} (${target_multiplier}x)</strong>

Your limit order conditions have been met. This is an alert-only notification - no buy was executed.
                  `,
                  type: "info",
                  metadata: {
                    tokenMint: order.token_mint,
                    chartUrl: `https://dexscreener.com/solana/${order.token_mint}`,
                  }
                }
              });
              console.log("Alert-only notification email sent");
            } catch (emailErr) {
              console.error("Failed to send alert-only notification email:", emailErr);
            }
          }

          // Send Telegram alert if enabled
          if (notify_telegram_group) {
            await sendTelegramAlert(supabase, {
              tokenSymbol: order.token_symbol || order.token_mint.slice(0, 8),
              tokenMint: order.token_mint,
              triggerPrice: currentPrice,
              priceRange: { min: buy_price_min_usd, max: buy_price_max_usd },
              amountSol: buy_amount_sol,
              amountUsd: buyAmountUsd,
              targetMultiplier: target_multiplier,
              alertOnly: true,
            });
          }

          continue; // Skip to next order without executing buy
        }

        // Execute actual buy (existing logic)
        try {
          console.log(`Executing limit buy: ${buy_amount_sol} SOL ($${buyAmountUsd.toFixed(2)}) at $${currentPrice}, target ${target_multiplier}x`);

          // Create new position via flipit-execute
          const { data: buyResult, error: buyError } = await supabase.functions.invoke("flipit-execute", {
            body: {
              action: "buy",
              tokenMint: order.token_mint,
              walletId: order.wallet_id,
              buyAmountUsd: buyAmountUsd,
              // Use the trigger price as the protected "display" price
              displayPriceUsd: currentPrice,
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
          if (notification_email) {
            try {
              await supabase.functions.invoke("send-email-notification", {
                body: {
                  to: notification_email,
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

          // Send Telegram alert if enabled
          if (notify_telegram_group) {
            await sendTelegramAlert(supabase, {
              tokenSymbol: order.token_symbol || order.token_mint.slice(0, 8),
              tokenMint: order.token_mint,
              triggerPrice: currentPrice,
              priceRange: { min: buy_price_min_usd, max: buy_price_max_usd },
              amountSol: buy_amount_sol,
              amountUsd: buyAmountUsd,
              targetMultiplier: target_multiplier,
              alertOnly: false,
            });
          }

          // Send tweet (fire and forget)
          await sendTweet(supabase, {
            type: 'limit_buy',
            tokenMint: order.token_mint,
            tokenSymbol: order.token_symbol || 'TOKEN',
            tokenName: order.token_name,
            twitterUrl: order.twitter_url || '',
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
      alertsOnly,
      expiredCount: expiredOrders?.length || 0,
      checkedAt: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("FlipIt limit order monitor error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
