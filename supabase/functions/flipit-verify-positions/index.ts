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

interface ParsedSwapResult {
  tokenAmount: number | null; // Human-readable token amount (with decimals applied)
  solInput: number | null; // SOL spent in the swap
}

// Parse a transaction via Helius to get exact token amounts AND SOL input from a swap
async function parseSwapTransaction(
  heliusKey: string,
  signature: string,
  targetMint: string,
  walletPubkey: string
): Promise<ParsedSwapResult> {
  const result: ParsedSwapResult = { tokenAmount: null, solInput: null };
  
  try {
    const parseRes = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${heliusKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: [signature] }),
    });
    
    if (!parseRes.ok) {
      console.log(`Helius parse failed for ${signature}: ${parseRes.status}`);
      return result;
    }
    
    const parsedTxs = await parseRes.json();
    const parsedTx = parsedTxs?.[0];
    
    if (!parsedTx) {
      console.log(`No parsed transaction data for ${signature}`);
      return result;
    }
    
    console.log(`Parsed tx ${signature.substring(0, 12)}... type=${parsedTx.type} source=${parsedTx.source}`);
    
    // Extract SOL input from nativeTransfers (what wallet spent)
    if (parsedTx.nativeTransfers && Array.isArray(parsedTx.nativeTransfers)) {
      let totalSolSpent = 0;
      for (const transfer of parsedTx.nativeTransfers) {
        // SOL sent FROM our wallet to the AMM/market
        if (transfer.fromUserAccount === walletPubkey && transfer.amount > 0) {
          totalSolSpent += transfer.amount / 1e9; // lamports to SOL
        }
      }
      if (totalSolSpent > 0) {
        result.solInput = totalSolSpent;
        console.log(`Found SOL input from nativeTransfers: ${totalSolSpent} SOL`);
      }
    }
    
    // Also check swap event for tokenInputs (native SOL)
    if (parsedTx?.events?.swap) {
      const swapEvent = parsedTx.events.swap;
      
      // Check nativeInput (SOL spent)
      if (swapEvent.nativeInput && result.solInput === null) {
        const nativeAmount = swapEvent.nativeInput.amount;
        if (nativeAmount && nativeAmount > 0) {
          result.solInput = nativeAmount / 1e9;
          console.log(`Found SOL input from swap.nativeInput: ${result.solInput} SOL`);
        }
      }
      
      // Also check tokenInputs for WSOL
      if (swapEvent.tokenInputs && result.solInput === null) {
        const wsolInput = swapEvent.tokenInputs.find(
          (inp: any) => inp.mint === "So11111111111111111111111111111111111111112"
        );
        if (wsolInput?.rawTokenAmount?.tokenAmount) {
          result.solInput = Number(wsolInput.rawTokenAmount.tokenAmount) / 1e9;
          console.log(`Found SOL input from swap.tokenInputs WSOL: ${result.solInput} SOL`);
        }
      }
      
      // Find token output matching our target mint
      const tokenOutput = swapEvent.tokenOutputs?.find(
        (out: any) => out.mint === targetMint
      );
      
      if (tokenOutput?.rawTokenAmount?.tokenAmount) {
        // Apply decimals to get human-readable amount
        const rawAmount = BigInt(tokenOutput.rawTokenAmount.tokenAmount);
        const decimals = tokenOutput.rawTokenAmount.decimals ?? 9;
        result.tokenAmount = Number(rawAmount) / Math.pow(10, decimals);
        console.log(`Token output: raw=${rawAmount}, decimals=${decimals}, human=${result.tokenAmount}`);
      } else if (tokenOutput?.tokenAmount) {
        // tokenAmount is already human-readable
        result.tokenAmount = Number(tokenOutput.tokenAmount);
      }
    }
    
    // Fallback: tokenTransfers array for token amount
    if (!result.tokenAmount && parsedTx?.tokenTransfers?.length > 0) {
      // Also look for WSOL outbound for solInput
      if (result.solInput === null) {
        const wsolTransfer = parsedTx.tokenTransfers.find(
          (t: any) => 
            t.mint === "So11111111111111111111111111111111111111112" && 
            t.fromUserAccount === walletPubkey
        );
        if (wsolTransfer?.tokenAmount) {
          result.solInput = wsolTransfer.tokenAmount;
          console.log(`Found SOL input from tokenTransfers WSOL: ${result.solInput} SOL`);
        }
      }
      
      const inboundTransfer = parsedTx.tokenTransfers.find(
        (t: any) => t.mint === targetMint && t.toUserAccount === walletPubkey
      );
      
      if (inboundTransfer?.tokenAmount) {
        // tokenAmount in tokenTransfers is already human-readable
        result.tokenAmount = Number(inboundTransfer.tokenAmount);
      }
    }
    
    // Fallback: accountData tokenBalanceChanges
    if (result.tokenAmount === null && parsedTx?.accountData?.length > 0) {
      for (const acct of parsedTx.accountData) {
        const tokenChange = acct.tokenBalanceChanges?.find(
          (c: any) => c.mint === targetMint && c.userAccount === walletPubkey
        );
        if (tokenChange?.rawTokenAmount?.tokenAmount) {
          const rawAmount = BigInt(tokenChange.rawTokenAmount.tokenAmount);
          if (rawAmount > 0n) {
            // Apply decimals to get human-readable amount
            const decimals = tokenChange.rawTokenAmount.decimals ?? 9;
            result.tokenAmount = Number(rawAmount) / Math.pow(10, decimals);
            console.log(`Token balance change: raw=${rawAmount}, decimals=${decimals}, human=${result.tokenAmount}`);
            break;
          }
        }
      }
    }
    
    console.log(`Parsed result: tokenAmount=${result.tokenAmount}, solInput=${result.solInput}`);
    return result;
  } catch (e) {
    console.error(`Error parsing transaction ${signature}:`, e);
    return result;
  }
}

// Get current wallet balance as fallback
async function getCurrentBalance(
  rpcUrl: string, 
  walletPubkey: string, 
  tokenMint: string
): Promise<number | null> {
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
    
    if (accounts.length === 0) return 0;
    
    // Use uiAmount which is human-readable (decimals already applied)
    const tokenAmount = accounts[0]?.account?.data?.parsed?.info?.tokenAmount;
    if (tokenAmount?.uiAmount !== undefined) {
      return tokenAmount.uiAmount;
    }
    // Fallback: apply decimals manually
    const rawAmount = tokenAmount?.amount;
    const decimals = tokenAmount?.decimals ?? 9;
    if (rawAmount) {
      return Number(rawAmount) / Math.pow(10, decimals);
    }
    return null;
  } catch (e) {
    console.error(`Error getting balance for ${tokenMint}:`, e);
    return null;
  }
}

// Fetch current SOL price in USD with authenticated CoinGecko
async function getSolPrice(): Promise<number> {
  try {
    const apiKey = Deno.env.get('COINGECKO_API_KEY');
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { headers });
    if (!res.ok) return 135; // fallback
    const data = await res.json();
    return data?.solana?.usd || 135;
  } catch {
    return 135; // fallback
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

    // Get SOL price for USD calculations
    const solPrice = await getSolPrice();
    console.log(`Current SOL price: $${solPrice}`);

    if (action === "verify_single" && positionId) {
      const { data: position, error } = await supabase
        .from("flip_positions")
        .select("id, token_mint, wallet_id, quantity_tokens, buy_amount_usd, buy_signature, status, super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)")
        .eq("id", positionId)
        .single();

      if (error || !position) {
        return bad(`Position not found: ${error?.message || "unknown"}`);
      }

      const walletPubkey = (position as any).super_admin_wallets?.pubkey;
      if (!walletPubkey) {
        return bad("Wallet pubkey not found");
      }

      let parsed: ParsedSwapResult = { tokenAmount: null, solInput: null };
      
      // Try to parse the buy transaction to get exact amount and SOL spent
      if (position.buy_signature) {
        parsed = await parseSwapTransaction(
          heliusKey, 
          position.buy_signature, 
          position.token_mint,
          walletPubkey
        );
      }
      
      // Fallback to current balance only if no buy signature or parsing failed
      if (!parsed.tokenAmount) {
        parsed.tokenAmount = await getCurrentBalance(rpcUrl, walletPubkey, position.token_mint);
      }
      
      // Calculate correct USD amount from SOL input
      const correctBuyAmountUsd = parsed.solInput !== null ? parsed.solInput * solPrice : null;
      
      const result: any = {
        positionId: position.id,
        tokenMint: position.token_mint,
        buySignature: position.buy_signature,
        currentDbQuantity: position.quantity_tokens,
        currentDbBuyAmountUsd: position.buy_amount_usd,
        parsedQuantity: parsed.tokenAmount,
        parsedSolInput: parsed.solInput,
        correctBuyAmountUsd,
        solPriceUsed: solPrice,
        status: position.status,
      };

      if (!dryRun && (parsed.tokenAmount !== null || correctBuyAmountUsd !== null)) {
        const updateData: any = {};
        if (parsed.tokenAmount !== null) {
          updateData.quantity_tokens = parsed.tokenAmount;
        }
        if (correctBuyAmountUsd !== null) {
          updateData.buy_amount_usd = correctBuyAmountUsd;
        }
        
        await supabase
          .from("flip_positions")
          .update(updateData)
          .eq("id", position.id);
        result.updated = true;
        result.updateData = updateData;
      }

      return ok(result);
    }

    if (action === "verify_all" || action === "backfill_nulls" || action === "fix_all") {
      // Get positions - prioritize ones with buy_signature for accurate parsing
      const query = supabase
        .from("flip_positions")
        .select("id, token_mint, wallet_id, quantity_tokens, buy_amount_usd, buy_signature, status, super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)")
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
          let parsed: ParsedSwapResult = { tokenAmount: null, solInput: null };
          let source = "unknown";
          
          // Prefer parsing the buy signature for exact amount
          if (position.buy_signature) {
            parsed = await parseSwapTransaction(
              heliusKey, 
              position.buy_signature, 
              position.token_mint,
              walletPubkey
            );
            if (parsed.tokenAmount) source = "helius_parse";
          }
          
          // Only use current balance if we can't parse the transaction
          if (!parsed.tokenAmount) {
            const balance = await getCurrentBalance(rpcUrl, walletPubkey, position.token_mint);
            if (balance) {
              parsed.tokenAmount = balance;
              source = "current_balance_fallback";
            }
          }
          
          verified++;

          // Calculate correct USD from on-chain SOL spent
          const correctBuyAmountUsd = parsed.solInput !== null ? parsed.solInput * solPrice : null;

          const quantityNeedsUpdate = parsed.tokenAmount !== null && 
            String(parsed.tokenAmount) !== String(position.quantity_tokens);
          
          // Check if USD amount is significantly different (>5% off)
          const usdNeedsUpdate = correctBuyAmountUsd !== null && 
            position.buy_amount_usd !== null &&
            Math.abs(correctBuyAmountUsd - position.buy_amount_usd) / position.buy_amount_usd > 0.05;

          const needsUpdate = quantityNeedsUpdate || usdNeedsUpdate;

          const result: any = {
            positionId: position.id,
            tokenMint: position.token_mint.substring(0, 12) + "...",
            hasBuySig: !!position.buy_signature,
            dbQuantity: position.quantity_tokens,
            correctQuantity: parsed.tokenAmount,
            dbBuyAmountUsd: position.buy_amount_usd,
            parsedSolInput: parsed.solInput,
            correctBuyAmountUsd,
            source,
            needsUpdate,
          };

          if (needsUpdate && !dryRun) {
            const updateData: any = {};
            if (quantityNeedsUpdate && parsed.tokenAmount !== null) {
              updateData.quantity_tokens = parsed.tokenAmount;
            }
            if (usdNeedsUpdate && correctBuyAmountUsd !== null) {
              updateData.buy_amount_usd = correctBuyAmountUsd;
            }
            
            if (Object.keys(updateData).length > 0) {
              await supabase
                .from("flip_positions")
                .update(updateData)
                .eq("id", position.id);
              result.updated = true;
              result.updateData = updateData;
              updated++;
            }
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
        solPriceUsed: solPrice,
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
