import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { user_id, telegram_user_id, telegram_username, otp_token } = await req.json();

    if (!user_id || !telegram_user_id || !otp_token) {
      return new Response(JSON.stringify({ error: 'user_id, telegram_user_id, and otp_token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate the OTP token
    const { data: record, error: lookupErr } = await supabase
      .from('one_time_action_tokens')
      .select('*')
      .eq('token', otp_token)
      .maybeSingle();

    if (lookupErr || !record) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (record.used_at) {
      return new Response(JSON.stringify({ error: 'Token already used' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (new Date(record.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token expired' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify the payload matches
    if (record.payload?.telegram_user_id !== telegram_user_id) {
      return new Response(JSON.stringify({ error: 'Token payload mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if this Telegram user is already linked to another account
    const { data: existingLink } = await supabase
      .from('telegram_link_codes')
      .select('user_id')
      .eq('telegram_user_id', telegram_user_id)
      .maybeSingle();

    if (existingLink && existingLink.user_id !== user_id) {
      return new Response(JSON.stringify({ error: 'This Telegram account is already linked to another user.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user already has a link code entry
    const { data: userLink } = await supabase
      .from('telegram_link_codes')
      .select('id, telegram_user_id')
      .eq('user_id', user_id)
      .maybeSingle();

    if (userLink) {
      if (userLink.telegram_user_id && userLink.telegram_user_id !== telegram_user_id) {
        return new Response(JSON.stringify({ error: 'Your account is already linked to a different Telegram account.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      // Update existing record to link
      await supabase
        .from('telegram_link_codes')
        .update({
          telegram_user_id: telegram_user_id,
          telegram_username: telegram_username || null,
          linked_at: new Date().toISOString(),
          is_used: true,
        })
        .eq('id', userLink.id);
    } else {
      // Generate a link code and create entry
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = 'BF-';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }

      await supabase.from('telegram_link_codes').insert({
        user_id,
        link_code: code,
        telegram_user_id: telegram_user_id,
        telegram_username: telegram_username || null,
        linked_at: new Date().toISOString(),
        is_used: true,
      });
    }

    // Mark the OTP token as used
    await supabase.from('one_time_action_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', record.id);

    console.log(`[tg-link] Linked TG ${telegram_user_id} → user ${user_id}`);

    // Fire admin notification for TG link
    await supabase.from('admin_notifications').insert({
      notification_type: 'new_signup',
      title: 'Telegram Account Linked',
      message: `@${telegram_username || telegram_user_id} linked via OTP auth flow`,
      metadata: { telegram_user_id, telegram_username, user_id, link_method: 'otp_auth' },
    });

    return new Response(JSON.stringify({ success: true, message: 'Telegram account linked!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
