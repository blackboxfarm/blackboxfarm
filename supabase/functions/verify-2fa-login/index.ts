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
    const { email, totpCode, rememberDevice } = await req.json();

    if (!email || !totpCode) {
      throw new Error('Email and TOTP code are required');
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

    // Get user's 2FA secret from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('two_factor_secret, two_factor_enabled')
      .eq('user_id', user.id)
      .single();

    if (profileError) throw profileError;

    if (!profile?.two_factor_enabled || !profile?.two_factor_secret) {
      throw new Error('Two-factor authentication is not enabled for this user');
    }

    // Decrypt the secret (assuming it's base64 encoded)
    let secret;
    try {
      secret = atob(profile.two_factor_secret);
    } catch {
      secret = profile.two_factor_secret; // Fallback if not encoded
    }

    // Verify the TOTP code
    const isValid = authenticator.verify({ 
      token: totpCode, 
      secret: secret,
      window: 1 // Allow 1 time step tolerance
    });

    if (!isValid) {
      // Log failed attempt
      await supabase.functions.invoke('security-logger', {
        body: {
          event_type: 'AUTH_2FA_FAILURE',
          user_id: user.id,
          details: { email, timestamp: new Date().toISOString() }
        }
      });

      throw new Error('Invalid TOTP code');
    }

    // Generate a new session
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${Deno.env.get('SUPABASE_URL')}/auth/callback`
      }
    });

    if (sessionError) throw sessionError;

    // If user wants to remember device, create a trusted device record
    if (rememberDevice) {
      const deviceFingerprint = await generateDeviceFingerprint(req);
      
      await supabase
        .from('trusted_devices')
        .insert({
          user_id: user.id,
          device_fingerprint: deviceFingerprint,
          device_name: req.headers.get('user-agent')?.substring(0, 100) || 'Unknown Device',
          last_used: new Date().toISOString()
        });
    }

    // Log successful 2FA login
    await supabase.functions.invoke('security-logger', {
      body: {
        event_type: 'AUTH_2FA_SUCCESS',
        user_id: user.id,
        details: { 
          email, 
          remembered_device: rememberDevice,
          timestamp: new Date().toISOString() 
        }
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        session: sessionData,
        message: '2FA verification successful'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in verify-2fa-login:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
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
  const fingerprint = btoa(userAgent + acceptLanguage + acceptEncoding + Date.now());
  return fingerprint.substring(0, 64); // Truncate to reasonable length
}