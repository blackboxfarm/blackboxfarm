import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusRpcUrl, getHeliusApiKey } from '../_shared/helius-client.ts';
enableHeliusTracking('dust-wallet-monitor');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DustWallet {
  id: string;
  wallet_address: string;
  total_sol_received: number;
  current_sol_balance: number;
  dust_marked_at: string;
  dust_recheck_at: string;
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

    const { action, mega_whale_id, dust_sol_threshold = 0.01, recheck_limit = 50 } = await req.json();

    console.log(`[Dust Monitor] Action: ${action}, Whale: ${mega_whale_id || 'all'}`);

    // Get RPC URL
    const rpcUrl = getHeliusApiKey() 
      ? getHeliusRpcUrl()
      : 'https://api.mainnet-beta.solana.com';

    if (action === 'initial_balance_check') {
      // Fetch ALL wallets and update their current SOL balances
      let query = supabase
        .from('mega_whale_offspring')
        .select('id, wallet_address')
        .order('created_at', { ascending: false });

      if (mega_whale_id) {
        query = query.eq('mega_whale_id', mega_whale_id);
      }

      const { data: wallets, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(`Failed to fetch wallets: ${fetchError.message}`);
      }

      console.log(`[Dust Monitor] Running initial balance check for ${wallets?.length || 0} wallets`);

      if (!wallets || wallets.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          checked: 0,
          message: 'No wallets found'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let checkedCount = 0;
      let errorCount = 0;
      const batchSize = 100; // Helius supports up to 100 accounts per call

      // Process in batches
      for (let i = 0; i < wallets.length; i += batchSize) {
        const batch = wallets.slice(i, i + batchSize);
        const addresses = batch.map(w => w.wallet_address);

        try {
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getMultipleAccounts',
              params: [addresses, { encoding: 'base64' }]
            })
          });

          const result = await response.json();
          const accounts = result?.result?.value || [];

          // Update each wallet's balance
          for (let j = 0; j < batch.length; j++) {
            const wallet = batch[j];
            const account = accounts[j];
            const lamports = account?.lamports || 0;
            const solBalance = lamports / 1e9;

            const { error: updateError } = await supabase
              .from('mega_whale_offspring')
              .update({
                current_sol_balance: solBalance,
                balance_checked_at: new Date().toISOString()
              })
              .eq('id', wallet.id);

            if (updateError) {
              console.error(`[Dust Monitor] Failed to update wallet ${wallet.id}: ${updateError.message}`);
              errorCount++;
            } else {
              checkedCount++;
            }
          }

          console.log(`[Dust Monitor] Batch ${Math.floor(i / batchSize) + 1}: Checked ${batch.length} wallets`);

          // Rate limit between batches
          if (i + batchSize < wallets.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (batchError) {
          console.error(`[Dust Monitor] Batch error:`, batchError);
          errorCount += batch.length;
        }
      }

      console.log(`[Dust Monitor] Initial balance check complete. Checked: ${checkedCount}, Errors: ${errorCount}`);

      return new Response(JSON.stringify({
        success: true,
        checked: checkedCount,
        errors: errorCount,
        total: wallets.length
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'check_reactivations') {
      // Get dust wallets that need rechecking
      let query = supabase
        .from('mega_whale_offspring')
        .select('id, wallet_address, total_sol_received, current_sol_balance, dust_marked_at, dust_recheck_at')
        .eq('is_dust', true)
        .lte('dust_recheck_at', new Date().toISOString())
        .order('dust_recheck_at', { ascending: true })
        .limit(recheck_limit);

      if (mega_whale_id) {
        query = query.eq('mega_whale_id', mega_whale_id);
      }

      const { data: dustWallets, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(`Failed to fetch dust wallets: ${fetchError.message}`);
      }

      console.log(`[Dust Monitor] Found ${dustWallets?.length || 0} dust wallets to recheck`);

      if (!dustWallets || dustWallets.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          checked: 0,
          reactivated: 0,
          message: 'No dust wallets due for recheck'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let reactivatedCount = 0;
      const reactivatedWallets: string[] = [];
      const batchSize = 10;

      // Process in batches to avoid rate limits
      for (let i = 0; i < dustWallets.length; i += batchSize) {
        const batch = dustWallets.slice(i, i + batchSize);
        const addresses = batch.map((w: DustWallet) => w.wallet_address);

        try {
          // Batch getMultipleAccounts call
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getMultipleAccounts',
              params: [addresses, { encoding: 'base64' }]
            })
          });

          const result = await response.json();
          const accounts = result?.result?.value || [];

          for (let j = 0; j < batch.length; j++) {
            const wallet = batch[j];
            const account = accounts[j];
            const lamports = account?.lamports || 0;
            const solBalance = lamports / 1e9;

            // Check if wallet has been reactivated (SOL deposited)
            if (solBalance > dust_sol_threshold) {
              // Reactivate wallet
              await supabase
                .from('mega_whale_offspring')
                .update({
                  is_dust: false,
                  current_sol_balance: solBalance,
                  balance_checked_at: new Date().toISOString()
                })
                .eq('id', wallet.id);

              reactivatedCount++;
              reactivatedWallets.push(wallet.wallet_address);
              console.log(`[Dust Monitor] Reactivated wallet: ${wallet.wallet_address.slice(0, 8)}... (${solBalance.toFixed(4)} SOL)`);
            } else {
              // Update balance and reschedule recheck
              const nextRecheck = new Date();
              nextRecheck.setHours(nextRecheck.getHours() + 24); // Check again in 24 hours

              await supabase
                .from('mega_whale_offspring')
                .update({
                  current_sol_balance: solBalance,
                  balance_checked_at: new Date().toISOString(),
                  dust_recheck_at: nextRecheck.toISOString()
                })
                .eq('id', wallet.id);
            }
          }

          // Small delay between batches to avoid rate limits
          if (i + batchSize < dustWallets.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (batchError) {
          console.error(`[Dust Monitor] Batch error:`, batchError);
          // Continue with next batch
        }
      }

      console.log(`[Dust Monitor] Complete. Checked: ${dustWallets.length}, Reactivated: ${reactivatedCount}`);

      return new Response(JSON.stringify({
        success: true,
        checked: dustWallets.length,
        reactivated: reactivatedCount,
        reactivated_wallets: reactivatedWallets
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'mark_dust') {
      // Mark inactive low-balance wallets as dust
      const { data, error } = await supabase.rpc('mark_dust_wallets', {
        min_sol_threshold: dust_sol_threshold,
        max_token_value_usd: 0.0001,
        recheck_interval_hours: 24
      });

      if (error) {
        throw new Error(`Failed to mark dust wallets: ${error.message}`);
      }

      const result = data?.[0] || { marked_count: 0, total_dust: 0, total_active: 0, wallets_without_balance: 0 };
      console.log(`[Dust Monitor] Marked ${result.marked_count} as dust. Total: ${result.total_dust} dust, ${result.total_active} active, ${result.wallets_without_balance} unchecked`);

      return new Response(JSON.stringify({
        success: true,
        marked: result.marked_count,
        total_dust: result.total_dust,
        total_active: result.total_active,
        wallets_without_balance: result.wallets_without_balance
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'get_stats') {
      // Get dust wallet statistics including balance check status
      const { data: stats, error: statsError } = await supabase.rpc('get_dust_wallet_stats', {
        whale_id: mega_whale_id || null
      });

      if (statsError) {
        throw new Error(`Failed to get dust stats: ${statsError.message}`);
      }

      // Also get count of wallets without balance data
      let balanceQuery = supabase
        .from('mega_whale_offspring')
        .select('balance_checked_at', { count: 'exact', head: true })
        .is('balance_checked_at', null);

      if (mega_whale_id) {
        balanceQuery = balanceQuery.eq('mega_whale_id', mega_whale_id);
      }

      const { count: uncheckedCount } = await balanceQuery;

      // Get last balance check time
      let lastCheckQuery = supabase
        .from('mega_whale_offspring')
        .select('balance_checked_at')
        .not('balance_checked_at', 'is', null)
        .order('balance_checked_at', { ascending: false })
        .limit(1);

      if (mega_whale_id) {
        lastCheckQuery = lastCheckQuery.eq('mega_whale_id', mega_whale_id);
      }

      const { data: lastCheck } = await lastCheckQuery;

      return new Response(JSON.stringify({
        success: true,
        stats: stats?.[0] || null,
        wallets_without_balance: uncheckedCount || 0,
        last_balance_check: lastCheck?.[0]?.balance_checked_at || null
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else {
      return new Response(JSON.stringify({
        error: 'Invalid action. Use: initial_balance_check, check_reactivations, mark_dust, or get_stats'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error('[Dust Monitor] Error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error'
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
