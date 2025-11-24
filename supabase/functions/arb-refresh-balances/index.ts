import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) {
      throw new Error('Not authenticated');
    }

    const ethRpcUrl = Deno.env.get('ETH_RPC_URL');
    const baseRpcUrl = Deno.env.get('BASE_RPC_URL');
    const privateKey = Deno.env.get('ARB_WALLET_PRIVATE_KEY');

    if (!ethRpcUrl || !baseRpcUrl || !privateKey) {
      throw new Error('Missing required environment variables');
    }

    // Get wallet address from private key (this is a placeholder - in production use proper crypto library)
    // For now, we'll use a dummy implementation
    const walletAddress = "0x..."; // TODO: Derive from private key

    // Fetch ETH balance on mainnet
    const ethMainnetResponse = await fetch(ethRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
        id: 1
      })
    });
    const ethMainnetData = await ethMainnetResponse.json();
    const ethMainnet = parseInt(ethMainnetData.result, 16) / 1e18;

    // Fetch ETH balance on Base
    const ethBaseResponse = await fetch(baseRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
        id: 1
      })
    });
    const ethBaseData = await ethBaseResponse.json();
    const ethBase = parseInt(ethBaseData.result, 16) / 1e18;

    // TODO: Fetch BASE token balance on Base chain
    const baseTokenBase = 0;

    // Calculate total value (simplified - would need real price feeds)
    const ethPriceUsd = 3000; // TODO: Fetch from price oracle
    const totalValueUsd = (ethMainnet + ethBase) * ethPriceUsd;

    // Upsert balance record
    const { error } = await supabaseClient
      .from('arb_balances')
      .upsert({
        user_id: user.id,
        eth_mainnet: ethMainnet,
        eth_base: ethBase,
        base_token_base: baseTokenBase,
        total_value_usd: totalValueUsd,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        balances: {
          eth_mainnet: ethMainnet,
          eth_base: ethBase,
          base_token_base: baseTokenBase,
          total_value_usd: totalValueUsd
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error refreshing balances:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
