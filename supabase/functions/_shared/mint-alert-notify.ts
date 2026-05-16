/**
 * Unified mint-alert broadcaster used by both `allstar-mint-auditor` and
 * `family-mint-monitor`.
 *
 * Responsibilities:
 *   1. De-dupe: if any `allstar_mint_alerts` row for this `tokenMint` already
 *      has `tg_broadcasted_at` set within the dedupe window, skip every
 *      external send so the same mint never spams TG/DM twice.
 *   2. Respect the `telegram_broadcast_suspended` kill-switch for the
 *      BlackBox group broadcast (DrRick DM is independent — DrRick still gets
 *      DM'd when the group is suspended).
 *   3. Use the shared `broadcastToBlackBox` helper so each send is logged to
 *      `notification_delivery_log`, rate-limited, and DLQ-retried on failure.
 *   4. Send a direct MTProto DM to DrRick using the chat ID stored in
 *      `system_settings.drrick_dm_chat_id` (falls back to 5549703183).
 *   5. Stamp `tg_broadcasted_at = now()` on every matching mint-alert row.
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { broadcastToBlackBox } from "./telegram-broadcast.ts";

const DRRICK_FALLBACK_CHAT_ID = 5549703183;

export interface MintAlertNotifyParams {
  tokenMint: string;
  blackboxMessage: string;
  drrickMessage: string;
  sourceFunction: string; // e.g. 'allstar-mint-auditor' | 'family-mint-monitor'
}

export interface MintAlertNotifyResult {
  skipped: boolean;
  reason?: string;
  blackboxSent: number;
  drrickSent: boolean;
}

async function readSetting<T = unknown>(
  supabase: SupabaseClient,
  key: string,
): Promise<T | null> {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    return (data?.value ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function sendMintAlert(
  supabase: SupabaseClient,
  params: MintAlertNotifyParams,
): Promise<MintAlertNotifyResult> {
  const { tokenMint, blackboxMessage, drrickMessage, sourceFunction } = params;

  // ─── 1. De-dupe by tokenMint within window ───
  const windowHours = Number(await readSetting<number>(supabase, "mint_alert_dedupe_window_hours")) || 24;
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  try {
    const { data: prior } = await supabase
      .from("allstar_mint_alerts")
      .select("id, tg_broadcasted_at")
      .eq("token_mint", tokenMint)
      .not("tg_broadcasted_at", "is", null)
      .gte("tg_broadcasted_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (prior?.tg_broadcasted_at) {
      console.log(`[mint-alert-notify] DEDUPE ${tokenMint.slice(0, 8)} — already broadcast at ${prior.tg_broadcasted_at} (source=${sourceFunction})`);
      return { skipped: true, reason: "already_broadcast", blackboxSent: 0, drrickSent: false };
    }
  } catch (e) {
    console.warn("[mint-alert-notify] dedupe lookup failed (proceeding):", e);
  }

  // ─── 2. BlackBox group (suspendable) ───
  let blackboxSent = 0;
  const suspended = (await readSetting<boolean>(supabase, "telegram_broadcast_suspended")) === true;
  if (suspended) {
    console.log(`[mint-alert-notify] BlackBox suspended, skipping group broadcast (source=${sourceFunction})`);
  } else {
    try {
      const results = await broadcastToBlackBox(supabase, blackboxMessage);
      blackboxSent = results.filter((r) => r.success).length;
      console.log(`[mint-alert-notify] ✓ BlackBox sent (${blackboxSent}/${results.length}) source=${sourceFunction}`);
    } catch (e) {
      console.warn("[mint-alert-notify] BlackBox broadcast failed:", e);
    }
  }

  // ─── 3. DrRick DM (independent of suspension) ───
  let drrickSent = false;
  const rawChatId = await readSetting<number | string>(supabase, "drrick_dm_chat_id");
  const drrickChatId = rawChatId !== null && rawChatId !== undefined && rawChatId !== ""
    ? Number(rawChatId)
    : DRRICK_FALLBACK_CHAT_ID;

  if (Number.isFinite(drrickChatId) && drrickChatId !== 0) {
    try {
      const { data, error } = await supabase.functions.invoke("telegram-mtproto-auth", {
        body: { action: "send_message", chatId: drrickChatId, message: drrickMessage },
      });
      if (error || !data?.success) {
        console.warn(`[mint-alert-notify] DrRick DM failed (chatId=${drrickChatId}):`, error?.message || data?.error);
      } else {
        drrickSent = true;
        console.log(`[mint-alert-notify] ✓ DrRick DM sent (chatId=${drrickChatId}) source=${sourceFunction}`);
      }
    } catch (e) {
      console.warn(`[mint-alert-notify] DrRick DM threw (chatId=${drrickChatId}):`, e);
    }
  } else {
    console.log("[mint-alert-notify] DrRick chat ID not configured, skipping DM");
  }

  // ─── 4. Stamp tg_broadcasted_at on every matching row ───
  if (blackboxSent > 0 || drrickSent) {
    try {
      await supabase
        .from("allstar_mint_alerts")
        .update({ tg_broadcasted_at: new Date().toISOString() })
        .eq("token_mint", tokenMint)
        .is("tg_broadcasted_at", null);
    } catch (e) {
      console.warn("[mint-alert-notify] failed to stamp tg_broadcasted_at:", e);
    }
  }

  return { skipped: false, blackboxSent, drrickSent };
}