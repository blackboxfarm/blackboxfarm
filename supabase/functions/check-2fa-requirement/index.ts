import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Uniform response to prevent user enumeration
const UNIFORM_NO_2FA = { requires2FA: false, has2FA: false, isTrustedDevice: false };

serve(withRunLog('check-2fa-requirement', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      // Return uniform response instead of error
      return new Response(
        JSON.stringify(UNIFORM_NO_2FA),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user by email — return uniform response if not found (no enumeration)
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
      console.error('Error listing users:', userError);
      return new Response(
        JSON.stringify(UNIFORM_NO_2FA),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const user = users.users.find(u => u.email === email);
    if (!user) {
      // User not found — return same shape as "no 2FA" to prevent enumeration
      return new Response(
        JSON.stringify(UNIFORM_NO_2FA),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Check if user has 2FA enabled
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('two_factor_enabled')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      // Profile error — return uniform response
      return new Response(
        JSON.stringify(UNIFORM_NO_2FA),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const has2FA = profile?.two_factor_enabled || false;

    // Check if this device is trusted (if 2FA is enabled)
    let isTrustedDevice = false;
    if (has2FA) {
      const deviceFingerprint = generateDeviceFingerprint(req);
      
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
    // Return uniform response on any error — never leak user existence
    return new Response(
      JSON.stringify(UNIFORM_NO_2FA),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});

function generateDeviceFingerprint(req: Request): string {
  const userAgent = req.headers.get('user-agent') || '';
  const acceptLanguage = req.headers.get('accept-language') || '';
  const acceptEncoding = req.headers.get('accept-encoding') || '';
  
  const fingerprint = btoa(userAgent + acceptLanguage + acceptEncoding);
  return fingerprint.substring(0, 64);
}
