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

import { assertInsert } from './db-assert.ts';

const MAX_RPM = 800;
const WINDOW_MS = 60_000;
const requestTimestamps: number[] = [];

// Lazy supabase client for usage logging (service-role)
let _supa: any = null;
async function getLogClient() {
  if (_supa) return _supa;
  try {
    const url = (globalThis as any).Deno?.env?.get?.('SUPABASE_URL');
    const key = (globalThis as any).Deno?.env?.get?.('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return null;
    const { createClient } = await import('@supabase/supabase-js');
    _supa = createClient(url, key, { auth: { persistSession: false } });
    return _supa;
  } catch { return null; }
}

function logCall(row: {
  endpoint_path: string;
  function_name?: string;
  http_status: number;
  duration_ms: number;
  from_cache: boolean;
  error_message?: string;
  response_bytes?: number;
  mint_or_address?: string;
}) {
  // Fire-and-forget; never blocks the request.
  getLogClient().then((supa) => {
    if (!supa) return;
    assertInsert(supa.from('solscan_api_calls').insert(row), 'solscan_api_calls')
      .catch((error: any) => console.warn('[Solscan][usage-log] insert failed:', error?.message ?? error));
  }).catch(() => {});
}

function extractMintOrAddress(url: string): string | undefined {
  try {
    const u = new URL(url);
    return (
      u.searchParams.get('address') ||
      u.searchParams.get('token') ||
      u.searchParams.get('token[]') ||
      u.searchParams.get('tx') ||
      undefined
    );
  } catch { return undefined; }
}

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

// ── Per-endpoint circuit breaker ─────────────────────────────────────────────
// Solscan's /v2.0/account/transfer endpoint chronically 504s on heavy wallets.
// After N consecutive 504/timeout failures within FAIL_WINDOW_MS we trip the
// breaker for COOLDOWN_MS, returning a fast synthetic 504 so callers fall
// through to their Helius / scrape fallback instead of waiting 8s per call.
const CB_FAIL_THRESHOLD = 3;
const CB_FAIL_WINDOW_MS = 5 * 60_000;   // 5 minutes
const CB_COOLDOWN_MS    = 15 * 60_000;  // 15 minutes
interface CBState { failures: number[]; openUntil: number; }
const circuitState = new Map<string, CBState>();

function cbGet(path: string): CBState {
  let s = circuitState.get(path);
  if (!s) { s = { failures: [], openUntil: 0 }; circuitState.set(path, s); }
  return s;
}

function cbIsOpen(path: string): boolean {
  const s = cbGet(path);
  return Date.now() < s.openUntil;
}

function cbRecordFailure(path: string) {
  const s = cbGet(path);
  const now = Date.now();
  s.failures = s.failures.filter(t => now - t <= CB_FAIL_WINDOW_MS);
  s.failures.push(now);
  if (s.failures.length >= CB_FAIL_THRESHOLD) {
    s.openUntil = now + CB_COOLDOWN_MS;
    s.failures = [];
    console.warn(`[Solscan][circuit-breaker] OPEN for ${path} — cooldown ${Math.round(CB_COOLDOWN_MS / 60_000)}m (too many 504/timeout)`);
  }
}

function cbRecordSuccess(path: string) {
  const s = cbGet(path);
  if (s.failures.length || s.openUntil) {
    s.failures = [];
    s.openUntil = 0;
  }
}

export function getSolscanCircuitState() {
  const out: Record<string, { open: boolean; openUntilMs: number; recentFailures: number }> = {};
  const now = Date.now();
  for (const [path, s] of circuitState.entries()) {
    out[path] = {
      open: now < s.openUntil,
      openUntilMs: Math.max(0, s.openUntil - now),
      recentFailures: s.failures.filter(t => now - t <= CB_FAIL_WINDOW_MS).length,
    };
  }
  return out;
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
  /** Identifier of the calling edge function (for usage attribution) */
  callerName?: string;
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
  const { headers = {}, cacheTtlMs = 0, timeoutMs = 8000, cacheKeyOverride, callerName } = opts;
  const cacheKey = cacheKeyOverride || url;
  const path = shortPath(url);
  const addr = extractMintOrAddress(url);

  // Cache hit
  if (cacheTtlMs > 0) {
    const hit = responseCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < hit.ttl) {
      console.log(`[Solscan] GET ${shortPath(url)} hit=cache age=${Date.now() - hit.ts}ms`);
      logCall({
        endpoint_path: path,
        function_name: callerName,
        http_status: hit.status,
        duration_ms: 0,
        from_cache: true,
        response_bytes: hit.body.length,
        mint_or_address: addr,
      });
      return { ok: hit.status >= 200 && hit.status < 300, status: hit.status, body: safeParse(hit.body), fromCache: true };
    }
  }

  // Circuit breaker short-circuit (skip cache miss + network)
  if (cbIsOpen(path)) {
    const remainingMs = cbGet(path).openUntil - Date.now();
    logCall({
      endpoint_path: path,
      function_name: callerName,
      http_status: 504,
      duration_ms: 0,
      from_cache: false,
      error_message: `circuit-open (cooldown ${Math.round(remainingMs / 1000)}s)`,
      mint_or_address: addr,
    });
    return { ok: false, status: 504, body: { error: 'circuit-open', cooldown_ms: remainingMs }, fromCache: false };
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
    cbRecordFailure(path);
    logCall({
      endpoint_path: path,
      function_name: callerName,
      http_status: 0,
      duration_ms: ms,
      from_cache: false,
      error_message: msg,
      mint_or_address: addr,
    });
    return { ok: false, status: 0, body: { error: msg }, fromCache: false };
  }

  const text = await resp.text();
  const ms = Date.now() - start;
  console.log(`[Solscan] GET ${shortPath(url)} hit=net status=${resp.status} ms=${ms} rpm=${requestTimestamps.length}/${MAX_RPM}`);

  // Update circuit breaker based on outcome
  if (resp.status === 504 || resp.status === 502 || resp.status === 503) {
    cbRecordFailure(path);
  } else if (resp.ok) {
    cbRecordSuccess(path);
  }

  if (cacheTtlMs > 0 && resp.ok) {
    responseCache.set(cacheKey, { ts: Date.now(), ttl: cacheTtlMs, status: resp.status, body: text });
    pruneCache();
  }

  logCall({
    endpoint_path: path,
    function_name: callerName,
    http_status: resp.status,
    duration_ms: ms,
    from_cache: false,
    error_message: resp.ok ? undefined : text.slice(0, 500),
    response_bytes: text.length,
    mint_or_address: addr,
  });

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