import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (!await isFunctionEnabled('sol-renewal-reminder')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Find SOL subscriptions expiring within 14 days that haven't been reminded
    const now = new Date();
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const { data: expiringSubs } = await supabase
      .from('tg_sol_subscriptions')
      .select('id, telegram_user_id, user_id, amount_sol, expires_at, renewal_reminder_sent')
      .eq('status', 'paid')
      .lte('expires_at', twoWeeksOut.toISOString())
      .gte('expires_at', now.toISOString())
      .or('renewal_reminder_sent.is.null,renewal_reminder_sent.eq.false');

    const subs = expiringSubs || [];
    let sent = 0;

    for (const sub of subs) {
      const expiryDate = new Date(sub.expires_at!).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      const daysLeft = Math.ceil((new Date(sub.expires_at!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Send TG message reminder
      try {
        const BOT_TOKEN = Deno.env.get('HOLDERSINTEL_BOT_TOKEN') || Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (BOT_TOKEN) {
          // We need the chat_id - for DM bots the chat_id equals the telegram_user_id
          const chatId = sub.telegram_user_id;
          const message =
            `⏰ *Subscription Renewal Reminder*\n\n` +
            `Your *Pro* subscription expires on *${expiryDate}* (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left).\n\n` +
            `🔄 To renew, simply use /payment again and you'll get another full year of Pro access.\n\n` +
            `💰 Same great deal: *1 SOL/yr* (~$84) — cheaper than the Stripe yearly rate.\n\n` +
            `Don't lose your Pro commands & highest rate limits!`;

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: 'Markdown',
            }),
          });
        }
      } catch (tgErr) {
        console.warn(`[sol-renewal] TG reminder failed for ${sub.telegram_user_id}:`, tgErr);
      }

      // Also send email if user has linked account
      if (sub.user_id) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', sub.user_id)
            .maybeSingle();

          const { data: authUser } = await supabase.auth.admin.getUserById(sub.user_id);
          const email = authUser?.user?.email;

          if (email) {
            await fetch(`${SUPABASE_URL}/functions/v1/subscriber-welcome`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              },
              body: JSON.stringify({
                emailType: 'sol_renewal_reminder',
                email,
                name: profile?.display_name,
                expiresAt: sub.expires_at,
                daysLeft,
                amountSol: sub.amount_sol,
              }),
            });
          }
        } catch (emailErr) {
          console.warn(`[sol-renewal] Email reminder failed for ${sub.user_id}:`, emailErr);
        }
      }

      // Mark as reminded
      await supabase
        .from('tg_sol_subscriptions')
        .update({ renewal_reminder_sent: true })
        .eq('id', sub.id);

      sent++;
    }

    console.log(`[sol-renewal] Sent ${sent} renewal reminders out of ${subs.length} expiring subs`);

    return new Response(JSON.stringify({ sent, total: subs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[sol-renewal] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
