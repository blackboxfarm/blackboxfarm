import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TelegramClient, MemoryStorage } from "jsr:@mtcute/deno";
import { convertFromTelethonSession } from "jsr:@mtcute/convert";

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

  console.log(`[telegram-mtproto-auth] Creating MTProto client for @${channelUsername}, sessionLen=${sessionString.length}`);

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

    console.log(`[telegram-mtproto-auth] Connected, fetching history for @${channelUsername}`);

    // Fetch message history
    const messages = await client.getHistory(channelUsername, { limit });

    const mapped = messages.map((m: any) => {
      const text = m.text || '';
      const sender = m.sender;
      const callerUsername = sender?.username;
      const callerDisplayName = sender?.displayName || sender?.firstName 
        ? `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim()
        : undefined;

      return {
        messageId: String(m.id),
        text,
        date: m.date ? new Date(m.date * 1000).toISOString() : new Date().toISOString(),
        callerUsername,
        callerDisplayName,
      };
    }).filter((m: any) => m.text);

    console.log(`[telegram-mtproto-auth] Fetched ${mapped.length} messages from @${channelUsername}`);

    return { success: true, messages: mapped };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action, code, channelUsername, limit } = body;

    const apiIdRaw = Deno.env.get('TELEGRAM_API_ID');
    const apiHash = Deno.env.get('TELEGRAM_API_HASH');
    const phoneNumber = Deno.env.get('TELEGRAM_PHONE_NUMBER');

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

    const { data: existingSession } = await supabase
      .from('telegram_mtproto_session')
      .select('*')
      .eq('is_active', true)
      .single();

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
      if (!channelUsername) {
        throw new Error('Channel username required');
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

      const username = normalizeUsername(channelUsername);
      const msgLimit = Math.max(1, Math.min(200, Number(limit) || 50));

      console.log(`[telegram-mtproto-auth] fetch_recent_messages @${username} limit=${msgLimit}`);

      const res = await fetchRecentMessagesViaMTProto({
        sessionString: existingSession.session_string,
        apiId,
        apiHash,
        channelUsername: username,
        limit: msgLimit,
      });

      await supabase
        .from('telegram_mtproto_session')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', existingSession.id);

      return new Response(JSON.stringify({
        success: true,
        channelUsername: username,
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
});
