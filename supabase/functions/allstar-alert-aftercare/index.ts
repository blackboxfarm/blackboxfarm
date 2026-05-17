/**
 * Allstar Alert Aftercare
 * Periodically re-scores every token alerted via allstar_mint_alerts for the
 * first 72h of life and emits Reinforce / Exit re-alerts.
 *
 * Verdict ladder (score -100..+100):
 *   >= +60  reinforcing
 *   <= -60  exit
 *   else    cooling / pending
 *
 * Cheap signals first (DexScreener cache deltas, dev sell flag).
 * Dissent score is read from cached lifecycle notes only — no live scrape here.
 * Fail-open: nothing here blocks a buy; we just inform.
 * Decay: hot 5m -> warm 15m -> cool 60m -> tail 6h; expire at 72h.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { withRunLog } from '../_shared/run-logger.ts';
import { assertDbWrite } from '../_shared/db-assert.ts';
import { broadcastToBlackBox } from '../_shared/telegram-broadcast.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Verdict = 'pending' | 'reinforcing' | 'cooling' | 'exit' | 'graduated' | 'expired';

interface Snapshot {
  mcap: number | null;
  liquidity: number | null;
  volume_24h: number | null;
  price: number | null;
}

function pct(curr: number | null, base: number | null): number {
  if (!curr || !base || base <= 0) return 0;
  return ((curr - base) / base) * 100;
}

function decayInterval(stage: string, inBurst: boolean): { stage: string; ms: number } {
  if (inBurst) return { stage: 'hot', ms: 5 * 60_000 };
  switch (stage) {
    case 'hot':  return { stage: 'warm', ms: 15 * 60_000 };
    case 'warm': return { stage: 'cool', ms: 60 * 60_000 };
    case 'cool': return { stage: 'tail', ms: 6 * 60 * 60_000 };
    default:     return { stage: 'tail', ms: 6 * 60 * 60_000 };
  }
}

async function snapshotToken(sb: ReturnType<typeof createClient>, mint: string): Promise<Snapshot> {
  const { data } = await sb
    .from('dexscreener_top_200_cache')
    .select('market_cap, liquidity_usd, volume_24h, price_usd')
    .eq('token_mint', mint)
    .maybeSingle();
  if (data) {
    return {
      mcap: data.market_cap as number | null,
      liquidity: data.liquidity_usd as number | null,
      volume_24h: data.volume_24h as number | null,
      price: data.price_usd as number | null,
    };
  }
  return { mcap: null, liquidity: null, volume_24h: null, price: null };
}

interface ScoreInput {
  baseline: Snapshot; current: Snapshot;
  devSold: boolean; liqPulled: boolean;
  ageMinutes: number; dissentScore: number | null;
}
interface ScoreReason { signal: string; delta?: number; weight: number }
interface ScoreResult { score: number; verdict: Verdict; reasons: ScoreReason[] }

function score(input: ScoreInput): ScoreResult {
  const r: ScoreReason[] = [];
  let s = 0;
  const mcapDelta = pct(input.current.mcap, input.baseline.mcap);
  const liqDelta = pct(input.current.liquidity, input.baseline.liquidity);
  const volDelta = pct(input.current.volume_24h, input.baseline.volume_24h);

  if (input.liqPulled) { s -= 80; r.push({ signal: 'liquidity_pulled', weight: -80 }); }
  if (input.devSold)   { s -= 50; r.push({ signal: 'dev_sold', weight: -50 }); }
  if (mcapDelta <= -50) { s -= 40; r.push({ signal: 'mcap_crash', delta: mcapDelta, weight: -40 }); }
  if (liqDelta <= -40)  { s -= 25; r.push({ signal: 'liq_drain',  delta: liqDelta,  weight: -25 }); }
  if ((input.dissentScore ?? 0) >= 60) {
    s -= 25; r.push({ signal: 'chat_dissent', delta: input.dissentScore!, weight: -25 });
  }

  if (mcapDelta >= 100) { s += 40; r.push({ signal: 'mcap_double', delta: mcapDelta, weight: 40 }); }
  else if (mcapDelta >= 40) { s += 20; r.push({ signal: 'mcap_up', delta: mcapDelta, weight: 20 }); }
  if (volDelta >= 200) { s += 25; r.push({ signal: 'vol_3x', delta: volDelta, weight: 25 }); }
  else if (volDelta >= 50) { s += 10; r.push({ signal: 'vol_up', delta: volDelta, weight: 10 }); }
  if (liqDelta >= 30) { s += 15; r.push({ signal: 'liq_growing', delta: liqDelta, weight: 15 }); }

  s = Math.max(-100, Math.min(100, s));
  let verdict: Verdict = 'cooling';
  if (s >= 60) verdict = 'reinforcing';
  else if (s <= -60) verdict = 'exit';
  else if (input.ageMinutes < 10) verdict = 'pending';
  return { score: s, verdict, reasons: r };
}

async function detectDevSell(sb: ReturnType<typeof createClient>, creator: string | null): Promise<boolean> {
  if (!creator) return false;
  try {
    const { data } = await sb
      .from('dev_behavior_scores')
      .select('recent_sell_flag, last_sell_at')
      .eq('wallet_address', creator)
      .maybeSingle();
    if (!data) return false;
    if ((data as any).recent_sell_flag) return true;
    if ((data as any).last_sell_at) {
      return (Date.now() - new Date((data as any).last_sell_at).getTime()) < 30 * 60_000;
    }
  } catch { /* fail open */ }
  return false;
}

async function maybeDissentScore(sb: ReturnType<typeof createClient>, mint: string, gate: boolean): Promise<number | null> {
  if (!gate) return null;
  try {
    const { data } = await sb
      .from('token_lifecycle')
      .select('autopsy_notes')
      .eq('token_mint', mint)
      .maybeSingle();
    const note = ((data as any)?.autopsy_notes ?? '') as string;
    const m = note.match(/dissent_score[:=]\s*(\d{1,3})/i);
    if (m) return Math.min(100, parseInt(m[1], 10));
  } catch { /* ignore */ }
  return null;
}

function fmtMcap(n: number | null | undefined): string {
  if (!n) return '?';
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n/1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

async function sendReinforceAlert(sb: ReturnType<typeof createClient>, row: any, sc: ScoreResult, snap: Snapshot) {
  const ticker = row.token_symbol || 'UNKNOWN';
  const reasons = sc.reasons.filter(r => r.weight > 0).map(r => r.signal).join(', ');
  const msg = [
    `🟢 ALLSTAR AFTERCARE — $ ${ticker} STRENGTHENING`,
    ``,
    `Mcap: ${fmtMcap(row.baseline_mcap)} → ${fmtMcap(snap.mcap)}  (score +${sc.score})`,
    `Signals: ${reasons}`,
    ``,
    `Original tier: T${row.allstar_tier ?? '?'}`,
    `Pump: https://pump.fun/${row.token_mint}`,
    `DexScreener: https://dexscreener.com/solana/${row.token_mint}`,
  ].join('\n');
  try { await broadcastToBlackBox(sb, msg); } catch (e) { console.warn('[aftercare] reinforce broadcast failed:', e); }
}

async function sendExitAlert(sb: ReturnType<typeof createClient>, row: any, sc: ScoreResult, snap: Snapshot) {
  const ticker = row.token_symbol || 'UNKNOWN';
  const reasons = sc.reasons.filter(r => r.weight < 0).map(r => r.signal).join(', ');
  const msg = [
    `🔴 ALLSTAR AFTERCARE — $ ${ticker} GET OUT`,
    ``,
    `Mcap: ${fmtMcap(row.baseline_mcap)} → ${fmtMcap(snap.mcap)}  (score ${sc.score})`,
    `Warning signals: ${reasons}`,
    ``,
    `Was alerted as a T${row.allstar_tier ?? '?'} dev launch but trajectory is failing.`,
    `DexScreener: https://dexscreener.com/solana/${row.token_mint}`,
  ].join('\n');
  try { await broadcastToBlackBox(sb, msg); } catch (e) { console.warn('[aftercare] exit broadcast failed:', e); }
}

Deno.serve(withRunLog('allstar-alert-aftercare', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batchSize ?? 30), 5), 100);
  const now = new Date();

  // ── Enrollment safety-net: backfill watch rows for any recent alerts missing one
  const sinceIso = new Date(now.getTime() - 3 * 60 * 60_000).toISOString();
  const { data: recentAlerts } = await sb
    .from('allstar_mint_alerts')
    .select('id, token_mint, token_symbol, creator_wallet, allstar_id, allstar_tier, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(100);

  let enrolled = 0;
  for (const a of recentAlerts ?? []) {
    const { data: exists } = await sb
      .from('allstar_alert_watch')
      .select('id')
      .eq('alert_id', (a as any).id)
      .maybeSingle();
    if (exists) continue;
    const snap = await snapshotToken(sb, (a as any).token_mint);
    try {
      await assertDbWrite(
        sb.from('allstar_alert_watch').insert({
          alert_id: (a as any).id,
          token_mint: (a as any).token_mint,
          token_symbol: (a as any).token_symbol,
          allstar_id: (a as any).allstar_id,
          creator_wallet: (a as any).creator_wallet,
          allstar_tier: (a as any).allstar_tier,
          baseline_mcap: snap.mcap, baseline_liquidity: snap.liquidity,
          baseline_volume_24h: snap.volume_24h, baseline_price: snap.price,
          current_mcap: snap.mcap, current_liquidity: snap.liquidity,
          current_volume_24h: snap.volume_24h, current_price: snap.price,
          verdict: 'pending', decay_stage: 'hot',
          next_check_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
          enrolled_at: (a as any).created_at,
        }).select('id'),
        'allstar_alert_watch', 'INSERT',
      );
      enrolled++;
    } catch (e) { console.warn('[aftercare] enroll failed:', (e as Error).message); }
  }

  // ── Process due rows
  const { data: due } = await sb
    .from('allstar_alert_watch')
    .select('*')
    .is('closed_at', null)
    .lte('next_check_at', now.toISOString())
    .order('next_check_at', { ascending: true })
    .limit(batchSize);

  let processed = 0, reinforced = 0, exited = 0, expired = 0;

  for (const row of (due ?? []) as any[]) {
    processed++;
    if (new Date(row.expires_at).getTime() <= now.getTime()) {
      await sb.from('allstar_alert_watch').update({
        verdict: 'expired', closed_at: now.toISOString(), close_reason: 'ttl_72h',
      }).eq('id', row.id);
      expired++; continue;
    }

    const snap = await snapshotToken(sb, row.token_mint);
    const ageMin = (now.getTime() - new Date(row.enrolled_at).getTime()) / 60_000;
    const liqPulled = snap.liquidity != null && row.baseline_liquidity != null
      ? pct(snap.liquidity, row.baseline_liquidity) <= -70 : false;
    const devSold = await detectDevSell(sb, row.creator_wallet);
    const volGate = snap.volume_24h != null && row.baseline_volume_24h != null
      && Math.abs(pct(snap.volume_24h, row.baseline_volume_24h)) >= 30;
    const dissentScore = await maybeDissentScore(sb, row.token_mint, volGate);

    const scored = score({
      baseline: { mcap: row.baseline_mcap, liquidity: row.baseline_liquidity,
                  volume_24h: row.baseline_volume_24h, price: row.baseline_price },
      current: snap, devSold, liqPulled, ageMinutes: ageMin, dissentScore,
    });

    const prevScore = row.verdict_score ?? 0;
    const cooldownOk = !row.last_realert_at
      || (now.getTime() - new Date(row.last_realert_at).getTime()) > 30 * 60_000;
    const willReinforce = scored.verdict === 'reinforcing' && cooldownOk && (row.reinforce_alerts_sent < 3);
    const willExit = scored.verdict === 'exit'
      && (!row.exit_alert_sent_at || scored.score <= prevScore - 20);

    if (willReinforce) { await sendReinforceAlert(sb, row, scored, snap); reinforced++; }
    if (willExit) { await sendExitAlert(sb, row, scored, snap); exited++; }

    const inBurst = scored.verdict === 'reinforcing' || scored.verdict === 'exit';
    const decay = decayInterval(row.decay_stage, inBurst);

    const history = Array.isArray(row.history) ? row.history.slice(-19) : [];
    history.push({
      at: now.toISOString(), verdict: scored.verdict, score: scored.score,
      mcap: snap.mcap, reasons: scored.reasons,
    });

    const patch: Record<string, unknown> = {
      current_mcap: snap.mcap, current_liquidity: snap.liquidity,
      current_volume_24h: snap.volume_24h, current_price: snap.price,
      verdict: scored.verdict, verdict_score: scored.score,
      verdict_reasons: scored.reasons as unknown as object,
      dissent_score: dissentScore,
      last_check_at: now.toISOString(),
      next_check_at: new Date(now.getTime() + decay.ms).toISOString(),
      check_count: (row.check_count ?? 0) + 1,
      decay_stage: decay.stage,
      history,
    };
    if (willReinforce) {
      patch.reinforce_alerts_sent = (row.reinforce_alerts_sent ?? 0) + 1;
      patch.last_realert_at = now.toISOString();
    }
    if (willExit) {
      patch.exit_alert_sent_at = now.toISOString();
      patch.last_realert_at = now.toISOString();
    }

    try {
      await assertDbWrite(
        sb.from('allstar_alert_watch').update(patch).eq('id', row.id).select('id'),
        'allstar_alert_watch', 'UPDATE',
      );
    } catch (e) { console.warn('[aftercare] update failed:', (e as Error).message); }
  }

  return new Response(
    JSON.stringify({ ok: true, enrolled, processed, reinforced, exited, expired }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
