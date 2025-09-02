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

    // Get basic token info from RPC - SIMPLIFIED to just mint data
    let decimals = 9;
    let supply = 0;
    let mintAuthority = null;
    let freezeAuthority = null;
    
    try {
      const heliosApiKey = Deno.env.get('HELIOS_API_KEY');
      const rpcUrl = heliosApiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${heliosApiKey}` : 
        'https://api.mainnet-beta.solana.com';
      
      console.log('Using RPC:', heliosApiKey ? 'Helios (fast)' : 'Default (slow)');
      console.log('Fetching mint data for:', tokenMint);
      
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
      console.log('RPC response received');
      
      if (data.result?.value?.data?.parsed?.info) {
        const mintInfo = data.result.value.data.parsed.info;
        decimals = mintInfo.decimals || 9;
        supply = parseInt(mintInfo.supply || '0');
        mintAuthority = mintInfo.mintAuthority;
        freezeAuthority = mintInfo.freezeAuthority;
        
        console.log('Mint data parsed:', {
          decimals,
          supply: supply.toString(),
          mintAuthority,
          freezeAuthority
        });
      } else {
        console.log('No mint data found in RPC response');
      }
    } catch (error) {
      console.log('Failed to fetch on-chain data:', error);
    }

    // Basic metadata with actual mint address and real on-chain data
    const metadata = {
      mint: tokenMint,
      name: `Token ${tokenMint.slice(0, 8)}...`, // Show part of mint address
      symbol: supply > 0 ? 'LIVE' : 'DEAD', // Show if token has supply
      decimals,
      totalSupply: supply / Math.pow(10, decimals),
      verified: mintAuthority === null, // Immutable if no mint authority
      mintAuthority,
      freezeAuthority
    };

    console.log('Returning mint data:', {
      tokenMint,
      decimals,
      totalSupply: metadata.totalSupply,
      hasSupply: supply > 0,
      isImmutable: mintAuthority === null
    });

    // Get token price using Jupiter Price API (same as SOL price method)
    let priceInfo = null;
    try {
      console.log('Fetching token price from Jupiter Price API...');
      
      const jupiterPriceResponse = await fetch(
        `https://price.jup.ag/v6/price?ids=${tokenMint}`,
        { 
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000)
        }
      );
      
      if (jupiterPriceResponse.ok) {
        const jupiterData = await jupiterPriceResponse.json();
        const tokenPriceData = jupiterData?.data?.[tokenMint];
        
        if (tokenPriceData?.price && typeof tokenPriceData.price === 'number') {
          priceInfo = {
            priceUsd: tokenPriceData.price,
            priceChange24h: 0, // Jupiter doesn't provide 24h change
            volume24h: 0,
            liquidity: 0,
            marketCap: (tokenPriceData.price * metadata.totalSupply),
            source: 'jupiter',
            timestamp: new Date().toISOString()
          };
          console.log(`Token price from Jupiter: $${tokenPriceData.price}`);
        } else {
          console.log('No price data found in Jupiter response');
        }
      } else {
        console.log('Jupiter Price API failed with status:', jupiterPriceResponse.status);
      }
    } catch (error) {
      console.log('Jupiter Price API error:', error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        metadata,
        priceInfo,
        onChainData: {
          decimals,
          supply: supply.toString(),
          mintAuthority,
          freezeAuthority
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