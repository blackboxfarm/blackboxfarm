// Insiders Pipeline Orchestrator
// Single entry point for the 3-hour cron. Runs the full Insiders enrichment chain
// in order, stopping a step early if the Helius budget guard trips but continuing
// with the cheaper steps after. Each step reports {processed, remaining}.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type StepResult = { step: string; ok: boolean; data?: any; error?: string };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const skip: string[] = Array.isArray(body.skip) ? body.skip : [];

  const steps: Array<{ name: string; body: any; mustContinueOnFailure?: boolean }> = [
    { name: 'insiders-lifecycle-builder',       body: {} },
    { name: 'insiders-creator-backfill',        body: { auto_loop: true, batchSize: 25 } },
    { name: 'insiders-genealogy-backfill',      body: { auto_loop: true, batchSize: 25 } },
    { name: 'insiders-genealogy-rescan-kyc',    body: { batchSize: 1000 }, mustContinueOnFailure: true },
  ];

  const results: StepResult[] = [];

  for (const step of steps) {
    if (skip.includes(step.name)) {
      results.push({ step: step.name, ok: true, data: { skipped: true } });
      continue;
    }
    console.log(`[orchestrator] → ${step.name}`);
    try {
      const { data, error } = await supabase.functions.invoke(step.name, { body: step.body });
      if (error) throw error;
      results.push({ step: step.name, ok: true, data });
      // If a step aborted on Helius budget guard, skip the next Helius-heavy step
      if (data?.aborted === 'helius_budget_guard') {
        console.warn(`[orchestrator] ${step.name} aborted on budget guard — skipping subsequent Helius-heavy steps`);
        break;
      }
    } catch (e: any) {
      console.warn(`[orchestrator] ${step.name} failed:`, e?.message);
      results.push({ step: step.name, ok: false, error: e?.message || String(e) });
      if (!step.mustContinueOnFailure) break;
    }
  }

  const { data: stuckRows } = await supabase
    .from('telegram_insider_token_lifecycle')
    .select('token_mint, token_symbol, ingest_started_at')
    .eq('ingest_status', 'enriching')
    .lt('ingest_started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('ingest_started_at', { ascending: true })
    .limit(50);

  const stuckRecovery: Array<{ mint: string; symbol: string | null; ok: boolean; error?: string }> = [];
  for (const row of stuckRows || []) {
    try {
      const { error } = await supabase.functions.invoke('no-lube-ingest', {
        body: { mint: row.token_mint, force: true, fast_post: true },
      });
      if (error) throw error;
      stuckRecovery.push({ mint: row.token_mint, symbol: row.token_symbol, ok: true });
    } catch (e: any) {
      stuckRecovery.push({ mint: row.token_mint, symbol: row.token_symbol, ok: false, error: e?.message || String(e) });
    }
  }

  // Snapshot coverage stats so the cron history shows progress over time
  const { data: cov } = await supabase
    .from('telegram_insider_token_lifecycle')
    .select('creator_status, kyc_status', { count: 'exact', head: false })
    .limit(50_000);

  const coverage = {
    total: cov?.length ?? 0,
    creator_resolved: cov?.filter((r: any) => r.creator_status === 'resolved').length ?? 0,
    creator_unresolvable: cov?.filter((r: any) => r.creator_status === 'unresolvable').length ?? 0,
    kyc_resolved: cov?.filter((r: any) => r.kyc_status === 'kyc_resolved').length ?? 0,
    kyc_dead_end: cov?.filter((r: any) => r.kyc_status === 'no_kyc_reachable').length ?? 0,
    kyc_pending: cov?.filter((r: any) => r.kyc_status === 'pending' || r.kyc_status === 'tracing').length ?? 0,
  };

  console.log('[orchestrator] coverage:', coverage);

  return new Response(
    JSON.stringify({ ok: true, results, stuckRecovery, coverage, ranAt: new Date().toISOString() }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});