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

// Helper: sleep for rate limiting
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
    console.log(`[Master Sync] Whale address: ${whale.wallet_address}`);

    // Use public Solana RPC for balances
    const rpcUrl = 'https://api.mainnet-beta.solana.com';

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

    // Helper: Fetch transaction history using Solscan API (free tier)
    async function getTransactionHistory(address: string, limit = 50) {
      try {
        // Use Solscan public API
        const response = await fetch(
          `https://public-api.solscan.io/account/transactions?account=${address}&limit=${limit}`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'BlackboxFarm/1.0'
            }
          }
        );
        
        if (!response.ok) {
          console.error(`[Master Sync] Solscan error for ${address}: ${response.status}`);
          return [];
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error(`[Master Sync] Failed to get tx history for ${address}:`, error);
        return [];
      }
    }

    // Helper: Get SOL transfers from Solscan
    async function getSolTransfers(address: string, limit = 50) {
      try {
        const response = await fetch(
          `https://public-api.solscan.io/account/solTransfers?account=${address}&limit=${limit}`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'BlackboxFarm/1.0'
            }
          }
        );
        
        if (!response.ok) {
          console.error(`[Master Sync] Solscan sol transfers error for ${address}: ${response.status}`);
          return [];
        }
        
        const data = await response.json();
        return data?.data || [];
      } catch (error) {
        console.error(`[Master Sync] Failed to get sol transfers for ${address}:`, error);
        return [];
      }
    }

    // Helper: Check if wallet has minted tokens using Solscan
    async function checkMintHistory(address: string): Promise<boolean> {
      try {
        // Check for token accounts created by this wallet
        const response = await fetch(
          `https://public-api.solscan.io/account/tokens?account=${address}`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'BlackboxFarm/1.0'
            }
          }
        );
        
        if (!response.ok) return false;
        
        const tokens = await response.json();
        // If wallet has created any SPL tokens, it's likely a minter
        // We'd need deeper analysis, but for now check if they have tokens with high supply %
        return Array.isArray(tokens) && tokens.some((t: any) => 
          t.tokenAmount?.uiAmount > 0 && t.tokenAmount?.decimals >= 6
        );
      } catch (error) {
        return false;
      }
    }

    // Helper: Get SOL balance using public RPC
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
        } catch (error) {
          console.error(`[Master Sync] Batch balance error:`, error);
        }

        // Rate limiting for public RPC
        if (i + batchSize < addresses.length) {
          await sleep(200);
        }
      }

      return balances;
    }

    // Helper: Discover wallets recursively
    async function discoverWallets(address: string, depth: number, parentAddress: string | null) {
      if (depth > max_depth || processedAddresses.has(address)) return;
      processedAddresses.add(address);

      console.log(`[Master Sync] Scanning depth ${depth}: ${address.slice(0, 8)}...`);

      // Rate limit: 1 second between Solscan API calls
      await sleep(1000);

      // Get SOL transfers (outgoing funds = offspring wallets)
      const transfers = await getSolTransfers(address, isIncrementalSync ? 30 : 50);

      console.log(`[Master Sync] Found ${transfers.length} SOL transfers for ${address.slice(0, 8)}...`);

      for (const transfer of transfers) {
        // Skip incoming transfers - we want outgoing (where this wallet sent SOL)
        if (transfer.src !== address) continue;

        // Skip if incremental and transfer is before last sync
        const txTime = transfer.blockTime * 1000;
        if (isIncrementalSync && lastSync && txTime < lastSync.getTime()) {
          continue;
        }

        const recipient = transfer.dst;
        if (!recipient || recipient === address) continue;

        const timestamp = txTime;
        const timeKey = Math.floor(timestamp / 500).toString(); // 500ms bundle window

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
          console.log(`[Master Sync] Discovered wallet: ${recipient.slice(0, 8)}... at depth ${depth + 1}`);
        }

        // Track potential bundles (multiple wallets funded in same block)
        if (!bundleGroups.has(timeKey)) {
          bundleGroups.set(timeKey, []);
        }
        bundleGroups.get(timeKey)!.push(recipient);
      }

      // Recursively scan discovered wallets at this depth (up to a reasonable limit per depth)
      const walletsAtNextDepth = Array.from(walletMap.values())
        .filter(w => w.depth === depth + 1 && w.parent_address === address)
        .slice(0, 20); // Limit to 20 per parent to avoid exponential growth

      for (const wallet of walletsAtNextDepth) {
        await discoverWallets(wallet.address, depth + 1, address);
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
    if (walletMap.size > 0) {
      console.log(`[Master Sync] Fetching balances for ${walletMap.size} wallets...`);
      const allAddresses = Array.from(walletMap.keys());
      const balances = await getMultipleBalances(allAddresses);
      for (const [addr, balance] of balances) {
        const wallet = walletMap.get(addr);
        if (wallet) {
          wallet.sol_balance = balance;
        }
      }
      result.balances_checked = balances.size;
    }

    // STEP 4: Check mint history for wallets with sufficient balance (sample to avoid rate limits)
    const potentialMinters = Array.from(walletMap.values())
      .filter(w => w.sol_balance >= 0.05)
      .slice(0, 30); // Limit to 30 mint checks to avoid rate limits

    console.log(`[Master Sync] Checking mint history for ${potentialMinters.length} wallets...`);
    
    for (const wallet of potentialMinters) {
      await sleep(1000); // 1 second delay for Solscan
      wallet.has_minted = await checkMintHistory(wallet.address);
      if (wallet.has_minted) {
        result.minters_found++;
        console.log(`[Master Sync] Minter found: ${wallet.address.slice(0, 8)}...`);
      }
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
