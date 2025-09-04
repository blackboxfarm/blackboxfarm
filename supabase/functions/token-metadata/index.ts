import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1.78.8";

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

// Helper function to check if token is on pump.fun
function isPumpFunToken(mintAddress: string): boolean {
  // Pump.fun tokens typically have specific characteristics
  // This is a simple heuristic - could be improved with more specific detection
  return mintAddress.endsWith('pump') || mintAddress.length === 44;
}

// Memory-optimized API call with timeout
async function fetchWithTimeout(url: string, timeout: number = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Token metadata request received');
    
    const body = await req.json();
    const { tokenMint } = body;
    console.log('Processing token:', tokenMint);

    if (!tokenMint) {
      throw new Error('Token mint address is required');
    }

    // Validate mint address
    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(tokenMint);
    } catch {
      throw new Error('Invalid mint address');
    }

    // Check if this is likely a pump.fun token
    const isPumpFun = isPumpFunToken(tokenMint);
    console.log('Is pump.fun token:', isPumpFun);

    const rpcUrl = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl);

    // Get basic on-chain data with reduced timeout
    let mintInfo;
    let decimals = 9;
    let supply = 0;
    
    try {
      mintInfo = await Promise.race([
        connection.getParsedAccountInfo(mintPubkey),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('RPC timeout')), 3000)
        )
      ]);
      
      if (mintInfo.value?.data) {
        const parsedData = mintInfo.value.data as any;
        decimals = parsedData.parsed?.info?.decimals || 9;
        supply = parsedData.parsed?.info?.supply || 0;
      }
    } catch (error) {
      console.log('RPC call failed, using defaults:', error.message);
    }

    // Initialize basic metadata
    let metadata: TokenMetadata = {
      mint: tokenMint,
      name: isPumpFun ? 'Pump.fun Token' : 'Token',
      symbol: isPumpFun ? 'PUMP' : 'TKN',
      decimals,
      totalSupply: supply / Math.pow(10, decimals),
      verified: false
    };

    // For pump.fun tokens, use a lighter approach
    if (isPumpFun) {
      console.log('Using pump.fun optimized path');
      
      // Only try DexScreener for pump.fun tokens (lighter than Jupiter + CG)
      let priceInfo = null;
      try {
        const dexResponse = await fetchWithTimeout(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
          3000
        );
        
        if (dexResponse.ok) {
          const dexData = await dexResponse.json();
          if (dexData.pairs && dexData.pairs.length > 0) {
            const pair = dexData.pairs[0];
            
            // Update metadata from dex data
            if (pair.baseToken?.name) {
              metadata.name = pair.baseToken.name;
              metadata.symbol = pair.baseToken.symbol || metadata.symbol;
            }
            
            priceInfo = {
              priceUsd: parseFloat(pair.priceUsd || '0'),
              priceChange24h: parseFloat(pair.priceChange?.h24 || '0'),
              volume24h: parseFloat(pair.volume?.h24 || '0'),
              liquidity: parseFloat(pair.liquidity?.usd || '0'),
              dexUrl: pair.url
            };
          }
        }
      } catch (error) {
        console.log('DexScreener failed for pump.fun token:', error.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          metadata: { ...metadata, isPumpFun: true },
          priceInfo,
          onChainData: {
            decimals,
            supply: supply.toString(),
            isPumpFun: true
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // For regular tokens, try Jupiter first (most reliable)
    try {
      console.log('Checking Jupiter token list...');
      const jupiterResponse = await fetchWithTimeout('https://token.jup.ag/strict', 4000);
      
      if (jupiterResponse.ok) {
        const tokens = await jupiterResponse.json();
        const tokenData = tokens.find((t: any) => t.address === tokenMint);
        
        if (tokenData) {
          metadata = {
            mint: tokenMint,
            name: tokenData.name || 'Token',
            symbol: tokenData.symbol || 'TKN',
            decimals: tokenData.decimals || decimals,
            logoURI: tokenData.logoURI,
            totalSupply: supply / Math.pow(10, tokenData.decimals || decimals),
            verified: true
          };
          
          console.log('Found verified token in Jupiter');
        }
      }
    } catch (error) {
      console.log('Jupiter API failed:', error.message);
    }

    // Get price info if not found in Jupiter
    let priceInfo = null;
    if (!metadata.verified) {
      try {
        console.log('Checking DexScreener for price...');
        const dexResponse = await fetchWithTimeout(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
          3000
        );
        
        if (dexResponse.ok) {
          const dexData = await dexResponse.json();
          if (dexData.pairs && dexData.pairs.length > 0) {
            const pair = dexData.pairs[0];
            priceInfo = {
              priceUsd: parseFloat(pair.priceUsd || '0'),
              priceChange24h: parseFloat(pair.priceChange?.h24 || '0'),
              volume24h: parseFloat(pair.volume?.h24 || '0'),
              liquidity: parseFloat(pair.liquidity?.usd || '0'),
              dexUrl: pair.url
            };
          }
        }
      } catch (error) {
        console.log('DexScreener failed:', error.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        metadata,
        priceInfo,
        onChainData: {
          decimals,
          supply: supply.toString(),
          mintAuthority: mintInfo?.value?.data?.parsed?.info?.mintAuthority,
          freezeAuthority: mintInfo?.value?.data?.parsed?.info?.freezeAuthority
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
      JSON.stringify({ 
        success: false,
        error: error.message,
        debug: {
          timestamp: new Date().toISOString(),
          error_type: error.name
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});