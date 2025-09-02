import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  totalSupply?: number;
  verified?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Token metadata request received');
    
    let body;
    try {
      body = await req.json();
      console.log('Request body:', body);
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      throw new Error('Invalid JSON in request body');
    }

    const { tokenMint } = body;

    if (!tokenMint) {
      console.error('No token mint provided');
      throw new Error('Token mint address is required');
    }

    // Validate mint address format (basic validation)
    if (typeof tokenMint !== 'string' || tokenMint.length < 32 || tokenMint.length > 44) {
      console.error('Invalid token mint format:', tokenMint);
      throw new Error('Invalid mint address format');
    }

    console.log('Processing token mint:', tokenMint);

    // Get basic token info from RPC (lighter approach)
    let decimals = 9;
    let supply = 0;
    
    try {
      const rpcUrl = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [
            tokenMint,
            { encoding: 'jsonParsed' }
          ]
        })
      });
      
      const data = await response.json();
      if (data.result?.value?.data?.parsed?.info) {
        decimals = data.result.value.data.parsed.info.decimals || 9;
        supply = parseInt(data.result.value.data.parsed.info.supply || '0');
      }
    } catch (error) {
      console.log('Failed to fetch on-chain data, using defaults:', error);
    }

    // Try to fetch metadata from Jupiter API (public token list)
    let metadata: TokenMetadata = {
      mint: tokenMint,
      name: 'Unknown Token',
      symbol: 'UNK',
      decimals,
      totalSupply: supply / Math.pow(10, decimals)
    };

    try {
      // Jupiter token list API with shorter timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
      
      const jupiterResponse = await fetch('https://token.jup.ag/all', {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      
      if (jupiterResponse.ok) {
        const tokens = await jupiterResponse.json();
        const tokenData = tokens.find((t: any) => t.address === tokenMint);
        
        if (tokenData) {
          console.log('Found token in Jupiter list:', tokenData.name);
          metadata = {
            mint: tokenMint,
            name: tokenData.name || 'Unknown Token',
            symbol: tokenData.symbol || 'UNK',
            decimals: tokenData.decimals || decimals,
            logoURI: tokenData.logoURI,
            totalSupply: supply / Math.pow(10, tokenData.decimals || decimals),
            verified: true
          };
        } else {
          console.log('Token not found in Jupiter list');
        }
      } else {
        console.log('Jupiter API response not ok:', jupiterResponse.status);
      }
    } catch (error) {
      console.log('Jupiter API failed:', error);
    }

    // Skip CoinGecko for now to reduce timeout issues
    console.log('Skipping CoinGecko API to improve performance');

    // Try to get current price from DexScreener with shorter timeout
    let priceInfo = null;
    try {
      const controller3 = new AbortController();
      const timeoutId3 = setTimeout(() => controller3.abort(), 1500); // 1.5 second timeout
      
      const dexResponse = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
        { 
          signal: controller3.signal,
          headers: { 'Accept': 'application/json' }
        }
      );
      clearTimeout(timeoutId3);
      
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        if (dexData.pairs && dexData.pairs.length > 0) {
          const pair = dexData.pairs[0];
          console.log('Found price data in DexScreener');
          priceInfo = {
            priceUsd: parseFloat(pair.priceUsd || '0'),
            priceChange24h: parseFloat(pair.priceChange?.h24 || '0'),
            volume24h: parseFloat(pair.volume?.h24 || '0'),
            liquidity: parseFloat(pair.liquidity?.usd || '0'),
            dexUrl: pair.url
          };
        } else {
          console.log('No pairs found in DexScreener');
        }
      } else {
        console.log('DexScreener API response not ok:', dexResponse.status);
      }
    } catch (error) {
      console.log('DexScreener API failed:', error);
    }

    console.log('Returning metadata:', { success: true, hasPrice: !!priceInfo });

    return new Response(
      JSON.stringify({
        success: true,
        metadata,
        priceInfo,
        onChainData: {
          decimals,
          supply: supply.toString(),
          mintAuthority: null,
          freezeAuthority: null
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in token-metadata:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});