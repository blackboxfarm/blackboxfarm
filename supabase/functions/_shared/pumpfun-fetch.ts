/**
 * Shared Pump.fun API fetch wrapper with:
 * - Exponential backoff on 429 rate limits
 * - Structured logging for all calls
 * - Admin notifications on repeated rate limits
 * - Run-level stats tracking
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PUMPFUN_API = 'https://frontend-api-v3.pump.fun';

// Track 429s across the entire run to trigger admin alerts
let runRateLimitCount = 0;
let runTotalCalls = 0;
let runSuccessCalls = 0;
let runFailedCalls = 0;
let alertSent = false;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface PumpFunFetchOptions {
  callerName: string;  // e.g. 'token-enricher', 'watchlist-monitor'
  tokenMint: string;
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
 * Fetch from pump.fun API with backoff, logging, and admin alert on rate limits.
 */
export async function pumpfunFetch(
  endpoint: string,
  options: PumpFunFetchOptions
): Promise<PumpFunFetchResult> {
  const { callerName, tokenMint, maxRetries = 3, timeoutMs = 8000 } = options;
  const url = `${PUMPFUN_API}${endpoint}`;
  
  runTotalCalls++;
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
        const backoffMs = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        console.warn(`[${callerName}] 🚫 429 RATE LIMITED on ${tokenMint} (attempt ${attempt + 1}/${maxRetries}, backing off ${backoffMs}ms)`);
        
        // Send admin alert after 3 rate limits in a single run
        if (runRateLimitCount >= 3 && !alertSent) {
          await sendRateLimitAlert(callerName, runRateLimitCount, runTotalCalls);
          alertSent = true;
        }
        
        await delay(backoffMs);
        continue;
      }

      if (response.status === 403) {
        runFailedCalls++;
        console.error(`[${callerName}] 🔒 403 FORBIDDEN on ${tokenMint} — pump.fun may be blocking us`);
        
        if (!alertSent) {
          await sendBlockedAlert(callerName, tokenMint);
          alertSent = true;
        }
        
        return { data: null, rateLimited: false, status: 403, error: 'Forbidden - possibly blocked' };
      }

      if (!response.ok) {
        runFailedCalls++;
        console.warn(`[${callerName}] ⚠️ ${response.status} on ${tokenMint}`);
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
      
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.warn(`[${callerName}] ❌ Fetch error for ${tokenMint}: ${errMsg}, backing off ${backoffMs}ms`);
      await delay(backoffMs);
    }
  }

  // All retries exhausted (rate limited)
  runFailedCalls++;
  console.error(`[${callerName}] 💀 All ${maxRetries} retries exhausted for ${tokenMint} (429 rate limited)`);
  return { data: null, rateLimited: true, status: lastStatus, error: 'Rate limit - all retries exhausted' };
}

/**
 * Convenience: fetch coin data from pump.fun
 */
export async function fetchPumpFunCoin(mint: string, callerName: string): Promise<any | null> {
  const result = await pumpfunFetch(`/coins/${mint}`, { callerName, tokenMint: mint });
  return result.data;
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
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('admin_notifications')
      .select('id')
      .eq('notification_type', 'pumpfun_rate_limit')
      .gte('created_at', tenMinAgo)
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

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('admin_notifications')
      .select('id')
      .eq('notification_type', 'pumpfun_blocked')
      .gte('created_at', tenMinAgo)
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
