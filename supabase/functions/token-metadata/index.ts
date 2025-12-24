import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PublicKey } from 'npm:@solana/web3.js@1.95.3';

const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Helius helper
async function fetchHeliusMetadata(mintAddress: string, heliusApiKey: string) {
  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAsset',
        params: { id: mintAddress }
      })
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (data.result) {
      return {
        name: data.result.content?.metadata?.name,
        symbol: data.result.content?.metadata?.symbol,
        image: data.result.content?.links?.image || data.result.content?.files?.[0]?.uri,
        description: data.result.content?.metadata?.description,
        uri: data.result.content?.json_uri
      };
    }
  } catch (error) {
    console.log('Helius metadata fetch failed:', error instanceof Error ? error.message : String(error));
  }
  return null;
}

// Metaplex PDA fallback
async function fetchMetaplexMetadata(mintAddress: string, rpcUrl: string) {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    const [metadataPDA] = await PublicKey.findProgramAddress(
      [new TextEncoder().encode('metadata'), METAPLEX_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [metadataPDA.toBase58(), { encoding: 'base64' }]
      })
    });
    
    const data = await response.json();
    if (!data.result?.value?.data?.[0]) return null;
    
    // Decode URI from account data (simplified - proper Metaplex decoding would be more complex)
    const b64: string = data.result.value.data[0];
    const dataStr = atob(b64);
    const uriMatch = dataStr.match(/https?:\/\/[^\x00]+/);
    
    if (uriMatch) {
      const uri = uriMatch[0].replace(/\x00/g, '').trim();
      console.log('Metaplex URI found:', uri);
      
      // Fetch off-chain JSON
      const jsonResponse = await fetch(uri, { signal: AbortSignal.timeout(5000) });
      if (jsonResponse.ok) {
        const json = await jsonResponse.json();
        return {
          name: json.name,
          symbol: json.symbol,
          image: json.image,
          description: json.description,
          uri
        };
      }
    }
  } catch (error) {
    console.log('Metaplex metadata fetch failed:', error instanceof Error ? error.message : String(error));
  }
  return null;
}

// Launchpad detection
function detectLaunchpad(mintAddress: string, dexData: any): { name: string; detected: boolean; confidence: string } {
  let launchpad = { name: 'unknown', detected: false, confidence: 'none' };
  
  if (dexData?.pairs?.[0]) {
    const pair = dexData.pairs[0];
    const websites = pair.info?.websites || [];
    
    // High confidence: check websites
    for (const site of websites) {
      const url = site.url || site;
      if (url.includes('pump.fun')) {
        return { name: 'pump.fun', detected: true, confidence: 'high' };
      }
      if (url.includes('bonk.fun') || url.includes('bonk.bot')) {
        return { name: 'bonk.fun', detected: true, confidence: 'high' };
      }
      if (url.includes('bags.fm')) {
        return { name: 'bags.fm', detected: true, confidence: 'high' };
      }
    }
  }
  
  // Low confidence: mint suffix hints
  if (mintAddress.endsWith('pump')) {
    return { name: 'pump.fun', detected: true, confidence: 'low' };
  }
  
  return launchpad;
}

// Raydium pools resolver
function resolveRaydiumPools(dexData: any) {
  const pools = [];
  if (dexData?.pairs) {
    for (const pair of dexData.pairs) {
      if (pair.dexId === 'raydium') {
        pools.push({
          pairAddress: pair.pairAddress,
          baseSymbol: pair.baseToken?.symbol,
          quoteSymbol: pair.quoteToken?.symbol,
          liquidityUsd: pair.liquidity?.usd || 0,
          url: pair.url
        });
      }
    }
  }
  return pools;
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
    const { tokenMint, tokenMints } = body;
    
    // Support batch requests with tokenMints array
    if (tokenMints && Array.isArray(tokenMints) && tokenMints.length > 0) {
      console.log(`Batch fetching metadata for ${tokenMints.length} tokens`);
      const heliusApiKey = Deno.env.get('HELIUS_HOLDERS_KEY') || Deno.env.get('HELIUS_API_KEY');
      
      const tokens: Array<{ mint: string; symbol: string; name: string }> = [];
      
      for (const mint of tokenMints.slice(0, 20)) { // Limit to 20 tokens
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) continue;
        
        try {
          // Try DexScreener first (fast)
          const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
            signal: AbortSignal.timeout(3000)
          });
          if (dexRes.ok) {
            const dexData = await dexRes.json();
            const pair = dexData?.pairs?.[0];
            if (pair?.baseToken?.symbol) {
              tokens.push({
                mint,
                symbol: pair.baseToken.symbol,
                name: pair.baseToken.name || pair.baseToken.symbol
              });
              continue;
            }
          }
        } catch (e) {
          console.log(`DexScreener failed for ${mint.slice(0,8)}:`, (e as Error).message);
        }
        
        // Fallback to Helius
        if (heliusApiKey) {
          try {
            const heliusMeta = await fetchHeliusMetadata(mint, heliusApiKey);
            if (heliusMeta?.symbol) {
              tokens.push({
                mint,
                symbol: heliusMeta.symbol,
                name: heliusMeta.name || heliusMeta.symbol
              });
              continue;
            }
          } catch (e) {
            console.log(`Helius failed for ${mint.slice(0,8)}:`, (e as Error).message);
          }
        }
        
        // Use mint suffix as fallback
        tokens.push({
          mint,
          symbol: mint.slice(0, 6).toUpperCase(),
          name: `Token ${mint.slice(0, 8)}`
        });
      }
      
      return new Response(
        JSON.stringify({ success: true, tokens }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!tokenMint) {
      throw new Error('Token mint address is required');
    }

    console.log(`Fetching metadata for token: ${tokenMint}`);
    
    // Basic validation
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenMint)) {
      throw new Error('Invalid mint address format');
    }

    // Uses dedicated HELIUS_HOLDERS_KEY for /holders page functions
    const heliusApiKey = Deno.env.get('HELIUS_HOLDERS_KEY');
    const rpcUrl = heliusApiKey 
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
      : 'https://api.mainnet-beta.solana.com';

    // Initialize response data
    const metadata: TokenMetadata = {
      mint: tokenMint,
      name: 'Unknown Token',
      symbol: 'UNK',
      decimals: 9,
      verified: false,
      isPumpFun: false
    };
    
    let priceInfo = null;
    let dexData = null;
    let pools: any[] = [];

    // Step 1: Fetch DexScreener data for price, launchpad detection, and pools
    console.log('Fetching DexScreener data...');
    try {
      const dexResponse = await fetchWithTimeout(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
        5000
      );
      
      if (dexResponse.ok) {
        dexData = await dexResponse.json();
        
        if (dexData?.pairs && dexData.pairs.length > 0) {
          const pair = dexData.pairs[0];
          
          // Update basic metadata from DexScreener
          if (pair.baseToken) {
            metadata.name = pair.baseToken.name || metadata.name;
            metadata.symbol = pair.baseToken.symbol || metadata.symbol;
            metadata.logoURI = pair.baseToken.logoURI;
            metadata.image = pair.baseToken.logoURI; // Both fields for compatibility
            metadata.verified = true;
          }
          
          // Set enhanced price info with market data
          priceInfo = {
            priceUsd: parseFloat(pair.priceUsd) || 0,
            priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            liquidity: parseFloat(pair.liquidity?.usd) || 0,
            marketCap: parseFloat(pair.marketCap) || 0,
            fdv: parseFloat(pair.fdv) || 0,
            dexUrl: pair.url,
            pairAddress: pair.pairAddress,
            dexId: pair.dexId
          };
          
          console.log('DexScreener data retrieved - Logo:', metadata.logoURI);
        }
      }
    } catch (error) {
      console.log('DexScreener fetch failed:', error instanceof Error ? error.message : String(error));
    }

    // Step 2: Detect launchpad
    const launchpad = detectLaunchpad(tokenMint, dexData);
    metadata.isPumpFun = launchpad.name === 'pump.fun' && launchpad.detected;
    console.log('Launchpad detection:', launchpad);

    // Step 3: Resolve Raydium pools
    pools = resolveRaydiumPools(dexData);
    console.log('Raydium pools found:', pools.length);

    // Step 4: Try to get off-chain metadata (image, description)
    let offChainMetadata = null;
    
    if (heliusApiKey) {
      console.log('Trying Helius for off-chain metadata...');
      offChainMetadata = await fetchHeliusMetadata(tokenMint, heliusApiKey);
    }
    
    if (!offChainMetadata) {
      console.log('Falling back to Metaplex PDA for off-chain metadata...');
      offChainMetadata = await fetchMetaplexMetadata(tokenMint, rpcUrl);
    }

    // Merge off-chain metadata if found
    if (offChainMetadata) {
      metadata.name = offChainMetadata.name || metadata.name;
      metadata.symbol = offChainMetadata.symbol || metadata.symbol;
      const img = offChainMetadata.image || metadata.image;
      if (img) {
        metadata.image = img;
        metadata.logoURI = metadata.logoURI || img;
      }
      metadata.description = offChainMetadata.description ?? metadata.description;
      metadata.uri = offChainMetadata.uri || metadata.uri;
      console.log('Off-chain metadata merged (image set:', Boolean(img), ')');
    }

    const response = {
      success: true,
      metadata: {
        ...metadata,
        launchpad
      },
      priceInfo,
      onChainData: {
        decimals: metadata.decimals,
        supply: '0',
        isPumpFun: metadata.isPumpFun
      },
      pools
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
    
    // Get tokenMint from request body for error response
    let mintAddress = 'unknown';
    try {
      const body = await req.json();
      mintAddress = body.tokenMint || 'unknown';
    } catch {
      // If we can't parse the body, use 'unknown'
    }
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          mint: mintAddress,
          name: 'Unknown Token',
          symbol: 'UNK',
          decimals: 9,
          verified: false
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});