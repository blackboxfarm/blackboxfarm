import { withRunLog } from '../_shared/run-logger.ts';
import {
  getSupabaseAdmin,
  tgSendDM,
  tgKickFromChannel,
} from '../_shared/profile-subscription.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Kind = 't_3d' | 't_24h' | 't_3h' | 'expired';

async function alreadySent(supabase: any, subId: string, kind: Kind): Promise<boolean> {
  const { data } = await supabase
    .from('subscription_reminder_log')
    .select('subscription_id')
    .eq('subscription_id', subId)
    .eq('kind', kind)
    .maybeSingle();
  return !!data;
}

async function markSent(supabase: any, subId: string, kind: Kind) {
  await supabase.from('subscription_reminder_log').upsert({
    subscription_id: subId, kind, sent_at: new Date().toISOString(),
  }, { onConflict: 'subscription_id,kind' });
}

Deno.serve(withRunLog('profile-subscription-renewal-tick', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = getSupabaseAdmin();
  const now = Date.now();

  const { data: paid, error } = await supabase
    .from('profile_subscriptions')
    .select('*')
    .eq('status', 'paid')
    .not('expires_at', 'is', null);
  if (error) throw error;

  let nudges = 0, kicks = 0;

  for (const sub of paid ?? []) {
    const exp = new Date(sub.expires_at).getTime();
    const dt = exp - now; // ms until expiry

    // Reminder windows
    const windows: Array<{ kind: Kind; lo: number; hi: number; label: string }> = [
      { kind: 't_3d', lo: 2.9 * 24 * 3600e3, hi: 3.1 * 24 * 3600e3, label: '3 days' },
      { kind: 't_24h', lo: 23 * 3600e3, hi: 25 * 3600e3, label: '24 hours' },
      { kind: 't_3h', lo: 2.9 * 3600e3, hi: 3.1 * 3600e3, label: '3 hours' },
    ];
    for (const w of windows) {
      if (dt >= w.lo && dt <= w.hi) {
        if (await alreadySent(supabase, sub.id, w.kind)) continue;
        try {
          await tgSendDM(sub.profile_key, sub.telegram_user_id,
            `⏰ <b>Renewal heads-up</b>\n` +
            `Your subscription expires in <b>~${w.label}</b>.\n` +
            `Send <code>/renew</code> any time to keep your access live.`);
          await markSent(supabase, sub.id, w.kind);
          nudges++;
        } catch (e) { console.warn('[renewal-tick] nudge failed', e); }
      }
    }

    // Expiry kick
    if (dt < 0) {
      if (await alreadySent(supabase, sub.id, 'expired')) continue;
      try {
        const { data: cfg } = await supabase
          .from('profile_subscription_configs')
          .select('private_chat_id, expiry_copy')
          .eq('profile_key', sub.profile_key)
          .maybeSingle();
        if (cfg?.private_chat_id) {
          await tgKickFromChannel(sub.profile_key, cfg.private_chat_id, sub.telegram_user_id);
        }
        await supabase.from('profile_subscriptions').update({ status: 'expired' }).eq('id', sub.id);
        await tgSendDM(sub.profile_key, sub.telegram_user_id,
          `⌛ Your subscription has expired.\n` +
          (cfg?.expiry_copy ? `${cfg.expiry_copy}\n\n` : '') +
          `Send <code>/renew</code> to get back in.`);
        await markSent(supabase, sub.id, 'expired');
        kicks++;
      } catch (e) { console.warn('[renewal-tick] kick failed', e); }
    }
  }

  return new Response(JSON.stringify({ ok: true, nudges, kicks, scanned: paid?.length ?? 0 }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));