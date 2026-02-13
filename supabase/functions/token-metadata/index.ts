import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PublicKey } from 'npm:@solana/web3.js@1.95.3';
import { resolvePrice, PriceResult } from '../_shared/price-resolver.ts';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('token-metadata');

const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Detect launchpad from mint address
function detectLaunchpadFromMint(mintAddress: string): 'pump.fun' | 'bags.fm' | 'bonk.fun' | null {
  if (mintAddress.endsWith('pump')) return 'pump.fun';
  if (mintAddress.endsWith('BAGS')) return 'bags.fm';
  if (mintAddress.endsWith('BONK') || mintAddress.endsWith('bonk')) return 'bonk.fun';
  return null;
}

// Bags.fm API helper - fetches token metadata and socials
async function fetchBagsFmMetadata(mintAddress: string, apiKey?: string): Promise<{
  name?: string;
  symbol?: string;
  image?: string;
  description?: string;
  twitter?: string;
  website?: string;
  telegram?: string;
  creator?: { wallet: string; username?: string; twitter?: string };
} | null> {
  try {
    // Try the bags.fm public page first (no API key needed)
    console.log(`Fetching bags.fm metadata for ${mintAddress}`);
    
    // Bags.fm tokens have their metadata on IPFS via Metaplex, but socials are on bags.fm
    // First try to scrape the public page
    const pageUrl = `https://bags.fm/${mintAddress}`;
    
    // If we have an API key, try the official API
    if (apiKey) {
      try {
        // Try to get token creators endpoint
        const creatorsResponse = await fetch(
          `https://public-api-v2.bags.fm/api/v1/analytics/token-creators/${mintAddress}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(5000)
          }
        );
        
        if (creatorsResponse.ok) {
          const creatorsData = await creatorsResponse.json();
          console.log('Bags.fm creators API response:', creatorsData);
          
          if (creatorsData.success && creatorsData.response) {
            const creator = creatorsData.response.find((c: any) => c.isCreator);
            return {
              creator: creator ? {
                wallet: creator.wallet,
                username: creator.providerUsername || creator.username,
                twitter: creator.provider === 'twitter' ? `https://x.com/${creator.providerUsername}` : undefined
              } : undefined
            };
          }
        }
      } catch (apiError) {
        console.log('Bags.fm API call failed:', apiError instanceof Error ? apiError.message : String(apiError));
      }
    }
    
    // Fallback: try to get data from the public page HTML
    // This is a simplified approach - in production you'd use a proper HTML parser
    try {
      const pageResponse = await fetch(pageUrl, {
        headers: { 'Accept': 'text/html' },
        signal: AbortSignal.timeout(5000)
      });
      
      if (pageResponse.ok) {
        const html = await pageResponse.text();
        
        // Extract Twitter link from page
        const twitterMatch = html.match(/href="(https:\/\/(twitter\.com|x\.com)\/[^"]+)"/);
        const websiteMatch = html.match(/href="(https?:\/\/(?!bags\.fm|twitter\.com|x\.com|t\.me)[^"]+)"[^>]*>website/i);
        const telegramMatch = html.match(/href="(https:\/\/t\.me\/[^"]+)"/);
        
        // Extract name and symbol from meta tags or page content
        const nameMatch = html.match(/<h1[^>]*>.*?\$([A-Z0-9]+)/i);
        const titleMatch = html.match(/<h2[^>]*>([^<]+)/);
        
        return {
          symbol: nameMatch?.[1],
          name: titleMatch?.[1],
          twitter: twitterMatch?.[1],
          website: websiteMatch?.[1],
          telegram: telegramMatch?.[1]
        };
      }
    } catch (scrapeError) {
      console.log('Bags.fm page scrape failed:', scrapeError instanceof Error ? scrapeError.message : String(scrapeError));
    }
    
    return null;
  } catch (error) {
    console.log('Bags.fm metadata fetch failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Pump.fun API helper - fetches token metadata and socials
async function fetchPumpFunMetadata(mintAddress: string): Promise<{
  name?: string;
  symbol?: string;
  image?: string;
  description?: string;
  twitter?: string;
  website?: string;
  telegram?: string;
  creator?: string;
  bondingCurveProgress?: number;
} | null> {
  try {
    console.log(`Fetching pump.fun metadata for ${mintAddress}`);
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mintAddress}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      console.log(`Pump.fun API returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    return {
      name: data.name,
      symbol: data.symbol,
      image: data.image_uri || data.profile_image,
      description: data.description,
      twitter: data.twitter ? `https://x.com/${data.twitter.replace('@', '')}` : undefined,
      website: data.website,
      telegram: data.telegram ? `https://t.me/${data.telegram.replace('@', '')}` : undefined,
      creator: data.creator,
      bondingCurveProgress: data.bonding_curve_progress
    };
  } catch (error) {
    console.log('Pump.fun metadata fetch failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

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

// Extract social links from DexScreener pair data
function extractSocialLinks(dexData: any): { twitter?: string; website?: string; telegram?: string } {
  const socials: { twitter?: string; website?: string; telegram?: string } = {};
  
  if (!dexData?.pairs?.[0]?.info) return socials;
  
  const pair = dexData.pairs[0];
  const info = pair.info;
  
  // Extract from socials array (DexScreener format)
  if (Array.isArray(info.socials)) {
    for (const social of info.socials) {
      const url = social.url || social;
      if (!url) continue;
      
      if (url.includes('twitter.com') || url.includes('x.com')) {
        socials.twitter = url;
      } else if (url.includes('t.me') || url.includes('telegram')) {
        socials.telegram = url;
      }
    }
  }
  
  // Extract from websites array
  if (Array.isArray(info.websites)) {
    for (const site of info.websites) {
      const url = site.url || site;
      if (!url) continue;
      
      // Skip pump.fun/bonk.fun/etc launchpad sites, we want the actual project website
      if (url.includes('pump.fun') || url.includes('bonk.fun') || url.includes('bags.fm') || url.includes('raydium.io')) {
        continue;
      }
      
      // First non-launchpad website wins
      if (!socials.website) {
        socials.website = url;
      }
    }
  }
  
  return socials;
}

// Launchpad detection with enhanced bags.fm support
function detectLaunchpad(mintAddress: string, dexData: any): { name: string; detected: boolean; confidence: string } {
  let launchpad = { name: 'unknown', detected: false, confidence: 'none' };
  
  if (dexData?.pairs?.[0]) {
    const pair = dexData.pairs[0];
    const websites = pair.info?.websites || [];
    const pairUrl = pair.url || '';
    
    // High confidence: check websites and URL
    for (const site of websites) {
      const url = site.url || site;
      if (url.includes('pump.fun')) {
        return { name: 'pump.fun', detected: true, confidence: 'high' };
      }
      if (url.includes('bonk.fun') || url.includes('bonk.bot') || url.includes('letsbonk')) {
        return { name: 'bonk.fun', detected: true, confidence: 'high' };
      }
      if (url.includes('bags.fm')) {
        return { name: 'bags.fm', detected: true, confidence: 'high' };
      }
    }
    
    // Check pair URL for launchpad detection
    if (pairUrl.includes('bags.fm')) {
      return { name: 'bags.fm', detected: true, confidence: 'high' };
    }
    if (pairUrl.includes('pump.fun')) {
      return { name: 'pump.fun', detected: true, confidence: 'high' };
    }
    if (pairUrl.includes('bonk.fun') || pairUrl.includes('letsbonk')) {
      return { name: 'bonk.fun', detected: true, confidence: 'high' };
    }
  }
  
  // Medium confidence: mint suffix hints
  if (mintAddress.endsWith('BAGS')) {
    return { name: 'bags.fm', detected: true, confidence: 'medium' };
  }
  if (mintAddress.endsWith('pump')) {
    return { name: 'pump.fun', detected: true, confidence: 'medium' };
  }
  if (mintAddress.endsWith('BONK') || mintAddress.endsWith('bonk')) {
    return { name: 'bonk.fun', detected: true, confidence: 'medium' };
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
  // Social links
  twitter?: string;
  website?: string;
  telegram?: string;
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
    let hasDexPaid = false;
    
    try {
      const dexResponse = await fetchWithTimeout(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
        5000
      );
      
      if (dexResponse.ok) {
        dexData = await dexResponse.json();
        
        if (dexData?.pairs && dexData.pairs.length > 0) {
          const pair = dexData.pairs[0];
          
          // Check if DEX paid (has profile, boosts, or CTO)
          const hasBoosts = (pair.boosts?.active || 0) > 0;
          const hasInfo = pair.info?.imageUrl || pair.info?.header || pair.info?.openGraph;
          const hasSocials = pair.info?.socials?.length > 0 || pair.info?.websites?.length > 0;
          hasDexPaid = hasBoosts || hasInfo || hasSocials;
          console.log(`DEX Paid status: ${hasDexPaid} (boosts: ${hasBoosts}, info: ${hasInfo}, socials: ${hasSocials})`);
          
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

    // Step 2.1: Use price router for ACCURATE pricing (replaces DexScreener price)
    console.log('Fetching accurate price via resolvePrice router...');
    const priceResult: PriceResult | null = await resolvePrice(tokenMint, {
      forceFresh: true,  // Never use cache for user-initiated fetches
      heliusApiKey: heliusApiKey
    });
    
    if (priceResult) {
      console.log(`Price router result: $${priceResult.price.toFixed(10)} from ${priceResult.source}, onCurve=${priceResult.isOnCurve}`);
      // Override the DexScreener price with the accurate price from the router
      priceInfo = {
        priceUsd: priceResult.price,
        priceChange24h: priceInfo?.priceChange24h || 0,  // Keep DexScreener's 24h change
        volume24h: priceInfo?.volume24h || 0,            // Keep DexScreener's volume
        liquidity: priceInfo?.liquidity || 0,            // Keep DexScreener's liquidity
        marketCap: priceInfo?.marketCap || 0,
        fdv: priceInfo?.fdv || 0,
        dexUrl: priceInfo?.dexUrl,
        pairAddress: priceInfo?.pairAddress,
        dexId: priceInfo?.dexId,
        // Add price source info for transparency
        source: priceResult.source,
        isOnCurve: priceResult.isOnCurve,
        bondingCurveProgress: priceResult.bondingCurveProgress,
        confidence: priceResult.confidence,
        fetchedAt: priceResult.fetchedAt
      };
    } else {
      console.log('Price router returned null, keeping DexScreener price as fallback');
    }

    // Step 2.5: Smart Social Sourcing - DEX paid = use DexScreener, otherwise use launchpad
    // Extract social links from DexScreener first
    const dexSocialLinks = extractSocialLinks(dexData);
    
    // If DEX paid, prioritize DexScreener socials (project team has updated them)
    if (hasDexPaid) {
      console.log('DEX PAID detected - using DexScreener socials as authoritative');
      metadata.twitter = dexSocialLinks.twitter;
      metadata.website = dexSocialLinks.website;
      metadata.telegram = dexSocialLinks.telegram;
    } else {
      // Not DEX paid - will try to get from launchpad first, DexScreener as fallback
      console.log('Not DEX paid - will prioritize launchpad socials');
    }

    // Step 2.6: Protocol-specific metadata fetching for better socials and creator info
    let creatorWallet: string | undefined;
    
    // Store launchpad creator info for profile tracking
    let launchpadCreatorInfo: {
      platform: string;
      creatorWallet?: string;
      platformUsername?: string;
      linkedXAccount?: string;
    } | null = null;

    if (launchpad.name === 'bags.fm' && launchpad.detected) {
      console.log('Fetching bags.fm specific metadata...');
      const bagsApiKey = Deno.env.get('BAGS_API_KEY');
      const bagsMetadata = await fetchBagsFmMetadata(tokenMint, bagsApiKey);
      
      if (bagsMetadata) {
        // Override with bags.fm data (more authoritative for bags tokens)
        if (bagsMetadata.name) metadata.name = bagsMetadata.name;
        if (bagsMetadata.symbol) metadata.symbol = bagsMetadata.symbol;
        if (bagsMetadata.image) {
          metadata.image = bagsMetadata.image;
          metadata.logoURI = metadata.logoURI || bagsMetadata.image;
        }
        if (bagsMetadata.description) metadata.description = bagsMetadata.description;
        
        // For bags.fm: Only use launchpad socials if NOT DEX paid
        if (!hasDexPaid) {
          if (bagsMetadata.twitter) metadata.twitter = bagsMetadata.twitter;
          if (bagsMetadata.website) metadata.website = bagsMetadata.website;
          if (bagsMetadata.telegram) metadata.telegram = bagsMetadata.telegram;
        }
        
        if (bagsMetadata.creator?.wallet) {
          creatorWallet = bagsMetadata.creator.wallet;
        }
        
        // Store launchpad creator profile info
        launchpadCreatorInfo = {
          platform: 'bags.fm',
          creatorWallet: bagsMetadata.creator?.wallet,
          platformUsername: bagsMetadata.creator?.username,
          linkedXAccount: bagsMetadata.creator?.twitter
        };
        
        console.log('Bags.fm metadata merged:', { twitter: metadata.twitter, website: metadata.website, creator: creatorWallet });
      }
    } else if (launchpad.name === 'pump.fun' && launchpad.detected) {
      console.log('Fetching pump.fun specific metadata...');
      const pumpMetadata = await fetchPumpFunMetadata(tokenMint);
      
      if (pumpMetadata) {
        // Override with pump.fun data (more authoritative for pump tokens)
        if (pumpMetadata.name) metadata.name = pumpMetadata.name;
        if (pumpMetadata.symbol) metadata.symbol = pumpMetadata.symbol;
        if (pumpMetadata.image) {
          metadata.image = pumpMetadata.image;
          metadata.logoURI = metadata.logoURI || pumpMetadata.image;
        }
        if (pumpMetadata.description) metadata.description = pumpMetadata.description;
        
        // For pump.fun: Only use launchpad socials if NOT DEX paid
        if (!hasDexPaid) {
          if (pumpMetadata.twitter) metadata.twitter = pumpMetadata.twitter;
          if (pumpMetadata.website) metadata.website = pumpMetadata.website;
          if (pumpMetadata.telegram) metadata.telegram = pumpMetadata.telegram;
        }
        
        if (pumpMetadata.creator) {
          creatorWallet = pumpMetadata.creator;
        }
        
        // Store launchpad creator profile info
        launchpadCreatorInfo = {
          platform: 'pump.fun',
          creatorWallet: pumpMetadata.creator
        };
        
        console.log('Pump.fun metadata merged:', { twitter: metadata.twitter, website: metadata.website, creator: creatorWallet });
      }
    }
    
    // If still no socials and we have DexScreener data, use it as fallback
    if (!metadata.twitter && dexSocialLinks.twitter) metadata.twitter = dexSocialLinks.twitter;
    if (!metadata.website && dexSocialLinks.website) metadata.website = dexSocialLinks.website;
    if (!metadata.telegram && dexSocialLinks.telegram) metadata.telegram = dexSocialLinks.telegram;

    // Step 3: Resolve Raydium pools
    pools = resolveRaydiumPools(dexData);
    console.log('Raydium pools found:', pools.length);

    // Step 4: Try to get off-chain metadata (image, description) if still missing
    let offChainMetadata = null;
    
    if (heliusApiKey && (!metadata.image || !metadata.description)) {
      console.log('Trying Helius for off-chain metadata...');
      offChainMetadata = await fetchHeliusMetadata(tokenMint, heliusApiKey);
    }
    
    if (!offChainMetadata && (!metadata.image || !metadata.description)) {
      console.log('Falling back to Metaplex PDA for off-chain metadata...');
      offChainMetadata = await fetchMetaplexMetadata(tokenMint, rpcUrl);
    }

    // Merge off-chain metadata if found (only for missing fields)
    if (offChainMetadata) {
      metadata.name = metadata.name === 'Unknown Token' ? (offChainMetadata.name || metadata.name) : metadata.name;
      metadata.symbol = metadata.symbol === 'UNK' ? (offChainMetadata.symbol || metadata.symbol) : metadata.symbol;
      const img = metadata.image || offChainMetadata.image;
      if (img) {
        metadata.image = img;
        metadata.logoURI = metadata.logoURI || img;
      }
      metadata.description = metadata.description ?? offChainMetadata.description;
      metadata.uri = metadata.uri || offChainMetadata.uri;
      console.log('Off-chain metadata merged (image set:', Boolean(img), ')');
    }

    // Detect Twitter type (account vs community)
    let twitterType: 'account' | 'community' | null = null;
    if (metadata.twitter) {
      if (metadata.twitter.includes('/i/communities/') || metadata.twitter.includes('communities/')) {
        twitterType = 'community';
      } else {
        twitterType = 'account';
      }
    }

    const response = {
      success: true,
      metadata: {
        ...metadata,
        launchpad,
        creatorWallet,
        socialLinks: {
          twitter: metadata.twitter,
          website: metadata.website,
          telegram: metadata.telegram,
          twitterType
        }
      },
      priceInfo,
      onChainData: {
        decimals: metadata.decimals,
        supply: '0',
        isPumpFun: metadata.isPumpFun,
        isBagsFm: launchpad.name === 'bags.fm' && launchpad.detected,
        isBonkFun: launchpad.name === 'bonk.fun' && launchpad.detected
      },
      pools,
      launchpadInfo: launchpadCreatorInfo ? {
        ...launchpadCreatorInfo,
        creatorWallet
      } : null,
      hasDexPaid,
      socialSource: hasDexPaid ? 'dexscreener' : (launchpad.detected ? launchpad.name : 'dexscreener')
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