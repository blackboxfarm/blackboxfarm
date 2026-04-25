import { withRunLog } from '../_shared/run-logger.ts';
import { createEmailTracking } from '../_shared/email-tracking.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = 'https://blackbox.farm';

serve(withRunLog('send-verification-email', async (req, logger) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { type = 'signup' } = await req.json().catch(() => ({}));

    // Check if already verified
    const { data: existing } = await supabaseAdmin
      .from('email_verifications')
      .select('id, verified_at')
      .eq('user_id', user.id)
      .eq('verification_type', 'signup')
      .not('verified_at', 'is', null)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ success: true, already_verified: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Rate limit: don't send more than 1 per 5 minutes
    const { data: recent } = await supabaseAdmin
      .from('email_verifications')
      .select('id')
      .eq('user_id', user.id)
      .eq('verification_type', type)
      .gte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      return new Response(JSON.stringify({ error: 'Verification email already sent recently. Please wait 5 minutes.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const verificationToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Store verification record
    await supabaseAdmin.from('email_verifications').insert({
      user_id: user.id,
      verification_token: verificationToken,
      verification_type: type,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    const verifyUrl = `${SITE_URL}/verify-email?token=${verificationToken}`;
    const subject = type === 'reactivation'
      ? 'Reactivate Your BlackBox Farm Account'
      : '🔐 Verify Your Email — BlackBox Farm';

    // Create tracking record
    const tracking = await createEmailTracking({
      userId: user.id,
      emailType: `verification_${type}`,
      recipientEmail: user.email!,
      subjectLine: subject,
      metadata: { verification_token: verificationToken },
    });

    const html = buildVerificationEmail(verifyUrl, tracking.pixelHtml, tracking.wrapUrl, type);

    // Send email using Supabase Auth admin's built-in email
    // We use the auth.admin API to send a custom email
    // Since we can't send arbitrary emails via Supabase Auth alone,
    // we'll use the existing send-email-notification function or direct SMTP
    // For now, let's use Supabase's resend verification which actually sends an email
    const { error: resendError } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email: user.email!,
      options: {
        emailRedirectTo: verifyUrl,
      }
    });

    if (resendError) {
      logger?.warn(`Supabase resend failed (likely autoconfirm): ${resendError.message}`);
      // If resend fails (e.g. user already confirmed via autoconfirm),
      // try the send-email-notification function as fallback
      try {
        await supabaseAdmin.functions.invoke('send-email-notification', {
          body: {
            to: user.email,
            subject,
            html,
          }
        });
        logger?.info(`Sent verification email via send-email-notification to ${user.email}`);
      } catch (fallbackErr) {
        logger?.warn(`Fallback email also failed: ${fallbackErr}`);
      }
    } else {
      logger?.info(`Verification email sent via Supabase resend to ${user.email}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Verification email sent',
      tracking_id: tracking.trackingId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger?.error(`Error: ${error instanceof Error ? (error as Error).message : String(error)}`);
    return new Response(JSON.stringify({ error: error instanceof Error ? (error as Error).message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}));

function buildVerificationEmail(
  verifyUrl: string,
  pixelHtml: string,
  wrapUrl: (url: string) => string,
  type: string
): string {
  const title = type === 'reactivation' ? 'Reactivate Your Account' : 'Verify Your Email';
  const message = type === 'reactivation'
    ? 'Your BlackBox Farm account was suspended because your email was not verified within 48 hours. Click the button below to reactivate your account.'
    : 'Welcome to BlackBox Farm! Please verify your email address by clicking the button below. You have 48 hours to complete this step.';
  const buttonText = type === 'reactivation' ? 'Reactivate My Account' : 'Verify My Email';

  // Wrap the verify URL through click tracking
  const trackedVerifyUrl = wrapUrl(verifyUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 30px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">🔐</div>
  <h1 style="color:#ffffff;font-size:24px;margin:0 0 10px;">${title}</h1>
  <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 30px;">${message}</p>
  <a href="${trackedVerifyUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">${buttonText}</a>
  <p style="color:#71717a;font-size:12px;margin:30px 0 0;">If you didn't create an account, you can safely ignore this email.</p>
  <p style="color:#52525b;font-size:11px;margin:20px 0 0;">© ${new Date().getFullYear()} BlackBox Farm — HoldersIntel</p>
</td></tr>
</table>
</td></tr>
</table>
${pixelHtml}
</body>
</html>`;
}
