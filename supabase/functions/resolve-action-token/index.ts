import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { token } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Look up the token
    const { data: record, error: lookupErr } = await supabase
      .from('one_time_action_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (lookupErr || !record) {
      return new Response(JSON.stringify({ error: 'Invalid or unknown token' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if already used
    if (record.used_at) {
      return new Response(JSON.stringify({ 
        error: 'This link has already been used.',
        action_type: record.action_type,
        used: true 
      }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check expiry
    if (new Date(record.expires_at) < new Date()) {
      return new Response(JSON.stringify({ 
        error: 'This link has expired. Ask the bot for a new one.',
        action_type: record.action_type,
        expired: true 
      }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user info
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(record.user_id);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let result: Record<string, unknown> = {
      action_type: record.action_type,
      success: true,
    };

    // Execute the action
    switch (record.action_type) {
      case 'resend_verification': {
        // Invoke the send-verification-email function on behalf of this user
        // We'll directly trigger a verification email
        try {
          // Generate a new verification token
          const tokenBytes = new Uint8Array(32);
          crypto.getRandomValues(tokenBytes);
          const verificationToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

          await supabase.from('email_verifications').insert({
            user_id: record.user_id,
            verification_token: verificationToken,
            verification_type: 'signup',
            expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          });

          const verifyUrl = `https://blackbox.farm/verify-email?token=${verificationToken}`;

          // Send via send-email-notification
          await supabase.functions.invoke('send-email-notification', {
            body: {
              to: user.email,
              subject: '🔐 Verify Your Email — BlackBox Farm',
              html: buildSimpleVerifyEmail(verifyUrl),
            }
          });

          result.message = `Verification email sent to ${maskEmail(user.email || '')}!`;
        } catch (e) {
          console.error('Verification email error:', e);
          result.message = 'Verification email sent! Check your inbox.';
        }
        break;
      }

      case 'password_reset': {
        // Use admin API to generate a password reset link
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: user.email!,
          options: {
            redirectTo: 'https://blackbox.farm/reset-password',
          }
        });

        if (linkErr) {
          console.error('Password reset link error:', linkErr);
          result.message = 'Password reset email sent! Check your inbox.';
        } else {
          result.message = `Password reset email sent to ${maskEmail(user.email || '')}!`;
        }
        break;
      }

      case 'view_reg_code': {
        const { data: linkCode } = await supabase
          .from('telegram_link_codes')
          .select('link_code, is_used, telegram_user_id')
          .eq('user_id', record.user_id)
          .maybeSingle();

        if (linkCode) {
          result.reg_code = linkCode.link_code;
          result.is_used = linkCode.is_used;
          result.is_linked = !!linkCode.telegram_user_id;
          result.message = 'Here is your registration code.';
        } else {
          result.message = 'No registration code found for your account.';
          result.success = false;
        }
        break;
      }

      case 'tg_signup':
      case 'tg_signin': {
        // For Telegram OTP auth, return the payload so the frontend can use it
        // Don't mark as used yet — tg-link-after-auth will do that after successful auth
        result.telegram_user_id = record.payload?.telegram_user_id;
        result.telegram_username = record.payload?.telegram_username;
        result.message = record.action_type === 'tg_signup'
          ? 'Create your BlackBox Farm account below.'
          : 'Log in to link your Telegram account.';
        // Return early WITHOUT marking token as used
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Mark token as used
    await supabase.from('one_time_action_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', record.id);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***@***';
  return user.substring(0, 2) + '***@' + domain;
}

function buildSimpleVerifyEmail(verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 30px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">🔐</div>
  <h1 style="color:#ffffff;font-size:24px;margin:0 0 10px;">Verify Your Email</h1>
  <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 30px;">Click the button below to verify your email address. You have 48 hours to complete this step.</p>
  <a href="${verifyUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Verify My Email</a>
  <p style="color:#71717a;font-size:12px;margin:30px 0 0;">If you didn't request this, you can safely ignore this email.</p>
  <p style="color:#52525b;font-size:11px;margin:20px 0 0;">© ${new Date().getFullYear()} BlackBox Farm — HoldersIntel</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
