import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Note: gramJS requires a session string for MTProto authentication
// This function handles the login flow to generate and store the session

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const apiId = Deno.env.get('TELEGRAM_API_ID');
    const apiHash = Deno.env.get('TELEGRAM_API_HASH');
    const phoneNumber = Deno.env.get('TELEGRAM_PHONE_NUMBER');

    if (!apiId || !apiHash || !phoneNumber) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing Telegram API credentials. Need TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE_NUMBER'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const body = await req.json();
    const { action, code, password, userId } = body;

    console.log(`[telegram-session-generator] Action: ${action}`);

    // For Deno edge functions, we can't use gramJS directly because it requires Node.js
    // Instead, we'll use Telegram's Bot API to send messages and MTProto via a workaround
    // 
    // The recommended approach for production:
    // 1. Use a separate Node.js service to handle MTProto session generation
    // 2. Or use Telegram Bot API (but it can't read channel messages as a user)
    //
    // For now, we'll implement a simplified approach using the bot token to verify
    // the setup and store a placeholder session that the monitor can use

    if (action === 'check_status') {
      // Check if we have a valid session stored
      const { data: session, error } = await supabase
        .from('telegram_session')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[telegram-session-generator] Error checking session:', error);
      }

      // Also check if we have the bot token configured
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

      return new Response(JSON.stringify({
        success: true,
        hasSession: !!session,
        session: session ? {
          id: session.id,
          phoneNumber: session.phone_number,
          isActive: session.is_active,
          lastUsedAt: session.last_used_at,
          createdAt: session.created_at
        } : null,
        hasBotToken: !!botToken,
        hasApiCredentials: !!(apiId && apiHash),
        phoneNumber: phoneNumber ? `***${phoneNumber.slice(-4)}` : null
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'create_session') {
      // Create a new session entry with the API credentials
      // The actual MTProto session will be generated when the monitor first runs
      
      // First, deactivate any existing sessions
      await supabase
        .from('telegram_session')
        .update({ is_active: false })
        .eq('is_active', true);

      // Create new session placeholder
      const { data: newSession, error } = await supabase
        .from('telegram_session')
        .insert({
          user_id: userId || null,
          session_string: 'pending_mtproto_auth', // Placeholder
          phone_number: phoneNumber,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        console.error('[telegram-session-generator] Error creating session:', error);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to create session: ' + error.message
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      console.log('[telegram-session-generator] Created new session:', newSession.id);

      return new Response(JSON.stringify({
        success: true,
        message: 'Session created. The channel monitor will use Bot API for monitoring.',
        session: {
          id: newSession.id,
          phoneNumber: phoneNumber ? `***${phoneNumber.slice(-4)}` : null,
          isActive: true
        },
        note: 'For reading channel messages, the bot must be added as an admin to the channel, OR you need to use MTProto with a user session (requires separate Node.js setup).'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'test_bot') {
      // Test the bot token by getting bot info
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      
      if (!botToken) {
        return new Response(JSON.stringify({
          success: false,
          error: 'TELEGRAM_BOT_TOKEN not configured'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const botResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const botData = await botResponse.json();

      if (!botData.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Bot token invalid: ' + botData.description
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      return new Response(JSON.stringify({
        success: true,
        bot: {
          id: botData.result.id,
          username: botData.result.username,
          firstName: botData.result.first_name,
          canReadMessages: botData.result.can_read_all_group_messages || false
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'test_channel') {
      // Test if we can access a specific channel
      const { channelId, channelUsername } = body;
      
      // If username is provided, try scraping the public page
      if (channelUsername) {
        const cleanUsername = channelUsername.replace('@', '').replace('https://t.me/', '').replace('t.me/', '');
        const url = `https://t.me/s/${cleanUsername}`;
        
        console.log(`[telegram-session-generator] Testing public channel: ${url}`);
        
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml',
            }
          });
          
          if (!response.ok) {
            return new Response(JSON.stringify({
              success: false,
              error: `Failed to access channel: HTTP ${response.status}`,
              hint: 'Make sure the channel is public and the username is correct'
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
          }
          
          const html = await response.text();
          
          // Check if we got the channel page
          const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
          const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
          
          if (!titleMatch) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Channel not found or is private',
              hint: 'Make sure the channel is public and the username is correct'
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
          }
          
          // Count messages to verify access
          const messageCount = (html.match(/tgme_widget_message/g) || []).length;
          
          return new Response(JSON.stringify({
            success: true,
            channel: {
              username: cleanUsername,
              title: titleMatch[1],
              description: descMatch ? descMatch[1] : null,
              messageCount,
              isPublic: true
            },
            message: `Successfully connected to public channel "${titleMatch[1]}" with ${messageCount} recent messages`
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          
        } catch (error) {
          console.error('[telegram-session-generator] Error testing public channel:', error);
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to access channel: ' + error.message
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }
      }
      
      // Fallback to Bot API for non-public channels
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      
      if (!botToken) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No channel username provided and TELEGRAM_BOT_TOKEN not configured',
          hint: 'For public channels, provide the username (e.g., blindapee). For private channels, configure a bot token.'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      // Try to get chat info
      const chatResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/getChat?chat_id=${channelId}`
      );
      const chatData = await chatResponse.json();

      if (!chatData.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Cannot access channel: ' + chatData.description,
          hint: 'Make sure the bot is added to the channel as an admin with message access'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      return new Response(JSON.stringify({
        success: true,
        channel: {
          id: chatData.result.id,
          title: chatData.result.title,
          type: chatData.result.type,
          username: chatData.result.username
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid action. Use: check_status, create_session, test_bot, or test_channel'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

  } catch (error) {
    console.error('[telegram-session-generator] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
