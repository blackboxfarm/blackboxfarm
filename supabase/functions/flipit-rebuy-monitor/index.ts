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
          // Calculate target price for new position
          const newTargetPrice = currentPrice * effectiveMultiplier;

          // Create new position via flipit-execute
          const { data: buyResult, error: buyError } = await supabase.functions.invoke("flipit-execute", {
            body: {
              action: "buy",
              tokenMint: position.token_mint,
              walletId: position.wallet_id,
              buyAmountUsd: rebuyAmountUsd,
              targetMultiplier: effectiveMultiplier,
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

          // Mark the new position with rebuy enabled from parent settings if desired
          if (newPositionId && position.rebuy_enabled) {
            await supabase
              .from("flip_positions")
              .update({
                rebuy_enabled: true,
                rebuy_price_high_usd: effectiveHigh,
                rebuy_price_low_usd: effectiveLow,
                rebuy_amount_usd: rebuyAmountUsd,
                rebuy_status: "pending", // Will activate after this position sells
              })
              .eq("id", newPositionId);
          }

          executed.push({
            originalPositionId: position.id,
            newPositionId,
            tokenMint: position.token_mint,
            rebuyPrice,
            currentPrice,
            amountUsd: rebuyAmountUsd,
            signature: buyResult?.position?.buy_signature,
          });

          console.log(`Rebuy executed for ${position.token_mint}: new position ${newPositionId}`);

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
