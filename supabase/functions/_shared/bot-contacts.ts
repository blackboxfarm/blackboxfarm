// Per-profile-bot CRM helpers. Upserts contact rows + logs timeline events
// from the subscription bot webhook, poll, and affiliate tick.
import { getSupabaseAdmin } from './profile-subscription.ts';

export type ContactEvent =
  | 'first_dm'
  | 'command'
  | 'ref_link_tapped'
  | 'quote_issued'
  | 'paid'
  | 'renewed'
  | 'referred_friend_paid'
  | 'broadcast_sent'
  | 'opted_out'
  | 'opted_in';

interface TgUser {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  language_code?: string | null;
}

export async function logContactEvent(
  profileKey: string,
  telegramUserId: number,
  event_type: ContactEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('profile_bot_contact_events').insert({
    profile_key: profileKey,
    telegram_user_id: telegramUserId,
    event_type,
    payload,
  });
}

/**
 * Upsert a contact on every inbound DM/callback. Returns true if this was
 * the FIRST time we've ever seen this user on this profile.
 */
export async function touchContact(
  profileKey: string,
  user: TgUser,
  opts: { referralCode?: string | null; utm?: string | null } = {},
): Promise<{ isNew: boolean; row: any }> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('profile_bot_contacts')
    .select('*')
    .eq('profile_key', profileKey)
    .eq('telegram_user_id', user.id)
    .maybeSingle();

  if (!existing) {
    const acquisition_source = opts.referralCode ? 'referral' : 'organic';
    const { data: inserted } = await supabase
      .from('profile_bot_contacts')
      .insert({
        profile_key: profileKey,
        telegram_user_id: user.id,
        telegram_username: user.username ?? null,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        language_code: user.language_code ?? null,
        first_seen_at: now,
        last_seen_at: now,
        total_dms: 1,
        acquisition_source,
        first_referrer_code: opts.referralCode ?? null,
        last_referrer_code: opts.referralCode ?? null,
        utm_payload: opts.utm ?? null,
      })
      .select()
      .single();
    await logContactEvent(profileKey, user.id, 'first_dm', {
      source: acquisition_source,
      ref: opts.referralCode ?? null,
    });
    return { isNew: true, row: inserted };
  }

  const patch: Record<string, unknown> = {
    last_seen_at: now,
    total_dms: (existing.total_dms ?? 0) + 1,
    telegram_username: user.username ?? existing.telegram_username,
    first_name: user.first_name ?? existing.first_name,
    last_name: user.last_name ?? existing.last_name,
    language_code: user.language_code ?? existing.language_code,
  };
  if (opts.referralCode) {
    patch.last_referrer_code = opts.referralCode;
    if (!existing.first_referrer_code) patch.first_referrer_code = opts.referralCode;
  }
  if (opts.utm && !existing.utm_payload) patch.utm_payload = opts.utm;

  const { data: updated } = await supabase
    .from('profile_bot_contacts')
    .update(patch)
    .eq('id', existing.id)
    .select()
    .single();
  return { isNew: false, row: updated };
}

/** Stamp the referrer's telegram id on a contact once attribution succeeds. */
export async function setFirstReferrerTgId(
  profileKey: string,
  telegramUserId: number,
  referrerTgId: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('profile_bot_contacts')
    .update({ first_referrer_tg_id: referrerTgId })
    .eq('profile_key', profileKey)
    .eq('telegram_user_id', telegramUserId)
    .is('first_referrer_tg_id', null);
}

/** Apply a "paid" rollup to the subscriber's contact row. */
export async function recordPaid(
  profileKey: string,
  telegramUserId: number,
  args: { tier_months: number; sol_paid: number; expires_at: string; sub_id: string },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from('profile_bot_contacts')
    .select('id,ever_paid,first_paid_at,total_subscriptions,total_months_paid,total_sol_paid')
    .eq('profile_key', profileKey)
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  const now = new Date().toISOString();
  if (!existing) {
    // Edge case: paid event with no prior DM record (e.g. backfill / external). Seed it.
    await supabase.from('profile_bot_contacts').insert({
      profile_key: profileKey,
      telegram_user_id: telegramUserId,
      acquisition_source: 'unknown',
      ever_paid: true,
      is_currently_paid: true,
      total_subscriptions: 1,
      total_months_paid: args.tier_months,
      total_sol_paid: args.sol_paid,
      first_paid_at: now,
      last_paid_at: now,
      current_expires_at: args.expires_at,
    });
  } else {
    await supabase
      .from('profile_bot_contacts')
      .update({
        ever_paid: true,
        is_currently_paid: true,
        total_subscriptions: (existing.total_subscriptions ?? 0) + 1,
        total_months_paid: (existing.total_months_paid ?? 0) + args.tier_months,
        total_sol_paid: Number(existing.total_sol_paid ?? 0) + Number(args.sol_paid ?? 0),
        first_paid_at: existing.first_paid_at ?? now,
        last_paid_at: now,
        current_expires_at: args.expires_at,
      })
      .eq('id', existing.id);
  }
  await logContactEvent(profileKey, telegramUserId, existing?.ever_paid ? 'renewed' : 'paid', {
    sub_id: args.sub_id,
    months: args.tier_months,
    sol: args.sol_paid,
    expires_at: args.expires_at,
  });
}

/** Bump a referrer's contact when their friend converted. */
export async function recordReferralConversion(
  profileKey: string,
  referrerTgId: number,
  args: { months_granted: number; referred_tg_id: number; new_expires_at: string },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from('profile_bot_contacts')
    .select('id,referrals_converted,referral_months_earned')
    .eq('profile_key', profileKey)
    .eq('telegram_user_id', referrerTgId)
    .maybeSingle();
  if (existing) {
    await supabase
      .from('profile_bot_contacts')
      .update({
        referrals_converted: (existing.referrals_converted ?? 0) + 1,
        referral_months_earned: (existing.referral_months_earned ?? 0) + args.months_granted,
      })
      .eq('id', existing.id);
  }
  await logContactEvent(profileKey, referrerTgId, 'referred_friend_paid', args);
}