/**
 * API Failure Alert System with Escalation Chain
 * 
 * Tier 1: Immediate TG alert (10 min cooldown)
 * Tier 2: Re-alert with "STILL DOWN" after 30 min if unresolved
 * Tier 3: Re-alert every 60 min with escalation count
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Track alert state per service
interface AlertState {
  firstAlertAt: number;
  lastAlertAt: number;
  escalationCount: number;
}

const alertStates = new Map<string, AlertState>();
const TIER1_COOLDOWN_MS = 10 * 60 * 1000;   // 10 min initial cooldown
const TIER2_THRESHOLD_MS = 30 * 60 * 1000;  // 30 min → re-alert
const TIER3_INTERVAL_MS = 60 * 60 * 1000;   // 60 min ongoing re-alerts

// SMS-specific cooldown for Apify funds blocks (separate channel = lower noise tolerance)
const APIFY_FUNDS_SMS_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between SMS
const apifyFundsSmsState = new Map<string, number>(); // key = status code, value = lastSentAt

export async function alertOnApiAuthFailure(
  supabase: SupabaseClient,
  serviceName: string,
  endpoint: string,
  httpStatus: number,
  errorBody?: string,
  functionName?: string
): Promise<void> {
  // 🔕 Hard kill-switch: API failure alerts (401/403/429) are fully muted.
  // No Telegram broadcast, no admin_notifications insert, no escalation tracking.
  // Health/quota are visible via the Solscan & provider dashboards instead.
  void supabase; void serviceName; void endpoint; void httpStatus; void errorBody; void functionName;
  return;

  const cooldownKey = `${serviceName}:${httpStatus}`;
  const now = Date.now();
  const state = alertStates.get(cooldownKey);

  let escalationPrefix = '';
  let shouldAlert = false;

  if (!state) {
    // First occurrence — Tier 1 alert
    alertStates.set(cooldownKey, { firstAlertAt: now, lastAlertAt: now, escalationCount: 0 });
    shouldAlert = true;
  } else {
    const sinceFirst = now - state.firstAlertAt;
    const sinceLast = now - state.lastAlertAt;

    if (sinceFirst >= TIER2_THRESHOLD_MS && sinceFirst < TIER3_INTERVAL_MS && sinceLast >= TIER2_THRESHOLD_MS) {
      // Tier 2: 30 min still down
      escalationPrefix = '🔴 STILL DOWN — ';
      state.escalationCount++;
      state.lastAlertAt = now;
      shouldAlert = true;
    } else if (sinceFirst >= TIER3_INTERVAL_MS && sinceLast >= TIER3_INTERVAL_MS) {
      // Tier 3: hourly re-alerts
      state.escalationCount++;
      escalationPrefix = `🚨 ESCALATION #${state.escalationCount} — `;
      state.lastAlertAt = now;
      shouldAlert = true;
    } else if (sinceLast < TIER1_COOLDOWN_MS) {
      // Within cooldown
      return;
    }
  }

  if (!shouldAlert) return;

  const statusEmoji = httpStatus === 401 ? '🔑' : httpStatus === 403 ? '🚫' : '⚠️';
  const statusLabel = httpStatus === 401 ? 'UNAUTHORIZED' : httpStatus === 403 ? 'FORBIDDEN' : 'RATE LIMITED';

  // Traceable alert ID — bake into every TG/email/SMS message + admin_notifications.metadata.trace_id
  const traceId = `[fn=${functionName || 'unknown'}][svc=${serviceName}][ep=${endpoint}][code=${httpStatus}]`;

  const message = [
    traceId,
    `${escalationPrefix}${statusEmoji} **API ${statusLabel}: ${serviceName.toUpperCase()}**`,
    ``,
    `**Status:** ${httpStatus}`,
    `**Endpoint:** \`${endpoint}\``,
    `**Function:** ${functionName || 'unknown'}`,
    errorBody ? `**Response:** \`${errorBody.slice(0, 150)}\`` : '',
    ``,
    `⏰ ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    ``,
    `🔧 Action: Check/rotate the **${serviceName.toUpperCase()}** API key in Supabase secrets.`,
  ].filter(Boolean).join('\n');

  // Telegram broadcast intentionally disabled — admin alerts are dashboard-only.
  // Keep `message` available for the DB insert below for parity with the old payload.
  void message;
  console.log(`[ApiAlert] Recorded ${serviceName} ${httpStatus} (escalation: ${state?.escalationCount || 0}) — TG broadcast suppressed`);

  try {
    await supabase.from('admin_notifications').insert({
      notification_type: escalationPrefix ? 'api_failure_escalation' : 'api_auth_failure',
      title: `${traceId} ${escalationPrefix}${statusEmoji} ${serviceName} API ${statusLabel}`,
      message: `${traceId} ${serviceName} returned ${httpStatus} on ${endpoint}. ${errorBody?.slice(0, 100) || 'Check API key.'}`,
      metadata: { trace_id: traceId, service: serviceName, status: httpStatus, endpoint, function: functionName, error: errorBody?.slice(0, 200), escalation: state?.escalationCount || 0 },
    });
  } catch (e) {
    console.error(`[ApiAlert] Failed to write admin notification:`, e);
  }
}

/**
 * Clear escalation state when a service recovers (called on successful API responses)
 */
export function clearEscalation(serviceName: string): void {
  for (const [key] of alertStates) {
    if (key.startsWith(`${serviceName}:`)) {
      alertStates.delete(key);
    }
  }
}

/**
 * Detect Apify credit/funds failures (HTTP 402, or 403/429 with quota wording)
 * vs. transient rate limits. Sends SMS to admin AND auto-pauses the Apify pipeline.
 */
export async function alertOnApifyCreditFailure(
  supabase: SupabaseClient,
  endpoint: string,
  httpStatus: number,
  errorBody: string | undefined,
  functionName: string | undefined,
): Promise<void> {
  const body = (errorBody || '').toLowerCase();
  const quotaWords = ['insufficient credit', 'monthly usage', 'usage limit', 'payment required', 'quota exceeded', 'monthly quota', 'out of credit', 'billing', 'plan limit'];
  const matchesQuotaWording = quotaWords.some(w => body.includes(w));

  let isCreditFailure = false;
  if (httpStatus === 402) isCreditFailure = true;
  else if (httpStatus === 403 && matchesQuotaWording) isCreditFailure = true;
  else if (httpStatus === 429 && matchesQuotaWording) isCreditFailure = true; // monthly quota, not transient

  if (!isCreditFailure) return;

  const cooldownKey = String(httpStatus);
  const now = Date.now();
  const lastSent = apifyFundsSmsState.get(cooldownKey) ?? 0;

  // Always pause the pipeline (cheap, idempotent)
  let pauseUntil: string | null = null;
  let queuePending = 0;
  try {
    const { data: pausedUntil } = await supabase.rpc('pause_apify', {
      p_minutes: 60,
      p_reason: `Apify ${httpStatus} — ${body.slice(0, 200) || 'credit/funds block'}`,
      p_status: httpStatus,
      p_body: errorBody?.slice(0, 500) ?? null,
      p_triggered_by: functionName || 'api-logger',
    });
    pauseUntil = (pausedUntil as string) || null;

    const { count } = await supabase
      .from('x_community_resolution_queue')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null)
      .lt('attempts', 3);
    queuePending = count ?? 0;
  } catch (e) {
    console.warn('[ApifyCreditAlert] pause_apify or queue count failed:', (e as Error).message);
  }

  // Throttle SMS — TG already escalates separately
  if (now - lastSent < APIFY_FUNDS_SMS_COOLDOWN_MS) {
    console.log(`[ApifyCreditAlert] SMS suppressed (cooldown). status=${httpStatus} fn=${functionName}`);
    return;
  }
  apifyFundsSmsState.set(cooldownKey, now);

  const reasonLine = matchesQuotaWording
    ? body.split('\n')[0].slice(0, 100)
    : (httpStatus === 402 ? 'Payment required' : `HTTP ${httpStatus}`);

  const traceId = `[fn=${functionName || 'unknown'}][svc=apify][ep=${endpoint}][code=${httpStatus}]`;
  const sms = [
    traceId,
    `🚨 APIFY FUNDS BLOCKED`,
    `Status: ${httpStatus}`,
    `Fn: ${functionName || 'unknown'}`,
    `Why: ${reasonLine}`,
    `Queue pending: ${queuePending.toLocaleString()}`,
    `Paused 60min — top up Apify`,
  ].join('\n');

  try {
    const { sendAdminSms } = await import('./sms-notify.ts');
    const ok = await sendAdminSms(sms);
    console.log(`[ApifyCreditAlert] SMS ${ok ? 'sent' : 'failed'} to admin. status=${httpStatus} pendingQueue=${queuePending}`);
  } catch (e) {
    console.warn('[ApifyCreditAlert] SMS send threw:', (e as Error).message);
  }

  // Mirror to admin_notifications for in-app visibility
  try {
    await supabase.from('admin_notifications').insert({
      notification_type: 'apify_funds_blocked',
      title: `${traceId} 🚨 Apify funds blocked (${httpStatus})`,
      message: `${traceId} ${reasonLine} — pipeline paused for 60 min. ${queuePending.toLocaleString()} community resolutions queued.`,
      metadata: { trace_id: traceId, status: httpStatus, endpoint, function: functionName, error: errorBody?.slice(0, 300), pauseUntil, queuePending },
    });
  } catch (e) {
    console.warn('[ApifyCreditAlert] admin_notifications insert failed:', (e as Error).message);
  }
}

/**
 * Clear the Apify SMS cooldown — called when a successful Apify call lands.
 */
export function clearApifyCreditCooldown(): void {
  apifyFundsSmsState.clear();
}
