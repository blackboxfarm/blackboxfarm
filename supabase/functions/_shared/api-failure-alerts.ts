/**
 * API Failure Alert System
 * Sends Telegram alerts to BlackBox channel on 401/403 API auth failures
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Cooldown tracking per service to avoid spam
const alertCooldowns = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes per service

export async function alertOnApiAuthFailure(
  supabase: SupabaseClient,
  serviceName: string,
  endpoint: string,
  httpStatus: number,
  errorBody?: string,
  functionName?: string
): Promise<void> {
  // Only alert on auth failures and server errors
  if (![401, 403, 429].includes(httpStatus)) return;

  const cooldownKey = `${serviceName}:${httpStatus}`;
  const lastAlert = alertCooldowns.get(cooldownKey) || 0;
  if (Date.now() - lastAlert < COOLDOWN_MS) {
    console.log(`[ApiAlert] Cooldown active for ${cooldownKey}, skipping TG alert`);
    return;
  }

  alertCooldowns.set(cooldownKey, Date.now());

  const statusEmoji = httpStatus === 401 ? '🔑' : httpStatus === 403 ? '🚫' : '⚠️';
  const statusLabel = httpStatus === 401 ? 'UNAUTHORIZED' : httpStatus === 403 ? 'FORBIDDEN' : 'RATE LIMITED';

  const message = [
    `${statusEmoji} **API ${statusLabel}: ${serviceName.toUpperCase()}**`,
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
    // Import broadcast dynamically to avoid circular deps
    const { broadcastToTelegram } = await import("./telegram-broadcast.ts");
    await broadcastToTelegram(supabase, message, ['BLACKBOX'], 0);
    console.log(`[ApiAlert] Sent TG alert for ${serviceName} ${httpStatus}`);
  } catch (e) {
    console.error(`[ApiAlert] Failed to send TG alert:`, e);
  }

  // Also write to admin_notifications for dashboard visibility
  try {
    await supabase.from('admin_notifications').insert({
      notification_type: 'api_auth_failure',
      title: `${statusEmoji} ${serviceName} API ${statusLabel}`,
      message: `${serviceName} returned ${httpStatus} on ${endpoint}. ${errorBody?.slice(0, 100) || 'Check API key.'}`,
      metadata: { service: serviceName, status: httpStatus, endpoint, function: functionName, error: errorBody?.slice(0, 200) },
    });
  } catch (e) {
    console.error(`[ApiAlert] Failed to write admin notification:`, e);
  }
}
