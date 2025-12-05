import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    if (action === 'check_reactivations') {
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

      // Check SOL balances via public RPC (lightweight check)
      const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : 'https://api.mainnet-beta.solana.com';

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
                  // Keep dust_marked_at for tracking that it WAS dust before
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

      const result = data?.[0] || { marked_count: 0, total_dust: 0, total_active: 0 };
      console.log(`[Dust Monitor] Marked ${result.marked_count} as dust. Total: ${result.total_dust} dust, ${result.total_active} active`);

      return new Response(JSON.stringify({
        success: true,
        marked: result.marked_count,
        total_dust: result.total_dust,
        total_active: result.total_active
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'get_stats') {
      // Get dust wallet statistics
      const { data, error } = await supabase.rpc('get_dust_wallet_stats', {
        whale_id: mega_whale_id || null
      });

      if (error) {
        throw new Error(`Failed to get dust stats: ${error.message}`);
      }

      return new Response(JSON.stringify({
        success: true,
        stats: data?.[0] || null
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else {
      return new Response(JSON.stringify({
        error: 'Invalid action. Use: check_reactivations, mark_dust, or get_stats'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error('[Dust Monitor] Error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error'
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
