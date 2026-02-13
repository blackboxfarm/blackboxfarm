import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('token-metadata-batch');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
  createdAt?: string;
  marketCap?: number;
  launchpad?: string;
}

async function fetchPumpFunData(mint: string): Promise<Partial<TokenInfo>> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) return {};
    const data = await response.json();
    return {
      name: data.name,
      symbol: data.symbol,
      image: data.image_uri,
      createdAt: data.created_timestamp ? new Date(data.created_timestamp).toISOString() : undefined,
      marketCap: data.usd_market_cap,
      launchpad: 'pump.fun'
    };
  } catch {
    return {};
  }
}

async function fetchDexScreenerData(mint: string): Promise<Partial<TokenInfo>> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) return {};
    const data = await response.json();
    const pair = data.pairs?.[0];
    if (!pair) return {};
    return {
      name: pair.baseToken?.name,
      symbol: pair.baseToken?.symbol,
      marketCap: pair.marketCap,
    };
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mints } = await req.json();
    
    if (!mints || !Array.isArray(mints)) {
      throw new Error('mints array is required');
    }

    const results: TokenInfo[] = [];

    for (const mint of mints.slice(0, 20)) { // Limit to 20 tokens
      await new Promise(r => setTimeout(r, 100)); // Rate limit
      
      const pumpData = await fetchPumpFunData(mint);
      let tokenInfo: TokenInfo = { mint, ...pumpData };
      
      // If pump.fun didn't have data, try DexScreener
      if (!tokenInfo.name) {
        const dexData = await fetchDexScreenerData(mint);
        tokenInfo = { ...tokenInfo, ...dexData };
      }
      
      results.push(tokenInfo);
    }

    return new Response(
      JSON.stringify({ tokens: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
