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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Token metadata request received');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    
    const body = await req.json();
    console.log('Raw request body:', JSON.stringify(body));
    const { tokenMint } = body;
    console.log('Parsed request body:', { tokenMint });

    if (!tokenMint) {
      throw new Error('Token mint address is required');
    }

    // Use public RPC endpoint as fallback
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    console.log('Using RPC URL:', rpcUrl);
    
    const connection = new Connection(rpcUrl);

    // Validate mint address
    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(tokenMint);
    } catch {
      throw new Error('Invalid mint address');
    }

    // Get mint info from Solana
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    
    if (!mintInfo.value || !mintInfo.value.data || mintInfo.value.data.space === undefined) {
      throw new Error('Token mint not found');
    }

    const parsedData = mintInfo.value.data as any;
    const decimals = parsedData.parsed?.info?.decimals || 9;
    const supply = parsedData.parsed?.info?.supply || 0;

    // Try to fetch metadata from Jupiter API (public token list)
    let metadata: TokenMetadata = {
      mint: tokenMint,
      name: 'Unknown Token',
      symbol: 'UNK',
      decimals,
      totalSupply: supply / Math.pow(10, decimals)
    };

    try {
      // Jupiter token list API
      const jupiterResponse = await fetch('https://token.jup.ag/all');
      if (jupiterResponse.ok) {
        const tokens = await jupiterResponse.json();
        const tokenData = tokens.find((t: any) => t.address === tokenMint);
        
        if (tokenData) {
          metadata = {
            mint: tokenMint,
            name: tokenData.name || 'Unknown Token',
            symbol: tokenData.symbol || 'UNK',
            decimals: tokenData.decimals || decimals,
            logoURI: tokenData.logoURI,
            totalSupply: supply / Math.pow(10, tokenData.decimals || decimals),
            verified: true
          };
        }
      }
    } catch (error) {
      console.log('Jupiter API failed, using basic metadata:', error);
    }

    // Try CoinGecko as fallback
    if (!metadata.verified) {
      try {
        const cgResponse = await fetch(
          `https://api.coingecko.com/api/v3/coins/solana/contract/${tokenMint}`
        );
        
        if (cgResponse.ok) {
          const cgData = await cgResponse.json();
          metadata = {
            ...metadata,
            name: cgData.name || metadata.name,
            symbol: cgData.symbol?.toUpperCase() || metadata.symbol,
            logoURI: cgData.image?.small || metadata.logoURI,
            verified: true
          };
        }
      } catch (error) {
        console.log('CoinGecko API failed:', error);
      }
    }

    // Try to get current price from DexScreener
    let priceInfo = null;
    try {
      const dexResponse = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
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
      console.log('DexScreener API failed:', error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        metadata,
        priceInfo,
        onChainData: {
          decimals,
          supply: supply.toString(),
          mintAuthority: parsedData.parsed?.info?.mintAuthority,
          freezeAuthority: parsedData.parsed?.info?.freezeAuthority
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in token-metadata:', error);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      cause: error.cause
    });
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
        status: 200, // Return 200 so frontend can handle the error gracefully
      }
    );
  }
});