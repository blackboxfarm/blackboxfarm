import { withRunLog } from '../_shared/run-logger.ts';
import { assertUpdate, assertInsert } from '../_shared/db-assert.ts';
import {
  getSupabaseAdmin,
  getBalanceLamports,
  tgSendDM,
  tgCreateInviteLink,
  getProfileBotToken,
  tgCall,
  LAMPORTS_PER_SOL,
} from '../_shared/profile-subscription.ts';
import { ensureReferralCode, findLiveSubscription, buildFooter } from '../_shared/affiliate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

Deno.serve(withRunLog('profile-subscription-poll', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = getSupabaseAdmin();

  // 1) Expire stale pendings
  await supabase
    .from('profile_subscriptions')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .lt('quote_window_expires_at', new Date().toISOString());

  // 2) Active pending subscriptions
  const { data: pendings, error } = await supabase
    .from('profile_subscriptions')
    .select('*')
    .eq('status', 'pending')
    .gt('quote_window_expires_at', new Date().toISOString())
    .limit(50);
  if (error) throw error;

  let confirmed = 0;
  for (const sub of pendings ?? []) {
    try {
      const balance = await getBalanceLamports(sub.payment_wallet_pubkey);
      const requiredLamports = Math.floor(Number(sub.quoted_sol) * LAMPORTS_PER_SOL * 0.99); // 1% tolerance
      if (balance < requiredLamports) continue;

      // Load config for channel
      const { data: config } = await supabase
        .from('profile_subscription_configs')
        .select('*')
        .eq('profile_key', sub.profile_key)
        .maybeSingle();

      const paidAt = new Date();
      const expiresAt = addMonths(paidAt, sub.tier_months);

      let inviteLink: string | null = null;
      if (config?.private_chat_id) {
        try {
          inviteLink = await tgCreateInviteLink(sub.profile_key, config.private_chat_id);
        } catch (e) {
          console.warn('[poll] invite link failed', e);
        }
      }

      await assertUpdate(
        supabase.from('profile_subscriptions').update({
          status: 'paid',
          paid_at: paidAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          invite_link: inviteLink,
        }).eq('id', sub.id).select().single(),
        'profile_subscriptions',
      );
      confirmed++;

      // ===== Affiliate: ensure code for this newly-paid user =====
      let newUserRefCode: string | null = null;
      try {
        newUserRefCode = await ensureReferralCode(sub.profile_key, sub.telegram_user_id);
      } catch (e) { console.warn('[poll] ensureReferralCode failed', e); }

      // ===== Affiliate: apply pending attribution credit to referrer =====
      try {
        const months = Number(config?.affiliate_months_per_referral ?? 1);
        const enabled = config?.affiliate_enabled !== false;
        if (enabled && months > 0) {
          const { data: attr } = await supabase
            .from('referral_attributions')
            .select('*')
            .eq('profile_key', sub.profile_key)
            .eq('referred_telegram_user_id', sub.telegram_user_id)
            .eq('status', 'pending')
            .maybeSingle();
          if (attr) {
            // Was this user previously paid on this profile? If yes, reject.
            const { count: priorPaid } = await supabase
              .from('profile_subscriptions')
              .select('id', { count: 'exact', head: true })
              .eq('profile_key', sub.profile_key)
              .eq('telegram_user_id', sub.telegram_user_id)
              .eq('status', 'paid')
              .neq('id', sub.id);
            // referrer code must still be active
            const { data: refCode } = await supabase
              .from('referral_codes')
              .select('status').eq('profile_key', sub.profile_key)
              .eq('telegram_user_id', attr.referrer_telegram_user_id).maybeSingle();
            if ((priorPaid ?? 0) > 0) {
              await supabase.from('referral_attributions').update({
                status: 'rejected', rejection_reason: 'existing_customer',
              }).eq('id', attr.id);
            } else if (!refCode || refCode.status !== 'active') {
              await supabase.from('referral_attributions').update({
                status: 'rejected', rejection_reason: 'referrer_inactive',
              }).eq('id', attr.id);
            } else {
              // Extend the referrer's live subscription by `months`
              const refSub = await findLiveSubscription(sub.profile_key, attr.referrer_telegram_user_id);
              if (refSub) {
                const newExp = addMonths(new Date(refSub.expires_at), months);
                await supabase.from('profile_subscriptions')
                  .update({ expires_at: newExp.toISOString() })
                  .eq('id', refSub.id);
                await supabase.from('referral_credits').insert({
                  profile_key: sub.profile_key,
                  referrer_telegram_user_id: attr.referrer_telegram_user_id,
                  attribution_id: attr.id,
                  months_granted: months,
                  applied_to_subscription_id: refSub.id,
                  new_expires_at: newExp.toISOString(),
                });
                await supabase.from('referral_attributions').update({
                  status: 'converted', converted_at: new Date().toISOString(),
                  subscription_id: sub.id,
                }).eq('id', attr.id);
                // DM the referrer
                try {
                  const handle = sub.telegram_username ? `@${sub.telegram_username}` : 'a new member';
                  await tgSendDM(sub.profile_key, attr.referrer_telegram_user_id,
                    `🎉 <b>+${months} month${months > 1 ? 's' : ''} added!</b>\n${handle} just subscribed using your referral link.\nNew expiry: <b>${newExp.toUTCString()}</b>`);
                } catch (e) { console.warn('[poll] referrer DM failed', e); }
              }
            }
          }
        }
      } catch (e) { console.warn('[poll] affiliate credit pipeline failed', e); }

      // DM the subscriber
      const msg =
        `✅ <b>Payment received — ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL</b>\n` +
        `Your subscription is active until <b>${expiresAt.toUTCString()}</b>.\n\n` +
        (inviteLink ? `🔓 Join here: ${inviteLink}\n` : '');
      const receiptFooter = await buildFooter(sub.profile_key, sub.telegram_user_id, null).catch(() => '');
      try { await tgSendDM(sub.profile_key, sub.telegram_user_id, msg + receiptFooter); } catch (e) { console.warn('[poll] DM failed', e); }

      // VIP "you're in" welcome — separate DM so it feels like a moment, not a receipt addendum.
      if (config?.paid_welcome_copy) {
        try {
          const token = await getProfileBotToken(sub.profile_key);
          if (token) {
            if (config?.paid_welcome_image_url) {
              try {
                await tgCall(token, 'sendPhoto', {
                  chat_id: sub.telegram_user_id,
                  photo: config.paid_welcome_image_url,
                });
              } catch { /* non-fatal */ }
            }
            let body = String(config.paid_welcome_copy).replace(/\{expires_at\}/g, expiresAt.toUTCString());
            const vipFooter = await buildFooter(sub.profile_key, sub.telegram_user_id, null).catch(() => '');
            body += vipFooter;
            await tgCall(token, 'sendMessage', {
              chat_id: sub.telegram_user_id,
              text: body,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            });
          }
        } catch (e) { console.warn('[poll] VIP welcome DM failed', e); }
      }

      // welcome log
      await supabase.from('subscription_reminder_log').upsert({
        subscription_id: sub.id, kind: 'welcome', sent_at: new Date().toISOString(),
      }, { onConflict: 'subscription_id,kind' });
    } catch (e) {
      console.error(`[poll] sub ${sub.id} error`, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: pendings?.length ?? 0, confirmed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));