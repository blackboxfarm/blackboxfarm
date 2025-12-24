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

async function fetchSolPrice(): Promise<number> {
  // Try Jupiter first
  try {
    const res = await fetch("https://price.jup.ag/v6/price?ids=SOL");
    const json = await res.json();
    const price = json?.data?.SOL?.price || json?.data?.wSOL?.price;
    if (price) return Number(price);
  } catch (e) {
    console.error("Jupiter SOL price failed:", e);
  }
  
  // Fallback to CoinGecko
  try {
    console.log("Trying CoinGecko fallback for SOL price...");
    const cgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const cgData = await cgRes.json();
    if (cgData?.solana?.usd) {
      console.log("Got SOL price from CoinGecko:", cgData.solana.usd);
      return Number(cgData.solana.usd);
    }
  } catch (e) {
    console.error("CoinGecko SOL price failed:", e);
  }
  
  return 200; // Default fallback
}

async function fetchTokenMetadata(tokenMint: string): Promise<{ symbol: string; name: string } | null> {
  try {
    // Try Jupiter token list
    const res = await fetch(`https://token.jup.ag/strict?mint=${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.symbol) {
        return { symbol: data.symbol, name: data.name || data.symbol };
      }
    }
    
    // Fallback to DexScreener
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pair = dexData?.pairs?.[0];
      if (pair?.baseToken) {
        return { symbol: pair.baseToken.symbol, name: pair.baseToken.name };
      }
    }
  } catch (e) {
    console.error("Token metadata fetch failed:", e);
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

    const body = await req.json();
    const { action, tokenMint, walletId, buyAmountUsd, targetMultiplier, positionId, slippageBps, priorityFeeMode } = body;

    // Default slippage 5% (500 bps), configurable
    const effectiveSlippage = slippageBps || 500;
    
    console.log("FlipIt execute:", { action, tokenMint, walletId, buyAmountUsd, targetMultiplier, positionId, slippageBps: effectiveSlippage, priorityFeeMode });

    if (action === "buy") {
      if (!tokenMint || !walletId) {
        return bad("Missing tokenMint or walletId");
      }

      // Get wallet details
      const { data: wallet, error: walletError } = await supabase
        .from("super_admin_wallets")
        .select("id, pubkey, secret_key_encrypted")
        .eq("id", walletId)
        .single();

      if (walletError || !wallet) {
        return bad("Wallet not found");
      }

      // Fetch current token price
      const currentPrice = await fetchTokenPrice(tokenMint);
      if (!currentPrice) {
        return bad("Could not fetch token price");
      }

      // Fetch token metadata
      const metadata = await fetchTokenMetadata(tokenMint);

      // Calculate target price
      const mult = targetMultiplier || 2;
      const targetPrice = currentPrice * mult;

      // Get auth user
      const authHeader = req.headers.get("authorization");
      let userId: string | null = null;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      }

      // Create position record first
      const { data: position, error: posError } = await supabase
        .from("flip_positions")
        .insert({
          user_id: userId,
          wallet_id: walletId,
          token_mint: tokenMint,
          token_symbol: metadata?.symbol || null,
          token_name: metadata?.name || null,
          buy_amount_usd: buyAmountUsd || 10,
          buy_price_usd: currentPrice,
          target_multiplier: mult,
          target_price_usd: targetPrice,
          status: "pending_buy"
        })
        .select()
        .single();

      if (posError) {
        console.error("Failed to create position:", posError);
        return bad("Failed to create position: " + posError.message);
      }

      // Execute the buy via raydium-swap
      try {
        const solPrice = await fetchSolPrice();
        const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
          body: {
            side: "buy",
            tokenMint: tokenMint,
            usdcAmount: buyAmountUsd || 10,
            buyWithSol: true,
            slippageBps: effectiveSlippage,
            priorityFeeMode: priorityFeeMode || "medium",
          },
          headers: {
            "x-owner-secret": wallet.secret_key_encrypted
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
          throw new Error("Swap returned no signature (buy did not confirm)");
        }

        // Update position with buy result
        await supabase
          .from("flip_positions")
          .update({
            buy_signature: signature,
            buy_executed_at: new Date().toISOString(),
            quantity_tokens: (swapResult as any)?.outAmount ?? null,
            status: "holding",
            error_message: null,
          })
          .eq("id", position.id);

        return ok({
          success: true,
          positionId: position.id,
          signature,
          signatures: (swapResult as any)?.signatures ?? [signature],
          entryPrice: currentPrice,
          targetPrice: targetPrice,
          multiplier: mult,
        });

      } catch (buyErr: any) {
        // Mark position as failed
        await supabase
          .from("flip_positions")
          .update({
            status: "failed",
            error_message: buyErr.message
          })
          .eq("id", position.id);

        return bad("Buy failed: " + buyErr.message);
      }
    }

    if (action === "sell") {
      if (!positionId) {
        return bad("Missing positionId");
      }

      // Get position
      const { data: position, error: posErr } = await supabase
        .from("flip_positions")
        .select("*, super_admin_wallets!flip_positions_wallet_id_fkey(secret_key_encrypted)")
        .eq("id", positionId)
        .single();

      if (posErr || !position) {
        return bad("Position not found");
      }

      // Allow retry when the UI/database incorrectly marked a sell without a signature.
      if (position.status !== "holding" && !(position.status === "sold" && !position.sell_signature)) {
        return bad("Position is not in holding status");
      }

      // Mark as pending sell
      await supabase
        .from("flip_positions")
        .update({ status: "pending_sell" })
        .eq("id", positionId);

      try {
        // Execute sell via raydium-swap
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

        // Get current price for profit calculation
        const sellPrice = (await fetchTokenPrice(position.token_mint)) || position.buy_price_usd;
        const profit = sellPrice && position.buy_price_usd
          ? position.buy_amount_usd * ((sellPrice / position.buy_price_usd) - 1)
          : null;

        // Update position with sell result
        await supabase
          .from("flip_positions")
          .update({
            sell_signature: signature,
            sell_executed_at: new Date().toISOString(),
            sell_price_usd: sellPrice,
            profit_usd: profit,
            status: "sold",
            error_message: null,
          })
          .eq("id", positionId);

        return ok({
          success: true,
          signature,
          signatures: (swapResult as any)?.signatures ?? [signature],
          sellPrice,
          profit,
        });

      } catch (sellErr: any) {
        // Revert to holding on error
        await supabase
          .from("flip_positions")
          .update({
            status: "holding",
            error_message: sellErr.message
          })
          .eq("id", positionId);

        return bad("Sell failed: " + sellErr.message);
      }
    }

    return bad("Invalid action. Use 'buy' or 'sell'");

  } catch (err: any) {
    console.error("FlipIt execute error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
