import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";
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

    // Generate TOTP secret
    const secret = authenticator.generateSecret();
    
    // Create service name and account name for QR code
    const serviceName = 'BlackBox Trading';
    const accountName = user.email || 'User';
    
    // Generate QR code URL
    const otpauth = authenticator.keyuri(accountName, serviceName, secret);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;

    // Store secret temporarily (will be permanently saved when 2FA is enabled)
    const { error: updateError } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        two_factor_secret: secret
      });

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        secret,
        qrCode: qrCodeUrl,
        otpauth
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in setup-totp:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});