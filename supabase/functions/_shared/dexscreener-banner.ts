/**
 * DexScreener banner/header image resolver.
 * Returns the best banner URL DexScreener exposes for a Solana token, or null.
 * Order of preference:
 *   1. info.header   (the wide banner image projects upload)
 *   2. info.imageUrl (square logo — fallback so we always show something)
 *   3. openGraph     (DexScreener-rendered OG card — last resort)
 *
 * Honors our project rule: dex-top-200 cache may be the sole authority for
 * trending data, but for the per-token banner image we hit DS token-pairs
 * directly (cheap, public, no key).
 */
export async function fetchDexBanner(mint: string): Promise<{ url: string | null; source: string | null }> {
  if (!mint) return { url: null, source: null };
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { url: null, source: null };
    const json: any = await res.json();
    const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : [];
    if (pairs.length === 0) return { url: null, source: null };

    // Pick the highest-liquidity pair so we get the canonical info block
    pairs.sort((a, b) => (b?.liquidity?.usd ?? 0) - (a?.liquidity?.usd ?? 0));
    const info = pairs[0]?.info || {};

    if (typeof info.header === 'string' && info.header.startsWith('http')) {
      return { url: info.header, source: 'header' };
    }
    if (typeof info.imageUrl === 'string' && info.imageUrl.startsWith('http')) {
      return { url: info.imageUrl, source: 'imageUrl' };
    }
    if (typeof info.openGraph === 'string' && info.openGraph.startsWith('http')) {
      return { url: info.openGraph, source: 'openGraph' };
    }
    return { url: null, source: null };
  } catch (e) {
    console.warn('[dexscreener-banner] fetch failed', mint, (e as Error).message);
    return { url: null, source: null };
  }
}