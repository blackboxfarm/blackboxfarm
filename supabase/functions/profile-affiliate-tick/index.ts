// Hourly: recompute referral_code active/inactive status based on each referrer's live expiry,
// and expire pending attributions older than the configured window.
import { withRunLog } from '../_shared/run-logger.ts';
import { getSupabaseAdmin } from '../_shared/profile-subscription.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('profile-affiliate-tick', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  let activated = 0, deactivated = 0, expired = 0;

  const { data: codes } = await supabase
    .from('referral_codes')
    .select('id,profile_key,telegram_user_id,status');

  for (const c of codes ?? []) {
    const { data: live } = await supabase
      .from('profile_subscriptions')
      .select('expires_at')
      .eq('profile_key', c.profile_key)
      .eq('telegram_user_id', c.telegram_user_id)
      .eq('status', 'paid')
      .gt('expires_at', now)
      .limit(1).maybeSingle();
    const shouldBeActive = !!live;
    if (shouldBeActive && c.status !== 'active') {
      await supabase.from('referral_codes').update({
        status: 'active', last_activated_at: now,
      }).eq('id', c.id);
      activated++;
    } else if (!shouldBeActive && c.status === 'active') {
      await supabase.from('referral_codes').update({
        status: 'inactive', last_deactivated_at: now,
      }).eq('id', c.id);
      deactivated++;
    }
  }

  // Expire pendings per-profile based on configured window
  const { data: cfgs } = await supabase
    .from('profile_subscription_configs')
    .select('profile_key,affiliate_pending_window_days');
  for (const cfg of cfgs ?? []) {
    const days = Number(cfg.affiliate_pending_window_days ?? 7);
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    const { data: exp } = await supabase
      .from('referral_attributions')
      .update({ status: 'expired' })
      .eq('profile_key', cfg.profile_key)
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .select('id');
    expired += exp?.length ?? 0;
  }

  // ===== CRM rollup recomputation =====
  let contacts_synced = 0;
  const { data: contacts } = await supabase
    .from('profile_bot_contacts')
    .select('id, profile_key, telegram_user_id, current_expires_at');
  for (const c of contacts ?? []) {
    const isPaid = !!(c.current_expires_at && new Date(c.current_expires_at) > new Date());
    const { data: code } = await supabase
      .from('referral_codes')
      .select('code, status')
      .eq('profile_key', c.profile_key)
      .eq('telegram_user_id', c.telegram_user_id)
      .maybeSingle();
    const { count: attrTotal } = await supabase
      .from('referral_attributions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_key', c.profile_key)
      .eq('referrer_telegram_user_id', c.telegram_user_id);
    const { count: attrPending } = await supabase
      .from('referral_attributions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_key', c.profile_key)
      .eq('referrer_telegram_user_id', c.telegram_user_id)
      .eq('status', 'pending');
    const { count: attrConverted } = await supabase
      .from('referral_attributions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_key', c.profile_key)
      .eq('referrer_telegram_user_id', c.telegram_user_id)
      .eq('status', 'converted');
    await supabase.from('profile_bot_contacts').update({
      is_currently_paid: isPaid,
      has_referral_code: !!code,
      referral_code: code?.code ?? null,
      referral_code_status: code?.status ?? null,
      referrals_attributed: attrTotal ?? 0,
      referrals_pending: attrPending ?? 0,
      referrals_converted: attrConverted ?? 0,
    }).eq('id', c.id);
    contacts_synced++;
  }

  return new Response(JSON.stringify({ ok: true, activated, deactivated, expired, contacts_synced }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));