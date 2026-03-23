import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { scrapeDexTopPages } from "../_shared/dex-top-pages.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResolvedPair {
  tokenMint: string | null;
  symbol: string | null;
  name: string | null;
  priceUsd: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  fdv: number | null;
  marketCap: number | null;
  url: string | null;
}

async function batchResolvePairs(pairIds: string[]): Promise<Map<string, ResolvedPair>> {
  const resolved = new Map<string, any>();
  const batchSize = 30;

  for (let i = 0; i < pairIds.length; i += batchSize) {
    const batch = pairIds.slice(i, i + batchSize);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${batch.join(',')}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        }
      });
      if (res.ok) {
        const data = await res.json();
        const pairs = data.pairs || (data.pair ? [data.pair] : []);
        for (const p of pairs) {
          if (p.baseToken?.address) {
            resolved.set(p.pairAddress?.toLowerCase(), {
              tokenMint: p.baseToken.address || null,
              symbol: p.baseToken.symbol || null,
              name: p.baseToken.name || null,
              priceUsd: p.priceUsd || null,
              liquidityUsd: p.liquidity?.usd ?? null,
              volume24h: p.volume?.h24 ?? null,
              fdv: p.fdv ?? null,
              marketCap: p.marketCap || p.fdv || null,
              url: p.url || null,
            });
          }
        }
        console.log(`[DexTop200] Batch ${Math.floor(i/batchSize)+1}: ${pairs.length}/${batch.length}`);
      } else {
        console.error(`[DexTop200] Batch failed (${res.status}) for ${batch.length} ids`);
      }
    } catch (e) {
      console.error(`[DexTop200] Batch error:`, e);
    }
    if (i + batchSize < pairIds.length) await new Promise(r => setTimeout(r, 250));
  }
  return resolved;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const rankedPairs = await scrapeDexTopPages();
    const resolved = await batchResolvePairs([...new Set(rankedPairs.map((pair) => pair.pairId))]);

    const finalTokens = rankedPairs.map((entry) => {
      const detail = resolved.get(entry.pairId.toLowerCase());

      return {
        rank: entry.rank,
        pairId: entry.pairId,
        tokenMint: detail?.tokenMint || null,
        symbol: detail?.symbol || entry.fallbackSymbol || null,
        name: detail?.name || entry.fallbackName || null,
        priceUsd: detail?.priceUsd || null,
        liquidityUsd: detail?.liquidityUsd || null,
        volume24h: detail?.volume24h || null,
        fdv: detail?.fdv || null,
        marketCap: detail?.marketCap || null,
        url: detail?.url || entry.url,
      };
    });

    const elapsed = Date.now() - startTime;
    const resolvedCount = finalTokens.filter((token) => !!token.tokenMint).length;
    console.log(`[DexTop200] ✅ Done in ${elapsed}ms: ${finalTokens.length} ranked, ${resolvedCount} resolved`);

    return new Response(JSON.stringify({
      success: true,
      source: 'dexscreener-pages',
      timestamp: Math.floor(Date.now() / 1000),
      elapsed_ms: elapsed,
      total: finalTokens.length,
      resolved: resolvedCount,
      tokens: finalTokens,
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
