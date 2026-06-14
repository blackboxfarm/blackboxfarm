import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const TWILIO_FROM = '+16624814161';

interface AlertRequest {
  user_id: string;
  alert_type: 'login_anomaly' | 'password_change' | 'new_device' | '2fa_disable' | 'large_withdrawal' | 'session_kill';
  metadata?: Record<string, any>;
}

const ALERT_TEMPLATES: Record<string, (meta: any) => { message: string; follow_up?: string }> = {
  login_anomaly: (meta) => ({
    message: `🚨 SECURITY ALERT\n\nNew login detected from ${meta.country || 'unknown location'}${meta.city ? ` (${meta.city})` : ''}.\nIP: ${meta.ip_address || 'unknown'}\nDevice: ${meta.device_name || 'unknown'}\n\nWas this you? Reply Y or N`,
    follow_up: `If this wasn't you, we'll immediately lock your account and kill all active sessions.`
  }),
  new_device: (meta) => ({
    message: `🔐 NEW DEVICE DETECTED\n\nSomeone logged into your account from a new device: ${meta.device_name || 'Unknown Device'}\nLocation: ${meta.country || 'unknown'}${meta.city ? `, ${meta.city}` : ''}\n\nWas this you? Reply Y or N`
  }),
  password_change: (_meta) => ({
    message: `🔑 PASSWORD CHANGED\n\nYour account password was just changed.\n\nWas this you? Reply Y or N\n\nIf not, we'll lock your account immediately.`
  }),
  '2fa_disable': (_meta) => ({
    message: `⚠️ 2FA DISABLED\n\nTwo-factor authentication was just turned off on your account.\n\nDid you do this? Reply Y or N`
  }),
  large_withdrawal: (meta) => ({
    message: `💰 WITHDRAWAL ALERT\n\nA withdrawal of ${meta.amount || '?'} SOL was initiated from your account.\n\nDid you authorize this? Reply Y or N`
  }),
  session_kill: (_meta) => ({
    message: `🔒 ACCOUNT LOCKED\n\nYour account has been locked per your request. All sessions terminated.\n\nReply UNLOCK when you're ready to restore access.`
  })
};

serve(withRunLog('security-sms-alert', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (Deno.env.get('SMS_GLOBAL_KILL') !== 'false') {
      console.warn('[SMS KILL] security-sms-alert suppressed');
      return new Response(JSON.stringify({ skipped: true, reason: 'SMS_GLOBAL_KILL active' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    const { user_id, alert_type, metadata = {} }: AlertRequest = await req.json();

    if (!user_id || !alert_type) {
      return new Response(JSON.stringify({ error: 'user_id and alert_type are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's verified phone number
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('phone_number, phone_verified')
      .eq('user_id', user_id)
      .maybeSingle();

    if (profileError || !profile?.phone_number || !profile?.phone_verified) {
      console.log('No verified phone for user', user_id);
      return new Response(JSON.stringify({ 
        error: 'No verified phone number on file',
        skipped: true 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the alert message
    const template = ALERT_TEMPLATES[alert_type];
    if (!template) {
      return new Response(JSON.stringify({ error: `Unknown alert type: ${alert_type}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { message } = template(metadata);

    // Send SMS via Twilio gateway
    const twilioResponse = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: profile.phone_number,
        From: TWILIO_FROM,
        Body: message,
      }),
    });

    const twilioData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error('Twilio error:', twilioData);
      throw new Error(`Twilio API error [${twilioResponse.status}]: ${JSON.stringify(twilioData)}`);
    }

    // Record the alert
    const expectedResponses = alert_type === 'session_kill' 
      ? ['UNLOCK'] 
      : ['Y', 'N', 'YES', 'NO'];

    const { data: alert, error: alertError } = await supabase
      .from('security_sms_alerts')
      .insert({
        user_id,
        phone_number: profile.phone_number,
        alert_type,
        message_body: message,
        expected_responses: expectedResponses,
        twilio_message_sid: twilioData.sid,
        status: 'sent',
        metadata,
      })
      .select()
      .single();

    if (alertError) {
      console.error('Failed to record alert:', alertError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      alert_id: alert?.id,
      message_sid: twilioData.sid 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Security SMS alert error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? (error as Error).message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));