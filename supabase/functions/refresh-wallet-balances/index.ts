import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1.78.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication token');
    }

    // Get Solana RPC connection
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl);

    // Get all user's wallet pools
    const { data: walletPools, error: poolError } = await supabase
      .from('wallet_pools')
      .select('id, pubkey')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (poolError) throw poolError;

    // Get all user's blackbox wallets
    const { data: blackboxWallets, error: blackboxError } = await supabase
      .from('blackbox_wallets')
      .select(`
        id, pubkey,
        blackbox_campaigns!inner(user_id)
      `)
      .eq('blackbox_campaigns.user_id', user.id)
      .eq('is_active', true);

    if (blackboxError) throw blackboxError;

    const allWallets = [
      ...(walletPools || []).map(w => ({ ...w, type: 'pool' })),
      ...(blackboxWallets || []).map(w => ({ ...w, type: 'blackbox' }))
    ];

    console.log(`Refreshing balances for ${allWallets.length} wallets`);

    // Update balances in batches
    const batchSize = 10;
    for (let i = 0; i < allWallets.length; i += batchSize) {
      const batch = allWallets.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (wallet) => {
          try {
            const pubkey = new PublicKey(wallet.pubkey);
            const balance = await connection.getBalance(pubkey);
            const solBalance = balance / 1e9; // Convert lamports to SOL

            if (wallet.type === 'pool') {
              await supabase
                .from('wallet_pools')
                .update({
                  sol_balance: solBalance,
                  last_balance_check: new Date().toISOString()
                })
                .eq('id', wallet.id);
            } else {
              await supabase
                .from('blackbox_wallets')
                .update({
                  sol_balance: solBalance
                })
                .eq('id', wallet.id);
            }

            console.log(`Updated balance for ${wallet.pubkey}: ${solBalance} SOL`);
          } catch (error) {
            console.error(`Failed to update balance for ${wallet.pubkey}:`, error);
          }
        })
      );

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < allWallets.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Send notification about balance refresh
    await supabase
      .from('notifications')
      .insert({
        user_id: user.id,
        title: 'Wallet Balances Updated',
        message: `Successfully refreshed balances for ${allWallets.length} wallets.`,
        type: 'info'
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Updated ${allWallets.length} wallet balances`,
        count: allWallets.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in refresh-wallet-balances:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});