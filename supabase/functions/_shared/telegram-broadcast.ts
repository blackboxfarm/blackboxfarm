/**
 * Shared Telegram broadcast utility
 * Fetches targets from database and broadcasts to all matching groups
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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
 * @param supabase - Supabase client with service role
 * @param labels - Optional array of labels to filter (e.g., ["BLACKBOX"]). If empty, fetches all.
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

    // Update last_used_at
    await supabase
      .from("telegram_message_targets")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", target.id);

    return { target, success: true };
  } catch (e) {
    return { target, success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Broadcasts a message to multiple Telegram targets
 * @param supabase - Supabase client with service role
 * @param message - The message to send (supports Markdown)
 * @param labels - Optional array of labels to filter targets. If empty, sends to all targets.
 * @returns Array of results for each target
 */
// Default delay between messages to avoid rate limiting (in milliseconds)
const DEFAULT_MESSAGE_DELAY_MS = 3000;

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Broadcasts a message to multiple Telegram targets with rate limiting
 * @param supabase - Supabase client with service role
 * @param message - The message to send (supports Markdown)
 * @param labels - Optional array of labels to filter targets. If empty, sends to all targets.
 * @param delayMs - Delay between messages in milliseconds (default: 2000ms)
 * @returns Array of results for each target
 */
export async function broadcastToTelegram(
  supabase: SupabaseClient,
  message: string,
  labels?: string[],
  delayMs: number = DEFAULT_MESSAGE_DELAY_MS
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

    if (result.success) {
      console.log(`[telegram-broadcast] ✓ Sent to ${target.label}`);
    } else {
      console.error(`[telegram-broadcast] ✗ Failed ${target.label}: ${result.error}`);
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
