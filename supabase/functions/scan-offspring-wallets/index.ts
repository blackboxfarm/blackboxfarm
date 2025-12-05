import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WalletScanResult {
  wallet_address: string;
  current_sol_balance: number;
  has_minted: boolean;
  minted_token: string | null;
  is_bundled: boolean;
  bundle_id: string | null;
  last_activity_at: string | null;
  activity_count: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mega_whale_id, batch_size = 50 } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log(`[ScanOffspring] Starting scan for whale: ${mega_whale_id || 'ALL'}`);
    
    // Get offspring wallets to scan
    let query = supabase
      .from('mega_whale_offspring')
      .select('id, wallet_address, mega_whale_id, has_minted, is_bundled, balance_checked_at')
      .order('balance_checked_at', { ascending: true, nullsFirst: true })
      .limit(batch_size);
    
    if (mega_whale_id) {
      query = query.eq('mega_whale_id', mega_whale_id);
    }
    
    const { data: wallets, error: fetchError } = await query;
    
    if (fetchError) throw fetchError;
    
    console.log(`[ScanOffspring] Scanning ${wallets?.length || 0} wallets`);
    
    const results: WalletScanResult[] = [];
    const bundleMap: Map<string, string[]> = new Map(); // fundingSource -> walletAddresses
    const mintedWallets: string[] = [];
    const activeWallets: string[] = [];
    
    // Process wallets in parallel batches of 10
    const processWallet = async (wallet: typeof wallets[0]) => {
      try {
        const result: WalletScanResult = {
          wallet_address: wallet.wallet_address,
          current_sol_balance: 0,
          has_minted: false,
          minted_token: null,
          is_bundled: false,
          bundle_id: null,
          last_activity_at: null,
          activity_count: 0
        };
        
        if (!heliusApiKey) {
          console.log(`[ScanOffspring] No Helius API key, skipping ${wallet.wallet_address}`);
          return result;
        }
        
        // 1. Get balance
        const balanceResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [wallet.wallet_address]
          })
        });
        
        const balanceData = await balanceResponse.json();
        result.current_sol_balance = (balanceData.result?.value || 0) / 1e9;
        
        // 2. Get recent transactions to check for minting and activity
        const txResponse = await fetch(`https://api.helius.xyz/v0/addresses/${wallet.wallet_address}/transactions?api-key=${heliusApiKey}&limit=20`);
        
        if (txResponse.ok) {
          const transactions = await txResponse.json();
          result.activity_count = transactions.length;
          
          if (transactions.length > 0) {
            result.last_activity_at = new Date(transactions[0].timestamp * 1000).toISOString();
            
            // Check for token minting (look for initializeMint or create instructions)
            for (const tx of transactions) {
              // Check if this wallet created a token
              if (tx.type === 'TOKEN_MINT' || tx.type === 'CREATE' || 
                  tx.description?.toLowerCase().includes('mint') ||
                  tx.instructions?.some((i: any) => 
                    i.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
                    (i.type === 'initializeMint' || i.type === 'initializeMint2')
                  )) {
                result.has_minted = true;
                
                // Try to extract the minted token address
                const tokenMint = tx.tokenTransfers?.[0]?.mint || 
                                  tx.events?.token?.mint ||
                                  tx.instructions?.find((i: any) => i.accounts?.length > 0)?.accounts?.[0];
                if (tokenMint) {
                  result.minted_token = tokenMint;
                }
                break;
              }
              
              // Also check for pump.fun mints
              if (tx.source === 'PUMP_FUN' && tx.type === 'SWAP' && 
                  tx.tokenTransfers?.[0]?.fromUserAccount === wallet.wallet_address) {
                // Check if it's a very early buy (potential creator)
                const tokenMint = tx.tokenTransfers?.[0]?.mint;
                if (tokenMint) {
                  // Could be a creator buying their own token early
                  result.has_minted = true;
                  result.minted_token = tokenMint;
                }
              }
            }
            
            // 3. Bundle detection - check if funded from same source as other wallets
            // Look at the first incoming SOL transfer
            const incomingTx = transactions.find((tx: any) => 
              tx.nativeTransfers?.some((t: any) => 
                t.toUserAccount === wallet.wallet_address && t.amount > 0
              )
            );
            
            if (incomingTx) {
              const fundingSource = incomingTx.nativeTransfers?.find((t: any) => 
                t.toUserAccount === wallet.wallet_address
              )?.fromUserAccount;
              
              if (fundingSource) {
                // Track for bundle detection
                if (!bundleMap.has(fundingSource)) {
                  bundleMap.set(fundingSource, []);
                }
                bundleMap.get(fundingSource)!.push(wallet.wallet_address);
              }
            }
          }
        }
        
        return result;
      } catch (error) {
        console.error(`[ScanOffspring] Error scanning ${wallet.wallet_address}:`, error);
        return {
          wallet_address: wallet.wallet_address,
          current_sol_balance: 0,
          has_minted: false,
          minted_token: null,
          is_bundled: false,
          bundle_id: null,
          last_activity_at: null,
          activity_count: 0
        };
      }
    };
    
    // Process in batches of 10
    for (let i = 0; i < (wallets || []).length; i += 10) {
      const batch = wallets!.slice(i, i + 10);
      const batchResults = await Promise.all(batch.map(processWallet));
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + 10 < (wallets || []).length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    
    // 4. Identify bundles (wallets funded by the same source)
    for (const [fundingSource, fundedWallets] of bundleMap.entries()) {
      if (fundedWallets.length >= 3) { // Consider it a bundle if 3+ wallets from same source
        const bundleId = `bundle_${fundingSource.slice(0, 8)}`;
        for (const walletAddr of fundedWallets) {
          const result = results.find(r => r.wallet_address === walletAddr);
          if (result) {
            result.is_bundled = true;
            result.bundle_id = bundleId;
          }
        }
      }
    }
    
    // 5. Update database with results
    let updatedCount = 0;
    for (const result of results) {
      const wallet = wallets?.find(w => w.wallet_address === result.wallet_address);
      if (!wallet) continue;
      
      const { error: updateError } = await supabase
        .from('mega_whale_offspring')
        .update({
          current_sol_balance: result.current_sol_balance,
          has_minted: result.has_minted,
          minted_token: result.minted_token,
          is_bundled: result.is_bundled,
          bundle_id: result.bundle_id,
          last_activity_at: result.last_activity_at,
          balance_checked_at: new Date().toISOString()
        })
        .eq('id', wallet.id);
      
      if (!updateError) {
        updatedCount++;
        if (result.has_minted) mintedWallets.push(result.wallet_address);
        if (result.activity_count > 0) activeWallets.push(result.wallet_address);
      }
    }
    
    // Calculate bundle summary
    const bundledWallets = results.filter(r => r.is_bundled);
    const uniqueBundles = new Set(bundledWallets.map(r => r.bundle_id).filter(Boolean));
    
    const summary = {
      totalScanned: results.length,
      updatedCount,
      mintedCount: mintedWallets.length,
      bundledCount: bundledWallets.length,
      uniqueBundles: uniqueBundles.size,
      activeCount: activeWallets.length,
      mintedWallets: mintedWallets.slice(0, 10), // First 10 for display
      bundles: Array.from(uniqueBundles).slice(0, 5) // First 5 bundles
    };
    
    console.log(`[ScanOffspring] Scan complete:`, summary);
    
    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('[ScanOffspring] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
