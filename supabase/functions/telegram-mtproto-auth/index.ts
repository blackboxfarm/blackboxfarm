import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code, password } = await req.json();
    
    const apiId = Deno.env.get('TELEGRAM_API_ID');
    const apiHash = Deno.env.get('TELEGRAM_API_HASH');
    const phoneNumber = Deno.env.get('TELEGRAM_PHONE_NUMBER');
    
    if (!apiId || !apiHash || !phoneNumber) {
      throw new Error('Telegram API credentials not configured. Need TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_PHONE_NUMBER');
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
        lastUsed: existingSession?.last_used_at
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'send_code') {
      // Use grm library to send verification code
      const { TelegramClient, StringSession } = await import("https://deno.land/x/grm@0.6.0/mod.ts");
      
      const client = new TelegramClient(
        new StringSession(""),
        parseInt(apiId),
        apiHash,
        { connectionRetries: 3 }
      );

      await client.connect();
      
      const result = await client.sendCode(
        { apiId: parseInt(apiId), apiHash },
        phoneNumber
      );

      // Store the phone code hash temporarily
      await supabase
        .from('telegram_mtproto_session')
        .upsert({
          id: 'pending',
          session_string: JSON.stringify({ phoneCodeHash: result.phoneCodeHash }),
          phone_number: phoneNumber,
          is_active: false
        }, { onConflict: 'id' });

      await client.disconnect();

      console.log('Verification code sent to', phoneNumber);

      return new Response(JSON.stringify({
        success: true,
        message: `Verification code sent to ${phoneNumber}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'verify_code') {
      if (!code) {
        throw new Error('Verification code is required');
      }

      // Get the pending session with phone code hash
      const { data: pendingSession } = await supabase
        .from('telegram_mtproto_session')
        .select('*')
        .eq('id', 'pending')
        .single();

      if (!pendingSession) {
        throw new Error('No pending authentication. Please send code first.');
      }

      const { phoneCodeHash } = JSON.parse(pendingSession.session_string);

      const { TelegramClient, StringSession } = await import("https://deno.land/x/grm@0.6.0/mod.ts");
      
      const stringSession = new StringSession("");
      const client = new TelegramClient(
        stringSession,
        parseInt(apiId),
        apiHash,
        { connectionRetries: 3 }
      );

      await client.connect();

      try {
        await client.signIn({
          phoneNumber,
          phoneCodeHash,
          phoneCode: code
        });
      } catch (signInError: any) {
        // Check if 2FA is required
        if (signInError.message?.includes('SESSION_PASSWORD_NEEDED')) {
          if (!password) {
            await client.disconnect();
            return new Response(JSON.stringify({
              success: false,
              requires2FA: true,
              message: '2FA password required'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // Try with 2FA password
          await client.signInWithPassword({
            password
          });
        } else {
          throw signInError;
        }
      }

      // Save the session string
      const sessionString = stringSession.save();
      
      // Delete pending and create active session
      await supabase
        .from('telegram_mtproto_session')
        .delete()
        .eq('id', 'pending');

      await supabase
        .from('telegram_mtproto_session')
        .insert({
          session_string: sessionString,
          phone_number: phoneNumber,
          is_active: true,
          last_used_at: new Date().toISOString()
        });

      await client.disconnect();

      console.log('Successfully authenticated MTProto session');

      return new Response(JSON.stringify({
        success: true,
        message: 'Successfully authenticated! You can now read groups and channels.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'test') {
      if (!existingSession) {
        throw new Error('No active session. Please authenticate first.');
      }

      const { TelegramClient, StringSession } = await import("https://deno.land/x/grm@0.6.0/mod.ts");
      
      const client = new TelegramClient(
        new StringSession(existingSession.session_string),
        parseInt(apiId),
        apiHash,
        { connectionRetries: 3 }
      );

      await client.connect();
      
      const me = await client.getMe();
      
      await supabase
        .from('telegram_mtproto_session')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', existingSession.id);

      await client.disconnect();

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: me.id?.toString(),
          username: me.username,
          firstName: me.firstName,
          lastName: me.lastName
        }
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
