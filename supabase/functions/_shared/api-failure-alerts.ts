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

export async function alertOnApiAuthFailure(
  supabase: SupabaseClient,
  serviceName: string,
  endpoint: string,
  httpStatus: number,
  errorBody?: string,
  functionName?: string
): Promise<void> {
  if (![401, 403, 429].includes(httpStatus)) return;

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

  const message = [
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

  try {
    const { broadcastToTelegram } = await import("./telegram-broadcast.ts");
    await broadcastToTelegram(supabase, message, ['BLACKBOX'], 0);
    console.log(`[ApiAlert] Sent TG alert for ${serviceName} ${httpStatus} (escalation: ${state?.escalationCount || 0})`);
  } catch (e) {
    console.error(`[ApiAlert] Failed to send TG alert:`, e);
  }

  try {
    await supabase.from('admin_notifications').insert({
      notification_type: escalationPrefix ? 'api_failure_escalation' : 'api_auth_failure',
      title: `${escalationPrefix}${statusEmoji} ${serviceName} API ${statusLabel}`,
      message: `${serviceName} returned ${httpStatus} on ${endpoint}. ${errorBody?.slice(0, 100) || 'Check API key.'}`,
      metadata: { service: serviceName, status: httpStatus, endpoint, function: functionName, error: errorBody?.slice(0, 200), escalation: state?.escalationCount || 0 },
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
