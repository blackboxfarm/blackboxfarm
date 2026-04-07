import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = 'https://blackbox.farm';

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Process pending reactivation emails
    const { data: pending, error: pendingErr } = await supabase
      .from('pending_reactivation_emails')
      .select('*')
      .eq('processed', false)
      .limit(10);

    if (pendingErr) {
      console.error('Failed to fetch pending emails:', pendingErr);
      return new Response(JSON.stringify({ error: pendingErr.message }), { status: 500 });
    }

    let reactivationsSent = 0;
    for (const row of (pending || [])) {
      const verifyUrl = `${SITE_URL}/verify-email?token=${row.reactivation_token}`;
      const html = buildReactivationEmail(verifyUrl, row.email);

      try {
        await supabase.functions.invoke('send-email-notification', {
          body: {
            to: row.email,
            subject: '🔓 Reactivate Your BlackBox Farm Account',
            html,
          }
        });

        await supabase
          .from('pending_reactivation_emails')
          .update({ processed: true })
          .eq('id', row.id);

        // Track the email
        await supabase.from('email_tracking_events').insert({
          user_id: row.user_id,
          email_type: 'verification_reactivation',
          recipient_email: row.email,
          subject_line: '🔓 Reactivate Your BlackBox Farm Account',
        });

        reactivationsSent++;
        console.log(`Reactivation email sent to ${row.email}`);
      } catch (err) {
        console.error(`Failed to send reactivation email to ${row.email}:`, err);
      }
    }

    // 2. Send 24-hour reminder emails
    let remindersSent = 0;
    const { data: reminders, error: reminderErr } = await supabase.rpc('get_24h_unverified_users');

    if (reminderErr) {
      console.error('Failed to get 24h unverified users:', reminderErr);
    } else {
      for (const user of (reminders || [])) {
        const verifyUrl = `${SITE_URL}/verify-email?token=${user.signup_token}`;
        const html = buildReminderEmail(verifyUrl, user.email);

        try {
          await supabase.functions.invoke('send-email-notification', {
            body: {
              to: user.email,
              subject: '⏰ Reminder: Verify Your Email — 24 Hours Left',
              html,
            }
          });

          // Track the reminder
          await supabase.from('email_tracking_events').insert({
            user_id: user.user_id,
            email_type: 'verification_reminder',
            recipient_email: user.email,
            subject_line: '⏰ Reminder: Verify Your Email — 24 Hours Left',
          });

          remindersSent++;
          console.log(`24h reminder sent to ${user.email}`);
        } catch (err) {
          console.error(`Failed to send reminder to ${user.email}:`, err);
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      reactivations_sent: reactivationsSent,
      reminders_sent: remindersSent,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('process-reactivation-emails error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

function buildReactivationEmail(verifyUrl: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 30px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">🔓</div>
  <h1 style="color:#ffffff;font-size:24px;margin:0 0 10px;">Reactivate Your Account</h1>
  <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 30px;">
    Your BlackBox Farm account was suspended because your email wasn't verified within 48 hours. 
    No worries — click the button below to reactivate instantly!
  </p>
  <a href="${verifyUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Reactivate My Account</a>
  <p style="color:#71717a;font-size:12px;margin:30px 0 0;">This link is valid for 30 days.</p>
  <p style="color:#52525b;font-size:11px;margin:20px 0 0;">© ${new Date().getFullYear()} BlackBox Farm — HoldersIntel</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildReminderEmail(verifyUrl: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 30px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">⏰</div>
  <h1 style="color:#ffffff;font-size:24px;margin:0 0 10px;">Verify Your Email — 24 Hours Left</h1>
  <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 30px;">
    Hey! Just a friendly reminder — you have about 24 hours left to verify your email address. 
    After that, your account will be temporarily suspended. Click below to verify now!
  </p>
  <a href="${verifyUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Verify My Email</a>
  <p style="color:#71717a;font-size:12px;margin:30px 0 0;">If you've already verified, you can safely ignore this.</p>
  <p style="color:#52525b;font-size:11px;margin:20px 0 0;">© ${new Date().getFullYear()} BlackBox Farm — HoldersIntel</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
