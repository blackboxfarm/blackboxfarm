import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { authenticator } from "https://esm.sh/@otplib/preset-default@12.0.1";

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

    const { secret, totpCode } = await req.json();

    if (!secret || !totpCode) {
      throw new Error('Secret and TOTP code are required');
    }

    // Verify the TOTP code
    const isValid = authenticator.verify({ token: totpCode, secret });

    if (!isValid) {
      throw new Error('Invalid TOTP code');
    }

    // Enable 2FA for the user
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        two_factor_enabled: true,
        two_factor_secret: secret
      })
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    // Send notification
    await supabase
      .from('notifications')
      .insert({
        user_id: user.id,
        title: '2FA Enabled',
        message: 'Two-factor authentication has been successfully enabled for your account.',
        type: 'success'
      });

    return new Response(
      JSON.stringify({ success: true, message: '2FA enabled successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in enable-2fa:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});