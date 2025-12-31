import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1.87.6";

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

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety

    console.log("FlipIt Phantom Position Cleanup - dryRun:", dryRun);

    // Get all holding positions
    const { data: holdingPositions, error: posErr } = await supabase
      .from("flip_positions")
      .select("id, wallet_id, token_mint, token_symbol, status, buy_signature, buy_executed_at, created_at")
      .eq("status", "holding")
      .order("created_at", { ascending: false });

    if (posErr) {
      return bad("Failed to fetch positions: " + posErr.message);
    }

    console.log(`Found ${holdingPositions?.length || 0} holding positions`);

    if (!holdingPositions || holdingPositions.length === 0) {
      return ok({ message: "No holding positions found", cleaned: 0 });
    }

    // Get unique wallet IDs
    const walletIds = [...new Set(holdingPositions.map(p => p.wallet_id))];
    
    // Fetch wallets
    const { data: wallets, error: walletErr } = await supabase
      .from("super_admin_wallets")
      .select("id, pubkey")
      .in("id", walletIds);

    if (walletErr || !wallets) {
      return bad("Failed to fetch wallets: " + walletErr?.message);
    }

    const walletMap = new Map(wallets.map(w => [w.id, w.pubkey]));

    // Setup RPC connection
    const heliusKey = Deno.env.get("HELIUS_API_KEY");
    const rpcUrl = heliusKey 
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
      : "https://api.mainnet-beta.solana.com";
    
    const connection = new Connection(rpcUrl, "confirmed");

    // Group positions by wallet
    const positionsByWallet = new Map<string, typeof holdingPositions>();
    for (const pos of holdingPositions) {
      const pubkey = walletMap.get(pos.wallet_id);
      if (!pubkey) continue;
      if (!positionsByWallet.has(pubkey)) {
        positionsByWallet.set(pubkey, []);
      }
      positionsByWallet.get(pubkey)!.push(pos);
    }

    const results: any[] = [];
    const phantomPositions: string[] = [];

    // Check each wallet's actual token holdings
    for (const [pubkey, positions] of positionsByWallet) {
      console.log(`Checking wallet ${pubkey} with ${positions.length} positions`);
      
      try {
        const walletPk = new PublicKey(pubkey);
        
        // Get all token accounts for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPk, {
          programId: TOKEN_PROGRAM_ID,
        });
        
        // Also check Token-2022 accounts
        const token2022Accounts = await connection.getParsedTokenAccountsByOwner(walletPk, {
          programId: TOKEN_2022_PROGRAM_ID,
        }).catch(() => ({ value: [] }));

        // Build map of actual token holdings
        const actualHoldings = new Map<string, number>();
        
        for (const account of [...tokenAccounts.value, ...token2022Accounts.value]) {
          const info = account.account.data.parsed?.info;
          if (info?.mint && info?.tokenAmount?.uiAmount > 0) {
            actualHoldings.set(info.mint, info.tokenAmount.uiAmount);
          }
        }

        console.log(`Wallet ${pubkey} has ${actualHoldings.size} tokens on-chain`);
        console.log("On-chain tokens:", Array.from(actualHoldings.keys()));

        // IMPORTANT: User can have multiple positions for the same token
        // We should NOT mark positions as phantom if there's ANY balance for that token
        // Group positions by token_mint to compare aggregate positions vs on-chain balance
        const positionsByToken = new Map<string, typeof positions>();
        for (const pos of positions) {
          if (!positionsByToken.has(pos.token_mint)) {
            positionsByToken.set(pos.token_mint, []);
          }
          positionsByToken.get(pos.token_mint)!.push(pos);
        }

        // Check each token's positions
        for (const [tokenMint, tokenPositions] of positionsByToken) {
          const actualBalance = actualHoldings.get(tokenMint) || 0;
          const hasOnChain = actualBalance > 0;
          
          // If there's NO on-chain balance for this token, ALL positions for it are phantom
          // If there IS balance, none of them are phantom (user may have accumulated multiple buys)
          for (const pos of tokenPositions) {
            results.push({
              positionId: pos.id,
              tokenMint: pos.token_mint,
              tokenSymbol: pos.token_symbol,
              buySignature: pos.buy_signature,
              hasOnChainBalance: hasOnChain,
              actualBalance,
              isPhantom: !hasOnChain,
              totalPositionsForToken: tokenPositions.length,
              createdAt: pos.created_at,
            });

            if (!hasOnChain) {
              phantomPositions.push(pos.id);
              console.log(`PHANTOM: ${pos.token_symbol} (${tokenMint}) - no on-chain balance at all`);
            } else {
              console.log(`VALID: ${pos.token_symbol} (${tokenMint}) - balance: ${actualBalance} (${tokenPositions.length} positions)`);
            }
          }
        }
      } catch (err: any) {
        console.error(`Error checking wallet ${pubkey}:`, err);
        for (const pos of positions) {
          results.push({
            positionId: pos.id,
            tokenMint: pos.token_mint,
            tokenSymbol: pos.token_symbol,
            error: err.message,
          });
        }
      }
    }

    // Clean up phantom positions
    let cleanedCount = 0;
    if (!dryRun && phantomPositions.length > 0) {
      console.log(`Cleaning up ${phantomPositions.length} phantom positions...`);
      
      for (const posId of phantomPositions) {
        const { error: updateErr } = await supabase
          .from("flip_positions")
          .update({ 
            status: "sold",
            error_message: "Cleaned up: no on-chain balance found",
            sell_executed_at: new Date().toISOString(),
          })
          .eq("id", posId);
        
        if (!updateErr) {
          cleanedCount++;
        } else {
          console.error(`Failed to clean position ${posId}:`, updateErr);
        }
      }
    }

    return ok({
      totalHolding: holdingPositions.length,
      phantomCount: phantomPositions.length,
      validCount: holdingPositions.length - phantomPositions.length,
      cleanedCount,
      dryRun,
      results,
      phantomPositionIds: phantomPositions,
    });

  } catch (err: any) {
    console.error("Cleanup error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
