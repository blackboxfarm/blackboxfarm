import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TelegramClient, MemoryStorage } from "@mtcute/deno";
import { convertFromTelethonSession } from "@mtcute/convert";
import { md } from "npm:@mtcute/markdown-parser";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

async function fetchRecentMessagesViaMTProto(opts: {
  sessionString: string;
  apiId: number;
  apiHash: string;
  channelUsername: string;
  limit: number;
}) {
  const { sessionString, apiId, apiHash, channelUsername, limit } = opts;

  // Determine if it's a numeric chat ID or username
  const isNumericId = /^-?\d+$/.test(channelUsername);
  const peer: string | number = isNumericId ? parseInt(channelUsername, 10) : channelUsername;
  const peerDisplay = isNumericId ? `chat ID ${peer}` : `@${channelUsername}`;

  console.log(`[telegram-mtproto-auth] Creating MTProto client for ${peerDisplay}, sessionLen=${sessionString.length}`);

  // Convert Telethon session to mtcute format
  const mtcuteSession = convertFromTelethonSession(sessionString);

  const client = new TelegramClient({
    apiId,
    apiHash,
    storage: new MemoryStorage(),
  });

  try {
    // Import the converted session
    await client.importSession(mtcuteSession);
    await client.connect();

    console.log(`[telegram-mtproto-auth] Connected, fetching history for ${peerDisplay}`);

    // Fetch message history - use numeric ID for private groups, username for public
    const messages = await client.getHistory(peer, { limit });

    const URL_RE = /https?:\/\/[^\s)>\]]+/gi;

    const mapped = messages.map((m: any) => {
      const text = m.text || '';
      const sender = m.sender;
      const callerUsername = sender?.username;
      const callerDisplayName = sender?.displayName || sender?.firstName
        ? `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim()
        : undefined;

      // --- Normalize message entities (hidden hyperlinks, mentions, etc.) ---
      // mtcute exposes each entity with a `type` string and optional fields
      // like `url` (MessageEntityTextUrl) and `userId` (MessageEntityMentionName).
      const rawEntities: any[] = Array.isArray(m.entities) ? m.entities : [];
      const entities = rawEntities.map((e: any) => ({
        type: e.type || e._ || null,
        offset: typeof e.offset === 'number' ? e.offset : null,
        length: typeof e.length === 'number' ? e.length : null,
        url: e.url || null,
        user_id: e.userId ? String(e.userId) : (e.user_id ? String(e.user_id) : null),
        language: e.language || null,
      }));

      // --- Normalize link-preview card (DexScreener / X / etc.) ---
      const wp = m.webPreview || m.web_preview || null;
      const webPreview = wp ? {
        url: wp.url || wp.displayUrl || null,
        display_url: wp.displayUrl || wp.display_url || null,
        site_name: wp.siteName || wp.site_name || null,
        title: wp.title || null,
        description: wp.description || null,
        type: wp.type || null,
      } : null;

      // --- Flat de-duped list of every URL in the message ---
      const urlSet = new Set<string>();
      for (const e of entities) if (e.url) urlSet.add(e.url);
      if (webPreview?.url) urlSet.add(webPreview.url);
      // Plain-text URL fallback for bots that inline href instead of entity-linking
      const textMatches = text.match(URL_RE) || [];
      for (const u of textMatches) urlSet.add(u);
      // Also extract URLs sitting inside entity slices (MessageEntityUrl carries
      // no `url` field — the URL is the substring itself)
      for (const e of entities) {
        if (e.type && /Url$/i.test(String(e.type)) && !e.url &&
            typeof e.offset === 'number' && typeof e.length === 'number') {
          const slice = text.substring(e.offset, e.offset + e.length);
          if (/^https?:\/\//i.test(slice)) urlSet.add(slice);
        }
      }
      const linkUrls = Array.from(urlSet);

      return {
        messageId: String(m.id),
        text,
        date: m.date ? new Date(m.date * 1000).toISOString() : new Date().toISOString(),
        callerUsername,
        callerDisplayName,
        entities,
        webPreview,
        linkUrls,
      };
    }).filter((m: any) => m.text || (m.linkUrls && m.linkUrls.length));

    console.log(`[telegram-mtproto-auth] Fetched ${mapped.length} messages from ${peerDisplay}`);

    return { success: true, messages: mapped };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
}

serve(withRunLog('telegram-mtproto-auth', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action, code, channelUsername, chatId, limit } = body;

    // Gracefully handle empty/missing action (e.g. cron health pings)
    if (!action) {
      return new Response(JSON.stringify({
        ok: true,
        message: 'telegram-mtproto-auth is alive. Provide an "action" to use.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiIdRaw = Deno.env.get('TELEGRAM_API_ID');
    const apiHash = Deno.env.get('TELEGRAM_API_HASH');
    const phoneNumber = Deno.env.get('TELEGRAM_PHONE_NUMBER');
    const sessionStringFromEnv = Deno.env.get('TELEGRAM_SESSION_STRING');

    if (!apiIdRaw || !apiHash) {
      throw new Error('Telegram API credentials not configured. Need TELEGRAM_API_ID and TELEGRAM_API_HASH');
    }

    const apiId = Number(apiIdRaw);
    if (!Number.isFinite(apiId)) {
      throw new Error('Invalid TELEGRAM_API_ID');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Prefer session from environment variable (secrets), fall back to database
    let existingSession: { id?: string; session_string?: string; phone_number?: string; last_used_at?: string } | null = null;
    
    if (sessionStringFromEnv) {
      console.log('[telegram-mtproto-auth] Using session string from TELEGRAM_SESSION_STRING secret');
      existingSession = {
        session_string: sessionStringFromEnv,
        phone_number: phoneNumber,
      };
    } else {
      const { data: dbSession } = await supabase
        .from('telegram_mtproto_session')
        .select('*')
        .eq('is_active', true)
        .single();
      existingSession = dbSession;
    }

    if (action === 'status') {
      return new Response(JSON.stringify({
        hasSession: !!existingSession,
        phoneNumber: existingSession?.phone_number || phoneNumber,
        lastUsed: existingSession?.last_used_at,
        sessionFormat: 'telethon',
        message: existingSession
          ? 'MTProto session active (Telethon format). Groups will use MTProto.'
          : 'No active MTProto session. Groups will fall back to Bot API.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'fetch_recent_messages') {
      // Accept either channelUsername or chatId (numeric ID for private groups)
      const resolvedPeer = channelUsername || (chatId ? String(chatId) : null);
      if (!resolvedPeer) {
        throw new Error('channelUsername or chatId required');
      }
      if (!existingSession?.session_string) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No active MTProto session saved'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // For numeric chat IDs, pass as-is; for usernames, normalize
      const isNumeric = /^-?\d+$/.test(resolvedPeer);
      const peerValue = isNumeric ? resolvedPeer : normalizeUsername(resolvedPeer);
      const msgLimit = Math.max(1, Math.min(200, Number(limit) || 50));

      console.log(`[telegram-mtproto-auth] fetch_recent_messages ${isNumeric ? 'chatId' : '@'}${peerValue} limit=${msgLimit}`);

      const res = await fetchRecentMessagesViaMTProto({
        sessionString: existingSession.session_string,
        apiId,
        apiHash,
        channelUsername: peerValue,
        limit: msgLimit,
      });

      await supabase
        .from('telegram_mtproto_session')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', existingSession.id);

      return new Response(JSON.stringify({
        success: true,
        channelUsername: peerValue,
        messageCount: res.messages.length,
        messages: res.messages,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'test_group_access') {
      if (!channelUsername) {
        throw new Error('Channel username required');
      }

      const username = normalizeUsername(channelUsername);

      // MTProto-first if we have a session
      if (existingSession?.session_string) {
        try {
          console.log(`[telegram-mtproto-auth] test_group_access MTProto @${username}`);

          const res = await fetchRecentMessagesViaMTProto({
            sessionString: existingSession.session_string,
            apiId,
            apiHash,
            channelUsername: username,
            limit: 10,
          });

          await supabase
            .from('telegram_mtproto_session')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', existingSession.id);

          return new Response(JSON.stringify({
            success: true,
            channelUsername: username,
            accessMethod: 'mtproto',
            messageCount: res.messages.length,
            message: `MTProto OK! Fetched ${res.messages.length} messages.`
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e: any) {
          console.error('[telegram-mtproto-auth] MTProto test failed:', e?.message || e);
          return new Response(JSON.stringify({
            success: false,
            channelUsername: username,
            accessMethod: 'mtproto_error',
            messageCount: 0,
            message: `MTProto failed: ${e?.message || 'unknown error'}`
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // No session: fall back to web scrape test
      const testUrls = [
        `https://t.me/s/${username}`,
        `https://t.me/${username}`,
      ];

      let accessMethod: string | null = null;
      let messageCount = 0;

      for (const url of testUrls) {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml',
            }
          });

          if (response.ok) {
            const html = await response.text();

            const isGroup = html.includes('tgme_page_extra') && html.includes('members');
            const isChannel = html.includes('tgme_channel_info') || html.includes('tgme_widget_message');

            const messageMatches = html.match(/tgme_widget_message_wrap/g);
            messageCount = messageMatches?.length || 0;

            if (messageCount > 0) {
              accessMethod = 'web_scraping';
              break;
            } else if (isGroup) {
              accessMethod = 'group_detected_no_public_messages';
            } else if (isChannel) {
              accessMethod = 'channel_detected_no_messages';
            }
          }
        } catch (e) {
          console.error(`[telegram-mtproto-auth] Error testing ${url}:`, e);
        }
      }

      return new Response(JSON.stringify({
        success: accessMethod === 'web_scraping',
        channelUsername: username,
        accessMethod,
        messageCount,
        message: accessMethod === 'web_scraping'
          ? `Found ${messageCount} messages via web scraping`
          : 'No MTProto session saved, and web view has no messages. Save an MTProto session first.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'save_session') {
      const session = code || body.sessionString;

      if (!session || typeof session !== 'string' || session.trim().length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Session string is required. Provide it as "code" or "sessionString".'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const cleanedSession = session.replace(/\s+/g, '');

      // Validate it's a Telethon session by trying to convert
      try {
        convertFromTelethonSession(cleanedSession);
      } catch (e: any) {
        return new Response(JSON.stringify({
          success: false,
          error: `Invalid Telethon session string: ${e?.message || 'unknown error'}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await supabase
        .from('telegram_mtproto_session')
        .update({ is_active: false })
        .eq('is_active', true);

      const { error: insertError } = await supabase
        .from('telegram_mtproto_session')
        .insert({
          session_string: cleanedSession,
          phone_number: phoneNumber,
          is_active: true,
          last_used_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('[telegram-mtproto-auth] Error inserting session:', insertError);
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to save session: ${insertError.message}`
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Session saved successfully (Telethon format)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'send_message') {
      const { chatUsername, chatId, message, parseMode } = body;
      
      // Support both username (public groups) and chatId (private groups)
      const targetChat = chatId || chatUsername;

      if (!targetChat || !message) {
        return new Response(JSON.stringify({
          success: false,
          error: 'chatUsername or chatId, and message are required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!existingSession?.session_string) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No active MTProto session. Save a session first using action: save_session'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Determine if it's a numeric chat ID or username
      let peer: string | number;
      let peerDisplay: string;
      
      if (chatId || /^-?\d+$/.test(String(targetChat))) {
        // It's a numeric chat ID (private groups use negative IDs like -1001234567890)
        peer = parseInt(String(targetChat), 10);
        peerDisplay = `chat ID ${peer}`;
        console.log(`[telegram-mtproto-auth] send_message to ${peerDisplay}: "${message.substring(0, 50)}..."`);
      } else {
        // It's a username
        peer = normalizeUsername(String(targetChat));
        peerDisplay = `@${peer}`;
        console.log(`[telegram-mtproto-auth] send_message to ${peerDisplay}: "${message.substring(0, 50)}..."`);
      }

      const mtcuteSession = convertFromTelethonSession(existingSession.session_string);

      const client = new TelegramClient({
        apiId,
        apiHash,
        storage: new MemoryStorage(),
      });

      try {
        await client.importSession(mtcuteSession);
        await client.connect();

        console.log(`[telegram-mtproto-auth] Connected, sending message to ${peerDisplay}`);

        // If parseMode is 'markdown', parse the message for entities (links, bold, etc.)
        const textInput = (parseMode === 'markdown' || parseMode === 'md') ? md(message) : message;
        const result = await client.sendText(peer, textInput);

        await supabase
          .from('telegram_mtproto_session')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', existingSession.id);

        console.log(`[telegram-mtproto-auth] Message sent successfully, messageId=${result.id}`);

        return new Response(JSON.stringify({
          success: true,
          messageId: result.id,
          chatTarget: peerDisplay,
          message: 'Message sent successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        console.error(`[telegram-mtproto-auth] Failed to send message:`, e?.message || e);
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to send message: ${e?.message || 'unknown error'}`
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } finally {
        try {
          await client.close();
        } catch {
          // ignore close errors
        }
      }
    }

    if (action === 'resolve_chat') {
      const { chatUsername, chatId } = body;
      
      if (!chatUsername && !chatId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'chatUsername or chatId is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!existingSession?.session_string) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No active MTProto session. Save a session first.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mtcuteSession = convertFromTelethonSession(existingSession.session_string);

      const client = new TelegramClient({
        apiId,
        apiHash,
        storage: new MemoryStorage(),
      });

      try {
        await client.importSession(mtcuteSession);
        await client.connect();

        let peer: string | number;
        if (chatId) {
          peer = parseInt(String(chatId), 10);
          console.log(`[telegram-mtproto-auth] resolve_chat by ID: ${peer}`);
        } else {
          peer = normalizeUsername(String(chatUsername));
          console.log(`[telegram-mtproto-auth] resolve_chat by username: @${peer}`);
        }

        // Try to get chat/channel info
        const entity = await client.resolvePeer(peer);
        let chatInfo: any = null;

        if (entity && entity._ !== 'inputPeerEmpty') {
          // Try to get full chat info
          try {
            if ('channelId' in entity) {
              const channelInfo = await client.call({
                _: 'channels.getChannels',
                id: [{ _: 'inputChannel', channelId: entity.channelId, accessHash: (entity as any).accessHash }]
              }) as any;
              if (channelInfo?.chats?.[0]) {
                const ch = channelInfo.chats[0];
                chatInfo = {
                  id: ch.id,
                  title: ch.title,
                  username: ch.username,
                  type: ch._ || 'channel'
                };
              }
            } else if ('chatId' in entity) {
              const chatsInfo = await client.call({
                _: 'messages.getChats',
                id: [entity.chatId]
              }) as any;
              if (chatsInfo?.chats?.[0]) {
                const ch = chatsInfo.chats[0];
                chatInfo = {
                  id: ch.id,
                  title: ch.title,
                  type: ch._ || 'chat'
                };
              }
            } else if ('userId' in entity) {
              const usersInfo = await client.call({
                _: 'users.getUsers',
                id: [{ _: 'inputUser', userId: entity.userId, accessHash: (entity as any).accessHash }]
              }) as any;
              if (usersInfo?.[0]) {
                const u = usersInfo[0];
                chatInfo = {
                  id: u.id,
                  name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username,
                  username: u.username,
                  type: 'user'
                };
              }
            }
          } catch (e: any) {
            console.log(`[telegram-mtproto-auth] Could not get full info, using basic:`, e?.message);
          }
        }

        await supabase
          .from('telegram_mtproto_session')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', existingSession.id);

        return new Response(JSON.stringify({
          success: !!chatInfo,
          chatInfo,
          message: chatInfo ? 'Chat resolved successfully' : 'Could not resolve chat'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        console.error(`[telegram-mtproto-auth] Failed to resolve chat:`, e?.message || e);
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to resolve chat: ${e?.message || 'unknown error'}`
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } finally {
        try {
          await client.close();
        } catch {
          // ignore close errors
        }
      }
    }

    if (action === 'generate_session_instructions') {
      return new Response(JSON.stringify({
        success: true,
        instructions: `
# Generate Telegram Session String (Telethon)

\`\`\`python
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id = ${apiId}
api_hash = '${apiHash}'

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print(client.session.save())
\`\`\`

Copy the printed session string and use **Save Session**.
        `.trim(),
        apiId,
        apiHash: apiHash?.substring(0, 4) + '...',
        phoneNumber
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'audit_channel_members') {
      const { channelUsername: rawChannel, chatId: rawChatId, seededCutoffDate } = body;
      const resolvedPeer = rawChannel || (rawChatId ? String(rawChatId) : null);
      if (!resolvedPeer) {
        throw new Error('channelUsername or chatId required');
      }
      if (!existingSession?.session_string) {
        throw new Error('No active MTProto session');
      }

      // Use date-based cutoff: anyone who joined on or before this date is seeded
      const cutoffDate = seededCutoffDate ? new Date(seededCutoffDate) : new Date('2026-03-25');
      // Set to end of day so the entire cutoff day is included as seeded
      cutoffDate.setUTCHours(23, 59, 59, 999);
      console.log(`[audit] Using seeded cutoff date: ${cutoffDate.toISOString()}`);
      const isNumeric = /^-?\d+$/.test(resolvedPeer);
      const peerValue = isNumeric ? resolvedPeer : normalizeUsername(resolvedPeer);

      // Create audit run
      const { data: auditRun, error: runErr } = await supabase
        .from('telegram_channel_audit_runs')
        .insert({ chat_id: 0, seeded_threshold: 0, status: 'running' })
        .select('id')
        .single();

      if (runErr || !auditRun) {
        throw new Error(`Failed to create audit run: ${runErr?.message}`);
      }

      const batchId = auditRun.id;

      const mtcuteSession = convertFromTelethonSession(existingSession.session_string);
      const client = new TelegramClient({ apiId, apiHash, storage: new MemoryStorage() });

      try {
        await client.importSession(mtcuteSession);
        await client.connect();

        // Resolve channel
        const entity = await client.resolvePeer(isNumeric ? parseInt(peerValue, 10) : peerValue);
        if (!entity || entity._ === 'inputPeerEmpty' || !('channelId' in entity)) {
          throw new Error('Could not resolve channel');
        }

        const channelId = entity.channelId;
        const accessHash = (entity as any).accessHash;

        // Get channel info
        const channelInfo = await client.call({
          _: 'channels.getChannels',
          id: [{ _: 'inputChannel', channelId, accessHash }]
        }) as any;
        const chatTitle = channelInfo?.chats?.[0]?.title || peerValue;
        const chatIdNum = channelInfo?.chats?.[0]?.id || 0;

        // Fetch ALL participants using channelParticipantsSearch (empty query returns all)
        // channelParticipantsRecent only returns ~200, so we use search instead
        const allParticipants: any[] = [];
        const seenUserIds = new Set();
        let offset = 0;
        const batchSize = 200;

        while (true) {
          console.log(`[audit] Fetching participants offset=${offset} (search filter)`);
          const result = await client.call({
            _: 'channels.getParticipants',
            channel: { _: 'inputChannel', channelId, accessHash },
            filter: { _: 'channelParticipantsSearch', q: '' },
            offset,
            limit: batchSize,
            hash: BigInt(0) as any,
          }) as any;

          if (!result?.participants?.length) break;

          const users = new Map();
          for (const u of (result.users || [])) {
            users.set(u.id, u);
          }

          let newCount = 0;
          for (const p of result.participants) {
            const userId = p.userId;
            if (seenUserIds.has(userId)) continue;
            seenUserIds.add(userId);
            const user = users.get(userId);
            allParticipants.push({
              participant: p,
              user: user || {},
            });
            newCount++;
          }

          offset += result.participants.length;
          console.log(`[audit] Batch returned ${result.participants.length}, new unique: ${newCount}, total: ${allParticipants.length}`);
          if (result.participants.length < batchSize) break;
          if (offset > 50000) break; // safety cap
        }

        console.log(`[audit] Total participants fetched: ${allParticipants.length}`);

        // Sort by join date to detect batch patterns
        const withDates = allParticipants.map((p, idx) => {
          const joinDate = p.participant.date
            ? new Date(p.participant.date * 1000)
            : null;
          const pType = p.participant._ === 'channelParticipantCreator' ? 'creator'
            : p.participant._ === 'channelParticipantAdmin' ? 'admin'
            : 'member';
          return {
            telegram_user_id: p.participant.userId,
            telegram_username: p.user.username || null,
            first_name: p.user.firstName || null,
            last_name: p.user.lastName || null,
            is_bot: p.user.bot || false,
            join_date: joinDate?.toISOString() || null,
            participant_type: pType,
            chat_id: chatIdNum,
            chat_title: chatTitle,
            audit_batch_id: batchId,
            _joinTs: joinDate?.getTime() || 0,
            _idx: idx,
          };
        });

        // Classify: on or before cutoff = seeded, after cutoff = organic
        // Bots are seeded too (they were added during the seeding phase)
        withDates.sort((a, b) => a._joinTs - b._joinTs);

        let seeded = 0, organic = 0, botCount = 0, unknown = 0;
        const cutoffTs = cutoffDate.getTime();

        const rows = withDates.map((m) => {
          let classification: string;
          if (m.is_bot) {
            botCount++;
          }
          if (!m.join_date) {
            classification = 'seeded'; // no date = old/seeded
            seeded++;
          } else if (m._joinTs <= cutoffTs) {
            classification = 'seeded';
            seeded++;
          } else {
            classification = 'organic';
            organic++;
          }

          return {
            telegram_user_id: m.telegram_user_id,
            telegram_username: m.telegram_username,
            first_name: m.first_name,
            last_name: m.last_name,
            is_bot: m.is_bot,
            join_date: m.join_date,
            participant_type: m.participant_type,
            classification,
            chat_id: m.chat_id,
            chat_title: m.chat_title,
            audit_batch_id: batchId,
          };
        });

        // Insert in chunks of 500
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error: insertErr } = await supabase
            .from('telegram_channel_member_audit')
            .insert(chunk);
          if (insertErr) {
            console.error(`[audit] Insert error at offset ${i}:`, insertErr.message);
          }
        }

        // Update audit run
        await supabase.from('telegram_channel_audit_runs').update({
          chat_id: chatIdNum,
          chat_title: chatTitle,
          total_members: rows.length,
          seeded_count: seeded,
          organic_count: organic,
          bot_count: botCount,
          unknown_count: unknown,
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', batchId);

        return new Response(JSON.stringify({
          success: true,
          auditRunId: batchId,
          totalMembers: rows.length,
          seeded,
          organic,
          botCount,
          unknown,
          chatTitle,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        console.error('[audit] Error:', e?.message || e);
        await supabase.from('telegram_channel_audit_runs').update({
          status: 'error',
          error_message: e?.message || 'unknown',
          completed_at: new Date().toISOString(),
        }).eq('id', batchId);
        throw e;
      } finally {
        try { await client.close(); } catch {}
      }
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: any) {
    console.error('[telegram-mtproto-auth] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error)
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}));

