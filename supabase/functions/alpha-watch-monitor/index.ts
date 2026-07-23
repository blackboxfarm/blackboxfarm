// alpha-watch-monitor
// Cron every ~20s. Scans alpha_watch_queue for active post-bond tokens.
// For each: fetches current mcap and applies Rule 3:
//   - mcap < post_bond_dead_below  -> resolve 'dead', SMS SKIP
//   - dip_low <= mcap <= dip_high  -> execute alpha buy, mark 'bought'
//   - expires_at reached           -> resolve 'expired', no buy
// Otherwise continue watching.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { executeAlphaBuy, fetchDexInfo, fetchPumpInfo, sendAdminSms, fmtMoney } from '../_shared/alpha-buy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: cfg } = await supabase.from('alpha_config').select('*').eq('id', 1).maybeSingle();
  const config = cfg || {};
  const dipLow = Number(config.post_bond_dip_low ?? 7000);
  const dipHigh = Number(config.post_bond_dip_high ?? 12000);
  const deadBelow = Number(config.post_bond_dead_below ?? 6000);

  const now = new Date().toISOString();
  const { data: watches } = await supabase.from('alpha_watch_queue')
    .select('*')
    .eq('status', 'active')
    .order('started_at', { ascending: true })
    .limit(50);

  const results: any[] = [];

  // Multi-pass in one invocation for tighter cadence (~20s x 3 = 60s)
  const PASSES = 3;
  for (let pass = 0; pass < PASSES; pass++) {
    for (const w of watches || []) {
      // Re-read latest state (may have been resolved in prior pass)
      const { data: cur } = await supabase.from('alpha_watch_queue')
        .select('status, expires_at').eq('id', w.id).maybeSingle();
      if (!cur || cur.status !== 'active') continue;

      // Expiry
      if (new Date(cur.expires_at).getTime() < Date.now()) {
        await supabase.from('alpha_watch_queue').update({
          status: 'resolved', resolution: 'expired_no_dip',
          resolved_at: new Date().toISOString(),
        }).eq('id', w.id);
        results.push({ mint: w.mint, action: 'expired' });
        continue;
      }

      // Live mcap
      const dex = await fetchDexInfo(w.mint);
      const pump = await fetchPumpInfo(w.mint);
      const mcap = dex.mcap ?? pump.mcap ?? null;
      if (mcap === null) {
        await supabase.from('alpha_watch_queue').update({
          last_checked_at: new Date().toISOString(),
          check_count: (w.check_count || 0) + 1,
        }).eq('id', w.id);
        continue;
      }

      const newMin = Math.min(Number(w.min_mcap_seen ?? mcap), mcap);
      const newMax = Math.max(Number(w.max_mcap_seen ?? mcap), mcap);

      // DEAD — dumped below floor
      if (mcap < deadBelow) {
        await supabase.from('alpha_watch_queue').update({
          status: 'resolved', resolution: 'dead_below_floor',
          last_mcap: mcap, min_mcap_seen: newMin, max_mcap_seen: newMax,
          resolved_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          check_count: (w.check_count || 0) + 1,
        }).eq('id', w.id);
        if (config.sms_enabled) {
          const tk = w.ticker ? `$${w.ticker}` : w.mint.slice(0, 6);
          await sendAdminSms(
            `☠️ SKIP ${tk} — dumped to ${fmtMoney(mcap)}\n` +
            `Post-bond floor breached ($${(deadBelow / 1000).toFixed(0)}k).\n` +
            `Dex: https://dexscreener.com/solana/${w.mint}`
          );
        }
        results.push({ mint: w.mint, action: 'killed', mcap });
        continue;
      }

      // DIP-BUY window
      if (mcap >= dipLow && mcap <= dipHigh) {
        const payload = w.match_payload || {};
        const m = {
          matchKind: payload.matchKind || w.match_kind,
          devWallet: payload.devWallet ?? w.dev_wallet,
          kycRoot: payload.kycRoot ?? w.kyc_root,
          kycLabel: payload.kycLabel ?? w.kyc_label,
          reason: payload.reason ?? w.reason ?? 'post-bond dip',
          source: payload.source ?? w.source ?? 'watch-monitor',
          devHit: payload.devHit, personHit: payload.personHit, kycHit: payload.kycHit,
        };
        const buyRes = await executeAlphaBuy(
          supabase, config, m, w.mint, '🎯 POST-BOND DIP BUY'
        );
        await supabase.from('alpha_watch_queue').update({
          status: 'resolved',
          resolution: buyRes.ok && !buyRes.skipped ? 'bought_dip' : `buy_${buyRes.skipped || 'error'}`,
          last_mcap: mcap, min_mcap_seen: newMin, max_mcap_seen: newMax,
          resolved_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          check_count: (w.check_count || 0) + 1,
        }).eq('id', w.id);
        results.push({ mint: w.mint, action: 'bought_dip', mcap, buy: buyRes });
        continue;
      }

      // Still watching
      await supabase.from('alpha_watch_queue').update({
        last_mcap: mcap, min_mcap_seen: newMin, max_mcap_seen: newMax,
        last_checked_at: new Date().toISOString(),
        check_count: (w.check_count || 0) + 1,
      }).eq('id', w.id);
      results.push({ mint: w.mint, action: 'watching', mcap });
    }
    if (pass < PASSES - 1) await new Promise((r) => setTimeout(r, 20000));
  }

  return new Response(JSON.stringify({ ok: true, watched: watches?.length || 0, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});