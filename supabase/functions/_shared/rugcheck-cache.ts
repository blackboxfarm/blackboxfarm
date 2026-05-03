/**
 * Centralized RugCheck API client with DB caching.
 * All RugCheck /report/summary calls should go through this module.
 * 
 * Cache TTL: 30 minutes for summary, 1 hour for insiders graph.
 * Saves ~60-80% of redundant RugCheck calls across all consumers.
 */

import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { createApiLogger } from "./api-logger.ts";
import { clearEscalation } from "./api-failure-alerts.ts";

const SUMMARY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const INSIDERS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RUGCHECK_TIMEOUT_MS = 10_000;

export interface RugCheckSummary {
  score?: number;
  score_normalised?: number;
  rugged?: boolean;
  risks?: Array<{ name?: string; description?: string; level?: string; score?: number }>;
  tokenMeta?: any;
  [key: string]: any;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// In-memory LRU cache (per cold start) — first layer before DB
const memoryCache = new Map<string, CacheEntry<any>>();
const MAX_MEMORY_ENTRIES = 200;

function getFromMemory<T>(key: string, ttlMs: number): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setInMemory<T>(key: string, data: T): void {
  // Evict oldest if at capacity
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { data, fetchedAt: Date.now() });
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/**
 * Fetch RugCheck token summary with 2-tier caching (memory → DB → API).
 * @param tokenMint Solana token mint address
 * @param callerName Name of the calling function (for logging)
 * @param forceRefresh Skip cache and fetch fresh
 */
export async function fetchRugCheckSummary(
  tokenMint: string,
  callerName: string,
  forceRefresh = false,
): Promise<RugCheckSummary | null> {
  const cacheKey = `rc_summary:${tokenMint}`;

  // 1. Memory cache
  if (!forceRefresh) {
    const memHit = getFromMemory<RugCheckSummary>(cacheKey, SUMMARY_CACHE_TTL_MS);
    if (memHit) {
      console.log(`[RugCheckCache] Memory HIT for ${tokenMint} (caller: ${callerName})`);
      return memHit;
    }
  }

  // 2. DB cache — check rugcheck_cache table
  if (!forceRefresh) {
    try {
      const sb = getSupabase();
      const cutoff = new Date(Date.now() - SUMMARY_CACHE_TTL_MS).toISOString();
      const { data: cached } = await sb
        .from('rugcheck_cache')
        .select('summary_data, fetched_at')
        .eq('token_mint', tokenMint)
        .gt('fetched_at', cutoff)
        .maybeSingle();

      if (cached?.summary_data) {
        console.log(`[RugCheckCache] DB HIT for ${tokenMint} (caller: ${callerName})`);
        const summary = cached.summary_data as RugCheckSummary;
        setInMemory(cacheKey, summary);
        return summary;
      }
    } catch (e) {
      console.warn(`[RugCheckCache] DB read failed, falling through to API:`, e);
    }
  }

  // 3. Fresh API call
  const logger = createApiLogger({
    serviceName: 'rugcheck',
    endpoint: `/v1/tokens/${tokenMint}/report/summary`,
    tokenMint,
    functionName: callerName,
    isCached: false,
  });

  try {
    // 3a. Try GoPlus first (primary provider — free, reliable, similar shape).
    const goPlus = await fetchGoPlusSummary(tokenMint, callerName).catch(() => null);
    if (goPlus) {
      console.log(`[RugCheckCache] GoPlus PRIMARY hit for ${tokenMint} (caller: ${callerName})`);
      clearEscalation('rugcheck');
      setInMemory(cacheKey, goPlus);
      persistToDb(tokenMint, goPlus).catch(e =>
        console.warn(`[RugCheckCache] DB write failed:`, e)
      );
      // Don't log as a rugcheck failure — just skip the rugcheck logger
      return goPlus;
    }

    // 3b. Fall back to RugCheck.xyz (secondary).
    console.log(`[RugCheckCache] API fetch for ${tokenMint} (caller: ${callerName})`);
    const response = await fetch(
      `https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report/summary`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(RUGCHECK_TIMEOUT_MS),
      }
    );

    await logger.complete(response.status);

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[RugCheckCache] 404 for ${tokenMint} — no data`);
        return null;
      }
      console.warn(`[RugCheckCache] API ${response.status} for ${tokenMint}`);
      return null;
    }

    const data = await response.json() as RugCheckSummary;

    // Service is healthy — clear any active escalation state
    clearEscalation('rugcheck');

    // Write to both caches
    setInMemory(cacheKey, data);

    // Async DB write — don't block caller
    persistToDb(tokenMint, data).catch(e =>
      console.warn(`[RugCheckCache] DB write failed:`, e)
    );

    return data;
  } catch (e) {
    await logger.fail(e instanceof Error ? e.message : String(e));
    console.error(`[RugCheckCache] API error for ${tokenMint}:`, e);
    return null;
  }
}

// =====================================================================
// GoPlus Security primary provider
// Docs: https://docs.gopluslabs.io/reference/solanatokensecurityusingget
// Free tier (no auth) is generous; with App Key + Secret we get a higher
// rate limit. Auth is via short-lived Access Token from /token endpoint.
// =====================================================================

const GOPLUS_BASE = 'https://api.gopluslabs.io';
const GOPLUS_TIMEOUT_MS = 8_000;
let goPlusToken: { token: string; expiresAt: number } | null = null;

async function getGoPlusToken(): Promise<string | null> {
  const appKey = Deno.env.get('GOPLUS_APP_KEY');
  const appSecret = Deno.env.get('GOPLUS_APP_SECRET');
  if (!appKey || !appSecret) return null; // unauthenticated mode is fine
  if (goPlusToken && goPlusToken.expiresAt > Date.now() + 60_000) return goPlusToken.token;
  try {
    // Per GoPlus docs: sign = sha1(app_key + time + app_secret); time in seconds
    const time = Math.floor(Date.now() / 1000).toString();
    const sigInput = `${appKey}${time}${appSecret}`;
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(sigInput));
    const sign = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const res = await fetch(`${GOPLUS_BASE}/api/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_key: appKey, time, sign }),
      signal: AbortSignal.timeout(GOPLUS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const tok = j?.result?.access_token;
    if (!tok) return null;
    // GoPlus tokens last ~1h; refresh 1 min early
    goPlusToken = { token: tok, expiresAt: Date.now() + 55 * 60_000 };
    return tok;
  } catch (e) {
    console.warn('[GoPlus] auth failed:', e);
    return null;
  }
}

/** Map GoPlus Solana token security response → RugCheckSummary shape. */
function mapGoPlusToRugCheck(raw: any, mint: string): RugCheckSummary | null {
  if (!raw) return null;
  // GoPlus returns { result: { [mint_lowercase]: {...} } }
  const inner = raw?.result?.[mint] ?? raw?.result?.[mint?.toLowerCase?.()] ?? raw?.[mint];
  const t = inner ?? raw;
  if (!t || typeof t !== 'object') return null;

  const risks: Array<{ name: string; description: string; level: string }> = [];
  const flag = (cond: any, name: string, level: string) => {
    if (cond === '1' || cond === 1 || cond === true) {
      risks.push({ name, description: name, level });
    }
  };
  flag(t.mintable, 'Mint Authority still enabled', 'danger');
  flag(t.freezable, 'Freeze Authority still enabled', 'danger');
  flag(t.is_proxy, 'Proxy contract', 'warn');
  flag(t.is_blacklisted, 'Blacklist enabled', 'warn');
  flag(t.is_whitelisted, 'Whitelist enabled', 'warn');
  flag(t.is_anti_whale, 'Anti-whale enabled', 'info');
  flag(t.transfer_pausable, 'Transfer pausable', 'warn');
  flag(t.is_honeypot, 'Honeypot detected', 'danger');
  flag(t.cannot_buy, 'Cannot buy', 'danger');
  flag(t.cannot_sell_all, 'Cannot sell all', 'danger');

  // Holder concentration heuristic
  const holders = t.holders ?? t.lp_holders ?? [];
  if (Array.isArray(holders) && holders.length > 0) {
    const top = Number(holders[0]?.percent ?? 0);
    if (top > 0.5) risks.push({ name: 'High holder concentration', description: `Top holder ${(top*100).toFixed(1)}%`, level: 'warn' });
  }

  // Map a normalised score: start at 100, subtract per risk
  const danger = risks.filter(r => r.level === 'danger').length;
  const warn = risks.filter(r => r.level === 'warn').length;
  const score_normalised = Math.max(0, 100 - danger * 30 - warn * 10);

  return {
    score: score_normalised,
    score_normalised,
    rugged: danger >= 2 || t.is_honeypot === '1',
    risks,
    tokenMeta: {
      provider: 'goplus',
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
    },
    _provider: 'goplus',
  };
}

async function fetchGoPlusSummary(mint: string, _caller: string): Promise<RugCheckSummary | null> {
  const logger = createApiLogger({
    serviceName: 'goplus',
    endpoint: `/api/v1/solana/token_security/${mint}`,
    tokenMint: mint,
    functionName: _caller,
    isCached: false,
  });
  try {
    const token = await getGoPlusToken();
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = token;
    const url = `${GOPLUS_BASE}/api/v1/solana/token_security/${mint}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(GOPLUS_TIMEOUT_MS) });
    await logger.complete(res.status);
    if (!res.ok) return null;
    const j = await res.json();
    // GoPlus uses code: 1 for success
    if (j?.code !== undefined && j.code !== 1) return null;
    return mapGoPlusToRugCheck(j, mint);
  } catch (e) {
    await logger.fail(e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Persist RugCheck summary to DB cache (upsert).
 */
async function persistToDb(tokenMint: string, data: RugCheckSummary): Promise<void> {
  const sb = getSupabase();
  await sb.from('rugcheck_cache').upsert(
    {
      token_mint: tokenMint,
      summary_data: data,
      score_normalised: data.score_normalised ?? null,
      rugged: data.rugged ?? false,
      risk_count: data.risks?.length ?? 0,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'token_mint' }
  );
}

/**
 * Batch check: which mints already have cached data?
 * Returns set of mints that DON'T need a fresh fetch.
 */
export async function getAlreadyCachedMints(mints: string[]): Promise<Set<string>> {
  if (mints.length === 0) return new Set();
  try {
    const sb = getSupabase();
    const cutoff = new Date(Date.now() - SUMMARY_CACHE_TTL_MS).toISOString();
    const { data } = await sb
      .from('rugcheck_cache')
      .select('token_mint')
      .in('token_mint', mints)
      .gt('fetched_at', cutoff);
    return new Set((data || []).map(r => r.token_mint));
  } catch {
    return new Set();
  }
}
