// One-shot backfill: seed profile_bot_contacts from existing
// profile_subscriptions, referral_codes, and referral_attributions.
// Safe to re-run (idempotent upserts).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const summary = { from_subs: 0, from_codes: 0, from_attrs: 0, errors: [] as string[] };

  // 1) Subscriptions → contacts (definitely paid users)
  const { data: subs, error: subsErr } = await supabase
    .from('profile_subscriptions')
    .select('profile_key, telegram_user_id, telegram_username, tier_months, quoted_sol, status, paid_at, expires_at')
    .eq('status', 'paid');
  if (subsErr) summary.errors.push(`subs: ${subsErr.message}`);

  // Aggregate per (profile, user)
  const aggSubs = new Map<string, any>();
  for (const s of subs ?? []) {
    const k = `${s.profile_key}|${s.telegram_user_id}`;
    const cur = aggSubs.get(k) ?? {
      profile_key: s.profile_key,
      telegram_user_id: s.telegram_user_id,
      telegram_username: s.telegram_username ?? null,
      total_subscriptions: 0,
      total_months_paid: 0,
      total_sol_paid: 0,
      first_paid_at: s.paid_at,
      last_paid_at: s.paid_at,
      current_expires_at: s.expires_at,
    };
    cur.total_subscriptions++;
    cur.total_months_paid += Number(s.tier_months ?? 0);
    cur.total_sol_paid += Number(s.quoted_sol ?? 0);
    if (s.paid_at && (!cur.first_paid_at || s.paid_at < cur.first_paid_at)) cur.first_paid_at = s.paid_at;
    if (s.paid_at && (!cur.last_paid_at || s.paid_at > cur.last_paid_at)) cur.last_paid_at = s.paid_at;
    if (s.expires_at && (!cur.current_expires_at || s.expires_at > cur.current_expires_at)) cur.current_expires_at = s.expires_at;
    aggSubs.set(k, cur);
  }

  for (const v of aggSubs.values()) {
    const isPaid = !!(v.current_expires_at && new Date(v.current_expires_at) > new Date());
    const { data: existing } = await supabase
      .from('profile_bot_contacts')
      .select('id')
      .eq('profile_key', v.profile_key)
      .eq('telegram_user_id', v.telegram_user_id)
      .maybeSingle();
    const patch = {
      profile_key: v.profile_key,
      telegram_user_id: v.telegram_user_id,
      telegram_username: v.telegram_username,
      acquisition_source: 'unknown',
      ever_paid: true,
      is_currently_paid: isPaid,
      total_subscriptions: v.total_subscriptions,
      total_months_paid: v.total_months_paid,
      total_sol_paid: v.total_sol_paid,
      first_paid_at: v.first_paid_at,
      last_paid_at: v.last_paid_at,
      current_expires_at: v.current_expires_at,
    };
    if (existing) {
      await supabase.from('profile_bot_contacts').update(patch).eq('id', existing.id);
    } else {
      await supabase.from('profile_bot_contacts').insert(patch);
    }
    summary.from_subs++;
  }

  // 2) Referral codes → contacts (referrers)
  const { data: codes } = await supabase
    .from('referral_codes')
    .select('profile_key, telegram_user_id, code, status');
  for (const c of codes ?? []) {
    const { data: existing } = await supabase
      .from('profile_bot_contacts')
      .select('id')
      .eq('profile_key', c.profile_key)
      .eq('telegram_user_id', c.telegram_user_id)
      .maybeSingle();
    const patch = {
      has_referral_code: true,
      referral_code: c.code,
      referral_code_status: c.status,
    };
    if (existing) {
      await supabase.from('profile_bot_contacts').update(patch).eq('id', existing.id);
    } else {
      await supabase.from('profile_bot_contacts').insert({
        profile_key: c.profile_key,
        telegram_user_id: c.telegram_user_id,
        acquisition_source: 'unknown',
        ...patch,
      });
    }
    summary.from_codes++;
  }

  // 3) Attributions → seed referred users + count referrer stats
  const { data: attrs } = await supabase
    .from('referral_attributions')
    .select('profile_key, referrer_telegram_user_id, referred_telegram_user_id, referrer_code, status');
  const refrCounts = new Map<string, { att: number; conv: number; pend: number }>();
  for (const a of attrs ?? []) {
    const k = `${a.profile_key}|${a.referrer_telegram_user_id}`;
    const cur = refrCounts.get(k) ?? { att: 0, conv: 0, pend: 0 };
    cur.att++;
    if (a.status === 'converted') cur.conv++;
    if (a.status === 'pending') cur.pend++;
    refrCounts.set(k, cur);

    // Seed referred user as a contact
    const { data: existing } = await supabase
      .from('profile_bot_contacts')
      .select('id, first_referrer_code, first_referrer_tg_id')
      .eq('profile_key', a.profile_key)
      .eq('telegram_user_id', a.referred_telegram_user_id)
      .maybeSingle();
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (!existing.first_referrer_code) patch.first_referrer_code = a.referrer_code;
      if (!existing.first_referrer_tg_id) patch.first_referrer_tg_id = a.referrer_telegram_user_id;
      if (Object.keys(patch).length) await supabase.from('profile_bot_contacts').update(patch).eq('id', existing.id);
    } else {
      await supabase.from('profile_bot_contacts').insert({
        profile_key: a.profile_key,
        telegram_user_id: a.referred_telegram_user_id,
        acquisition_source: 'referral',
        first_referrer_code: a.referrer_code,
        first_referrer_tg_id: a.referrer_telegram_user_id,
        last_referrer_code: a.referrer_code,
      });
    }
    summary.from_attrs++;
  }

  // Apply aggregated referrer counts
  for (const [k, v] of refrCounts.entries()) {
    const [profile_key, tgIdStr] = k.split('|');
    await supabase.from('profile_bot_contacts').update({
      referrals_attributed: v.att,
      referrals_converted: v.conv,
      referrals_pending: v.pend,
    }).eq('profile_key', profile_key).eq('telegram_user_id', Number(tgIdStr));
  }

  // Referral credits → sum months earned per referrer
  const { data: credits } = await supabase
    .from('referral_credits')
    .select('profile_key, referrer_telegram_user_id, months_granted');
  const monthsByRef = new Map<string, number>();
  for (const c of credits ?? []) {
    const k = `${c.profile_key}|${c.referrer_telegram_user_id}`;
    monthsByRef.set(k, (monthsByRef.get(k) ?? 0) + Number(c.months_granted ?? 0));
  }
  for (const [k, months] of monthsByRef.entries()) {
    const [profile_key, tgIdStr] = k.split('|');
    await supabase.from('profile_bot_contacts').update({
      referral_months_earned: months,
    }).eq('profile_key', profile_key).eq('telegram_user_id', Number(tgIdStr));
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});