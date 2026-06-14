// coverage-milestone-notifier
// Every run: compute current Dev Wallet % and KYC Traced % across the
// master_token_directory, compare to the last-notified integer % stored in
// coverage_milestone_state, and SMS the admin for each new whole-percent
// milestone crossed. Self-throttling: never sends the same % twice.
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertUpsert, assertInsert } from '../_shared/db-assert.ts';

const ADMIN_PHONE = '+12265835975';
const TWILIO_FROM = '+16624814161';

async function sendSms(body: string): Promise<{ ok: boolean; status?: number; err?: string }> {
  if (Deno.env.get('SMS_GLOBAL_KILL') !== 'false') {
    console.warn('[SMS KILL] coverage-milestone-notifier SMS suppressed');
    return { ok: false, err: 'SMS_GLOBAL_KILL active' };
  }
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = TWILIO_FROM;
  if (!sid || !token) return { ok: false, err: 'missing twilio creds' };
  try {
    const auth = btoa(`${sid}:${token}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: ADMIN_PHONE, From: from, Body: body.slice(0, 1500) }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn('[notifier-sms] twilio error', res.status, t.slice(0, 200));
      return { ok: false, status: res.status, err: t.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, err: (e as Error).message };
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('coverage-milestone-notifier', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let force = false;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch { /* no body, fine */ }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const [totalRes, devRes, kycRes] = await Promise.all([
    supabase.from('master_token_directory').select('token_mint', { count: 'exact', head: true }),
    supabase.from('master_token_directory').select('token_mint', { count: 'exact', head: true }).not('creator_wallet', 'is', null),
    supabase.from('master_token_directory').select('token_mint', { count: 'exact', head: true }).eq('kyc_verified', true),
  ]);

  const total = totalRes.count ?? 0;
  const dev = devRes.count ?? 0;
  const kyc = kycRes.count ?? 0;

  if (total === 0) {
    return new Response(JSON.stringify({ ok: true, message: 'no tokens yet' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const devPct = Math.floor((dev / total) * 100);
  const kycPct = Math.floor((kyc / total) * 100);

  const { data: stateRows } = await supabase
    .from('coverage_milestone_state')
    .select('metric_key, last_pct');

  const stateMap = new Map<string, number>();
  for (const r of stateRows ?? []) stateMap.set(r.metric_key, r.last_pct);

  const sent: any[] = [];

  async function checkAndNotify(key: string, label: string, current: number, count: number) {
    const last = stateMap.get(key) ?? -1;
    if (!force && current <= last) return;
    const prefix = force && current <= last ? '🔄 (re-send) ' : '';
    const msg = `${prefix}📊 ${current}% ${label}\n\n${count.toLocaleString()} / ${total.toLocaleString()} tokens.${current >= 100 ? '\n\n✅ COMPLETE.' : ''}`;
    const r = await sendSms(msg);
    if (r.ok) {
      await assertUpsert(supabase.from('coverage_milestone_state').upsert({
        metric_key: key,
        last_pct: current,
        last_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'metric_key' }), 'coverage_milestone_state');
      sent.push({ key, pct: current });
    } else {
      sent.push({ key, pct: current, failed: r.err, status: r.status });
    }
    await assertInsert(supabase.from('coverage_milestone_sms_log').insert({
      metric_key: key,
      pct: current,
      count_at_send: count,
      total_at_send: total,
      body: msg,
      to_phone: ADMIN_PHONE,
      status: r.ok ? 'sent' : 'failed',
      error: r.ok ? null : (r.err ?? null),
    }), 'coverage_milestone_sms_log');
  }

  await checkAndNotify('dev_wallet', 'Dev Wallets Discovered', devPct, dev);
  await checkAndNotify('kyc_traced', 'KYC Traced', kycPct, kyc);

  return new Response(JSON.stringify({
    ok: true, total, dev, kyc, devPct, kycPct, sent,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));