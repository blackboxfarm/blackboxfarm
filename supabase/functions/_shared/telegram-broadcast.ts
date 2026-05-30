/**
 * Shared Telegram broadcast utility
 * Fetches targets from database and broadcasts to all matching groups
 * Logs delivery to notification_delivery_log and enqueues DLQ on failure
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertInsert, assertUpdate } from "./db-assert.ts";

const MUTED_TARGET_LABELS = new Set(["BLACKBOX"]);

export interface TelegramTarget {
  id: string;
  chat_id: string;
  label: string;
  resolved_name: string | null;
}

export interface BroadcastResult {
  target: TelegramTarget;
  success: boolean;
  error?: string;
}

/**
 * Fetches Telegram targets from the database
 */
export async function getTelegramTargets(
  supabase: SupabaseClient,
  labels?: string[]
): Promise<TelegramTarget[]> {
  let query = supabase
    .from("telegram_message_targets")
    .select("id, chat_id, label, resolved_name");

  if (labels && labels.length > 0) {
    query = query.in("label", labels);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[telegram-broadcast] Failed to fetch targets:", error);
    return [];
  }

  return data || [];
}

/**
 * Sends a message to a single Telegram target via MTProto
 */
async function sendToTarget(
  supabase: SupabaseClient,
  target: TelegramTarget,
  message: string
): Promise<BroadcastResult> {
  const chatId = Number(target.chat_id);

  try {
    const { data, error } = await supabase.functions.invoke("telegram-mtproto-auth", {
      body: {
        action: "send_message",
        chatId: chatId,
        message: message,
      },
    });

    if (error) {
      return { target, success: false, error: error.message };
    }

    if (!data?.success) {
      return { target, success: false, error: data?.error || "Unknown error" };
    }

    await assertUpdate(
      supabase
        .from("telegram_message_targets")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", target.id),
      "telegram_message_targets",
    );

    return { target, success: true };
  } catch (e) {
    return { target, success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Log delivery result to notification_delivery_log
 */
async function logDelivery(
  supabase: SupabaseClient,
  target: TelegramTarget,
  result: BroadcastResult,
  messagePreview: string,
  sourceFunction?: string
): Promise<void> {
  try {
    await assertInsert(
      supabase.from('notification_delivery_log').insert({
        channel: 'telegram',
        recipient: target.label,
        status: result.success ? 'delivered' : 'failed',
        error_message: result.error?.slice(0, 500) || null,
        delivered_at: result.success ? new Date().toISOString() : null,
        response_body: JSON.stringify({
          target_id: target.id,
          target_label: target.label,
          chat_id: target.chat_id,
          resolved_name: target.resolved_name,
          source_function: sourceFunction || null,
          message_preview: messagePreview.slice(0, 200),
        }).slice(0, 5000),
      }),
      'notification_delivery_log',
    );
  } catch (e) {
    console.warn('[telegram-broadcast] Failed to log delivery:', e);
  }
}

// Default delay between messages to avoid rate limiting (in milliseconds)
const DEFAULT_MESSAGE_DELAY_MS = 5000;

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Broadcasts a message to multiple Telegram targets with rate limiting
 * Logs each delivery to notification_delivery_log
 * Enqueues failed sends to the dead letter queue for retry
 */
export async function broadcastToTelegram(
  supabase: SupabaseClient,
  message: string,
  labels?: string[],
  delayMs: number = DEFAULT_MESSAGE_DELAY_MS,
  sourceFunction?: string
): Promise<BroadcastResult[]> {
  // Initial delay to prevent rapid-fire spam when called in loops
  console.log(`[telegram-broadcast] Initial 2s cooldown before sending...`);
  await sleep(2000);

  const targets = await getTelegramTargets(supabase, labels);

  if (targets.length === 0) {
    console.log("[telegram-broadcast] No targets found for labels:", labels);
    return [];
  }

  console.log(`[telegram-broadcast] Broadcasting to ${targets.length} target(s) with ${delayMs}ms delay:`, 
    targets.map(t => t.label).join(", "));

  const results: BroadcastResult[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    
    // Add delay between messages (skip delay for first message)
    if (i > 0 && delayMs > 0) {
      console.log(`[telegram-broadcast] Rate limit delay: ${delayMs}ms...`);
      await sleep(delayMs);
    }
    
    console.log(`[telegram-broadcast] Sending to ${target.label} (${target.chat_id})...`);
    const result = await sendToTarget(supabase, target, message);
    results.push(result);

    // Log delivery result
    await logDelivery(supabase, target, result, message, sourceFunction);

    if (result.success) {
      console.log(`[telegram-broadcast] ✓ Sent to ${target.label}`);
    } else {
      console.error(`[telegram-broadcast] ✗ Failed ${target.label}: ${result.error}`);
      
      // Enqueue to DLQ for retry
      try {
        const { enqueueDeadLetter } = await import("./dead-letter.ts");
        await enqueueDeadLetter({
          sourceFunction: sourceFunction || 'telegram-broadcast',
          operation: 'tg_send',
          payload: {
            target_id: target.id,
            target_label: target.label,
            chat_id: target.chat_id,
            message: message.slice(0, 2000),
            labels: labels || [],
          },
          errorMessage: result.error || 'Unknown send failure',
          maxRetries: 3,
          retryDelayMinutes: 5,
        });
      } catch (dlqErr) {
        console.warn('[telegram-broadcast] Failed to enqueue DLQ:', dlqErr);
      }
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`[telegram-broadcast] Complete: ${successCount}/${results.length} succeeded`);

  return results;
}

/**
 * Convenience function to broadcast to BlackBox group only
 */
export async function broadcastToBlackBox(
  supabase: SupabaseClient,
  message: string
): Promise<BroadcastResult[]> {
  return broadcastToTelegram(supabase, message, ["BLACKBOX"]);
}
