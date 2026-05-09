/**
 * Solscan Pro v2.0 — Per-Process Rate Limiter & LRU Response Cache
 *
 * Pro plan ≈ 1,000 requests/min. We self-throttle to 800 rpm to leave headroom.
 * Caching: 5-min TTL for /token/meta-class endpoints, 60-sec TTL for transfer feeds.
 *
 * Usage:
 *   const data = await solscanFetch(url, { headers, cacheTtlMs: 300_000 });
 *
 * Structured log lines look like:
 *   [Solscan] GET /v2.0/token/meta hit=cache key=…  (or hit=net status=200 ms=420 rpm=124/800)
 */

const MAX_RPM = 800;
const WINDOW_MS = 60_000;
const requestTimestamps: number[] = [];

interface CacheEntry { ts: number; ttl: number; status: number; body: string; }
const responseCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 1000;

function pruneCache() {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  // Drop oldest 10% by insertion order
  const drop = Math.ceil(MAX_CACHE_ENTRIES * 0.1);
  let i = 0;
  for (const k of responseCache.keys()) {
    if (i++ >= drop) break;
    responseCache.delete(k);
  }
}

function shortPath(url: string): string {
  try { return new URL(url).pathname; } catch { return url.slice(0, 40); }
}

async function waitForSlot() {
  const now = Date.now();
  // Drop timestamps outside the window
  while (requestTimestamps.length && now - requestTimestamps[0] > WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length < MAX_RPM) return;
  const oldest = requestTimestamps[0];
  const wait = Math.max(0, WINDOW_MS - (now - oldest)) + 25;
  console.warn(`[Solscan] rate-limit ceiling reached (${requestTimestamps.length}/${MAX_RPM}); sleeping ${wait}ms`);
  await new Promise(r => setTimeout(r, wait));
  return waitForSlot();
}

export interface SolscanFetchOptions {
  headers?: Record<string, string>;
  cacheTtlMs?: number; // 0 disables cache for this call
  timeoutMs?: number;
  cacheKeyOverride?: string;
}

export interface SolscanFetchResult {
  ok: boolean;
  status: number;
  body: any;
  fromCache: boolean;
}

/**
 * Throttled + cached fetch wrapper for Solscan Pro endpoints.
 * Always returns parsed JSON in `body` when content-type is JSON.
 */
export async function solscanFetch(url: string, opts: SolscanFetchOptions = {}): Promise<SolscanFetchResult> {
  const { headers = {}, cacheTtlMs = 0, timeoutMs = 8000, cacheKeyOverride } = opts;
  const cacheKey = cacheKeyOverride || url;

  // HARD-DISABLED at code level. Solscan API is permanently off — invalid key was spamming
  // 401 audit alerts. All callers fall back to DexScreener / Helius / Pump.fun.
  // To re-enable: delete this block (and ensure SOLSCAN_API_KEY is a valid Pro v2 key).
  console.warn(`[Solscan] HARD-DISABLED in code — skipping ${shortPath(url)}`);
  return { ok: false, status: 503, body: { error: 'solscan_disabled' }, fromCache: false };

  // Cache hit
  if (cacheTtlMs > 0) {
    const hit = responseCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < hit.ttl) {
      console.log(`[Solscan] GET ${shortPath(url)} hit=cache age=${Date.now() - hit.ts}ms`);
      return { ok: hit.status >= 200 && hit.status < 300, status: hit.status, body: safeParse(hit.body), fromCache: true };
    }
  }

  await waitForSlot();
  const start = Date.now();
  requestTimestamps.push(start);

  let resp: Response;
  try {
    resp = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const ms = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Solscan] GET ${shortPath(url)} hit=net status=ERR ms=${ms} rpm=${requestTimestamps.length}/${MAX_RPM} err="${msg}"`);
    return { ok: false, status: 0, body: { error: msg }, fromCache: false };
  }

  const text = await resp.text();
  const ms = Date.now() - start;
  console.log(`[Solscan] GET ${shortPath(url)} hit=net status=${resp.status} ms=${ms} rpm=${requestTimestamps.length}/${MAX_RPM}`);

  if (cacheTtlMs > 0 && resp.ok) {
    responseCache.set(cacheKey, { ts: Date.now(), ttl: cacheTtlMs, status: resp.status, body: text });
    pruneCache();
  }

  return { ok: resp.ok, status: resp.status, body: safeParse(text), fromCache: false };
}

function safeParse(text: string): any {
  try { return JSON.parse(text); } catch { return text; }
}

/** Diagnostics for the admin Solscan key-status panel. */
export function getSolscanRateStats() {
  const now = Date.now();
  const recent = requestTimestamps.filter(t => now - t <= WINDOW_MS);
  return {
    rpm: recent.length,
    rpmCeiling: MAX_RPM,
    cacheSize: responseCache.size,
    cacheCeiling: MAX_CACHE_ENTRIES,
  };
}