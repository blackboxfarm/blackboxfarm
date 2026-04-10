import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const TWILIO_FROM_NUMBER = '+16624814161';

serve(withRunLog('send-verification', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, type = 'sms' } = await req.json();

    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

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
        phone_number: phoneNumber,
        verification_code: verificationCode,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        verified: false
      });

    if (dbError) throw dbError;

    if (type === 'sms') {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

      const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
      if (!TWILIO_API_KEY) throw new Error('TWILIO_API_KEY is not configured');

      const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TWILIO_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phoneNumber,
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
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
}));
