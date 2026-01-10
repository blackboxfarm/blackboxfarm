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

// Verify token balance on-chain for a given wallet and mint
async function verifyTokenBalance(
  rpcUrl: string, 
  walletPubkey: string, 
  tokenMint: string
): Promise<{ rawAmount: string | null; uiAmount: number | null; decimals: number | null }> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          walletPubkey,
          { mint: tokenMint },
          { encoding: "jsonParsed" }
        ]
      }),
    });
    
    if (!res.ok) {
      console.log(`RPC failed for ${tokenMint}: ${res.status}`);
      return { rawAmount: null, uiAmount: null, decimals: null };
    }
    
    const data = await res.json();
    const accounts = data?.result?.value || [];
    
    if (accounts.length === 0) {
      // No token account found - position may have been sold
      return { rawAmount: "0", uiAmount: 0, decimals: null };
    }
    
    const tokenAccount = accounts[0];
    const parsedInfo = tokenAccount?.account?.data?.parsed?.info;
    const tokenAmount = parsedInfo?.tokenAmount;
    
    if (tokenAmount) {
      return {
        rawAmount: tokenAmount.amount,
        uiAmount: tokenAmount.uiAmount,
        decimals: tokenAmount.decimals
      };
    }
    
    return { rawAmount: null, uiAmount: null, decimals: null };
  } catch (e) {
    console.error(`Error verifying balance for ${tokenMint}:`, e);
    return { rawAmount: null, uiAmount: null, decimals: null };
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
    const { action = "verify_all", positionId, dryRun = true } = body;

    // Build RPC URL with Helius as primary
    const heliusKey = Deno.env.get("HELIUS_API_KEY");
    const rpcUrl = heliusKey 
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
      : "https://api.mainnet-beta.solana.com";

    console.log(`FlipIt Verify Positions: action=${action}, dryRun=${dryRun}, rpcUrl=${rpcUrl.substring(0, 40)}...`);

    if (action === "verify_single" && positionId) {
      // Verify a single position
      const { data: position, error } = await supabase
        .from("flip_positions")
        .select("id, token_mint, wallet_id, quantity_tokens, status, super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)")
        .eq("id", positionId)
        .single();

      if (error || !position) {
        return bad(`Position not found: ${error?.message || "unknown"}`);
      }

      const walletPubkey = (position as any).super_admin_wallets?.pubkey;
      if (!walletPubkey) {
        return bad("Wallet pubkey not found");
      }

      const balance = await verifyTokenBalance(rpcUrl, walletPubkey, position.token_mint);
      
      const result = {
        positionId: position.id,
        tokenMint: position.token_mint,
        walletPubkey,
        currentDbQuantity: position.quantity_tokens,
        onChainBalance: balance,
        status: position.status,
      };

      if (!dryRun && balance.rawAmount !== null) {
        await supabase
          .from("flip_positions")
          .update({ quantity_tokens: balance.rawAmount })
          .eq("id", position.id);
        (result as any).updated = true;
      }

      return ok(result);
    }

    if (action === "verify_all" || action === "backfill_nulls") {
      // Get positions with null quantity_tokens that are still holding
      const query = supabase
        .from("flip_positions")
        .select("id, token_mint, wallet_id, quantity_tokens, status, super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)")
        .eq("status", "holding");
      
      if (action === "backfill_nulls") {
        query.is("quantity_tokens", null);
      }

      const { data: positions, error } = await query.limit(100);

      if (error) {
        return bad(`Failed to fetch positions: ${error.message}`);
      }

      const results: any[] = [];
      let updated = 0;
      let verified = 0;
      let noChange = 0;
      let errors = 0;

      for (const position of positions || []) {
        const walletPubkey = (position as any).super_admin_wallets?.pubkey;
        if (!walletPubkey) {
          errors++;
          results.push({ positionId: position.id, error: "No wallet pubkey" });
          continue;
        }

        try {
          const balance = await verifyTokenBalance(rpcUrl, walletPubkey, position.token_mint);
          verified++;

          const needsUpdate = balance.rawAmount !== null && 
            String(balance.rawAmount) !== String(position.quantity_tokens);

          const result: any = {
            positionId: position.id,
            tokenMint: position.token_mint.substring(0, 12) + "...",
            dbQuantity: position.quantity_tokens,
            onChainQuantity: balance.rawAmount,
            needsUpdate,
          };

          if (needsUpdate && !dryRun) {
            await supabase
              .from("flip_positions")
              .update({ quantity_tokens: balance.rawAmount })
              .eq("id", position.id);
            result.updated = true;
            updated++;
          } else if (!needsUpdate) {
            noChange++;
          }

          results.push(result);

          // Rate limit - don't hammer the RPC
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          errors++;
          results.push({ positionId: position.id, error: (e as Error).message });
        }
      }

      return ok({
        dryRun,
        totalPositions: positions?.length || 0,
        verified,
        updated,
        noChange,
        errors,
        results: results.slice(0, 20), // Only return first 20 for brevity
      });
    }

    if (action === "get_stats") {
      // Get statistics about positions with null quantities
      const { data: stats, error } = await supabase
        .rpc("get_flip_position_stats")
        .single();

      if (error) {
        // Fallback to manual query
        const { data: holding } = await supabase
          .from("flip_positions")
          .select("id", { count: "exact" })
          .eq("status", "holding");

        const { data: nullQuantity } = await supabase
          .from("flip_positions")
          .select("id", { count: "exact" })
          .eq("status", "holding")
          .is("quantity_tokens", null);

        return ok({
          totalHolding: holding?.length || 0,
          nullQuantityHolding: nullQuantity?.length || 0,
          needsBackfill: nullQuantity?.length || 0,
        });
      }

      return ok(stats);
    }

    return bad("Invalid action. Use: verify_all, backfill_nulls, verify_single, or get_stats");
  } catch (e) {
    console.error("flipit-verify-positions error:", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
