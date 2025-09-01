import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const { email } = await req.json();

    if (!email) {
      throw new Error('Email is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user by email
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) throw userError;

    const user = users.users.find(u => u.email === email);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user has 2FA enabled
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('two_factor_enabled')
      .eq('user_id', user.id)
      .single();

    if (profileError) throw profileError;

    const has2FA = profile?.two_factor_enabled || false;

    // Check if this device is trusted (if 2FA is enabled)
    let isTrustedDevice = false;
    if (has2FA) {
      const deviceFingerprint = await generateDeviceFingerprint(req);
      
      const { data: trustedDevice, error: deviceError } = await supabase
        .from('trusted_devices')
        .select('id')
        .eq('user_id', user.id)
        .eq('device_fingerprint', deviceFingerprint)
        .eq('is_active', true)
        .single();

      if (!deviceError && trustedDevice) {
        isTrustedDevice = true;
        
        // Update last used timestamp
        await supabase
          .from('trusted_devices')
          .update({ last_used: new Date().toISOString() })
          .eq('id', trustedDevice.id);
      }
    }

    return new Response(
      JSON.stringify({ 
        requires2FA: has2FA && !isTrustedDevice,
        has2FA,
        isTrustedDevice
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in check-2fa-requirement:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

async function generateDeviceFingerprint(req: Request): Promise<string> {
  const userAgent = req.headers.get('user-agent') || '';
  const acceptLanguage = req.headers.get('accept-language') || '';
  const acceptEncoding = req.headers.get('accept-encoding') || '';
  
  // Create a simple fingerprint from headers
  const fingerprint = btoa(userAgent + acceptLanguage + acceptEncoding);
  return fingerprint.substring(0, 64); // Truncate to reasonable length
}