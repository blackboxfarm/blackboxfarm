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

function firstSignature(swapResult: any): string | null {
  if (!swapResult) return null;
  if (typeof swapResult.signature === "string" && swapResult.signature.length > 0) return swapResult.signature;
  if (Array.isArray(swapResult.signatures) && typeof swapResult.signatures[0] === "string" && swapResult.signatures[0].length > 0) {
    return swapResult.signatures[0];
  }
  if (Array.isArray(swapResult.data?.signatures) && typeof swapResult.data.signatures?.[0] === "string") {
    return swapResult.data.signatures[0];
  }
  return null;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { action, slippageBps, priorityFeeMode } = body;

    // Default slippage 5% (500 bps), configurable
    const effectiveSlippage = slippageBps || 500;

    console.log("FlipIt price monitor:", { action, slippageBps: effectiveSlippage, priorityFeeMode });

    // Get all holding positions
    const { data: positions, error: posErr } = await supabase
      .from("flip_positions")
      .select("*, super_admin_wallets!flip_positions_wallet_id_fkey(secret_key_encrypted)")
      .eq("status", "holding");

    if (posErr) {
      console.error("Failed to fetch positions:", posErr);
      return bad("Failed to fetch positions");
    }

    if (!positions || positions.length === 0) {
      return ok({ message: "No active positions to monitor", prices: {}, executed: [] });
    }

    console.log(`Monitoring ${positions.length} active positions`);

    // Get unique token mints
    const tokenMints = [...new Set(positions.map(p => p.token_mint))];

    // Fetch all prices
    const prices = await fetchTokenPrices(tokenMints);
    console.log("Fetched prices:", prices);

    const executed: any[] = [];

    // Check each position for target hit
    for (const position of positions) {
      const currentPrice = prices[position.token_mint];
      if (!currentPrice) {
        console.log(`No price available for ${position.token_mint}`);
        continue;
      }

      const targetPrice = position.target_price_usd;
      const entryPrice = position.buy_price_usd;

      if (!targetPrice || !entryPrice) {
        continue;
      }

      console.log(`Position ${position.id}: entry=${entryPrice}, current=${currentPrice}, target=${targetPrice}`);

      // Check if target hit
      if (currentPrice >= targetPrice) {
        console.log(`TARGET HIT for ${position.token_mint}! Executing sell...`);

        try {
          // Mark as pending sell
          await supabase
            .from("flip_positions")
            .update({ status: "pending_sell" })
            .eq("id", position.id);

          // Execute sell
          const walletSecret = (position as any).super_admin_wallets?.secret_key_encrypted;
          if (!walletSecret) {
            throw new Error("Wallet secret not found");
          }

          const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
            body: {
              side: "sell",
              tokenMint: position.token_mint,
              sellAll: true,
              slippageBps: effectiveSlippage,
              priorityFeeMode: priorityFeeMode || "medium",
            },
            headers: {
              "x-owner-secret": walletSecret
            }
          });

          if (swapError) {
            throw new Error(swapError.message);
          }

          if (swapResult?.error) {
            throw new Error(swapResult.error);
          }

          const signature = firstSignature(swapResult);
          if (!signature) {
            throw new Error("Swap returned no signature (sell did not confirm)");
          }

          // Calculate profit
          const profit = position.buy_amount_usd * ((currentPrice / entryPrice) - 1);

          // Update position - and set rebuy_status to 'watching' if rebuy_enabled
          const updateData: any = {
            sell_signature: signature,
            sell_executed_at: new Date().toISOString(),
            sell_price_usd: currentPrice,
            profit_usd: profit,
            status: "sold",
            error_message: null,
          };

          // If rebuy is enabled and has price/amount set, start watching
          if (position.rebuy_enabled && position.rebuy_price_usd && position.rebuy_amount_usd) {
            updateData.rebuy_status = "watching";
            console.log(`Rebuy enabled for ${position.id}, setting status to watching`);
          }

          await supabase
            .from("flip_positions")
            .update(updateData)
            .eq("id", position.id);

          executed.push({
            positionId: position.id,
            tokenMint: position.token_mint,
            entryPrice,
            sellPrice: currentPrice,
            profit,
            signature,
            signatures: (swapResult as any)?.signatures ?? [signature],
          });

          console.log(`Sold position ${position.id} with profit: $${profit.toFixed(2)}`);

        } catch (sellErr: any) {
          console.error(`Failed to sell position ${position.id}:`, sellErr);
          
          // Revert to holding
          await supabase
            .from("flip_positions")
            .update({
              status: "holding",
              error_message: sellErr.message
            })
            .eq("id", position.id);
        }
      }
    }

    return ok({
      message: `Monitored ${positions.length} positions`,
      prices,
      executed,
      checkedAt: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("FlipIt monitor error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
