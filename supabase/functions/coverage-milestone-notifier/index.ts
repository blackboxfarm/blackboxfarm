// coverage-milestone-notifier
// Every run: compute current Dev Wallet % and KYC Traced % across the
// master_token_directory, compare to the last-notified integer % stored in
// coverage_milestone_state, and SMS the admin for each new whole-percent
// milestone crossed. Self-throttling: never sends the same % twice.
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { sendAdminSms } from '../_shared/sms-notify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('coverage-milestone-notifier', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
    if (current <= last) return;
    // Send ONE SMS for the latest milestone (avoid burst when multiple % cross between runs)
    const msg = `📊 ${current}% ${label}\n\n${count.toLocaleString()} / ${total.toLocaleString()} tokens.${current >= 100 ? '\n\n✅ COMPLETE.' : ''}`;
    const ok = await sendAdminSms(msg);
    if (ok) {
      await supabase.from('coverage_milestone_state').upsert({
        metric_key: key,
        last_pct: current,
        last_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'metric_key' });
      sent.push({ key, pct: current });
    }
  }

  await checkAndNotify('dev_wallet', 'Dev Wallets Discovered', devPct, dev);
  await checkAndNotify('kyc_traced', 'KYC Traced', kycPct, kyc);

  return new Response(JSON.stringify({
    ok: true, total, dev, kyc, devPct, kycPct, sent,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));