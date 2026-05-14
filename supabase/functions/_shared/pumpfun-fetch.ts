/**
 * Shared Pump.fun API fetch wrapper with:
 * - Global rate limiter (max 1 request per THROTTLE_MS)
 * - Exponential backoff on 429 rate limits
 * - Structured logging for all calls
 * - Admin notifications on repeated rate limits
 * - Run-level stats tracking
 * - Support for all endpoint types (/coins, /trades, /replies, /clips, /user-created-coins)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PUMPFUN_API_BASE } from './pumpfun-api.ts';

const PUMPFUN_API = PUMPFUN_API_BASE;

// ── Global throttle: minimum 5 seconds between ANY pump.fun request ──
// Plus random jitter (0-3s) so parallel edge function invocations don't collide
const THROTTLE_MS = 5000;
const JITTER_MS = 3000;
let lastRequestTime = 0;

// ── Per-mint negative cache for 403 responses ──
// When pump.fun returns 403 for a specific mint (usually because it has
// graduated off the bonding curve and the /coins/{mint} endpoint refuses to
// serve it, OR because our IP is briefly blocked), we cache that decision so
// repeated cron cycles don't keep hammering the same dead mint and re-firing
// the BLOCKED admin alert. Cache is in-memory per edge-function isolate.
const NEG_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const negative403Cache = new Map<string, number>(); // mint -> expiresAt

function isMintNegativeCached(mint: string): boolean {
  const exp = negative403Cache.get(mint);
  if (!exp) return false;
  if (Date.now() > exp) {
    negative403Cache.delete(mint);
    return false;
  }
  return true;
}

function markMintNegative(mint: string) {
  if (!mint || mint === 'unknown' || mint === 'listing') return;
  negative403Cache.set(mint, Date.now() + NEG_CACHE_TTL_MS);
}

// Track 429s across the entire run to trigger admin alerts
let runRateLimitCount = 0;
let runTotalCalls = 0;
let runSuccessCalls = 0;
let runFailedCalls = 0;
let alertSent = false;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  const jitter = Math.floor(Math.random() * JITTER_MS);
  const waitTime = THROTTLE_MS + jitter;
  if (elapsed < waitTime) {
    await delay(waitTime - elapsed);
  }
  lastRequestTime = Date.now();
}

interface PumpFunFetchOptions {
  callerName: string;  // e.g. 'token-enricher', 'watchlist-monitor'
  tokenMint?: string;  // for logging context
  maxRetries?: number;
  timeoutMs?: number;
}

interface PumpFunFetchResult {
  data: any | null;
  rateLimited: boolean;
  status: number | null;
  error?: string;
}

/**
 * Fetch from pump.fun API with throttle, backoff, logging, and admin alert on rate limits.
 */
export async function pumpfunFetch(
  endpoint: string,
  options: PumpFunFetchOptions
): Promise<PumpFunFetchResult> {
  const { callerName, tokenMint = 'unknown', maxRetries = 3, timeoutMs = 10000 } = options;
  const url = `${PUMPFUN_API}${endpoint}`;
  
  runTotalCalls++;

  // Short-circuit: if this mint recently 403'd, skip pump.fun and go straight
  // to fallback (DexScreener) so we don't retrip the BLOCKED alert.
  if (isMintNegativeCached(tokenMint)) {
    console.log(`[${callerName}] ⏭ Skipping pump.fun for ${tokenMint} (403 negative-cached)`);
    const fallbackResult = await tryFallbackFetch(endpoint, options);
    if (fallbackResult) {
      runSuccessCalls++;
      return { data: fallbackResult, rateLimited: false, status: 200 };
    }
    return { data: null, rateLimited: false, status: 403, error: 'Negative-cached 403 (graduated/blocked)' };
  }

  // Global throttle — wait if too soon after last request
  await throttle();

  let lastStatus: number | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      lastStatus = response.status;

      if (response.status === 429) {
        runRateLimitCount++;
        const backoffMs = Math.pow(2, attempt) * 10000; // 10s, 20s, 40s (very conservative)
        console.warn(`[${callerName}] 🚫 429 RATE LIMITED on ${tokenMint} (attempt ${attempt + 1}/${maxRetries}, backing off ${backoffMs / 1000}s)`);
        
        // Send admin alert after 3 rate limits in a single run
        if (runRateLimitCount >= 3 && !alertSent) {
          await sendRateLimitAlert(callerName, runRateLimitCount, runTotalCalls);
          alertSent = true;
        }
        
        await delay(backoffMs);
        lastRequestTime = Date.now(); // Reset throttle after backoff
        continue;
      }

      if (response.status === 403) {
        runFailedCalls++;
        markMintNegative(tokenMint);
        console.error(`[${callerName}] 🔒 403 FORBIDDEN on ${tokenMint} — trying fallback mirror`);
        
        // Try fallback API mirror before giving up
        const fallbackResult = await tryFallbackFetch(endpoint, options);
        if (fallbackResult) {
          runSuccessCalls++;
          return { data: fallbackResult, rateLimited: false, status: 200 };
        }
        
        // Only alert when we see 403s on MULTIPLE distinct mints in a single
        // run — a single mint 403 is almost always "graduated off curve",
        // not an IP-level block. This stops the daily false-positive alert
        // for tokens like EwrGp4tDun3pVvHpidcoWbtSaU5gDpUJwuF7gEpump.
        if (!alertSent && negative403Cache.size >= 5) {
          await sendBlockedAlert(callerName, tokenMint);
          alertSent = true;
        }
        
        return { data: null, rateLimited: false, status: 403, error: 'Forbidden - blocked, fallback also failed' };
      }

      if (!response.ok) {
        runFailedCalls++;
        const body = await response.text().catch(() => '');
        console.warn(`[${callerName}] ⚠️ ${response.status} on ${tokenMint}: ${body.slice(0, 200)}`);
        return { data: null, rateLimited: false, status: response.status, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      runSuccessCalls++;
      return { data, rateLimited: false, status: 200 };

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      
      if (errMsg.includes('abort')) {
        runFailedCalls++;
        console.warn(`[${callerName}] ⏱ TIMEOUT on ${tokenMint} after ${timeoutMs}ms`);
        return { data: null, rateLimited: false, status: null, error: 'Timeout' };
      }
      
      const backoffMs = Math.pow(2, attempt) * 2000;
      console.warn(`[${callerName}] ❌ Fetch error for ${tokenMint}: ${errMsg}, backing off ${backoffMs}ms`);
      await delay(backoffMs);
      lastRequestTime = Date.now();
    }
  }

  // All retries exhausted (rate limited)
  runFailedCalls++;
  console.error(`[${callerName}] 💀 All ${maxRetries} retries exhausted for ${tokenMint} (429 rate limited)`);
  return { data: null, rateLimited: true, status: lastStatus, error: 'Rate limit - all retries exhausted' };
}

/**
 * Fallback: try DexScreener as metadata-only fallback when main API returns 403.
 * The Herokuapp mirror has been removed (dead/unreliable).
 */
async function tryFallbackFetch(endpoint: string, options: PumpFunFetchOptions): Promise<any | null> {
  const { callerName, tokenMint = 'unknown' } = options;
  
  // DexScreener fallback for /coins/{mint} endpoints
  const mintMatch = endpoint.match(/^\/coins\/([A-Za-z0-9]+)$/);
  if (mintMatch) {
    try {
      const mint = mintMatch[1];
      console.log(`[${callerName}] 🔄 Trying DexScreener fallback for ${mint}...`);
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        const pair = dexData.pairs?.[0];
        if (pair?.baseToken?.symbol) {
          const mapped = {
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name || pair.baseToken.symbol,
            image_uri: pair.info?.imageUrl || null,
            usd_market_cap: pair.marketCap || null,
            twitter: pair.info?.socials?.find((s: any) => s.type === 'twitter')?.url || null,
            website: pair.info?.websites?.[0]?.url || null,
            _source: 'dexscreener_fallback',
          };
          console.log(`[${callerName}] ✅ DexScreener fallback SUCCESS for ${mint}: $${mapped.symbol}`);
          return mapped;
        }
      }
    } catch (e) {
      console.warn(`[${callerName}] DexScreener fallback failed:`, e instanceof Error ? e.message : e);
    }
  }

  console.warn(`[${callerName}] No fallback available for endpoint: ${endpoint}`);
  return null;
}

/**
 * Convenience: fetch coin data from pump.fun
 */
export async function fetchPumpFunCoin(mint: string, callerName: string): Promise<any | null> {
  const result = await pumpfunFetch(`/coins/${mint}`, { callerName, tokenMint: mint });
  return result.data;
}

/**
 * Convenience: fetch user-created coins for a wallet
 */
export async function fetchPumpFunCreatorCoins(
  walletAddress: string,
  callerName: string,
  limit = 50,
  offset = 0
): Promise<any[] | null> {
  const result = await pumpfunFetch(
    `/coins/user-created-coins/${walletAddress}?limit=${limit}&offset=${offset}`,
    { callerName, tokenMint: walletAddress }
  );
  return result.data ? (Array.isArray(result.data) ? result.data : []) : null;
}

/**
 * Convenience: fetch latest trades for a token
 */
export async function fetchPumpFunTrades(mint: string, callerName: string, limit = 100): Promise<any[] | null> {
  const result = await pumpfunFetch(
    `/trades/latest/${mint}?limit=${limit}`,
    { callerName, tokenMint: mint }
  );
  return result.data ? (Array.isArray(result.data) ? result.data : []) : null;
}

/**
 * Convenience: fetch replies/comments for a token
 */
export async function fetchPumpFunReplies(mint: string, callerName: string, limit = 50): Promise<any[] | null> {
  const result = await pumpfunFetch(
    `/replies/${mint}?limit=${limit}&offset=0`,
    { callerName, tokenMint: mint }
  );
  return result.data ? (Array.isArray(result.data) ? result.data : []) : null;
}

/**
 * Convenience: fetch clips/livestreams for a token
 */
export async function fetchPumpFunClips(mint: string, callerName: string): Promise<any[] | null> {
  const result = await pumpfunFetch(
    `/clips/${mint}`,
    { callerName, tokenMint: mint }
  );
  return result.data ? (Array.isArray(result.data) ? result.data : []) : null;
}

/**
 * Convenience: fetch new coins listing
 */
export async function fetchPumpFunNewCoins(callerName: string, limit = 50): Promise<any[] | null> {
  const result = await pumpfunFetch(
    `/coins?sort=created_timestamp&order=DESC&limit=${limit}`,
    { callerName, tokenMint: 'listing' }
  );
  return result.data ? (Array.isArray(result.data) ? result.data : []) : null;
}

/**
 * Get run-level stats for logging at end of function execution
 */
export function getPumpFunRunStats() {
  return {
    totalCalls: runTotalCalls,
    successCalls: runSuccessCalls,
    failedCalls: runFailedCalls,
    rateLimitHits: runRateLimitCount,
    alertSent,
  };
}

/**
 * Reset run stats (call at start of each invocation)
 */
export function resetPumpFunRunStats() {
  runTotalCalls = 0;
  runSuccessCalls = 0;
  runFailedCalls = 0;
  runRateLimitCount = 0;
  alertSent = false;
}

// === Admin Alert Helpers ===

async function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return null;
  return createClient(url, key);
}

async function sendRateLimitAlert(callerName: string, hitCount: number, totalCalls: number) {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    // Check cooldown — don't spam alerts (10 min cooldown)
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('admin_notifications')
      .select('id')
      .eq('notification_type', 'pumpfun_rate_limit')
      .gte('created_at', oneHourAgo)
      .limit(1);

    if (recent && recent.length > 0) return; // Already alerted recently

    await supabase.from('admin_notifications').insert({
      notification_type: 'pumpfun_rate_limit',
      title: `🚫 RATE LIMITED: Pump.fun API 429 in ${callerName}`,
      message: `${hitCount} rate limit hits out of ${totalCalls} calls this run. The ${callerName} service is being throttled by pump.fun. Consider increasing call intervals or reducing batch sizes.`,
      metadata: { caller: callerName, rate_limit_hits: hitCount, total_calls: totalCalls },
    });

    console.warn(`[${callerName}] 📢 Admin notification sent: pump.fun rate limit alert`);
  } catch (e) {
    console.error('[pumpfun-fetch] Failed to send rate limit alert:', e);
  }
}

async function sendBlockedAlert(callerName: string, tokenMint: string) {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('admin_notifications')
      .select('id')
      .eq('notification_type', 'pumpfun_blocked')
      .gte('created_at', oneHourAgo)
      .limit(1);

    if (recent && recent.length > 0) return;

    await supabase.from('admin_notifications').insert({
      notification_type: 'pumpfun_blocked',
      title: `🔒 BLOCKED: Pump.fun returned 403 in ${callerName}`,
      message: `Pump.fun returned 403 Forbidden for ${tokenMint}. Our IP may be temporarily blocked. Service will retry on next cron cycle.`,
      metadata: { caller: callerName, token_mint: tokenMint },
    });

    console.warn(`[${callerName}] 📢 Admin notification sent: pump.fun 403 blocked alert`);
  } catch (e) {
    console.error('[pumpfun-fetch] Failed to send blocked alert:', e);
  }
}
