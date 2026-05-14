/**
 * Solscan Pro v2.0 — Token Metadata (lightweight)
 * 
 * Endpoint: https://pro-api.solscan.io/v2.0/token/meta
 * Rate limit: governed by shared solscan-rate-limiter (800rpm self-throttle)
 * Cost: 1 Pro credit per uncached call (5min LRU cache layered on top)
 * 
 * Returns: name, symbol, icon, decimals, supply, holder count, price, coingeckoId
 * 
 * USE CASE: Quick metadata fill-in to avoid burning a Helius DAS credit
 * when we just need name/symbol/image/icon/socials that DexScreener didn't have.
 *
 * HISTORY: Originally hit the unauthenticated public-api.solscan.io (free) path,
 * which 404s on most ungraduated tokens and silently failed in our pipeline.
 * Promoted to Pro v2.0 /token/meta — same shape we already consume in
 * creator-resolver.ts and breadcrumbs-scanner.ts.
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
  if (!solscanApiKey) {
    console.warn('[Solscan Meta] SOLSCAN_API_KEY missing — skipping');
    return null;
  }

  // Guard: validate Solana pubkey shape before calling Solscan.
  // A real pubkey is 32 bytes → 43–44 base58 chars. Truncated mints
  // (e.g. a chopped "…pump" suffix at 32 chars) trip Solscan's
  // validator with a 400 and keep retrying, so reject locally.
  const SOLANA_PUBKEY_REGEX = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
  if (!tokenMint || !SOLANA_PUBKEY_REGEX.test(tokenMint)) {
    console.warn(
      `[Solscan Meta] Skipping malformed mint (len=${tokenMint?.length ?? 0}): ${tokenMint?.slice(0, 12)}…`
    );
    return null;
  }
  
  const logger = createApiLogger({
    serviceName: 'solscan',
    endpoint: '/v2.0/token/meta',
    tokenMint,
    functionName: 'fetchSolscanTokenMeta',
    requestType: 'token_metadata',
    credits: 1,
  });

  try {
    const url = `https://pro-api.solscan.io/v2.0/token/meta?address=${tokenMint}`;
    const headers: Record<string, string> = { Accept: 'application/json', token: solscanApiKey };

    const resp = await solscanFetch(url, {
      headers,
      timeoutMs: 6000,
      cacheTtlMs: 5 * 60_000, // 5-min cache for token metadata
      callerName: 'fetchSolscanTokenMeta',
    });

    if (!resp.ok) {
      const errText = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body || '');
      if (resp.status === 404) {
        console.log(`[Solscan Meta] Token not indexed: ${tokenMint.slice(0, 8)}... (404 — expected)`);
        return null;
      }
      await logger.complete(resp.status, `Solscan Pro meta ${resp.status}: ${errText.slice(0, 200)}`);
      console.log(`[Solscan Meta] API error ${resp.status} for ${tokenMint.slice(0, 8)}...`);
      return null;
    }

    await logger.complete(resp.status);
    // Pro v2.0 envelope: { success, data: {...} }
    const body: any = resp.body;
    const data = body?.data ?? body;
    if (!data || (!data.name && !data.symbol)) {
      console.log(`[Solscan Meta] No metadata found for ${tokenMint.slice(0, 8)}...`);
      return null;
    }

    const result: SolscanFreeTokenMeta = {
      name: data.name || '',
      symbol: data.symbol || '',
      icon: data.icon || data.icon_url || undefined,
      decimals: data.decimals ?? 9,
      supply: data.supply?.toString(),
      holder: data.holder ?? data.holder_count,
      price: data.price,
      coingeckoId: data.coingeckoId || data.coingecko_id,
      website: data.website || data.metadata?.website || undefined,
      twitter: data.twitter || data.metadata?.twitter || undefined,
    };

    console.log(`[Solscan Meta] ✅ ${result.symbol} (${result.name}), icon=${!!result.icon}, holders=${result.holder || '?'}`);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'timeout';
    await logger.complete(0, `Solscan Pro meta error: ${msg}`).catch(() => {});
    console.log(`[Solscan Meta] Failed for ${tokenMint.slice(0, 8)}...: ${msg}`);
    return null;
  }
}
