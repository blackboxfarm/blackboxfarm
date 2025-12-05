import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WalletData {
  address: string;
  depth: number;
  parent_address: string | null;
  sol_balance: number;
  has_minted: boolean;
  created_at: string | null;
  last_activity: string | null;
  is_bundled: boolean;
  bundle_id: string | null;
}

interface SyncResult {
  wallets_discovered: number;
  wallets_updated: number;
  new_wallets: number;
  balances_checked: number;
  minters_found: number;
  dust_marked: number;
  mintable_marked: number;
  bundled_detected: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { mega_whale_id, max_depth = 6, force_full_sync = false } = await req.json();

    if (!mega_whale_id) {
      return new Response(JSON.stringify({ error: 'mega_whale_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Master Sync] Starting for whale: ${mega_whale_id}, depth: ${max_depth}, force: ${force_full_sync}`);

    // Get mega whale info
    const { data: whale, error: whaleError } = await supabase
      .from('mega_whales')
      .select('*')
      .eq('id', mega_whale_id)
      .single();

    if (whaleError || !whale) {
      throw new Error(`Whale not found: ${whaleError?.message}`);
    }

    // Check last sync time
    const lastSync = whale.last_sync_at ? new Date(whale.last_sync_at) : null;
    const isIncrementalSync = lastSync && !force_full_sync;

    console.log(`[Master Sync] Mode: ${isIncrementalSync ? 'INCREMENTAL' : 'FULL'}, Last sync: ${lastSync?.toISOString() || 'never'}`);

    // Get RPC URL
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY not configured');
    }
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

    const result: SyncResult = {
      wallets_discovered: 0,
      wallets_updated: 0,
      new_wallets: 0,
      balances_checked: 0,
      minters_found: 0,
      dust_marked: 0,
      mintable_marked: 0,
      bundled_detected: 0,
    };

    // Track all wallets we find
    const walletMap = new Map<string, WalletData>();
    const processedAddresses = new Set<string>();
    const bundleGroups = new Map<string, string[]>(); // timestamp -> addresses

    // Helper: Fetch transaction history with Helius
    async function getTransactionHistory(address: string, limit = 100, beforeSignature?: string) {
      const params: any = { query: { source: address }, options: { limit } };
      if (beforeSignature) params.options.before = beforeSignature;

      const response = await fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}&limit=${limit}`);
      if (!response.ok) {
        console.error(`[Master Sync] Failed to get tx history for ${address}: ${response.status}`);
        return [];
      }
      return await response.json();
    }

    // Helper: Check if wallet has minted tokens
    async function checkMintHistory(address: string): Promise<boolean> {
      try {
        const txs = await getTransactionHistory(address, 50);
        for (const tx of txs) {
          // Check for token creation instructions
          if (tx.type === 'CREATE' || tx.type === 'TOKEN_MINT' || 
              tx.instructions?.some((i: any) => 
                i.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && 
                i.parsed?.type === 'initializeMint'
              )) {
            return true;
          }
          // Check source field for mints
          if (tx.source === 'PUMP_FUN' || tx.source === 'RAYDIUM') {
            if (tx.type === 'CREATE' || tx.description?.toLowerCase().includes('create')) {
              return true;
            }
          }
        }
        return false;
      } catch (error) {
        console.error(`[Master Sync] Mint check error for ${address}:`, error);
        return false;
      }
    }

    // Helper: Get SOL balance
    async function getSolBalance(address: string): Promise<number> {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [address]
          })
        });
        const result = await response.json();
        return (result?.result?.value || 0) / 1e9;
      } catch {
        return 0;
      }
    }

    // Helper: Get multiple balances efficiently
    async function getMultipleBalances(addresses: string[]): Promise<Map<string, number>> {
      const balances = new Map<string, number>();
      const batchSize = 100;

      for (let i = 0; i < addresses.length; i += batchSize) {
        const batch = addresses.slice(i, i + batchSize);
        try {
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getMultipleAccounts',
              params: [batch, { encoding: 'base64' }]
            })
          });
          const result = await response.json();
          const accounts = result?.result?.value || [];
          
          for (let j = 0; j < batch.length; j++) {
            const lamports = accounts[j]?.lamports || 0;
            balances.set(batch[j], lamports / 1e9);
          }
          result.balances_checked += batch.length;
        } catch (error) {
          console.error(`[Master Sync] Batch balance error:`, error);
        }

        // Rate limiting
        if (i + batchSize < addresses.length) {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      return balances;
    }

    // Helper: Discover wallets recursively
    async function discoverWallets(address: string, depth: number, parentAddress: string | null) {
      if (depth > max_depth || processedAddresses.has(address)) return;
      processedAddresses.add(address);

      console.log(`[Master Sync] Scanning depth ${depth}: ${address.slice(0, 8)}...`);

      // For incremental sync, only get recent transactions
      const txs = await getTransactionHistory(address, isIncrementalSync ? 50 : 100);

      for (const tx of txs) {
        // Skip old transactions in incremental mode
        if (isIncrementalSync && lastSync && new Date(tx.timestamp * 1000) < lastSync) {
          continue;
        }

        const timestamp = tx.timestamp * 1000;
        const timeKey = Math.floor(timestamp / 500).toString(); // 500ms bundle window

        // Extract recipient wallets from SOL transfers
        if (tx.nativeTransfers) {
          for (const transfer of tx.nativeTransfers) {
            if (transfer.fromUserAccount === address && transfer.amount > 0) {
              const recipient = transfer.toUserAccount;
              
              if (!walletMap.has(recipient)) {
                walletMap.set(recipient, {
                  address: recipient,
                  depth: depth + 1,
                  parent_address: address,
                  sol_balance: 0,
                  has_minted: false,
                  created_at: new Date(timestamp).toISOString(),
                  last_activity: new Date(timestamp).toISOString(),
                  is_bundled: false,
                  bundle_id: null,
                });
                result.wallets_discovered++;
              }

              // Track potential bundles (multiple wallets funded in same block)
              if (!bundleGroups.has(timeKey)) {
                bundleGroups.set(timeKey, []);
              }
              bundleGroups.get(timeKey)!.push(recipient);
            }
          }
        }
      }

      // Recursively scan discovered wallets at this depth
      const walletsAtNextDepth = Array.from(walletMap.values())
        .filter(w => w.depth === depth + 1 && w.parent_address === address);

      for (const wallet of walletsAtNextDepth) {
        await discoverWallets(wallet.address, depth + 1, address);
        await new Promise(r => setTimeout(r, 100)); // Rate limit
      }
    }

    // STEP 1: Discover wallets starting from whale
    await discoverWallets(whale.wallet_address, 0, null);
    console.log(`[Master Sync] Discovery complete. Found ${walletMap.size} wallets`);

    // STEP 2: Detect bundles (wallets funded within 500ms of each other)
    for (const [timeKey, addresses] of bundleGroups) {
      if (addresses.length >= 3) { // 3+ wallets = bundle
        const bundleId = `bundle_${timeKey}`;
        for (const addr of addresses) {
          const wallet = walletMap.get(addr);
          if (wallet) {
            wallet.is_bundled = true;
            wallet.bundle_id = bundleId;
          }
        }
        result.bundled_detected += addresses.length;
        console.log(`[Master Sync] Bundle detected: ${addresses.length} wallets in ${bundleId}`);
      }
    }

    // STEP 3: Get balances for all wallets
    const allAddresses = Array.from(walletMap.keys());
    const balances = await getMultipleBalances(allAddresses);
    for (const [addr, balance] of balances) {
      const wallet = walletMap.get(addr);
      if (wallet) {
        wallet.sol_balance = balance;
      }
    }
    result.balances_checked = balances.size;

    // STEP 4: Check mint history for wallets with sufficient balance
    const potentialMinters = Array.from(walletMap.values())
      .filter(w => w.sol_balance >= 0.01 || !isIncrementalSync);

    console.log(`[Master Sync] Checking mint history for ${potentialMinters.length} wallets...`);
    
    let mintCheckCount = 0;
    for (const wallet of potentialMinters) {
      wallet.has_minted = await checkMintHistory(wallet.address);
      if (wallet.has_minted) {
        result.minters_found++;
      }
      mintCheckCount++;
      
      // Progress log every 50
      if (mintCheckCount % 50 === 0) {
        console.log(`[Master Sync] Mint check progress: ${mintCheckCount}/${potentialMinters.length}`);
      }
      
      await new Promise(r => setTimeout(r, 50)); // Rate limit
    }

    // STEP 5: Store/update wallets in database
    console.log(`[Master Sync] Saving ${walletMap.size} wallets to database...`);
    
    for (const wallet of walletMap.values()) {
      // Determine flags
      const isDust = wallet.sol_balance < 0.01 && !wallet.has_minted;
      const isMintable = wallet.sol_balance >= 0.05 && !wallet.has_minted && !wallet.is_bundled;

      const { data: existing } = await supabase
        .from('mega_whale_offspring')
        .select('id')
        .eq('mega_whale_id', mega_whale_id)
        .eq('wallet_address', wallet.address)
        .single();

      if (existing) {
        // Update existing
        await supabase
          .from('mega_whale_offspring')
          .update({
            current_sol_balance: wallet.sol_balance,
            balance_checked_at: new Date().toISOString(),
            has_minted: wallet.has_minted,
            is_dust: isDust,
            dust_marked_at: isDust ? new Date().toISOString() : null,
            is_bundled: wallet.is_bundled,
            bundle_id: wallet.bundle_id,
            is_mintable: isMintable,
            last_activity_at: wallet.last_activity,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        result.wallets_updated++;
      } else {
        // Insert new
        await supabase
          .from('mega_whale_offspring')
          .insert({
            mega_whale_id: mega_whale_id,
            wallet_address: wallet.address,
            depth: wallet.depth,
            parent_wallet_address: wallet.parent_address,
            total_sol_received: wallet.sol_balance,
            current_sol_balance: wallet.sol_balance,
            balance_checked_at: new Date().toISOString(),
            has_minted: wallet.has_minted,
            is_dust: isDust,
            dust_marked_at: isDust ? new Date().toISOString() : null,
            is_bundled: wallet.is_bundled,
            bundle_id: wallet.bundle_id,
            is_mintable: isMintable,
            first_seen_at: wallet.created_at,
            last_activity_at: wallet.last_activity,
          });
        result.new_wallets++;
      }

      if (isDust) result.dust_marked++;
      if (isMintable) result.mintable_marked++;
    }

    // STEP 6: Update whale's last sync time and stats
    await supabase
      .from('mega_whales')
      .update({
        last_sync_at: new Date().toISOString(),
        total_offspring_wallets: walletMap.size,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mega_whale_id);

    console.log(`[Master Sync] Complete!`, result);

    return new Response(JSON.stringify({
      success: true,
      sync_type: isIncrementalSync ? 'incremental' : 'full',
      ...result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Master Sync] Error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
