/**
 * FLIPIT IMPORT POSITION
 * 
 * Scans wallet transaction history on Helius to find a buy for a specific token,
 * then creates a flip_positions entry with accurate on-chain data.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseBuyFromHelius } from "../_shared/helius-api.ts";
import { fetchSolPrice } from "../_shared/price-resolver.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const heliusApiKey = Deno.env.get("HELIUS_API_KEY");

    if (!heliusApiKey) {
      return bad("HELIUS_API_KEY required");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));
    
    const { 
      walletPubkey,
      walletId,
      tokenMint,
      signature, // Optional - if provided, use this specific tx
      targetMultiplier = 2,
      dryRun = true
    } = body;

    if (!walletPubkey) {
      return bad("walletPubkey required");
    }
    if (!tokenMint) {
      return bad("tokenMint required");
    }

    console.log(`[import] Looking for ${tokenMint.slice(0, 12)}... buys from wallet ${walletPubkey.slice(0, 12)}...`);

    let buySignature = signature;
    let buyData: { tokensReceived: number; solSpent: number; platform?: string } | null = null;

    // If signature provided, parse it directly
    if (signature) {
      console.log(`[import] Using provided signature: ${signature.slice(0, 20)}...`);
      buyData = await parseBuyFromHelius(signature, tokenMint, walletPubkey, heliusApiKey);
    } else {
      // Scan wallet history via Helius to find the buy
      console.log(`[import] Scanning wallet history...`);
      
      const historyUrl = `https://api.helius.xyz/v0/addresses/${walletPubkey}/transactions?api-key=${heliusApiKey}&limit=100`;
      const historyRes = await fetch(historyUrl);
      
      if (!historyRes.ok) {
        return bad(`Failed to fetch wallet history: ${historyRes.status}`);
      }
      
      const transactions = await historyRes.json();
      console.log(`[import] Found ${transactions.length} transactions`);

      // Look for swaps involving our token
      for (const tx of transactions) {
        // Check if this tx involves our token mint
        const tokenTransfers = tx.tokenTransfers || [];
        const hasOurToken = tokenTransfers.some((t: any) => t.mint === tokenMint);
        
        if (!hasOurToken) continue;

        // Check if it's a buy (we receive tokens)
        const receivedTokens = tokenTransfers.find((t: any) => 
          t.mint === tokenMint && t.toUserAccount === walletPubkey
        );

        if (receivedTokens) {
          console.log(`[import] Found potential buy: ${tx.signature.slice(0, 20)}...`);
          
          // Parse this transaction
          const parsed = await parseBuyFromHelius(tx.signature, tokenMint, walletPubkey, heliusApiKey);
          
          if (parsed && parsed.tokensReceived > 0) {
            buySignature = tx.signature;
            buyData = parsed;
            console.log(`[import] Confirmed buy: ${parsed.tokensReceived} tokens for ${parsed.solSpent} SOL`);
            break;
          }
        }
      }
    }

    if (!buyData || !buySignature) {
      return ok({
        found: false,
        message: "No buy transaction found for this token in wallet history",
        walletPubkey,
        tokenMint,
        hint: "Try providing the exact transaction signature if you have it"
      });
    }

    // Get SOL price at time of request (for display purposes)
    const solPrice = await fetchSolPrice();
    const buyAmountUsd = buyData.solSpent * solPrice;
    const buyPriceUsd = buyAmountUsd / buyData.tokensReceived;
    const targetPriceUsd = buyPriceUsd * targetMultiplier;

    // Try to get token metadata
    let tokenSymbol: string | null = null;
    let tokenName: string | null = null;
    let tokenImage: string | null = null;

    try {
      const metaUrl = `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`;
      const metaRes = await fetch(metaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintAccounts: [tokenMint] })
      });
      
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        if (metaData[0]) {
          tokenSymbol = metaData[0].onChainMetadata?.metadata?.data?.symbol || 
                        metaData[0].legacyMetadata?.symbol || null;
          tokenName = metaData[0].onChainMetadata?.metadata?.data?.name ||
                      metaData[0].legacyMetadata?.name || null;
          tokenImage = metaData[0].offChainMetadata?.metadata?.image || null;
        }
      }
    } catch (e) {
      console.log(`[import] Token metadata fetch failed:`, e);
    }

    const result = {
      found: true,
      tokenMint,
      tokenSymbol,
      tokenName,
      tokenImage,
      buySignature,
      walletPubkey,
      onChainData: {
        tokensReceived: buyData.tokensReceived,
        solSpent: buyData.solSpent,
        platform: buyData.platform
      },
      calculatedValues: {
        buyAmountUsd,
        buyPriceUsd,
        targetPriceUsd,
        targetMultiplier,
        solPriceUsed: solPrice
      },
      dryRun
    };

    if (!dryRun) {
      // Check if position already exists
      const { data: existing } = await supabase
        .from("flip_positions")
        .select("id")
        .eq("token_mint", tokenMint)
        .eq("buy_signature", buySignature)
        .single();

      if (existing) {
        return ok({
          ...result,
          error: "Position with this buy signature already exists",
          existingPositionId: existing.id
        });
      }

      // Determine wallet_id
      let finalWalletId = walletId;
      if (!finalWalletId) {
        const { data: wallet } = await supabase
          .from("super_admin_wallets")
          .select("id")
          .eq("pubkey", walletPubkey)
          .single();
        
        finalWalletId = wallet?.id;
      }

      if (!finalWalletId) {
        return bad("Could not determine wallet_id - please provide it");
      }

      // Insert the position
      const { data: newPosition, error: insertError } = await supabase
        .from("flip_positions")
        .insert({
          wallet_id: finalWalletId,
          token_mint: tokenMint,
          token_symbol: tokenSymbol,
          token_name: tokenName,
          token_image: tokenImage,
          buy_amount_usd: buyAmountUsd,
          buy_amount_sol: buyData.solSpent,
          buy_price_usd: buyPriceUsd,
          quantity_tokens: String(buyData.tokensReceived),
          buy_signature: buySignature,
          buy_executed_at: new Date().toISOString(),
          target_multiplier: targetMultiplier,
          target_price_usd: targetPriceUsd,
          status: "holding",
          source: "manual_import",
          is_test_position: false,
          entry_verified: true
        })
        .select("id")
        .single();

      if (insertError) {
        return bad(`Failed to insert position: ${insertError.message}`);
      }

      result.dryRun = false;
      (result as any).positionId = newPosition?.id;
      (result as any).message = "Position created successfully!";
    }

    return ok(result);

  } catch (e) {
    console.error("flipit-import-position error:", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
