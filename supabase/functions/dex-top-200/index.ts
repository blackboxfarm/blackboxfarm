import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CF_WORKER_URL = 'https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();

    // Step 1: Get the trending pair IDs from the Cloudflare worker
    // The CF worker already bypasses DexScreener's Cloudflare challenge
    // and returns ALL pair IDs (both resolved and unresolved)
    console.log('[DexTop200] Fetching trending list from CF worker...');
    const workerRes = await fetch(CF_WORKER_URL);
    if (!workerRes.ok) throw new Error(`CF worker returned ${workerRes.status}`);
    
    const workerData = await workerRes.json();
    const allPairs = workerData.pairs || [];
    
    console.log(`[DexTop200] CF worker returned ${allPairs.length} pairs (${workerData.countPairsResolved}/${workerData.countPairsRequested} resolved)`);

    // Step 2: Separate already-resolved from unresolved
    const resolved: any[] = [];
    const unresolvedPairIds: string[] = [];

    for (const p of allPairs) {
      if (p.ok && p.tokenMint) {
        resolved.push({
          rank: resolved.length + unresolvedPairIds.length + 1,
          pairId: p.pairId,
          tokenMint: p.tokenMint,
          symbol: p.symbol,
          name: p.name,
          priceUsd: p.priceUsd,
          liquidityUsd: p.liquidityUsd,
          volume24h: p.volume24h,
          fdv: p.fdv,
          url: p.url || `https://dexscreener.com/solana/${p.pairId}`,
          source: 'cf_resolved',
        });
      } else if (p.pairId) {
        unresolvedPairIds.push(p.pairId);
      }
    }

    console.log(`[DexTop200] ${resolved.length} pre-resolved, ${unresolvedPairIds.length} need batch resolution`);

    // Step 3: Batch-resolve all unresolved pairs via DexScreener API
    // API supports comma-separated pair addresses, ~30 per request
    const batchSize = 30;
    const newlyResolved: any[] = [];

    for (let i = 0; i < unresolvedPairIds.length; i += batchSize) {
      const batch = unresolvedPairIds.slice(i, i + batchSize);
      const joined = batch.join(',');

      try {
        const apiRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${joined}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          }
        });

        if (apiRes.ok) {
          const data = await apiRes.json();
          const pairs = data.pairs || (data.pair ? [data.pair] : []);

          for (const pair of pairs) {
            if (pair.baseToken?.address) {
              newlyResolved.push({
                pairId: pair.pairAddress,
                tokenMint: pair.baseToken.address,
                symbol: pair.baseToken.symbol,
                name: pair.baseToken.name,
                priceUsd: pair.priceUsd,
                liquidityUsd: pair.liquidity?.usd,
                volume24h: pair.volume?.h24,
                fdv: pair.fdv,
                marketCap: pair.marketCap || pair.fdv,
                url: pair.url || `https://dexscreener.com/solana/${pair.pairAddress}`,
                source: 'batch_resolved',
              });
            }
          }
          console.log(`[DexTop200] Batch ${Math.floor(i/batchSize)+1}: resolved ${pairs.length}/${batch.length}`);
        } else {
          console.error(`[DexTop200] Batch API returned ${apiRes.status}`);
        }
      } catch (e) {
        console.error(`[DexTop200] Batch error:`, e);
      }

      // Small delay between batches to be nice
      if (i + batchSize < unresolvedPairIds.length) {
        await new Promise(r => setTimeout(r, 250));
      }
    }

    // Step 4: Merge and assign final ranks (maintaining original trending order)
    // Build a map of pairId -> resolved data for newly resolved
    const newlyResolvedMap = new Map<string, any>();
    for (const nr of newlyResolved) {
      newlyResolvedMap.set(nr.pairId?.toLowerCase(), nr);
    }

    // Reconstruct the full list in original order
    const finalTokens: any[] = [];
    let rank = 1;

    for (const p of allPairs) {
      if (p.ok && p.tokenMint) {
        // Already resolved by CF worker
        finalTokens.push({
          rank,
          pairId: p.pairId,
          tokenMint: p.tokenMint,
          symbol: p.symbol,
          name: p.name,
          priceUsd: p.priceUsd,
          liquidityUsd: p.liquidityUsd,
          volume24h: p.volume24h,
          fdv: p.fdv,
          url: p.url || `https://dexscreener.com/solana/${p.pairId}`,
          source: 'cf_resolved',
        });
        rank++;
      } else if (p.pairId) {
        // Try to find in newly resolved
        const nr = newlyResolvedMap.get(p.pairId.toLowerCase());
        if (nr) {
          finalTokens.push({
            ...nr,
            rank,
          });
          rank++;
        }
        // If still not resolved, skip it (truly dead pair)
      }
    }

    const elapsed = Date.now() - startTime;
    
    console.log(`[DexTop200] ✅ Done in ${elapsed}ms: ${finalTokens.length} total tokens (${resolved.length} from CF, ${newlyResolved.length} batch-resolved, ${unresolvedPairIds.length - newlyResolved.length} truly failed)`);

    return new Response(JSON.stringify({
      success: true,
      timestamp: Math.floor(Date.now() / 1000),
      elapsed_ms: elapsed,
      total: finalTokens.length,
      cf_resolved: resolved.length,
      batch_resolved: newlyResolved.length,
      failed: unresolvedPairIds.length - newlyResolved.length,
      stale: workerData.stale || false,
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
