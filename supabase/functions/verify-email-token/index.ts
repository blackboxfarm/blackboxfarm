import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(withRunLog('verify-email-token', async (req, logger) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Look up the token
    const { data: verification, error: lookupError } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('verification_token', token)
      .single();

    if (lookupError || !verification) {
      logger?.error(`Invalid token: ${token}`);
      return new Response(JSON.stringify({ error: 'Invalid or expired verification token' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Already verified?
    if (verification.verified_at) {
      return new Response(JSON.stringify({ success: true, already_verified: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check expiry
    if (new Date(verification.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This verification link has expired' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Mark as verified
    await supabase
      .from('email_verifications')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', verification.id);

    // If this is a reactivation, unban the user
    if (verification.verification_type === 'reactivation') {
      await supabase.rpc('unban_user', { target_user_id: verification.user_id });
      logger?.info(`User ${verification.user_id} reactivated via email verification`);
    } else {
      logger?.info(`User ${verification.user_id} email verified (signup)`);
    }

    // Track the click in email_tracking_events if we can find the tracking record
    const { data: trackingEvent } = await supabase
      .from('email_tracking_events')
      .select('id')
      .eq('user_id', verification.user_id)
      .eq('email_type', `verification_${verification.verification_type}`)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (trackingEvent) {
      await supabase
        .from('email_tracking_events')
        .update({
          clicked_at: new Date().toISOString(),
          click_count: 1,
        })
        .eq('id', trackingEvent.id);
    }

    return new Response(JSON.stringify({
      success: true,
      verification_type: verification.verification_type,
      message: verification.verification_type === 'reactivation'
        ? 'Your account has been reactivated!'
        : 'Your email has been verified!',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger?.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}));
