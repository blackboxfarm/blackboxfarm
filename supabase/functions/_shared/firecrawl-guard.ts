/**
 * Centralized Firecrawl rate-limit guard.
 * Tracks usage across all callers within a single edge function invocation window
 * and provides self-throttle + alert capabilities.
 */

import { createClient } from "npm:@supabase/supabase-js@2.54.0";

// In-memory counters (reset per cold start, ~per invocation)
let callCountThisWindow = 0;
let windowStart = Date.now();
let selfThrottledUntil = 0;

const WINDOW_MS = 60_000; // 1-minute window
const MAX_CALLS_PER_WINDOW = 10; // max Firecrawl calls per minute across all callers
const THROTTLE_COOLDOWN_MS = 120_000; // 2-min pause when we self-throttle

export interface FirecrawlGuardResult {
  allowed: boolean;
  reason?: string;
  callsInWindow: number;
}

/**
 * Check if a Firecrawl call is allowed right now.
 * If not, fires an admin alert about self-throttling.
 */
export function checkFirecrawlBudget(callerName: string): FirecrawlGuardResult {
  const now = Date.now();

  // Reset window if expired
  if (now - windowStart > WINDOW_MS) {
    callCountThisWindow = 0;
    windowStart = now;
  }

  // Check self-throttle
  if (now < selfThrottledUntil) {
    const remainSec = Math.ceil((selfThrottledUntil - now) / 1000);
    console.warn(`[FirecrawlGuard] ${callerName} BLOCKED — self-throttled for ${remainSec}s more`);
    return { allowed: false, reason: `Self-throttled (${remainSec}s remaining)`, callsInWindow: callCountThisWindow };
  }

  // Check budget
  if (callCountThisWindow >= MAX_CALLS_PER_WINDOW) {
    selfThrottledUntil = now + THROTTLE_COOLDOWN_MS;
    console.warn(`[FirecrawlGuard] ${callerName} hit ${MAX_CALLS_PER_WINDOW} calls/min — self-throttling for ${THROTTLE_COOLDOWN_MS / 1000}s`);

    // Fire alert async (don't block)
    fireThrottleAlert(callerName, callCountThisWindow).catch(() => {});

    return { allowed: false, reason: `Rate limit: ${MAX_CALLS_PER_WINDOW} calls/min exceeded`, callsInWindow: callCountThisWindow };
  }

  callCountThisWindow++;
  return { allowed: true, callsInWindow: callCountThisWindow };
}

/**
 * Record a Firecrawl API error and fire targeted alerts for known error types.
 */
export async function handleFirecrawlError(
  callerName: string,
  statusCode: number,
  errorDetail: string
): Promise<string> {
  let errorType = 'unknown';
  let severity = 'ERROR';
  let emoji = '❌';
  let action = 'Investigate logs.';

  if (statusCode === 402) {
    errorType = 'credits_exhausted';
    severity = 'CRITICAL';
    emoji = '💳';
    action = 'Top up Firecrawl credits immediately — all scraping halted.';
  } else if (statusCode === 429) {
    errorType = 'rate_limited';
    severity = 'WARNING';
    emoji = '⏱️';
    action = 'Rate limited by Firecrawl API. Will auto-recover. If persistent, reduce frequency.';
    // Also self-throttle
    selfThrottledUntil = Date.now() + THROTTLE_COOLDOWN_MS;
  } else if (statusCode === 403) {
    errorType = 'blocked';
    severity = 'CRITICAL';
    emoji = '🚫';
    action = 'Possible IP/fingerprint block. Check Firecrawl dashboard.';
  }

  const taggedError = `FIRECRAWL_${errorType.toUpperCase()}: ${errorDetail}`;

  // Fire alert
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from('admin_notifications').insert({
      notification_type: `firecrawl_${errorType}`,
      title: `${emoji} ${severity}: Firecrawl ${errorType} in ${callerName}`,
      message: `Caller: ${callerName}\nStatus: ${statusCode}\nDetail: ${errorDetail}\n\n🔧 Action: ${action}`,
      metadata: {
        caller: callerName,
        status_code: statusCode,
        error_type: errorType,
        error_detail: errorDetail,
      },
    });
  } catch (e) {
    console.error('[FirecrawlGuard] Failed to send alert:', e);
  }

  return taggedError;
}

/**
 * Fire admin alert when we self-throttle
 */
async function fireThrottleAlert(callerName: string, callCount: number) {
  // Suppress noisy self-throttle alerts for callers we've intentionally muted.
  // Solscan v2 is disabled — its Firecrawl fallback is a no-op now, but in case
  // a stale invocation still trips the guard, we don't want to spam admin.
  const MUTED_CALLERS = new Set(['solscan-intelligence']);
  if (MUTED_CALLERS.has(callerName)) {
    console.log(`[FirecrawlGuard] self-throttle alert suppressed for muted caller=${callerName} (calls=${callCount})`);
    return;
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from('admin_notifications').insert({
      notification_type: 'firecrawl_self_throttle',
      title: `⚠️ WARNING: Firecrawl self-throttled by ${callerName}`,
      message: `${callCount} Firecrawl calls in 1 minute triggered internal rate limiter.\nCaller: ${callerName}\nCooldown: ${THROTTLE_COOLDOWN_MS / 1000}s\n\nThis is a protective measure to avoid burning credits. If legitimate, consider increasing the budget.`,
      metadata: {
        caller: callerName,
        calls_in_window: callCount,
        cooldown_ms: THROTTLE_COOLDOWN_MS,
      },
    });
  } catch (e) {
    console.error('[FirecrawlGuard] Failed to send throttle alert:', e);
  }
}
