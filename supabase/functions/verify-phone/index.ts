import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    // Verify the code
    const { data: verification, error: verifyError } = await supabase
      .from('phone_verifications')
      .select('*')
      .eq('phone_number', phoneNumber)
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
      .upsert({
        user_id: user.id,
        phone_number: phoneNumber,
        phone_verified: true
      });

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
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});