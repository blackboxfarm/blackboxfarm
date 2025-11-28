import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1.95.3";
import { TOKEN_PROGRAM_ID } from "https://esm.sh/@solana/spl-token@0.4.6";

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

    // Single wallet refresh mode
    if (body.wallet_id && body.pubkey) {
      logStep("Single wallet refresh", { pubkey: body.pubkey.slice(0, 8) + "..." });
      
      try {
        const publicKey = new PublicKey(body.pubkey);
        
        // Get SOL balance
        const balance = await connection.getBalance(publicKey);
        const solBalance = balance / 1_000_000_000;
        logStep("SOL balance fetched", { solBalance });

        let tokens: TokenBalance[] = [];

        // Use Solscan API for token portfolio (most reliable)
        try {
          logStep("Fetching tokens from Solscan API");
          const solscanResponse = await fetch(
            `https://api.solscan.io/v2/account/tokens?address=${body.pubkey}&page=1&page_size=50`,
            {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
              }
            }
          );
          
          if (solscanResponse.ok) {
            const solscanData = await solscanResponse.json();
            logStep("Solscan API response", { success: solscanData.success, dataLength: solscanData.data?.length });
            
            if (solscanData.success && solscanData.data) {
              tokens = solscanData.data
                .filter((item: any) => item.amount > 0)
                .map((item: any) => ({
                  mint: item.tokenAddress,
                  balance: item.amount / Math.pow(10, item.decimals || 0),
                  decimals: item.decimals || 0,
                  symbol: item.tokenSymbol || null,
                  name: item.tokenName || null
                }));
              logStep("Tokens from Solscan", { count: tokens.length });
            }
          } else {
            logStep("Solscan API failed", { status: solscanResponse.status });
          }
        } catch (solscanError) {
          logStep("Solscan API error", { error: String(solscanError) });
        }

        // Fallback to Helius DAS API if Solscan didn't work
        if (tokens.length === 0 && heliusKey) {
          try {
            logStep("Trying Helius DAS API for tokens");
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
                  displayOptions: { showFungible: true, showNativeBalance: false }
                }
              })
            });
            const dasResult = await response.json();
            
            if (dasResult.result?.items) {
              tokens = dasResult.result.items
                .filter((item: any) => item.interface === 'FungibleToken' || item.interface === 'FungibleAsset')
                .map((item: any) => ({
                  mint: item.id,
                  balance: item.token_info?.balance ? item.token_info.balance / Math.pow(10, item.token_info.decimals || 0) : 0,
                  decimals: item.token_info?.decimals || 0,
                  symbol: item.token_info?.symbol || item.content?.metadata?.symbol || null,
                  name: item.content?.metadata?.name || null
                }))
                .filter((t: TokenBalance) => t.balance > 0);
              logStep("Tokens from Helius DAS", { count: tokens.length });
            }
          } catch (dasError) {
            logStep("Helius DAS failed", { error: String(dasError) });
          }
        }

        // Last fallback: standard RPC
        if (tokens.length === 0) {
          logStep("Using standard RPC for token accounts");
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId: TOKEN_PROGRAM_ID }
          );

          tokens = tokenAccounts.value
            .map((account) => {
              const parsed = account.account.data.parsed;
              const info = parsed.info;
              return {
                mint: info.mint,
                balance: parseFloat(info.tokenAmount.uiAmountString || "0"),
                decimals: info.tokenAmount.decimals
              };
            })
            .filter((t) => t.balance > 0);
          logStep("Tokens from standard RPC", { count: tokens.length });
        }

        logStep("Token accounts found", { count: tokens.length });

        // Update airdrop_wallets table
        const { error: updateError } = await supabaseServiceClient
          .from("airdrop_wallets")
          .update({ sol_balance: solBalance })
          .eq("id", body.wallet_id);

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        logStep("Single wallet balance updated", { pubkey: body.pubkey.slice(0, 8) + "...", solBalance, tokenCount: tokens.length });

        return new Response(JSON.stringify({ 
          success: true,
          sol_balance: solBalance,
          lamports: balance,
          tokens,
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logStep("Single wallet refresh failed", { error: errorMsg });
        throw new Error(errorMsg);
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