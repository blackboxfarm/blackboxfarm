/**
 * FLIPIT REPAIR POSITIONS
 * 
 * Fixes all positions in DB to match on-chain truth using Helius.
 * Uses wallet balance delta calculation (not nativeTransfers sum).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyBuyFromChain, fetchSolPrice } from "../_shared/price-resolver.ts";

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

// Use centralized SOL price fetch
async function getSolPrice(): Promise<number> {
  return await fetchSolPrice();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const solscanApiKey = Deno.env.get("SOLSCAN_API_KEY");
    
    if (!solscanApiKey) {
      return bad("SOLSCAN_API_KEY required");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));
    const { 
      action = "repair_all", 
      positionId,
      dryRun = true,
      limit = 50,
      onlyHolding = true,
      hoursBack = 24
    } = body;

    const solPrice = await getSolPrice();
    console.log(`SOL price: $${solPrice}`);

    // Single position repair
    if (action === "repair_single" && positionId) {
      const { data: position, error } = await supabase
        .from("flip_positions")
        .select(`
          id, token_mint, wallet_id, status,
          buy_signature, sell_signature,
          quantity_tokens, buy_amount_usd, buy_price_usd,
          sell_amount_usd, sell_price_usd,
          super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)
        `)
        .eq("id", positionId)
        .single();

      if (error || !position) {
        return bad(`Position not found: ${error?.message}`);
      }

      const walletPubkey = (position as any).super_admin_wallets?.pubkey;
      if (!walletPubkey) {
        return bad("Wallet pubkey not found");
      }

      const result: any = {
        positionId: position.id,
        tokenMint: position.token_mint,
        status: position.status,
        dryRun,
        current: {
          quantity_tokens: position.quantity_tokens,
          buy_amount_usd: position.buy_amount_usd,
          buy_price_usd: position.buy_price_usd,
        }
      };

      // Parse buy transaction
      if (position.buy_signature) {
        const buyData = await parseBuyFromSolscan(
          position.buy_signature,
          position.token_mint,
          walletPubkey,
          solscanApiKey
        );

        if (buyData) {
          const correctBuyAmountUsd = buyData.solSpent * solPrice;
          const correctBuyPriceUsd = correctBuyAmountUsd / buyData.tokensReceived;

          result.solscan_buy = {
            tokensReceived: buyData.tokensReceived,
            solSpent: buyData.solSpent,
            platform: buyData.platform,
            correctBuyAmountUsd,
            correctBuyPriceUsd
          };

          if (!dryRun) {
            const updateData: any = {
              quantity_tokens: buyData.tokensReceivedRaw,
              buy_amount_usd: correctBuyAmountUsd,
              buy_price_usd: correctBuyPriceUsd,
              buy_amount_sol: buyData.solSpent,
              entry_verified: true,
              error_message: null
            };

            await supabase
              .from("flip_positions")
              .update(updateData)
              .eq("id", position.id);

            result.updated = true;
            result.updateData = updateData;
          }
        } else {
          result.solscan_buy = { error: "Could not parse from Solscan" };
        }
      }

      // Parse sell transaction if exists
      if (position.sell_signature) {
        const sellData = await parseSellFromSolscan(
          position.sell_signature,
          position.token_mint,
          walletPubkey,
          solscanApiKey
        );

        if (sellData) {
          const correctSellAmountUsd = sellData.solReceived * solPrice;
          const correctSellPriceUsd = correctSellAmountUsd / sellData.tokensSold;

          result.solscan_sell = {
            tokensSold: sellData.tokensSold,
            solReceived: sellData.solReceived,
            platform: sellData.platform,
            correctSellAmountUsd,
            correctSellPriceUsd
          };

          if (!dryRun) {
            await supabase
              .from("flip_positions")
              .update({
                sell_amount_usd: correctSellAmountUsd,
                sell_price_usd: correctSellPriceUsd,
                sell_amount_sol: sellData.solReceived
              })
              .eq("id", position.id);
          }
        }
      }

      return ok(result);
    }

    // Repair all positions
    if (action === "repair_all" || action === "repair_recent") {
      let query = supabase
        .from("flip_positions")
        .select(`
          id, token_mint, wallet_id, status,
          buy_signature, sell_signature,
          quantity_tokens, buy_amount_usd, buy_price_usd,
          created_at,
          super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)
        `)
        .not("buy_signature", "is", null)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (onlyHolding) {
        query = query.eq("status", "holding");
      }

      if (action === "repair_recent") {
        const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", cutoff);
      }

      const { data: positions, error } = await query;

      if (error) {
        return bad(`Query failed: ${error.message}`);
      }

      const results: any[] = [];
      let repaired = 0;
      let skipped = 0;
      let errors = 0;

      for (const position of positions || []) {
        const walletPubkey = (position as any).super_admin_wallets?.pubkey;
        if (!walletPubkey) {
          errors++;
          results.push({ id: position.id, error: "No wallet pubkey" });
          continue;
        }

        try {
          const buyData = await parseBuyFromSolscan(
            position.buy_signature!,
            position.token_mint,
            walletPubkey,
            solscanApiKey
          );

          if (!buyData) {
            skipped++;
            results.push({ 
              id: position.id, 
              mint: position.token_mint.slice(0, 12) + "...",
              skipped: true, 
              reason: "Solscan parse failed" 
            });
            // Rate limit
            await new Promise(r => setTimeout(r, 500));
            continue;
          }

          const correctBuyAmountUsd = buyData.solSpent * solPrice;
          const correctBuyPriceUsd = correctBuyAmountUsd / buyData.tokensReceived;

          const result: any = {
            id: position.id,
            mint: position.token_mint.slice(0, 12) + "...",
            platform: buyData.platform,
            db: {
              quantity: position.quantity_tokens,
              buyAmountUsd: position.buy_amount_usd,
              buyPriceUsd: position.buy_price_usd
            },
            onchain: {
              tokens: buyData.tokensReceived,
              solSpent: buyData.solSpent,
              buyAmountUsd: correctBuyAmountUsd,
              buyPriceUsd: correctBuyPriceUsd
            }
          };

          // Check if update needed
          const quantityDiff = Math.abs(Number(position.quantity_tokens || 0) - buyData.tokensReceived);
          const usdDiff = Math.abs((position.buy_amount_usd || 0) - correctBuyAmountUsd);
          
          const needsUpdate = quantityDiff > 1 || usdDiff > 0.01;

          if (needsUpdate && !dryRun) {
            await supabase
              .from("flip_positions")
              .update({
                quantity_tokens: buyData.tokensReceivedRaw,
                buy_amount_usd: correctBuyAmountUsd,
                buy_price_usd: correctBuyPriceUsd,
                buy_amount_sol: buyData.solSpent,
                entry_verified: true,
                error_message: null
              })
              .eq("id", position.id);

            result.repaired = true;
            repaired++;
          } else if (!needsUpdate) {
            result.alreadyCorrect = true;
            skipped++;
          }

          results.push(result);

          // Rate limit for Solscan API
          await new Promise(r => setTimeout(r, 300));

        } catch (e) {
          errors++;
          results.push({ id: position.id, error: (e as Error).message });
        }
      }

      return ok({
        dryRun,
        solPrice,
        totalPositions: positions?.length || 0,
        repaired,
        skipped,
        errors,
        results: results.slice(0, 50)
      });
    }

    // Get stats
    if (action === "stats") {
      const { count: totalHolding } = await supabase
        .from("flip_positions")
        .select("*", { count: "exact", head: true })
        .eq("status", "holding");

      const { count: withBuySig } = await supabase
        .from("flip_positions")
        .select("*", { count: "exact", head: true })
        .eq("status", "holding")
        .not("buy_signature", "is", null);

      const { count: recentPositions } = await supabase
        .from("flip_positions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      return ok({
        totalHolding,
        withBuySignature: withBuySig,
        canRepair: withBuySig,
        recentLast24h: recentPositions
      });
    }

    return bad("Invalid action. Use: repair_all, repair_recent, repair_single, stats");

  } catch (e) {
    console.error("flipit-repair-positions error:", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
