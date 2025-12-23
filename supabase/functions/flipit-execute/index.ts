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

async function fetchTokenPrice(tokenMint: string): Promise<number | null> {
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${tokenMint}`);
    const json = await res.json();
    const price = json?.data?.[tokenMint]?.price;
    return price ? Number(price) : null;
  } catch (e) {
    console.error("Jupiter price fetch failed:", e);
    return null;
  }
}

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch("https://price.jup.ag/v6/price?ids=SOL");
    const json = await res.json();
    return Number(json?.data?.SOL?.price || json?.data?.wSOL?.price || 200);
  } catch {
    return 200;
  }
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
    const { action, tokenMint, walletId, buyAmountUsd, targetMultiplier, positionId } = body;

    console.log("FlipIt execute:", { action, tokenMint, walletId, buyAmountUsd, targetMultiplier, positionId });

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
            slippageBps: 500, // 5% slippage for small caps
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

        // Update position with buy result
        await supabase
          .from("flip_positions")
          .update({
            buy_signature: swapResult?.signature || null,
            buy_executed_at: new Date().toISOString(),
            quantity_tokens: swapResult?.outAmount || null,
            status: "holding"
          })
          .eq("id", position.id);

        return ok({
          success: true,
          positionId: position.id,
          signature: swapResult?.signature,
          entryPrice: currentPrice,
          targetPrice: targetPrice,
          multiplier: mult
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

      if (position.status !== "holding") {
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
            slippageBps: 500,
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

        // Get current price for profit calculation
        const sellPrice = await fetchTokenPrice(position.token_mint) || position.buy_price_usd;
        const profit = position.buy_amount_usd * ((sellPrice / position.buy_price_usd) - 1);

        // Update position with sell result
        await supabase
          .from("flip_positions")
          .update({
            sell_signature: swapResult?.signature || null,
            sell_executed_at: new Date().toISOString(),
            sell_price_usd: sellPrice,
            profit_usd: profit,
            status: "sold"
          })
          .eq("id", positionId);

        return ok({
          success: true,
          signature: swapResult?.signature,
          sellPrice: sellPrice,
          profit: profit
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
