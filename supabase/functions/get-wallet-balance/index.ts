import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// RPC endpoints to try in order (Helius first, then fallbacks)
function getRpcEndpoints(): string[] {
  const endpoints: string[] = [];
  
  const heliusKey = Deno.env.get('HELIUS_API_KEY');
  if (heliusKey) {
    endpoints.push(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`);
  }
  
  const customRpc = Deno.env.get('SOLANA_RPC_URL');
  if (customRpc) {
    endpoints.push(customRpc);
  }
  
  // Public fallbacks (rate limited but work)
  endpoints.push('https://api.mainnet-beta.solana.com');
  
  return endpoints;
}

async function fetchBalanceFromRpc(rpcUrl: string, walletAddress: string): Promise<{ balance: number; lamports: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [walletAddress]
      }),
      signal: controller.signal
    });

    const data = await response.json();
    
    // Check for rate limit or errors
    if (data.error) {
      const errMsg = data.error.message || JSON.stringify(data.error);
      if (errMsg.includes('max usage') || errMsg.includes('rate limit') || errMsg.includes('429')) {
        console.log(`RPC rate limited: ${rpcUrl.substring(0, 50)}...`);
        return null;
      }
      throw new Error(errMsg);
    }

    const balanceLamports = data.result?.value || 0;
    const balanceSol = balanceLamports / 1e9;
    
    return { balance: balanceSol, lamports: balanceLamports };
  } catch (error) {
    console.log(`RPC failed (${rpcUrl.substring(0, 50)}...): ${(error as Error).message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { walletAddress } = await req.json();
    
    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: 'Wallet address required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoints = getRpcEndpoints();
    let lastError = 'No RPC endpoints available';
    
    // Try each RPC endpoint until one succeeds
    for (const rpcUrl of endpoints) {
      const result = await fetchBalanceFromRpc(rpcUrl, walletAddress);
      if (result !== null) {
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // All endpoints failed
    return new Response(
      JSON.stringify({ error: 'All RPC endpoints failed or rate limited', fallbackTried: endpoints.length }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching balance:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
