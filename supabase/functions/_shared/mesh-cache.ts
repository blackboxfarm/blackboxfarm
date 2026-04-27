/**
 * MESH CACHE — Read-Before-Fetch helper.
 *
 * Phase 2 of the Mesh-Symmetry plan. All public-input surfaces (Bubble Map,
 * /holders web, Telegram bot) call into the same canonical cache so that
 * "hot" tokens — those queried multiple times in a few minutes — never
 * waste Helius / DexScreener / Pump.fun credits.
 *
 * The contract is intentionally simple:
 *   - getCachedToken(mint, maxAgeMs)  → row from token_lifecycle if fresh
 *   - getCachedCreator(mint, maxAgeMs)→ creator wallet from token_lifecycle
 *   - shouldFetchFresh(mint, maxAgeMs) → boolean: true if cache is stale
 *
 * The cache is the existing token_lifecycle table populated by dex-top-200
 * (every 30 min) and oracle-unified-lookup (on-demand). We do NOT introduce
 * a new cache table — that would fragment the source of truth.
 *
 * Default freshness window is 5 minutes, matching the SOL-price-fetcher
 * staleness guard and the documented "Read-Before-Fetch" policy.
 */

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface CachedToken {
  token_mint: string;
  symbol: string | null;
  name: string | null;
  market_cap: number | null;
  fdv: number | null;
  creator_wallet: string | null;
  updated_at: string;
  last_seen_at: string | null;
}

/** Return cached token row if it was updated within `maxAgeMs`, else null. */
export async function getCachedToken(
  supabase: any,
  mint: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<CachedToken | null> {
  if (!mint) return null;
  try {
    const { data, error } = await supabase
      .from('token_lifecycle')
      .select('token_mint, symbol, name, market_cap, fdv, creator_wallet, updated_at, last_seen_at')
      .eq('token_mint', mint)
      .maybeSingle();
    if (error || !data) return null;
    if (!isFresh(data.updated_at, maxAgeMs)) return null;
    return data as CachedToken;
  } catch (e) {
    console.warn('[mesh-cache] getCachedToken:', (e as Error).message);
    return null;
  }
}

/** Return creator wallet from cache if fresh; null otherwise. */
export async function getCachedCreator(
  supabase: any,
  mint: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<string | null> {
  const t = await getCachedToken(supabase, mint, maxAgeMs);
  return t?.creator_wallet ?? null;
}

/** True if the cache row is missing or older than `maxAgeMs` — i.e. fetch. */
export async function shouldFetchFresh(
  supabase: any,
  mint: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<boolean> {
  const cached = await getCachedToken(supabase, mint, maxAgeMs);
  return cached === null;
}

function isFresh(ts: string | null | undefined, maxAgeMs: number): boolean {
  if (!ts) return false;
  const age = Date.now() - new Date(ts).getTime();
  return age >= 0 && age <= maxAgeMs;
}

/** Wrap any async fetcher: try cache first, on miss run fetcher and (caller) writes back. */
export async function readBeforeFetch<T>(
  supabase: any,
  mint: string,
  fetcher: () => Promise<T>,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
  mapCachedToResult?: (cached: CachedToken) => T | null,
): Promise<{ result: T; fromCache: boolean }> {
  if (mapCachedToResult) {
    const cached = await getCachedToken(supabase, mint, maxAgeMs);
    if (cached) {
      const mapped = mapCachedToResult(cached);
      if (mapped !== null && mapped !== undefined) {
        return { result: mapped, fromCache: true };
      }
    }
  }
  const result = await fetcher();
  return { result, fromCache: false };
}