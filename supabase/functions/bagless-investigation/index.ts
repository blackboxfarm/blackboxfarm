import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { fetchTokenBalance, getRpcUrl, isProviderEnabled } from '../_shared/rpc-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { childWallet, tokenMint } = await req.json();

    if (!childWallet || !tokenMint) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: childWallet and tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bagless-investigation] Checking balance for wallet: ${childWallet}, token: ${tokenMint}`);

    // Use the provider-agnostic token balance fetcher
    const result = await fetchTokenBalance(childWallet, tokenMint);

    if (result.error) {
      console.error(`[bagless-investigation] Error from ${result.provider}:`, result.error);
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const balance = result.data?.balance || 0;
    const hasTokens = balance > 0;

    console.log(`[bagless-investigation] Provider: ${result.provider}, Balance: ${balance}`);

    return new Response(
      JSON.stringify({
        childWallet,
        tokenMint,
        currentBalance: balance,
        balanceRaw: result.data?.decimals ? Math.floor(balance * Math.pow(10, result.data.decimals)).toString() : '0',
        summary: hasTokens 
          ? `The wallet ${childWallet} currently holds ${balance.toLocaleString()} tokens.`
          : 'Wallet has no tokens for this mint',
        hasTokens,
        provider: result.provider
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[bagless-investigation] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
