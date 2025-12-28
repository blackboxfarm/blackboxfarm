import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// We'll use a simpler approach: store credentials and use them with an external service
// Since MTProto libraries have deployment issues in Supabase Edge Functions,
// we'll implement a polling-based approach using Telegram's web interface

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code, password, channelUsername } = await req.json();
    
    const apiId = Deno.env.get('TELEGRAM_API_ID');
    const apiHash = Deno.env.get('TELEGRAM_API_HASH');
    const phoneNumber = Deno.env.get('TELEGRAM_PHONE_NUMBER');
    
    if (!apiId || !apiHash) {
      throw new Error('Telegram API credentials not configured. Need TELEGRAM_API_ID and TELEGRAM_API_HASH');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if we already have an active session
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
        message: existingSession 
          ? 'MTProto session active. Groups can be monitored.' 
          : 'No active session. For groups, we use enhanced web scraping.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'test_group_access') {
      // Test if we can access a group via enhanced scraping
      if (!channelUsername) {
        throw new Error('Channel username required');
      }

      // Try the web preview endpoint that sometimes works for groups
      const testUrls = [
        `https://t.me/s/${channelUsername}`,
        `https://t.me/${channelUsername}`,
      ];

      let accessMethod = null;
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
            
            // Check if it's a group vs channel
            const isGroup = html.includes('tgme_page_extra') && html.includes('members');
            const isChannel = html.includes('tgme_channel_info') || html.includes('tgme_widget_message');
            
            // Count messages if any
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
          console.error(`Error testing ${url}:`, e);
        }
      }

      return new Response(JSON.stringify({
        success: accessMethod === 'web_scraping',
        channelUsername,
        accessMethod,
        messageCount,
        message: accessMethod === 'web_scraping' 
          ? `Found ${messageCount} messages via web scraping`
          : accessMethod === 'group_detected_no_public_messages'
            ? 'This is a GROUP - public web view not available. Messages cannot be scraped without MTProto.'
            : 'Unable to access messages from this channel/group'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'save_session') {
      // Allow manual session string input (for users who generate it externally)
      // Accept either 'code' or 'sessionString' for flexibility
      const session = code || (await req.clone().json()).sessionString;
      
      if (!session || typeof session !== 'string' || session.trim().length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Session string is required. Provide it as "code" or "sessionString" in the request body.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Clean the session string
      const cleanedSession = session.replace(/\s+/g, '');

      // Deactivate any existing sessions
      await supabase
        .from('telegram_mtproto_session')
        .update({ is_active: false })
        .eq('is_active', true);

      // Save new session
      const { error: insertError } = await supabase
        .from('telegram_mtproto_session')
        .insert({
          session_string: cleanedSession,
          phone_number: phoneNumber,
          is_active: true,
          last_used_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error inserting session:', insertError);
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
        message: 'Session saved successfully'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'generate_session_instructions') {
      // Provide instructions for generating a session string locally
      return new Response(JSON.stringify({
        success: true,
        instructions: `
# Generate Telegram Session String Locally

Since MTProto requires interactive authentication, you'll need to generate a session string on your local machine and then paste it here.

## Option 1: Using Python (Telethon)

1. Install: pip install telethon
2. Run this script:

\`\`\`python
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id = ${apiId}
api_hash = '${apiHash}'

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print("Session string:")
    print(client.session.save())
\`\`\`

3. Follow the prompts to enter your phone number and verification code
4. Copy the printed session string

## Option 2: Using Node.js (telegram package)

1. Install: npm install telegram
2. Run this script and follow prompts
3. Copy the session string

## After generating:
Use the "Save Session" action with the generated session string.
        `.trim(),
        apiId,
        apiHash: apiHash?.substring(0, 4) + '...',
        phoneNumber
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error('MTProto auth error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
