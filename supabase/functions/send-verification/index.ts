import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';
const TWILIO_FROM_NUMBER = '+16624814161';

function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  throw new Error('Please enter a valid phone number with area code');
}

serve(withRunLog('send-verification', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, type = 'sms' } = await req.json();

    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store verification code in database with expiry
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: dbError } = await supabase
      .from('phone_verifications')
      .upsert({
        phone_number: normalizedPhoneNumber,
        verification_code: verificationCode,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        verified: false
      });

    if (dbError) throw dbError;

    if (type === 'sms') {
      if (Deno.env.get('SMS_GLOBAL_KILL') !== 'false') {
        console.warn('[SMS KILL] send-verification SMS suppressed');
        return new Response(JSON.stringify({ success: false, error: 'SMS temporarily disabled (SMS_GLOBAL_KILL)' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
      if (!TWILIO_ACCOUNT_SID) throw new Error('TWILIO_ACCOUNT_SID is not configured');

      const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
      if (!TWILIO_AUTH_TOKEN) throw new Error('TWILIO_AUTH_TOKEN is not configured');

      const response = await fetch(`${TWILIO_API_BASE}/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: normalizedPhoneNumber,
          From: TWILIO_FROM_NUMBER,
          Body: `Your BlackBox verification code is: ${verificationCode}. Valid for 10 minutes.`
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Twilio API error [${response.status}]: ${JSON.stringify(data)}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Verification code sent' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in send-verification:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? (error as Error).message : String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
}));
