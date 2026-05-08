/**
 * Solscan FREE Public API — Token Metadata Only
 * 
 * Endpoint: https://public-api.solscan.io/token/meta
 * Rate limit: 1000 req/60s with API key, 150 req/30s without
 * Cost: FREE (10M CU/month)
 * 
 * Returns: name, symbol, icon, decimals, supply, holder count, price, coingeckoId
 * 
 * USE CASE: Quick metadata fill-in to avoid burning a Helius DAS credit
 * when we just need name/symbol/image that DexScreener didn't have.
 * 
 * NOTE: pro-api.solscan.io/v2.0 endpoints are now ENABLED (Pro v2.0 key verified).
 * See solscan-intelligence.ts, solscan-api.ts, and solscan-markets.ts for the Pro paths.
 * This free endpoint is still preferred for lightweight name/symbol/icon lookups
 * to keep Pro credits for richer queries.
 */

import { createApiLogger } from "./api-logger.ts";
import { solscanFetch } from "./solscan-rate-limiter.ts";

export interface SolscanFreeTokenMeta {
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  supply?: string;
  holder?: number;
  price?: number;
  coingeckoId?: string;
  website?: string;
  twitter?: string;
}

/**
 * Fetch token metadata from Solscan FREE public API.
 * This is a lightweight call that returns basic metadata
 * without consuming Helius credits.
 * 
 * Returns null if the call fails or token is not found.
 */
export async function fetchSolscanFreeTokenMeta(
  tokenMint: string
): Promise<SolscanFreeTokenMeta | null> {
  const solscanApiKey = Deno.env.get('SOLSCAN_API_KEY');
  
  const logger = createApiLogger({
    serviceName: 'solscan',
    endpoint: '/public/token/meta',
    tokenMint,
    functionName: 'fetchSolscanFreeTokenMeta',
    requestType: 'token_metadata',
    credits: 1,
  });

  try {
    const url = `https://public-api.solscan.io/token/meta?tokenAddress=${tokenMint}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (solscanApiKey) headers['token'] = solscanApiKey;

    const resp = await solscanFetch(url, {
      headers,
      timeoutMs: 6000,
      cacheTtlMs: 5 * 60_000, // 5-min cache for token metadata
    });

    if (!resp.ok) {
      const errText = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body || '');
      // 404 = token not indexed by Solscan (expected for ungraduated pump.fun tokens)
      // Don't log as failure — only 5xx and rate-limits are real errors
      if (resp.status === 404) {
        // Skip logger — don't record as failure, it's just "not indexed"
        console.log(`[Solscan Free] Token not indexed: ${tokenMint.slice(0, 8)}... (404 — expected)`);
        return null;
      }
      await logger.complete(resp.status, `Solscan free ${resp.status}: ${errText.slice(0, 200)}`);
      console.log(`[Solscan Free] API error ${resp.status} for ${tokenMint.slice(0, 8)}...`);
      return null;
    }

    await logger.complete(resp.status);
    const data = resp.body;

    // The public API returns data directly (not wrapped in {success, data})
    if (!data || (!data.name && !data.symbol)) {
      console.log(`[Solscan Free] No metadata found for ${tokenMint.slice(0, 8)}...`);
      return null;
    }

    const result: SolscanFreeTokenMeta = {
      name: data.name || '',
      symbol: data.symbol || '',
      icon: data.icon || undefined,
      decimals: data.decimals ?? 9,
      supply: data.supply?.toString(),
      holder: data.holder,
      price: data.price,
      coingeckoId: data.coingeckoId,
      website: data.website || undefined,
      twitter: data.twitter || undefined,
    };

    console.log(`[Solscan Free] ✅ Got metadata: ${result.symbol} (${result.name}), icon=${!!result.icon}, holders=${result.holder || '?'}`);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'timeout';
    await logger.complete(0, `Solscan free error: ${msg}`).catch(() => {});
    console.log(`[Solscan Free] Failed for ${tokenMint.slice(0, 8)}...: ${msg}`);
    return null;
  }
}
