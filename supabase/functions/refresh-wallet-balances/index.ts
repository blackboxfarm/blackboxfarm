import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1.95.3?target=deno";
import { TOKEN_PROGRAM_ID } from "https://esm.sh/@solana/spl-token@0.4.6";

// KILL SWITCH - Set to true to disable function
const FUNCTION_DISABLED = false;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WalletBalance {
  pubkey: string;
  balance: number;
  lastUpdate: string;
}

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  symbol?: string | null;
  name?: string | null;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[WALLET-BALANCES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // KILL SWITCH - Early exit to reduce database load
  if (FUNCTION_DISABLED) {
    logStep('Function disabled via kill switch');
    return new Response(JSON.stringify({ status: 'disabled', message: 'Function temporarily disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseServiceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Use Helius if available, otherwise fallback to public RPC
    const heliusKey = Deno.env.get("HELIUS_API_KEY");
    const rpcUrl = heliusKey 
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
      : (Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com");
    const connection = new Connection(rpcUrl, { commitment: "confirmed" });
    logStep("Connected to Solana RPC", { hasHelius: !!heliusKey });

    // Check if this is a single wallet refresh request
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body provided, proceed with bulk refresh
    }

    // Single wallet refresh mode - works with just pubkey
    if (body.pubkey) {
      logStep("Single wallet refresh", { pubkey: body.pubkey.slice(0, 8) + "..." });
      
      try {
        let solBalance = 0;
        let tokens: TokenBalance[] = [];

        // Use Helius RPC if available for better reliability
        const rpcEndpoints = heliusKey 
          ? [`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`]
          : [
              "https://solana-mainnet.g.alchemy.com/v2/demo",
              "https://api.mainnet-beta.solana.com",
            ];

        // Get SOL balance
        for (const rpc of rpcEndpoints) {
          try {
            logStep("Fetching SOL balance", { endpoint: rpc.includes('helius') ? 'helius' : rpc.slice(0, 30) });
            const balanceResponse = await fetch(rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [body.pubkey]
              })
            });
            
            if (balanceResponse.ok) {
              const balanceData = await balanceResponse.json();
              if (balanceData.result?.value !== undefined) {
                solBalance = balanceData.result.value / 1_000_000_000;
                logStep("SOL balance fetched", { solBalance });
                break;
              }
            }
          } catch (rpcError) {
            logStep("RPC balance error", { error: String(rpcError) });
          }
        }

        // Get token accounts from RPC
        for (const rpc of rpcEndpoints) {
          if (tokens.length > 0) break;
          
          try {
            logStep("Fetching tokens", { endpoint: rpc.includes('helius') ? 'helius' : rpc.slice(0, 30) });
            
            // Try SPL Token Program
            const tokenResponse = await fetch(rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                  body.pubkey,
                  { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                  { encoding: 'jsonParsed' }
                ]
              })
            });
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              if (tokenData.result?.value) {
                const foundTokens = tokenData.result.value
                  .map((account: any) => {
                    const info = account.account?.data?.parsed?.info;
                    if (!info) return null;
                    const amount = info.tokenAmount?.uiAmount || 0;
                    if (amount === 0) return null;
                    return {
                      mint: info.mint,
                      balance: amount,
                      decimals: info.tokenAmount?.decimals || 0,
                      symbol: null,
                      name: null
                    };
                  })
                  .filter((t: TokenBalance | null) => t !== null);
                  
                if (foundTokens.length > 0) {
                  tokens = foundTokens;
                  logStep("Tokens found (SPL)", { count: tokens.length });
                }
              }
            }
            
            // Also try Token-2022 program
            const token2022Response = await fetch(rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'getTokenAccountsByOwner',
                params: [
                  body.pubkey,
                  { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' },
                  { encoding: 'jsonParsed' }
                ]
              })
            });
            
            if (token2022Response.ok) {
              const token2022Data = await token2022Response.json();
              if (token2022Data.result?.value) {
                const found2022Tokens = token2022Data.result.value
                  .map((account: any) => {
                    const info = account.account?.data?.parsed?.info;
                    if (!info) return null;
                    const amount = info.tokenAmount?.uiAmount || 0;
                    if (amount === 0) return null;
                    return {
                      mint: info.mint,
                      balance: amount,
                      decimals: info.tokenAmount?.decimals || 0,
                      symbol: null,
                      name: null
                    };
                  })
                  .filter((t: TokenBalance | null) => t !== null);
                  
                tokens = [...tokens, ...found2022Tokens];
                if (found2022Tokens.length > 0) {
                  logStep("Tokens found (Token-2022)", { count: found2022Tokens.length });
                }
              }
            }
          } catch (tokenError) {
            logStep("RPC token error", { error: String(tokenError) });
          }
        }

        // Enrich tokens with Helius DAS API metadata if available
        if (tokens.length > 0 && heliusKey) {
          try {
            logStep("Enriching tokens with Helius metadata");
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'token-balances',
                method: 'getAssetsByOwner',
                params: {
                  ownerAddress: body.pubkey,
                  page: 1,
                  limit: 100,
                  displayOptions: { showFungible: true }
                }
              })
            });
            const dasResult = await response.json();
            
            if (dasResult.result?.items) {
              const metadataMap = new Map();
              dasResult.result.items.forEach((item: any) => {
                metadataMap.set(item.id, {
                  symbol: item.token_info?.symbol || item.content?.metadata?.symbol,
                  name: item.content?.metadata?.name
                });
              });
              
              tokens = tokens.map(t => ({
                ...t,
                symbol: metadataMap.get(t.mint)?.symbol || t.symbol,
                name: metadataMap.get(t.mint)?.name || t.name
              }));
              logStep("Enriched tokens with metadata", { enriched: metadataMap.size });
            }
          } catch (dasError) {
            logStep("Helius metadata enrichment failed", { error: String(dasError) });
          }
        }

        logStep("Fetch complete", { solBalance, tokenCount: tokens.length });

        // Optionally update database if wallet_id is provided
        if (body.wallet_id && body.table) {
          const { error: updateError } = await supabaseServiceClient
            .from(body.table)
            .update({ sol_balance: solBalance })
            .eq("id", body.wallet_id);

          if (updateError) {
            logStep("Database update failed", { error: updateError.message });
          } else {
            logStep("Database updated", { table: body.table });
          }
        }

        return new Response(JSON.stringify({ 
          success: true,
          pubkey: body.pubkey,
          sol_balance: solBalance,
          tokens,
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logStep("Single wallet refresh failed", { error: errorMsg });
        return new Response(JSON.stringify({ 
          success: false,
          error: errorMsg,
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }
    }

    // Bulk refresh mode (original functionality)
    logStep("Starting bulk wallet balance refresh");

    // Get all active wallets from different pools
    const { data: walletPools, error: poolError } = await supabaseServiceClient
      .from("wallet_pools")
      .select("pubkey")
      .eq("is_active", true);

    const { data: blackboxWallets, error: blackboxError } = await supabaseServiceClient
      .from("blackbox_wallets")
      .select("pubkey")
      .eq("is_active", true);

    const { data: superAdminWallets, error: adminError } = await supabaseServiceClient
      .from("super_admin_wallets")
      .select("pubkey")
      .eq("is_active", true);

    if (poolError || blackboxError || adminError) {
      throw new Error(`Database query failed: ${JSON.stringify({ poolError, blackboxError, adminError })}`);
    }

    // Combine all wallet addresses
    const allWallets = [
      ...(walletPools || []).map(w => w.pubkey),
      ...(blackboxWallets || []).map(w => w.pubkey),
      ...(superAdminWallets || []).map(w => w.pubkey)
    ];

    const uniqueWallets = [...new Set(allWallets)];
    logStep("Found wallets to refresh", { count: uniqueWallets.length });

    if (uniqueWallets.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No wallets to refresh",
        updated: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const balanceUpdates: WalletBalance[] = [];
    const errors: Array<{ pubkey: string; error: string }> = [];

    // Update balances in batches to avoid overwhelming the RPC
    const batchSize = 10;
    for (let i = 0; i < uniqueWallets.length; i += batchSize) {
      const batch = uniqueWallets.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (pubkey) => {
        try {
          const publicKey = new PublicKey(pubkey);
          const balance = await connection.getBalance(publicKey);
          const solBalance = balance / 1_000_000_000; // Convert lamports to SOL
          
          balanceUpdates.push({
            pubkey,
            balance: solBalance,
            lastUpdate: new Date().toISOString()
          });
          
          logStep("Updated wallet balance", { pubkey: pubkey.slice(0, 8) + "...", balance: solBalance });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push({ pubkey, error: errorMsg });
          logStep("Failed to update wallet balance", { pubkey: pubkey.slice(0, 8) + "...", error: errorMsg });
        }
      });

      await Promise.all(batchPromises);
      
      // Small delay between batches to be respectful to RPC
      if (i + batchSize < uniqueWallets.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Update database with new balances
    let updatedCount = 0;

    for (const update of balanceUpdates) {
      try {
        // Update wallet pools
        const { error: poolUpdateError } = await supabaseServiceClient
          .from("wallet_pools")
          .update({ 
            sol_balance: update.balance,
            last_balance_check: update.lastUpdate 
          })
          .eq("pubkey", update.pubkey);

        // Update blackbox wallets
        const { error: blackboxUpdateError } = await supabaseServiceClient
          .from("blackbox_wallets")
          .update({ 
            sol_balance: update.balance,
            updated_at: update.lastUpdate 
          })
          .eq("pubkey", update.pubkey);

        if (!poolUpdateError && !blackboxUpdateError) {
          updatedCount++;
        } else {
          logStep("Database update failed", { 
            pubkey: update.pubkey.slice(0, 8) + "...", 
            poolUpdateError, 
            blackboxUpdateError 
          });
        }
      } catch (error) {
        logStep("Database update error", { 
          pubkey: update.pubkey.slice(0, 8) + "...", 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    logStep("Balance refresh completed", { 
      total: uniqueWallets.length,
      successful: balanceUpdates.length,
      updated: updatedCount,
      errors: errors.length 
    });

    return new Response(JSON.stringify({ 
      success: true,
      total: uniqueWallets.length,
      successful: balanceUpdates.length,
      updated: updatedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in refresh-wallet-balances", { message: errorMessage });
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});