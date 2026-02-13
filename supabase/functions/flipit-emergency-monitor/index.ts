import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('flipit-emergency-monitor');

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

async function fetchTokenPrice(tokenMint: string): Promise<number | null> {
  // Try Jupiter first
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${tokenMint}`);
    const json = await res.json();
    const price = json?.data?.[tokenMint]?.price;
    if (price) return Number(price);
  } catch (e) {
    console.error("Jupiter price fetch failed:", e);
  }
  
  // Fallback to DexScreener
  try {
    console.log("Trying DexScreener fallback for price...");
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    const dexData = await dexRes.json();
    const pair = dexData?.pairs?.[0];
    if (pair?.priceUsd) {
      console.log("Got price from DexScreener:", pair.priceUsd);
      return Number(pair.priceUsd);
    }
  } catch (e) {
    console.error("DexScreener price fetch failed:", e);
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

    console.log("Emergency monitor: Starting price check...");

    // Fetch all positions with emergency sell watching
    const { data: positions, error: posError } = await supabase
      .from("flip_positions")
      .select("*, super_admin_wallets!flip_positions_wallet_id_fkey(id, secret_key_encrypted)")
      .eq("status", "holding")
      .eq("emergency_sell_status", "watching");

    if (posError) {
      console.error("Failed to fetch positions:", posError);
      return bad("Failed to fetch positions: " + posError.message);
    }

    if (!positions || positions.length === 0) {
      console.log("Emergency monitor: No positions watching for emergency sell");
      return ok({ 
        checkedAt: new Date().toISOString(), 
        positionsChecked: 0, 
        executed: [],
        prices: {} 
      });
    }

    console.log(`Emergency monitor: Found ${positions.length} positions watching`);

    const executed: string[] = [];
    const prices: Record<string, number> = {};

    for (const position of positions) {
      const tokenMint = position.token_mint;
      const emergencyPrice = position.emergency_sell_price_usd;

      if (!emergencyPrice) {
        console.log(`Position ${position.id}: No emergency price set, skipping`);
        continue;
      }

      // Fetch current price
      const currentPrice = await fetchTokenPrice(tokenMint);
      if (!currentPrice) {
        console.log(`Position ${position.id}: Could not fetch price for ${tokenMint}`);
        continue;
      }

      prices[tokenMint] = currentPrice;
      console.log(`Position ${position.id}: Current price $${currentPrice}, emergency trigger at $${emergencyPrice}`);

      // Check if price is at or below emergency sell threshold
      if (currentPrice <= emergencyPrice) {
        console.log(`🚨 EMERGENCY SELL TRIGGERED for position ${position.id}!`);
        console.log(`   Current: $${currentPrice} <= Trigger: $${emergencyPrice}`);

        try {
          // Execute sell with 20% slippage (2000 bps) and 0.0005 SOL gas (medium)
          const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
            body: {
              side: "sell",
              tokenMint: tokenMint,
              sellAll: true,
              slippageBps: 2000, // 20% slippage for emergency
              priorityFeeMode: "medium", // ~0.0005 SOL
              walletId: position.wallet_id,
            },
          });

          if (swapError) {
            throw new Error(swapError.message);
          }

          // Handle soft errors
          if (swapResult?.error_code) {
            throw new Error(`[${swapResult.error_code}] ${swapResult.error}`);
          }

          if (swapResult?.error) {
            throw new Error(swapResult.error);
          }

          const signature = firstSignature(swapResult);
          if (!signature) {
            throw new Error("Swap returned no signature");
          }

          // Calculate profit/loss
          const sellPrice = currentPrice;
          const profit = sellPrice && position.buy_price_usd
            ? position.buy_amount_usd * ((sellPrice / position.buy_price_usd) - 1)
            : null;

          // Update position as sold via emergency
          await supabase
            .from("flip_positions")
            .update({
              sell_signature: signature,
              sell_executed_at: new Date().toISOString(),
              sell_price_usd: sellPrice,
              profit_usd: profit,
              status: "sold",
              emergency_sell_status: "executed",
              emergency_sell_executed_at: new Date().toISOString(),
              error_message: null,
            })
            .eq("id", position.id);

          console.log(`✅ Emergency sell executed for ${position.id}, signature: ${signature}`);
          executed.push(position.id);

        } catch (sellErr: any) {
          const errMsg = sellErr.message || String(sellErr);
          console.error(`❌ Emergency sell failed for ${position.id}:`, errMsg);

          // Check for no balance errors - mark as sold
          const noBalanceIndicators = [
            "No token balance",
            "No token accounts found",
            "already been sold",
            "Token balance is 0",
            "NO_BALANCE",
            "BALANCE_CHECK_FAILED",
          ];
          const isNoBalance = noBalanceIndicators.some((indicator) => errMsg.includes(indicator));

          if (isNoBalance) {
            await supabase
              .from("flip_positions")
              .update({
                status: "sold",
                emergency_sell_status: "executed",
                emergency_sell_executed_at: new Date().toISOString(),
                error_message: "Emergency sell: No tokens to sell - " + errMsg,
              })
              .eq("id", position.id);
            executed.push(position.id);
          } else {
            // Log error but keep watching
            await supabase
              .from("flip_positions")
              .update({
                error_message: "Emergency sell attempt failed: " + errMsg,
              })
              .eq("id", position.id);
          }
        }
      }
    }

    console.log(`Emergency monitor complete. Checked: ${positions.length}, Executed: ${executed.length}`);

    return ok({
      checkedAt: new Date().toISOString(),
      positionsChecked: positions.length,
      executed,
      prices,
    });

  } catch (err: any) {
    console.error("Emergency monitor error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
