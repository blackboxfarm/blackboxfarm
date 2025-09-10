import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

// Use TextEncoder/TextDecoder instead of Buffer for Deno compatibility
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Simple pump.fun token detection
function isPumpFunToken(mintAddress: string): boolean {
  const pumpFunPatterns = [
    /pump$/i,
    /^[1-9A-HJ-NP-Za-km-z]{44}$/,
  ];
  
  return pumpFunPatterns.some(pattern => pattern.test(mintAddress));
}

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
  image?: string;
  description?: string;
  uri?: string;
  isPumpFun?: boolean;
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
    const body = await req.json();
    const { tokenMint } = body;
    
    if (!tokenMint) {
      throw new Error('Token mint address is required');
    }

    console.log(`Fetching metadata for token: ${tokenMint}`);
    
    // Basic validation
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenMint)) {
      throw new Error('Invalid mint address format');
    }

    // Initialize response data
    let metadata: TokenMetadata = {
      mint: tokenMint,
      name: 'Unknown Token',
      symbol: 'UNK',
      decimals: 9,
      verified: false
    };
    
    let priceInfo = null;
    let onChainData = {
      decimals: 9,
      supply: '0',
      isPumpFun: isPumpFunToken(tokenMint)
    };

    // Skip complex on-chain lookups, focus on API data sources for speed
    console.log('Checking Jupiter token list...');

    // Try Jupiter token list first (faster and more reliable)
    try {
      const jupiterResponse = await fetchWithTimeout('https://token.jup.ag/all', 3000);
      
      if (jupiterResponse.ok) {
        const tokens = await jupiterResponse.json();
        const tokenData = tokens.find((t: any) => t.address === tokenMint);
        
        if (tokenData) {
          metadata = {
            mint: tokenMint,
            name: tokenData.name || 'Unknown Token',
            symbol: tokenData.symbol || 'UNK',
            decimals: tokenData.decimals || 9,
            logoURI: tokenData.logoURI,
            verified: true
          };
          onChainData.decimals = tokenData.decimals || 9;
          console.log('Found verified token in Jupiter list');
        }
      }
    } catch (error) {
      console.log('Jupiter fetch failed:', error.message);
    }

    // Try DexScreener for price data and token info if not found in Jupiter
    try {
      const dexResponse = await fetchWithTimeout(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
        4000
      );
      
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        
        if (dexData?.pairs && dexData.pairs.length > 0) {
          const pair = dexData.pairs[0];
          
          // Update metadata if we didn't find it in Jupiter
          if (!metadata.verified && pair.baseToken) {
            metadata.name = pair.baseToken.name || metadata.name;
            metadata.symbol = pair.baseToken.symbol || metadata.symbol;
            metadata.image = pair.baseToken.logoURI;
          }
          
          // Set price info
          priceInfo = {
            priceUsd: parseFloat(pair.priceUsd) || 0,
            priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            liquidity: parseFloat(pair.liquidity?.usd) || 0,
            dexUrl: pair.url
          };
          
          console.log('Found price data on DexScreener');
        }
      }
    } catch (error) {
      console.log('DexScreener fetch failed:', error.message);
    }

    // Mark pump.fun tokens
    if (isPumpFunToken(tokenMint)) {
      metadata.isPumpFun = true;
      onChainData.isPumpFun = true;
      console.log('Detected pump.fun token pattern');
    }

    const response = {
      success: true,
      metadata,
      priceInfo,
      onChainData
    };

    return new Response(
      JSON.stringify(response),
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