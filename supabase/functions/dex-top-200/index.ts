import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CF_WORKER_URL = 'https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana';

// Batch resolve pair IDs via DexScreener API (30 per request)
async function batchResolvePairs(pairIds: string[]): Promise<Map<string, any>> {
  const resolved = new Map<string, any>();
  const batchSize = 30;

  for (let i = 0; i < pairIds.length; i += batchSize) {
    const batch = pairIds.slice(i, i + batchSize);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${batch.join(',')}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });
      if (res.ok) {
        const data = await res.json();
        const pairs = data.pairs || (data.pair ? [data.pair] : []);
        for (const p of pairs) {
          if (p.baseToken?.address) {
            resolved.set(p.pairAddress?.toLowerCase(), {
              tokenMint: p.baseToken.address,
              symbol: p.baseToken.symbol,
              name: p.baseToken.name,
              priceUsd: p.priceUsd,
              liquidityUsd: p.liquidity?.usd,
              volume24h: p.volume?.h24,
              fdv: p.fdv,
              marketCap: p.marketCap || p.fdv,
              url: p.url,
            });
          }
        }
        console.log(`[DexTop200] Batch ${Math.floor(i/batchSize)+1}: ${pairs.length}/${batch.length}`);
      }
    } catch (e) {
      console.error(`[DexTop200] Batch error:`, e);
    }
    if (i + batchSize < pairIds.length) await new Promise(r => setTimeout(r, 300));
  }
  return resolved;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const seenMints = new Set<string>();
    const finalTokens: any[] = [];

    // ===== SOURCE 1: CF Worker trending (top ~30-74) =====
    console.log('[DexTop200] Source 1: CF Worker trending...');
    try {
      const workerRes = await fetch(CF_WORKER_URL);
      if (workerRes.ok) {
        const workerData = await workerRes.json();
        const allPairs = workerData.pairs || [];
        
        // Collect resolved and unresolved
        const unresolvedIds: string[] = [];
        
        for (const p of allPairs) {
          if (p.ok && p.tokenMint && !seenMints.has(p.tokenMint)) {
            seenMints.add(p.tokenMint);
            finalTokens.push({
              rank: finalTokens.length + 1,
              pairId: p.pairId,
              tokenMint: p.tokenMint,
              symbol: p.symbol,
              name: p.name,
              priceUsd: p.priceUsd,
              liquidityUsd: p.liquidityUsd,
              volume24h: p.volume24h,
              fdv: p.fdv,
              url: p.url || `https://dexscreener.com/solana/${p.pairId}`,
            });
          } else if (p.pairId && !p.ok) {
            unresolvedIds.push(p.pairId);
          }
        }

        // Batch resolve unresolved pairs
        if (unresolvedIds.length > 0) {
          console.log(`[DexTop200] Batch resolving ${unresolvedIds.length} unresolved CF pairs...`);
          const resolved = await batchResolvePairs(unresolvedIds);
          
          // Add in original order
          for (const pairId of unresolvedIds) {
            const detail = resolved.get(pairId.toLowerCase());
            if (detail && !seenMints.has(detail.tokenMint)) {
              seenMints.add(detail.tokenMint);
              finalTokens.push({
                rank: finalTokens.length + 1,
                pairId,
                ...detail,
              });
            }
          }
        }

        console.log(`[DexTop200] After CF worker: ${finalTokens.length} tokens`);
      }
    } catch (e) {
      console.error('[DexTop200] CF worker error:', e);
    }

    // ===== SOURCE 2: DexScreener Token Boosts (additional trending tokens) =====
    console.log('[DexTop200] Source 2: Token Boosts...');
    try {
      const boostRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });
      if (boostRes.ok) {
        const boosts = await boostRes.json();
        const solanaBoosted = (boosts || []).filter((b: any) => b.chainId === 'solana' && b.tokenAddress);
        
        // Batch resolve the boosted token mints
        const boostMints = solanaBoosted
          .map((b: any) => b.tokenAddress)
          .filter((m: string) => !seenMints.has(m));

        if (boostMints.length > 0) {
          // Fetch pair data for these mints
          for (let i = 0; i < boostMints.length; i += 30) {
            const batch = boostMints.slice(i, i + 30);
            for (const mint of batch) {
              try {
                const tokenRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                  }
                });
                if (tokenRes.ok) {
                  const tokenData = await tokenRes.json();
                  const pairs = tokenData.pairs || [];
                  // Get the main Solana pair (highest liquidity)
                  const mainPair = pairs
                    .filter((p: any) => p.chainId === 'solana')
                    .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
                  
                  if (mainPair && !seenMints.has(mint)) {
                    seenMints.add(mint);
                    finalTokens.push({
                      rank: finalTokens.length + 1,
                      pairId: mainPair.pairAddress,
                      tokenMint: mint,
                      symbol: mainPair.baseToken?.symbol,
                      name: mainPair.baseToken?.name,
                      priceUsd: mainPair.priceUsd,
                      liquidityUsd: mainPair.liquidity?.usd,
                      volume24h: mainPair.volume?.h24,
                      fdv: mainPair.fdv,
                      marketCap: mainPair.marketCap || mainPair.fdv,
                      url: mainPair.url,
                    });
                  }
                }
              } catch (_) {}
            }
            if (i + 30 < boostMints.length) await new Promise(r => setTimeout(r, 300));
          }
        }
        console.log(`[DexTop200] After boosts: ${finalTokens.length} tokens`);
      }
    } catch (e) {
      console.error('[DexTop200] Boosts error:', e);
    }

    // ===== SOURCE 3: DexScreener search for popular Solana pairs =====
    // This helps fill remaining slots toward 200
    if (finalTokens.length < 150) {
      console.log('[DexTop200] Source 3: DexScreener search API for more Solana tokens...');
      try {
        const searchRes = await fetch('https://api.dexscreener.com/latest/dex/search?q=SOL', {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
          }
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const solanaPairs = (searchData.pairs || [])
            .filter((p: any) => p.chainId === 'solana' && p.baseToken?.address)
            .sort((a: any, b: any) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
          
          for (const p of solanaPairs) {
            if (seenMints.has(p.baseToken.address)) continue;
            seenMints.add(p.baseToken.address);
            finalTokens.push({
              rank: finalTokens.length + 1,
              pairId: p.pairAddress,
              tokenMint: p.baseToken.address,
              symbol: p.baseToken.symbol,
              name: p.baseToken.name,
              priceUsd: p.priceUsd,
              liquidityUsd: p.liquidity?.usd,
              volume24h: p.volume?.h24,
              fdv: p.fdv,
              marketCap: p.marketCap || p.fdv,
              url: p.url,
            });
            if (finalTokens.length >= 200) break;
          }
          console.log(`[DexTop200] After search: ${finalTokens.length} tokens`);
        }
      } catch (e) {
        console.error('[DexTop200] Search error:', e);
      }
    }

    // Re-number ranks
    finalTokens.forEach((t, i) => t.rank = i + 1);

    const elapsed = Date.now() - startTime;
    console.log(`[DexTop200] ✅ Done in ${elapsed}ms: ${finalTokens.length} tokens total`);

    return new Response(JSON.stringify({
      success: true,
      timestamp: Math.floor(Date.now() / 1000),
      elapsed_ms: elapsed,
      total: finalTokens.length,
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
