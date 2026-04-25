import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

serve(withRunLog('verify-phone', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication token');
    }

    const { phoneNumber, code } = await req.json();

    if (!phoneNumber || !code) {
      throw new Error('Phone number and verification code are required');
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    // Verify the code
    const { data: verification, error: verifyError } = await supabase
      .from('phone_verifications')
      .select('*')
      .eq('phone_number', normalizedPhoneNumber)
      .eq('verification_code', code)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (verifyError || !verification) {
      throw new Error('Invalid or expired verification code');
    }

    // Mark as verified
    const { error: updateError } = await supabase
      .from('phone_verifications')
      .update({ verified: true })
      .eq('id', verification.id);

    if (updateError) throw updateError;

    // Update user profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        phone_number: normalizedPhoneNumber,
        phone_verified: true
      })
      .eq('user_id', user.id);

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ success: true, message: 'Phone number verified successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in verify-phone:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? (error as Error).message : String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
}));
