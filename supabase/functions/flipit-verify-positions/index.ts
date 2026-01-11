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

// Parse a transaction via Helius to get exact token amounts from a swap
async function parseSwapTransaction(
  heliusKey: string,
  signature: string,
  targetMint: string,
  walletPubkey: string
): Promise<string | null> {
  try {
    const parseRes = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${heliusKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: [signature] }),
    });
    
    if (!parseRes.ok) {
      console.log(`Helius parse failed for ${signature}: ${parseRes.status}`);
      return null;
    }
    
    const parsedTxs = await parseRes.json();
    const parsedTx = parsedTxs?.[0];
    
    if (!parsedTx) {
      console.log(`No parsed transaction data for ${signature}`);
      return null;
    }
    
    console.log(`Parsed tx ${signature.substring(0, 12)}... type=${parsedTx.type} source=${parsedTx.source}`);
    
    // Check swap event - most reliable for DEX trades
    if (parsedTx?.events?.swap) {
      const swapEvent = parsedTx.events.swap;
      
      // Find token output matching our target mint
      const tokenOutput = swapEvent.tokenOutputs?.find(
        (out: any) => out.mint === targetMint
      );
      
      if (tokenOutput?.rawTokenAmount?.tokenAmount) {
        return tokenOutput.rawTokenAmount.tokenAmount;
      }
      if (tokenOutput?.tokenAmount) {
        return String(tokenOutput.tokenAmount);
      }
    }
    
    // Fallback: tokenTransfers array
    if (parsedTx?.tokenTransfers?.length > 0) {
      const inboundTransfer = parsedTx.tokenTransfers.find(
        (t: any) => t.mint === targetMint && t.toUserAccount === walletPubkey
      );
      
      if (inboundTransfer?.tokenAmount) {
        return String(inboundTransfer.tokenAmount);
      }
    }
    
    // Fallback: accountData tokenBalanceChanges
    if (parsedTx?.accountData?.length > 0) {
      for (const acct of parsedTx.accountData) {
        const tokenChange = acct.tokenBalanceChanges?.find(
          (c: any) => c.mint === targetMint && c.userAccount === walletPubkey
        );
        if (tokenChange?.rawTokenAmount?.tokenAmount) {
          const amount = BigInt(tokenChange.rawTokenAmount.tokenAmount);
          if (amount > 0n) {
            return amount.toString();
          }
        }
      }
    }
    
    return null;
  } catch (e) {
    console.error(`Error parsing transaction ${signature}:`, e);
    return null;
  }
}

// Get current wallet balance as fallback
async function getCurrentBalance(
  rpcUrl: string, 
  walletPubkey: string, 
  tokenMint: string
): Promise<string | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [walletPubkey, { mint: tokenMint }, { encoding: "jsonParsed" }]
      }),
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const accounts = data?.result?.value || [];
    
    if (accounts.length === 0) return "0";
    
    return accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.amount || null;
  } catch (e) {
    console.error(`Error getting balance for ${tokenMint}:`, e);
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
    const { action = "verify_all", positionId, dryRun = true } = body;

    const heliusKey = Deno.env.get("HELIUS_API_KEY");
    const rpcUrl = heliusKey 
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
      : "https://api.mainnet-beta.solana.com";

    console.log(`FlipIt Verify: action=${action}, dryRun=${dryRun}, hasHelius=${!!heliusKey}`);

    if (!heliusKey) {
      return bad("HELIUS_API_KEY required for transaction parsing");
    }

    if (action === "verify_single" && positionId) {
      const { data: position, error } = await supabase
        .from("flip_positions")
        .select("id, token_mint, wallet_id, quantity_tokens, buy_signature, status, super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)")
        .eq("id", positionId)
        .single();

      if (error || !position) {
        return bad(`Position not found: ${error?.message || "unknown"}`);
      }

      const walletPubkey = (position as any).super_admin_wallets?.pubkey;
      if (!walletPubkey) {
        return bad("Wallet pubkey not found");
      }

      let correctQuantity: string | null = null;
      
      // Try to parse the buy transaction to get exact amount
      if (position.buy_signature) {
        correctQuantity = await parseSwapTransaction(
          heliusKey, 
          position.buy_signature, 
          position.token_mint,
          walletPubkey
        );
      }
      
      // Fallback to current balance only if no buy signature or parsing failed
      if (!correctQuantity) {
        correctQuantity = await getCurrentBalance(rpcUrl, walletPubkey, position.token_mint);
      }
      
      const result = {
        positionId: position.id,
        tokenMint: position.token_mint,
        buySignature: position.buy_signature,
        currentDbQuantity: position.quantity_tokens,
        parsedQuantity: correctQuantity,
        status: position.status,
      };

      if (!dryRun && correctQuantity !== null) {
        await supabase
          .from("flip_positions")
          .update({ quantity_tokens: correctQuantity })
          .eq("id", position.id);
        (result as any).updated = true;
      }

      return ok(result);
    }

    if (action === "verify_all" || action === "backfill_nulls" || action === "fix_all") {
      // Get positions - prioritize ones with buy_signature for accurate parsing
      const query = supabase
        .from("flip_positions")
        .select("id, token_mint, wallet_id, quantity_tokens, buy_signature, status, super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)")
        .eq("status", "holding")
        .order("created_at", { ascending: false });
      
      if (action === "backfill_nulls") {
        query.is("quantity_tokens", null);
      }

      const { data: positions, error } = await query.limit(50);

      if (error) {
        return bad(`Failed to fetch positions: ${error.message}`);
      }

      const results: any[] = [];
      let updated = 0;
      let verified = 0;
      let skipped = 0;
      let errors = 0;

      for (const position of positions || []) {
        const walletPubkey = (position as any).super_admin_wallets?.pubkey;
        if (!walletPubkey) {
          errors++;
          results.push({ positionId: position.id, error: "No wallet pubkey" });
          continue;
        }

        try {
          let correctQuantity: string | null = null;
          let source = "unknown";
          
          // Prefer parsing the buy signature for exact amount
          if (position.buy_signature) {
            correctQuantity = await parseSwapTransaction(
              heliusKey, 
              position.buy_signature, 
              position.token_mint,
              walletPubkey
            );
            if (correctQuantity) source = "helius_parse";
          }
          
          // Only use current balance if we can't parse the transaction
          // This is a fallback and may be inaccurate for multiple buys
          if (!correctQuantity) {
            correctQuantity = await getCurrentBalance(rpcUrl, walletPubkey, position.token_mint);
            if (correctQuantity) source = "current_balance_fallback";
          }
          
          verified++;

          const needsUpdate = correctQuantity !== null && 
            String(correctQuantity) !== String(position.quantity_tokens);

          const result: any = {
            positionId: position.id,
            tokenMint: position.token_mint.substring(0, 12) + "...",
            hasBuySig: !!position.buy_signature,
            dbQuantity: position.quantity_tokens,
            correctQuantity,
            source,
            needsUpdate,
          };

          if (needsUpdate && !dryRun) {
            await supabase
              .from("flip_positions")
              .update({ quantity_tokens: correctQuantity })
              .eq("id", position.id);
            result.updated = true;
            updated++;
          } else if (!needsUpdate) {
            skipped++;
          }

          results.push(result);

          // Rate limit - Helius has limits
          await new Promise(resolve => setTimeout(resolve, 300));
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
        skipped,
        errors,
        results: results.slice(0, 30),
      });
    }

    if (action === "get_stats") {
      const { data: holding } = await supabase
        .from("flip_positions")
        .select("id", { count: "exact" })
        .eq("status", "holding");

      const { data: withSig } = await supabase
        .from("flip_positions")
        .select("id", { count: "exact" })
        .eq("status", "holding")
        .not("buy_signature", "is", null);

      const { data: nullQuantity } = await supabase
        .from("flip_positions")
        .select("id", { count: "exact" })
        .eq("status", "holding")
        .is("quantity_tokens", null);

      return ok({
        totalHolding: holding?.length || 0,
        withBuySignature: withSig?.length || 0,
        nullQuantityHolding: nullQuantity?.length || 0,
        canFixAccurately: withSig?.length || 0,
      });
    }

    return bad("Invalid action. Use: verify_all, backfill_nulls, fix_all, verify_single, or get_stats");
  } catch (e) {
    console.error("flipit-verify-positions error:", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
