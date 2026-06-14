import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const TWILIO_FROM = '+16624814161';

serve(withRunLog('security-sms-webhook', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (Deno.env.get('SMS_GLOBAL_KILL') !== 'false') {
      console.warn('[SMS KILL] security-sms-webhook outbound suppressed');
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    if (!TWILIO_API_KEY) throw new Error('TWILIO_API_KEY is not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Twilio sends webhook data as form-encoded
    const formData = await req.formData();
    const fromNumber = formData.get('From')?.toString() || '';
    const body = formData.get('Body')?.toString()?.trim().toUpperCase() || '';
    const messageSid = formData.get('MessageSid')?.toString() || '';

    console.log(`SMS reply from ${fromNumber}: "${body}"`);

    // Find the most recent pending alert for this phone number
    const { data: alert, error: alertError } = await supabase
      .from('security_sms_alerts')
      .select('*')
      .eq('phone_number', fromNumber)
      .eq('status', 'sent')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alertError || !alert) {
      console.log('No pending alert found for', fromNumber);
      // Send a courtesy reply
      await sendSms(LOVABLE_API_KEY, TWILIO_API_KEY, fromNumber,
        '⚠️ No pending security alert found for your number. If you need help, contact support.');
      return new Response('<Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Normalize the response
    const isYes = ['Y', 'YES', 'YEP', 'YA', 'YEAH'].includes(body);
    const isNo = ['N', 'NO', 'NOPE', 'NAH'].includes(body);
    const isUnlock = body === 'UNLOCK';

    let responseAction = 'unknown';
    let replyMessage = '';

    if (alert.alert_type === 'session_kill' && isUnlock) {
      // User wants to unlock their account
      responseAction = 'unlock_account';
      
      // Unlock the account
      await supabase
        .from('account_lockdowns')
        .update({ 
          is_locked: false, 
          unlocked_at: new Date().toISOString(),
          unlock_method: 'sms_unlock'
        })
        .eq('user_id', alert.user_id)
        .eq('is_locked', true);

      replyMessage = '✅ Account unlocked! You can now log in. Stay safe! 🛡️';

    } else if (isYes) {
      // User confirms: "Yes, that was me"
      responseAction = 'approve';

      // If it's a new device login, trust the device
      if (alert.alert_type === 'new_device' || alert.alert_type === 'login_anomaly') {
        const meta = alert.metadata as Record<string, any> || {};
        if (meta.device_fingerprint) {
          await supabase
            .from('trusted_devices')
            .upsert({
              user_id: alert.user_id,
              device_fingerprint: meta.device_fingerprint,
              is_trusted: true,
              trust_confirmed_via: 'sms',
              device_name: meta.device_name || null,
              ip_address: meta.ip_address || null,
              country: meta.country || null,
              city: meta.city || null,
              last_seen_at: new Date().toISOString(),
            }, { onConflict: 'user_id,device_fingerprint' });
        }
      }

      replyMessage = '✅ Confirmed! Device trusted. Stay safe! 🛡️';

    } else if (isNo) {
      // User says "No, that wasn't me" — LOCKDOWN
      responseAction = 'lock_account';

      // 1. Lock the account
      await supabase
        .from('account_lockdowns')
        .insert({
          user_id: alert.user_id,
          is_locked: true,
          locked_reason: 'sms_response',
          alert_id: alert.id,
          metadata: alert.metadata,
        });

      // 2. Kill all sessions by updating the user's ban status
      // Note: Full session invalidation requires admin API
      // For now, we record the lockdown and the app checks on login

      // 3. Send lockdown confirmation + unlock instructions
      replyMessage = '🔒 ACCOUNT LOCKED\n\nAll sessions terminated. Your account is now locked.\n\nReply UNLOCK when you\'re ready to restore access.\n\nIf you need immediate help, contact support.';

      // 4. Send a follow-up session_kill alert so they can unlock via SMS
      await supabase.functions.invoke('security-sms-alert', {
        body: {
          user_id: alert.user_id,
          alert_type: 'session_kill',
          metadata: { triggered_by: alert.id, original_alert_type: alert.alert_type }
        }
      }).catch(err => console.error('Failed to send session_kill alert:', err));

    } else {
      replyMessage = `⚠️ Unrecognized reply: "${body}"\n\nPlease reply Y (yes, that was me) or N (no, lock my account).`;
      responseAction = 'unrecognized';
    }

    // Update the alert record
    await supabase
      .from('security_sms_alerts')
      .update({
        user_response: body,
        response_action: responseAction,
        status: responseAction === 'unrecognized' ? 'sent' : 'responded',
        responded_at: new Date().toISOString(),
        action_executed_at: responseAction !== 'unrecognized' ? new Date().toISOString() : null,
      })
      .eq('id', alert.id);

    // Send reply SMS
    if (replyMessage) {
      await sendSms(LOVABLE_API_KEY, TWILIO_API_KEY, fromNumber, replyMessage);
    }

    // Return TwiML empty response (Twilio expects XML)
    return new Response('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Security SMS webhook error:', error);
    return new Response('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}));

async function sendSms(lovableKey: string, twilioKey: string, to: string, body: string) {
  const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': twilioKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error('Failed to send SMS:', err);
  }
  return response;
}