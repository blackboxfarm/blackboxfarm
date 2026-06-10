// no-lube-sweeper — periodic maintenance for the No Lube pipeline.
//
// Scheduled every 15 minutes. Idempotent — safe to invoke ad-hoc from the UI.
//
// Responsibilities:
//   1. Stale in_process escalation — dev_wallet_source='in_process' rows older
//      than 30m re-attempt creator/dev resolution by invoking
//      `insiders-creator-backfill` and `insiders-row-ingest`.
//   2. Mesh re-arm — rows with mesh_hydrated_at IS NULL and ingest_completed_at
//      older than 1h are re-queued into `insiders-mesh-promoter`.
//   3. Rugged re-check — clears `is_rugged=true` on rows that have shown
//      positive 24h price action so the gate no longer permanently suppresses
//      a recovered token.
//   4. Stale push-lock release — clears pushing_started_at older than 60s so
//      a crashed push attempt cannot wedge the partial unique index.
//
// Fail-open: every step logs but never throws upstream — partial sweeps still
// commit successful sub-steps to the DB.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { withRunLog } from '../_shared/run-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(withRunLog('no-lube-sweeper', async (req, logger) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const report: Record<string, unknown> = { ok: true, started_at: new Date().toISOString() };

  // 1. Stale in_process escalation
  try {
    const { data: stale } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('token_mint, in_process_since')
      .eq('dev_wallet_source', 'in_process')
      .neq('ingest_status', 'archived')
      .lt('in_process_since', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .limit(20);
    const escalated: string[] = [];
    for (const r of (stale || []) as any[]) {
      try {
        await supabase.functions.invoke('insiders-row-ingest', { body: { token_mint: r.token_mint, force: true } });
        escalated.push(r.token_mint);
      } catch (e) { console.warn('[sweeper] escalate', r.token_mint, e); }
    }
    report.in_process_escalated = escalated.length;
  } catch (e) { report.in_process_error = String((e as Error).message || e); }

  // 2. Mesh re-arm
  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: needsMesh } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('token_mint')
      .is('mesh_hydrated_at', null)
      .neq('ingest_status', 'archived')
      .lt('ingest_completed_at', cutoff)
      .limit(10);
    let triggered = 0;
    for (const r of (needsMesh || []) as any[]) {
      try {
        await supabase.functions.invoke('insiders-mesh-promoter', { body: { token_mint: r.token_mint } });
        triggered++;
      } catch (e) { console.warn('[sweeper] mesh', r.token_mint, e); }
    }
    report.mesh_rearmed = triggered;
  } catch (e) { report.mesh_error = String((e as Error).message || e); }

  // 3. Stale push-lock release (>60s)
  try {
    const { data: released } = await supabase
      .from('no_lube_post_log')
      .update({ pushing_started_at: null })
      .lt('pushing_started_at', new Date(Date.now() - 60 * 1000).toISOString())
      .neq('posted', true)
      .select('id');
    report.push_locks_released = (released || []).length;
  } catch (e) { report.push_lock_error = String((e as Error).message || e); }

  // 4. Rugged re-check (advisory) — clears is_rugged when 24h price action positive
  // Cheap heuristic: only clear if the row has a recent positive update from
  // peak_market_cap fields. Heavier verification stays in insiders-mcap-backfill.
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: candidates } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('id, token_mint, entry_market_cap, peak_market_cap, last_milestone_at')
      .eq('is_rugged', true)
      .gt('last_milestone_at', cutoff)
      .limit(20);
    let revived = 0;
    for (const r of (candidates || []) as any[]) {
      const peak = Number(r.peak_market_cap || 0);
      const entry = Number(r.entry_market_cap || 0);
      if (peak > entry * 1.5 && entry > 0) {
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({ is_rugged: false })
          .eq('id', r.id);
        revived++;
      }
    }
    report.rugged_revived = revived;
  } catch (e) { report.rugged_error = String((e as Error).message || e); }

  report.finished_at = new Date().toISOString();
  logger?.addMeta('report', report);
  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));