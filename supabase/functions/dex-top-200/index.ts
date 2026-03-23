import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Scrape a single DexScreener Solana page and extract tokens
async function scrapePage(url: string): Promise<any[]> {
  console.log(`[DexTop200] Scraping ${url}...`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    console.error(`[DexTop200] Failed to fetch ${url}: ${response.status}`);
    return [];
  }

  const html = await response.text();
  console.log(`[DexTop200] Got ${html.length} chars from ${url}`);

  return parseTokensFromHtml(html);
}

// Parse token entries from DexScreener HTML
// Each token row contains: rank, symbol, name, pair URL
// The pair URL contains the pair address: /solana/{pairAddress}
function parseTokensFromHtml(html: string): any[] {
  const tokens: any[] = [];

  // DexScreener renders token rows with links like:
  // <a href="/solana/PAIR_ADDRESS" ...>
  // Inside each row: rank number, symbol/SOL, name, price, volume, liquidity, mcap
  
  // Strategy: Find all token row links with their rank numbers
  // Pattern in the rendered HTML: data attributes or structured divs
  
  // Look for pair links with rank data
  // The HTML structure has: ds-dex-table-row elements with href="/solana/..."
  
  // Find all href="/solana/PAIR_ADDRESS" patterns (these are the token row links)
  const pairLinkPattern = /href="\/solana\/([a-zA-Z0-9]{20,50})"/gi;
  const pairLinks: string[] = [];
  let match;
  
  while ((match = pairLinkPattern.exec(html)) !== null) {
    const pairAddress = match[1];
    // Skip page navigation links and non-pair links
    if (pairAddress.startsWith('page-') || pairAddress.length < 20) continue;
    if (!pairLinks.includes(pairAddress)) {
      pairLinks.push(pairAddress);
    }
  }

  console.log(`[DexTop200] Found ${pairLinks.length} unique pair links`);

  // Now try to extract rank + symbol + name for each pair
  // DexScreener HTML has structured data we can parse
  
  // Try JSON-LD or embedded data
  const jsonDataPattern = /"pairs":\s*(\[[\s\S]*?\])/;
  const jsonMatch = html.match(jsonDataPattern);
  
  if (jsonMatch) {
    try {
      const pairsData = JSON.parse(jsonMatch[1]);
      console.log(`[DexTop200] Found embedded JSON data with ${pairsData.length} pairs`);
      return pairsData;
    } catch (e) {
      console.log('[DexTop200] Could not parse embedded JSON');
    }
  }

  // Extract from Next.js/React hydration data
  const nextDataPattern = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
  const nextMatch = html.match(nextDataPattern);
  if (nextMatch) {
    try {
      const nextData = JSON.parse(nextMatch[1]);
      console.log('[DexTop200] Found __NEXT_DATA__');
      // Navigate to find pairs data
      const props = nextData?.props?.pageProps;
      if (props?.pairs) {
        return props.pairs;
      }
    } catch (e) {
      console.log('[DexTop200] Could not parse __NEXT_DATA__');
    }
  }

  // Look for window.__data or similar hydration patterns
  const windowDataPatterns = [
    /window\.__data\s*=\s*({[\s\S]*?});/,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
    /__remixContext\s*=\s*({[\s\S]*?});/,
  ];
  
  for (const pattern of windowDataPatterns) {
    const dataMatch = html.match(pattern);
    if (dataMatch) {
      try {
        const data = JSON.parse(dataMatch[1]);
        console.log('[DexTop200] Found window hydration data');
        // Try to find pairs in the data
        const pairs = findPairsInObject(data);
        if (pairs.length > 0) return pairs;
      } catch (e) {
        console.log('[DexTop200] Could not parse hydration data');
      }
    }
  }

  // Fallback: just return the pair addresses we found (rank = order found)
  return pairLinks.map((pairAddress, index) => ({
    pairAddress,
    rank: index + 1,
    needsResolution: true,
  }));
}

// Recursively find arrays of pair-like objects in a data structure
function findPairsInObject(obj: any, depth = 0): any[] {
  if (depth > 5) return [];
  if (Array.isArray(obj) && obj.length > 5) {
    // Check if this looks like a pairs array
    if (obj[0]?.pairAddress || obj[0]?.baseToken || obj[0]?.chainId) {
      return obj;
    }
  }
  if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      const result = findPairsInObject(obj[key], depth + 1);
      if (result.length > 0) return result;
    }
  }
  return [];
}

// Batch resolve pair addresses via DexScreener API
async function batchResolvePairs(pairAddresses: string[]): Promise<Map<string, any>> {
  const resolved = new Map<string, any>();
  
  // DexScreener API allows comma-separated pair addresses, up to ~30 per request
  const batchSize = 30;
  
  for (let i = 0; i < pairAddresses.length; i += batchSize) {
    const batch = pairAddresses.slice(i, i + batchSize);
    const joined = batch.join(',');
    
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${joined}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const pairs = data.pairs || (data.pair ? [data.pair] : []);
        
        for (const pair of pairs) {
          if (pair.pairAddress) {
            resolved.set(pair.pairAddress.toLowerCase(), {
              pairAddress: pair.pairAddress,
              tokenMint: pair.baseToken?.address,
              symbol: pair.baseToken?.symbol,
              name: pair.baseToken?.name,
              priceUsd: pair.priceUsd,
              liquidityUsd: pair.liquidity?.usd,
              volume24h: pair.volume?.h24,
              fdv: pair.fdv,
              marketCap: pair.marketCap || pair.fdv,
              priceChange24h: pair.priceChange?.h24,
              dexId: pair.dexId,
              pairCreatedAt: pair.pairCreatedAt,
              imageUrl: pair.info?.imageUrl,
              url: pair.url || `https://dexscreener.com/solana/${pair.pairAddress}`,
            });
          }
        }
        
        console.log(`[DexTop200] Batch ${Math.floor(i/batchSize)+1}: resolved ${pairs.length}/${batch.length}`);
      } else {
        console.error(`[DexTop200] Batch API returned ${response.status}`);
      }
    } catch (e) {
      console.error(`[DexTop200] Batch resolve error:`, e);
    }
    
    // Small delay between batches
    if (i + batchSize < pairAddresses.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  return resolved;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    
    // Scrape both pages in parallel
    const [page1Tokens, page2Tokens] = await Promise.all([
      scrapePage('https://dexscreener.com/solana'),
      scrapePage('https://dexscreener.com/solana/page-2'),
    ]);

    console.log(`[DexTop200] Page 1: ${page1Tokens.length} tokens, Page 2: ${page2Tokens.length} tokens`);

    // Combine and determine which need resolution
    const allRaw = [...page1Tokens, ...page2Tokens];
    
    // Check if we got pre-resolved data or just pair addresses
    const needsResolution = allRaw.some(t => t.needsResolution);
    
    let finalTokens: any[];
    
    if (needsResolution) {
      // We only got pair addresses from HTML scraping - batch resolve them
      const pairAddresses = allRaw.map(t => t.pairAddress).filter(Boolean);
      console.log(`[DexTop200] Batch resolving ${pairAddresses.length} pair addresses...`);
      
      const resolved = await batchResolvePairs(pairAddresses);
      
      finalTokens = allRaw.map((raw, index) => {
        const detail = resolved.get(raw.pairAddress?.toLowerCase());
        if (detail) {
          return {
            rank: index + 1,
            ...detail,
          };
        }
        return {
          rank: index + 1,
          pairAddress: raw.pairAddress,
          url: `https://dexscreener.com/solana/${raw.pairAddress}`,
          symbol: null,
          name: null,
          tokenMint: null,
          ok: false,
        };
      });
    } else {
      // We got full data from embedded JSON
      finalTokens = allRaw.map((t, index) => ({
        rank: index + 1,
        pairAddress: t.pairAddress,
        tokenMint: t.baseToken?.address,
        symbol: t.baseToken?.symbol,
        name: t.baseToken?.name,
        priceUsd: t.priceUsd,
        liquidityUsd: t.liquidity?.usd,
        volume24h: t.volume?.h24,
        fdv: t.fdv,
        marketCap: t.marketCap || t.fdv,
        priceChange24h: t.priceChange?.h24,
        dexId: t.dexId,
        url: t.url || `https://dexscreener.com/solana/${t.pairAddress}`,
        ok: true,
      }));
    }

    // Filter to only successfully resolved tokens
    const successTokens = finalTokens.filter(t => t.tokenMint);
    const failedCount = finalTokens.length - successTokens.length;
    
    const elapsed = Date.now() - startTime;
    
    console.log(`[DexTop200] ✅ Done in ${elapsed}ms: ${successTokens.length} resolved, ${failedCount} failed`);

    return new Response(JSON.stringify({
      success: true,
      timestamp: Math.floor(Date.now() / 1000),
      elapsed_ms: elapsed,
      total: successTokens.length,
      failed: failedCount,
      tokens: successTokens,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[DexTop200] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
