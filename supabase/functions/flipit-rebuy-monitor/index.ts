import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('flipit-rebuy-monitor');

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
  type: 'buy' | 'sell' | 'rebuy';
  tokenMint?: string;
  tokenSymbol: string;
  tokenName?: string;
  twitterUrl?: string;
  positionId?: string;
  entryPrice?: number;
  exitPrice?: number;
  targetMultiplier?: number;
  profitPercent?: number;
  profitSol?: number;
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

    const body = await req.json().catch(() => ({}));
    const { slippageBps, priorityFeeMode, targetMultiplier } = body;

    const effectiveSlippage = slippageBps || 500;
    const effectivePriorityFee = priorityFeeMode || "medium";
    const effectiveMultiplier = targetMultiplier || 2;

    console.log("FlipIt rebuy monitor:", { slippageBps: effectiveSlippage, priorityFeeMode: effectivePriorityFee });

    // Get all sold positions with rebuy_status = 'watching'
    const { data: positions, error: posErr } = await supabase
      .from("flip_positions")
      .select("*")
      .eq("status", "sold")
      .eq("rebuy_status", "watching");

    if (posErr) {
      console.error("Failed to fetch rebuy positions:", posErr);
      return bad("Failed to fetch rebuy positions");
    }

    if (!positions || positions.length === 0) {
      return ok({ message: "No positions watching for rebuy", prices: {}, executed: [] });
    }

    console.log(`Monitoring ${positions.length} positions for rebuy opportunities`);

    // Get unique token mints
    const tokenMints = [...new Set(positions.map(p => p.token_mint))];

    // Fetch all prices
    const prices = await fetchTokenPrices(tokenMints);
    const solPrice = await fetchSolPrice();
    console.log("Fetched prices:", prices, "SOL:", solPrice);

    const executed: any[] = [];

    // Check each position for rebuy trigger
    for (const position of positions) {
      const currentPrice = prices[position.token_mint];
      if (!currentPrice) {
        console.log(`No price available for ${position.token_mint}`);
        continue;
      }

      const rebuyPriceHigh = position.rebuy_price_high_usd;
      const rebuyPriceLow = position.rebuy_price_low_usd;
      const rebuyAmountUsd = position.rebuy_amount_usd;

      // Fallback to legacy single price if range not set
      const effectiveHigh = rebuyPriceHigh ?? position.rebuy_price_usd ?? 0;
      const effectiveLow = rebuyPriceLow ?? position.rebuy_price_usd ?? 0;

      if (!effectiveHigh || !effectiveLow || !rebuyAmountUsd) {
        console.log(`Position ${position.id} missing rebuy price range or amount`);
        continue;
      }

      console.log(`Position ${position.id}: current=${currentPrice}, rebuy_range=[${effectiveLow}, ${effectiveHigh}]`);

      // Check if price is within the rebuy range (between low and high)
      if (currentPrice >= effectiveLow && currentPrice <= effectiveHigh) {
        console.log(`REBUY TRIGGERED for ${position.token_mint}! Current: $${currentPrice} is within range [$${effectiveLow}, $${effectiveHigh}]`);

        try {
          // Use per-position rebuy target multiplier, fallback to global or default 2x
          const positionRebuyMultiplier = position.rebuy_target_multiplier || effectiveMultiplier;
          
          // Calculate target price for new position
          const newTargetPrice = currentPrice * positionRebuyMultiplier;

          console.log(`Using rebuy target multiplier: ${positionRebuyMultiplier}x (new target: $${newTargetPrice})`);

          // Create new position via flipit-execute
          const { data: buyResult, error: buyError } = await supabase.functions.invoke("flipit-execute", {
            body: {
              action: "buy",
              tokenMint: position.token_mint,
              walletId: position.wallet_id,
              buyAmountUsd: rebuyAmountUsd,
              targetMultiplier: positionRebuyMultiplier,
              slippageBps: effectiveSlippage,
              priorityFeeMode: effectivePriorityFee,
            }
          });

          if (buyError) {
            throw new Error(buyError.message);
          }

          if (buyResult?.error) {
            throw new Error(buyResult.error);
          }

          const newPositionId = buyResult?.position?.id;

          // Update original position
          await supabase
            .from("flip_positions")
            .update({
              rebuy_status: "executed",
              rebuy_executed_at: new Date().toISOString(),
              rebuy_position_id: newPositionId || null,
            })
            .eq("id", position.id);

          // Mark the new position with rebuy enabled from parent settings if loop is enabled
          if (newPositionId && position.rebuy_enabled && position.rebuy_loop_enabled) {
            console.log(`Loop mode enabled - copying rebuy settings to new position ${newPositionId}`);
            await supabase
              .from("flip_positions")
              .update({
                rebuy_enabled: true,
                rebuy_price_high_usd: effectiveHigh,
                rebuy_price_low_usd: effectiveLow,
                rebuy_amount_usd: rebuyAmountUsd,
                rebuy_target_multiplier: positionRebuyMultiplier,
                rebuy_loop_enabled: true, // Carry forward the loop setting
                rebuy_status: "pending", // Will activate after this position sells
              })
              .eq("id", newPositionId);
          }

          const signature = buyResult?.position?.buy_signature;
          
          executed.push({
            originalPositionId: position.id,
            newPositionId,
            tokenMint: position.token_mint,
            rebuyPriceLow: effectiveLow,
            rebuyPriceHigh: effectiveHigh,
            currentPrice,
            amountUsd: rebuyAmountUsd,
            signature,
          });

          console.log(`Rebuy executed for ${position.token_mint}: new position ${newPositionId}`);

          // Send email notification for successful rebuy
          try {
            const profitPct = position.profit_usd && position.buy_amount_usd 
              ? ((position.profit_usd / position.buy_amount_usd) * 100).toFixed(1) 
              : "N/A";
            
            await supabase.functions.invoke("send-email-notification", {
              body: {
                to: "wilsondavid@live.ca",
                subject: `🔄 FlipIt Rebuy: ${position.token_symbol || position.token_mint.slice(0, 8)} @ $${currentPrice.toFixed(6)}`,
                title: "Rebuy Triggered!",
                message: `
<strong>Token:</strong> ${position.token_name || position.token_symbol || "Unknown"} (${position.token_symbol || position.token_mint.slice(0, 8)})

<strong>Rebuy Details:</strong>
• Current Price: <strong>$${currentPrice.toFixed(8)}</strong>
• Rebuy Range: $${effectiveLow.toFixed(8)} - $${effectiveHigh.toFixed(8)}
• Amount: <strong>$${rebuyAmountUsd.toFixed(2)} USD</strong>
• New Target: <strong>$${newTargetPrice.toFixed(8)} (${positionRebuyMultiplier}x)</strong>

<strong>Previous Position:</strong>
• Profit: $${position.profit_usd?.toFixed(2) || "0.00"} (${profitPct}%)
• Entry: $${position.buy_price_usd?.toFixed(8) || "N/A"}
• Exit: $${position.sell_price_usd?.toFixed(8) || "N/A"}

<strong>Loop Mode:</strong> ${position.rebuy_loop_enabled ? "♻️ ENABLED - Will continue cycling" : "❌ Disabled"}
                `,
                type: "success",
                metadata: {
                  tokenMint: position.token_mint,
                  actionUrl: `https://solscan.io/tx/${signature}`,
                  actionText: "View Transaction",
                  chartUrl: `https://dexscreener.com/solana/${position.token_mint}`,
                }
              }
            });
            console.log("Rebuy notification email sent");
          } catch (emailErr) {
            console.error("Failed to send rebuy notification email:", emailErr);
          }

          // Send rebuy tweet (fire and forget)
          const amountSol = rebuyAmountUsd / solPrice;
          await sendTweet(supabase, {
            type: 'rebuy',
            tokenMint: position.token_mint,
            tokenSymbol: position.token_symbol || 'TOKEN',
            tokenName: position.token_name,
            twitterUrl: position.twitter_url || '',
            positionId: position.id,
            entryPrice: currentPrice,
            targetMultiplier: positionRebuyMultiplier,
            amountSol: amountSol,
            txSignature: signature,
          });

        } catch (rebuyErr: any) {
          console.error(`Failed to execute rebuy for position ${position.id}:`, rebuyErr);
          
          // Update status to show error but keep watching
          await supabase
            .from("flip_positions")
            .update({
              error_message: `Rebuy failed: ${rebuyErr.message}`
            })
            .eq("id", position.id);
        }
      }
    }

    return ok({
      message: `Monitored ${positions.length} positions for rebuy`,
      prices,
      solPrice,
      executed,
      checkedAt: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("FlipIt rebuy monitor error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
