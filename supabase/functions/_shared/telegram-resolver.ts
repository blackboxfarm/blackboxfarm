import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Resolves a Telegram username (e.g., "guanocoin") to its immutable numeric channel ID
 * using the Bot API `getChat`. Caches results in `telegram_channel_registry`.
 * 
 * Returns { channelId, title, username } on success, or null if resolution fails.
 */

export interface TelegramResolution {
  channelId: string;    // e.g. "-1001234567890"
  title: string;        // Current group/channel title
  username: string;     // The username we resolved from
  isRecycled: boolean;  // True if linked_token_count > 1
  linkedTokenCount: number;
}

export async function resolveTelegramUsername(
  username: string,
  supabase: ReturnType<typeof createClient>,
): Promise<TelegramResolution | null> {
  if (!username) return null;
  const cleanUsername = username.replace(/^@/, '').toLowerCase();

  // 1. Check cache first — look up by current_username
  const { data: cached } = await supabase
    .from('telegram_channel_registry')
    .select('channel_id, current_title, current_username, linked_token_count')
    .eq('current_username', cleanUsername)
    .maybeSingle();

  if (cached) {
    return {
      channelId: cached.channel_id,
      title: cached.current_title || cleanUsername,
      username: cleanUsername,
      isRecycled: (cached.linked_token_count || 0) > 1,
      linkedTokenCount: cached.linked_token_count || 0,
    };
  }

  // 2. Call Bot API getChat
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    console.warn('[telegram-resolver] No TELEGRAM_BOT_TOKEN set, falling back to username-only');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=@${cleanUsername}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[telegram-resolver] getChat failed for @${cleanUsername}: ${res.status} ${errBody}`);
      return null;
    }

    const data = await res.json();
    if (!data.ok || !data.result?.id) return null;

    const chat = data.result;
    const channelId = String(chat.id);
    const title = chat.title || cleanUsername;
    const resolvedUsername = chat.username?.toLowerCase() || cleanUsername;
    const now = new Date().toISOString();

    // 3. Check if this channel_id already exists (recycled group detection!)
    const { data: existing } = await supabase
      .from('telegram_channel_registry')
      .select('channel_id, current_username, current_title, username_history, title_history, linked_token_count')
      .eq('channel_id', channelId)
      .maybeSingle();

    if (existing) {
      // Channel exists — update username/title if changed
      const updates: any = { last_seen_at: now };
      const usernameHistory = existing.username_history || [];
      const titleHistory = existing.title_history || [];

      if (existing.current_username !== resolvedUsername) {
        // Username changed — record history
        if (existing.current_username) {
          usernameHistory.push({
            username: existing.current_username,
            first_seen: existing.last_seen_at || now,
            last_seen: now,
          });
        }
        updates.current_username = resolvedUsername;
        updates.username_history = usernameHistory;
      }

      if (existing.current_title !== title) {
        if (existing.current_title) {
          titleHistory.push({
            title: existing.current_title,
            first_seen: existing.last_seen_at || now,
            last_seen: now,
          });
        }
        updates.current_title = title;
        updates.title_history = titleHistory;
      }

      if (Object.keys(updates).length > 1) {
        await supabase.from('telegram_channel_registry').update(updates).eq('channel_id', channelId);
      }

      return {
        channelId,
        title: title,
        username: resolvedUsername,
        isRecycled: (existing.linked_token_count || 0) > 1,
        linkedTokenCount: existing.linked_token_count || 0,
      };
    }

    // 4. New channel — insert
    await supabase.from('telegram_channel_registry').insert({
      channel_id: channelId,
      current_username: resolvedUsername,
      current_title: title,
      username_history: [],
      title_history: [],
      linked_token_count: 0,
      first_seen_at: now,
      last_seen_at: now,
    });

    return {
      channelId,
      title,
      username: resolvedUsername,
      isRecycled: false,
      linkedTokenCount: 0,
    };

  } catch (err) {
    console.warn(`[telegram-resolver] Error resolving @${cleanUsername}:`, err);
    return null;
  }
}

/**
 * Increment the linked_token_count for a channel. Call after linking a new token.
 */
export async function incrementChannelTokenCount(
  channelId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { data } = await supabase
    .from('telegram_channel_registry')
    .select('linked_token_count')
    .eq('channel_id', channelId)
    .maybeSingle();

  if (data) {
    await supabase
      .from('telegram_channel_registry')
      .update({ linked_token_count: (data.linked_token_count || 0) + 1 })
      .eq('channel_id', channelId);
  }
}
