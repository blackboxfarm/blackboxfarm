import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const heliusRpcUrl = Deno.env.get('HELIUS_RPC_URL');
    
    if (!heliusRpcUrl) {
      console.error('HELIUS_RPC_URL not configured');
      throw new Error('Helius RPC URL not configured');
    }

    const { tokenMint } = await req.json();
    
    if (!tokenMint) {
      throw new Error('Token mint address is required');
    }

    console.log('Fetching price for token:', tokenMint);

    // Get token account info from Helius
    const rpcResponse = await fetch(heliusRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [
          tokenMint,
          { encoding: 'jsonParsed', commitment: 'confirmed' }
        ]
      })
    });

    const rpcData = await rpcResponse.json();
    
    if (rpcData.error) {
      throw new Error(`Helius RPC error: ${rpcData.error.message}`);
    }

    // Also get price from Jupiter as backup/comparison
    let jupiterPrice = null;
    try {
      const jupiterResponse = await fetch(`https://price.jup.ag/v6/price?ids=${tokenMint}`);
      if (jupiterResponse.ok) {
        const jupiterData = await jupiterResponse.json();
        jupiterPrice = jupiterData?.data?.[tokenMint]?.price;
      }
    } catch (error) {
      console.log('Jupiter price fetch failed:', error.message);
    }

    // Get market data from DexScreener
    let marketData = null;
    try {
      const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        if (dexData.pairs && dexData.pairs.length > 0) {
          const pair = dexData.pairs[0];
          marketData = {
            priceUsd: parseFloat(pair.priceUsd || '0'),
            priceChange24h: parseFloat(pair.priceChange?.h24 || '0'),
            volume24h: parseFloat(pair.volume?.h24 || '0'),
            liquidity: parseFloat(pair.liquidity?.usd || '0'),
            marketCap: parseFloat(pair.fdv || '0'),
            source: 'dexscreener'
          };
        }
      }
    } catch (error) {
      console.log('DexScreener fetch failed:', error.message);
    }

    const finalPrice = marketData?.priceUsd || jupiterPrice || 0;

    return new Response(
      JSON.stringify({
        success: true,
        tokenMint,
        price: finalPrice,
        sources: {
          jupiter: jupiterPrice,
          dexscreener: marketData?.priceUsd,
          helius_rpc_status: 'connected'
        },
        marketData,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in helius-token-price:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});