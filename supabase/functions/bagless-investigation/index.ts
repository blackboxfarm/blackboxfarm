import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { childWallet, tokenMint } = await req.json();
    
    if (!childWallet || !tokenMint) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: childWallet, tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Helius API key from environment
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) {
      return new Response(
        JSON.stringify({ error: 'Helius API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Checking current Bagless token balance for wallet: ${childWallet}`);
    console.log(`Token mint: ${tokenMint}`);

    // Get current token balance using Helius RPC
    const rpcUrl = `https://rpc.helius.xyz/?api-key=${heliusApiKey}`;
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          childWallet,
          {
            mint: tokenMint
          },
          {
            encoding: 'jsonParsed'
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    let currentBalance = 0;
    
    if (data.result && data.result.value && data.result.value.length > 0) {
      // Get the token account balance
      const tokenAccount = data.result.value[0];
      const balanceInfo = tokenAccount.account.data.parsed.info;
      currentBalance = parseFloat(balanceInfo.tokenAmount.uiAmount || 0);
    }

    console.log(`Current Bagless token balance: ${currentBalance}`);

    const result = {
      childWallet,
      tokenMint,
      currentBalance,
      balanceRaw: data.result?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.amount || '0',
      summary: `The wallet ${childWallet} currently holds ${currentBalance.toLocaleString()} Bagless tokens.`,
      hasTokens: currentBalance > 0
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Balance check error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Balance check failed', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});