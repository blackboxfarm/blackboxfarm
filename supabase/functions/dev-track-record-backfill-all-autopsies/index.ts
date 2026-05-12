// dev-track-record-backfill-all-autopsies
// Resolves dev wallets for every published autopsy + caller-supplied static
// mints, then fires `dev-track-record-run-all` for each unique dev wallet
// that has no fresh summary (older than `staleDays`, default 7). Long-running
// work is detached via EdgeRuntime.waitUntil so the HTTP call returns fast.

import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @ts-ignore — Deno edge runtime global
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

Deno.serve(withRunLog('dev-track-record-backfill-all-autopsies', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const dryRun: boolean = body.dryRun === true;
  const staleDays: number = Number.isFinite(body.staleDays) ? Number(body.staleDays) : 7;
  const extraMints: string[] = Array.isArray(body.extraMints) ? body.extraMints.filter((m: any) => typeof m === 'string' && m.length >= 32) : [];

  // 1. Pull every current autopsy mint
  const { data: autopsies, error: aErr } = await supabase
    .from('autopsy_reports')
    .select('slug, ticker, token_mint')
    .eq('is_current', true)
    .not('token_mint', 'is', null);
  if (aErr) {
    return new Response(JSON.stringify({ error: aErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const allMints = Array.from(new Set([
    ...(autopsies ?? []).map((a: any) => a.token_mint as string).filter(Boolean),
    ...extraMints,
  ]));

  // 2. Resolve dev wallets via token_lifecycle
  const { data: lifecycles } = await supabase
    .from('token_lifecycle')
    .select('token_mint, creator_wallet')
    .in('token_mint', allMints);

  const mintToDev = new Map<string, string>();
  (lifecycles ?? []).forEach((l: any) => {
    if (l.creator_wallet) mintToDev.set(l.token_mint, l.creator_wallet);
  });

  const devWallets = Array.from(new Set(Array.from(mintToDev.values())));
  const unresolvedMints = allMints.filter((m) => !mintToDev.has(m));

  // 3. Filter by staleness
  const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString();
  const { data: fresh } = await supabase
    .from('dev_track_record_summary')
    .select('dev_wallet, last_recomputed_at')
    .in('dev_wallet', devWallets)
    .gte('last_recomputed_at', cutoff);
  const freshSet = new Set((fresh ?? []).map((r: any) => r.dev_wallet));
  const toRun = devWallets.filter((d) => !freshSet.has(d));

  const summary = {
    total_autopsies: (autopsies ?? []).length,
    total_mints: allMints.length,
    mints_with_dev: mintToDev.size,
    unresolved_mints: unresolvedMints,
    unique_devs: devWallets.length,
    already_fresh: freshSet.size,
    to_run: toRun.length,
    dry_run: dryRun,
  };

  if (dryRun || toRun.length === 0) {
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 4. Fire-and-forget background processor (5-second stagger between devs)
  const job = (async () => {
    for (const dev of toRun) {
      try {
        await supabase.functions.invoke('dev-track-record-run-all', { body: { dev_wallet: dev } });
      } catch (e) {
        console.warn('[backfill] run-all failed for', dev, (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  })();

  try { EdgeRuntime.waitUntil(job); } catch { /* ignore on local */ }

  return new Response(JSON.stringify({ ok: true, started: true, ...summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
