import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Phanes X Query — sends /x <handle> to the Phanes bot in a Telegram group,
 * waits for the reply, parses recycled account + username history data,
 * and merges results into x_account_registry.
 *
 * Modes:
 *  - single: query a specific handle
 *  - backfill: pick the next un-queried handle from x_account_registry (1/min via cron)
 */

// How long to wait for Phanes to reply (ms)
const PHANES_REPLY_WAIT_MS = 8000;
// How many recent messages to fetch when looking for the reply
const REPLY_FETCH_LIMIT = 10;

/**
 * Parse Phanes bot reply for /x command.
 * Expected format (from screenshot):
 * - "Recycled Accounts:" section with same User ID entries
 * - "Username History:" section with past usernames
 * - Associated contract addresses
 */
function parsePhanesReply(text: string): {
  recycledAccounts: Array<{ handle: string; userId?: string; contractAddress?: string }>;
  usernameHistory: Array<{ username: string; date?: string }>;
  isRecycled: boolean;
  rawText: string;
} {
  const result = {
    recycledAccounts: [] as Array<{ handle: string; userId?: string; contractAddress?: string }>,
    usernameHistory: [] as Array<{ username: string; date?: string }>,
    isRecycled: false,
    rawText: text,
  };

  if (!text) return result;

  // Detect recycled accounts section
  // Phanes typically shows accounts sharing the same User ID
  const recycledMatch = text.match(/recycled\s*accounts?[:\s]*([\s\S]*?)(?=username\s*history|$)/i);
  if (recycledMatch) {
    const section = recycledMatch[1];
    // Look for handle patterns like @username or username entries
    const handleMatches = section.matchAll(/@?([a-zA-Z0-9_]{1,15})(?:\s*[—–-]\s*(?:User\s*ID[:\s]*(\d+))?)?/gi);
    for (const m of handleMatches) {
      const handle = m[1].toLowerCase();
      if (handle && handle.length > 0) {
        result.recycledAccounts.push({
          handle,
          userId: m[2] || undefined,
        });
      }
    }
    if (result.recycledAccounts.length > 0) {
      result.isRecycled = true;
    }
  }

  // Detect contract addresses (Solana-style base58, 32-44 chars)
  const contractMatches = text.matchAll(/([1-9A-HJ-NP-Za-km-z]{32,44})/g);
  const contracts = [...contractMatches].map(m => m[1]);
  
  // Associate contracts with recycled accounts if found near them
  if (contracts.length > 0 && result.recycledAccounts.length > 0) {
    // Simple heuristic: assign contracts to accounts in order
    contracts.forEach((ca, i) => {
      if (i < result.recycledAccounts.length) {
        result.recycledAccounts[i].contractAddress = ca;
      }
    });
  }

  // Detect username history section
  const historyMatch = text.match(/username\s*history[:\s]*([\s\S]*?)(?=\n\n|$)/i);
  if (historyMatch) {
    const section = historyMatch[1];
    const usernameMatches = section.matchAll(/@?([a-zA-Z0-9_]{1,15})(?:\s*[—–-]\s*(.+?))?(?:\n|$)/gi);
    for (const m of usernameMatches) {
      result.usernameHistory.push({
        username: m[1].toLowerCase(),
        date: m[2]?.trim() || undefined,
      });
    }
  }

  // Fallback: if no structured sections found, try to detect any mention of "recycled" or "reused"
  if (!result.isRecycled && /recycl|reus|same\s*user\s*id/i.test(text)) {
    result.isRecycled = true;
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'single', handle, chatId: overrideChatId } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the BlackBox channel chat ID from telegram_message_targets
    let targetChatId = overrideChatId;
    if (!targetChatId) {
      const { data: target } = await supabase
        .from('telegram_message_targets')
        .select('chat_id')
        .eq('label', 'BLACKBOX')
        .limit(1)
        .maybeSingle();
      
      if (!target?.chat_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No BLACKBOX Telegram target configured. Add one to telegram_message_targets.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetChatId = Number(target.chat_id);
    }

    // ─── BACKFILL MODE ───
    if (action === 'backfill') {
      // Pick the next handle that hasn't been queried via Phanes
      const { data: nextHandle } = await supabase
        .from('x_account_registry')
        .select('x_user_id, current_handle')
        .is('phanes_queried_at', null)
        .order('first_seen_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!nextHandle?.current_handle) {
        return new Response(JSON.stringify({
          success: true,
          message: 'Backfill complete — no more un-queried handles.',
          remaining: 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Count remaining
      const { count } = await supabase
        .from('x_account_registry')
        .select('x_user_id', { count: 'exact', head: true })
        .is('phanes_queried_at', null);

      console.log(`[phanes-x-query] Backfill: querying @${nextHandle.current_handle} (${count} remaining)`);

      // Query Phanes for this handle
      const result = await queryPhanes(supabase, nextHandle.current_handle, targetChatId);

      return new Response(JSON.stringify({
        success: true,
        handle: nextHandle.current_handle,
        remaining: (count || 1) - 1,
        result,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── SINGLE QUERY MODE ───
    if (!handle) {
      return new Response(JSON.stringify({
        success: false,
        error: 'handle is required for single query mode',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanHandle = handle.replace(/^@/, '').toLowerCase();
    console.log(`[phanes-x-query] Single query for @${cleanHandle}`);

    const result = await queryPhanes(supabase, cleanHandle, targetChatId);

    return new Response(JSON.stringify({
      success: true,
      handle: cleanHandle,
      result,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[phanes-x-query] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Send /x <handle> to the Phanes bot via MTProto, wait for reply, parse & store.
 */
async function queryPhanes(
  supabase: ReturnType<typeof createClient>,
  handle: string,
  chatId: number,
): Promise<{
  sent: boolean;
  replyFound: boolean;
  parsed: ReturnType<typeof parsePhanesReply> | null;
  error?: string;
}> {
  const now = new Date().toISOString();

  try {
    // 1. Send /x <handle> command via MTProto
    console.log(`[phanes-x-query] Sending /x ${handle} to chat ${chatId}`);
    
    const { data: sendResult, error: sendError } = await supabase.functions.invoke('telegram-mtproto-auth', {
      body: {
        action: 'send_message',
        chatId: chatId,
        message: `/x ${handle}`,
      },
    });

    if (sendError || !sendResult?.success) {
      const errMsg = sendError?.message || sendResult?.error || 'Failed to send message';
      console.error(`[phanes-x-query] Send failed:`, errMsg);
      
      // Mark as queried even on failure to avoid retry loops
      await supabase
        .from('x_account_registry')
        .update({ phanes_queried_at: now })
        .eq('current_handle', handle);

      return { sent: false, replyFound: false, parsed: null, error: errMsg };
    }

    const sentMessageId = sendResult.messageId;
    console.log(`[phanes-x-query] Command sent (msgId: ${sentMessageId}), waiting ${PHANES_REPLY_WAIT_MS}ms for reply...`);

    // 2. Wait for Phanes to process and reply
    await new Promise(resolve => setTimeout(resolve, PHANES_REPLY_WAIT_MS));

    // 3. Fetch recent messages to find the reply
    const { data: fetchResult, error: fetchError } = await supabase.functions.invoke('telegram-mtproto-auth', {
      body: {
        action: 'fetch_recent_messages',
        channelUsername: String(chatId),
        limit: REPLY_FETCH_LIMIT,
      },
    });

    if (fetchError || !fetchResult?.success) {
      console.error(`[phanes-x-query] Fetch failed:`, fetchError?.message || fetchResult?.error);
      
      await supabase
        .from('x_account_registry')
        .update({ phanes_queried_at: now })
        .eq('current_handle', handle);

      return { sent: true, replyFound: false, parsed: null, error: 'Failed to fetch reply messages' };
    }

    // 4. Find the Phanes bot reply (message after ours that's not from us)
    const messages = fetchResult.messages || [];
    
    // Look for a bot reply that mentions the handle or contains recycled/username history data
    // The reply should be a message with ID > sentMessageId from a bot account
    const phanesReply = messages.find((m: any) => {
      const msgId = parseInt(m.messageId, 10);
      // Must be after our sent message
      if (msgId <= sentMessageId) return false;
      // Should mention the handle or contain known Phanes response patterns
      const text = (m.text || '').toLowerCase();
      return (
        text.includes(handle.toLowerCase()) ||
        text.includes('recycled') ||
        text.includes('username history') ||
        text.includes('user id') ||
        text.includes('no data') ||
        text.includes('not found') ||
        // Phanes bot name detection
        (m.callerDisplayName || '').toLowerCase().includes('phanes') ||
        (m.callerUsername || '').toLowerCase().includes('phanes')
      );
    });

    if (!phanesReply) {
      console.log(`[phanes-x-query] No Phanes reply found in ${messages.length} messages`);
      
      await supabase
        .from('x_account_registry')
        .update({ phanes_queried_at: now })
        .eq('current_handle', handle);

      return { sent: true, replyFound: false, parsed: null, error: 'Phanes bot did not reply in time' };
    }

    console.log(`[phanes-x-query] Found Phanes reply (${phanesReply.text.length} chars)`);

    // 5. Parse the reply
    const parsed = parsePhanesReply(phanesReply.text);
    console.log(`[phanes-x-query] Parsed: recycled=${parsed.isRecycled}, accounts=${parsed.recycledAccounts.length}, history=${parsed.usernameHistory.length}`);

    // 6. Store results in x_account_registry
    const updateData: Record<string, any> = {
      phanes_queried_at: now,
      phanes_data: {
        queried_at: now,
        raw_reply: phanesReply.text,
        reply_from: phanesReply.callerUsername || phanesReply.callerDisplayName || 'unknown',
        is_recycled: parsed.isRecycled,
      },
    };

    if (parsed.recycledAccounts.length > 0) {
      updateData.phanes_recycled_accounts = parsed.recycledAccounts;
    }
    if (parsed.usernameHistory.length > 0) {
      updateData.phanes_username_history = parsed.usernameHistory;
      
      // Also merge into our own handle_history if we have entries we don't already track
      const { data: existing } = await supabase
        .from('x_account_registry')
        .select('handle_history')
        .eq('current_handle', handle)
        .maybeSingle();

      if (existing) {
        const ourHistory = existing.handle_history || [];
        const ourHandles = new Set(ourHistory.map((h: any) => h.handle?.toLowerCase()));
        
        const newEntries = parsed.usernameHistory
          .filter(ph => !ourHandles.has(ph.username.toLowerCase()) && ph.username.toLowerCase() !== handle)
          .map(ph => ({
            handle: ph.username,
            first_seen: ph.date || now,
            last_seen: ph.date || now,
            source: 'phanes_backfill',
          }));

        if (newEntries.length > 0) {
          updateData.handle_history = [...ourHistory, ...newEntries];
          console.log(`[phanes-x-query] Merged ${newEntries.length} new handle history entries from Phanes`);
        }
      }
    }

    await supabase
      .from('x_account_registry')
      .update(updateData)
      .eq('current_handle', handle);

    return { sent: true, replyFound: true, parsed };

  } catch (err: any) {
    console.error(`[phanes-x-query] Error querying @${handle}:`, err);
    
    // Mark as queried to avoid infinite retries
    await supabase
      .from('x_account_registry')
      .update({ phanes_queried_at: now })
      .eq('current_handle', handle);

    return { sent: false, replyFound: false, parsed: null, error: err?.message || String(err) };
  }
}
