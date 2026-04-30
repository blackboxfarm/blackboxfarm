import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Candidate = {
  token_mint: string;
  symbol: string | null;
  priority: number;
  sourceLabel: string;
  context?: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function readRecentSnapshotSet(
  supabase: ReturnType<typeof createClient>,
  mints: string[],
  since: string,
): Promise<Set<string>> {
  const seen = new Set<string>();
  for (const mintChunk of chunk(mints, 100)) {
    const { data, error } = await supabase
      .from('token_health_snapshots')
      .select('token_mint')
      .in('token_mint', mintChunk)
      .gte('snapshot_hour', since);

    if (error) throw error;
    for (const row of data ?? []) seen.add(row.token_mint);
  }
  return seen;
}

/**
 * Hourly Feed Health Scanner
 *
 * Fills Litmus Strip snapshots for the actual active monitoring pool, not just
 * the tiny live feed slice. Priority order:
 *   1. Funnel/watchlist tokens still being triaged or actively watched
 *   2. Curated live feed tokens
 *   3. Active lifecycle tokens still alive in the system
 */
Deno.serve(withRunLog('feed-health-scanner', async (req) => {
  if (!await isFunctionEnabled('feed-health-scanner')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedBatchSize = Number(body.batchSize ?? 30);
    const batchSize = Math.min(Math.max(Number.isFinite(requestedBatchSize) ? requestedBatchSize : 30, 24), 60);
    const maxAgeMins = Math.min(Math.max(Number(body.maxAgeMins ?? 60), 15), 240);
    const concurrency = Math.min(Math.max(Number(body.concurrency ?? 3), 1), 5);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const [{ data: watchlistTokens, error: watchlistErr }, { data: feedTokens, error: feedErr }, { data: lifecycleTokens, error: lifecycleErr }] = await Promise.all([
      supabase
        .from('pumpfun_watchlist')
        .select('token_mint, token_symbol, source, status')
        .in('status', ['watching', 'pending_triage'])
        .order('source', { ascending: true })
        .order('updated_at', { ascending: false })
        .limit(800),
      supabase
        .from('live_feed_curated')
        .select('token_mint, symbol, freshness_tier, last_top_200_rank')
        .order('freshness_tier', { ascending: true })
        .order('last_top_200_rank', { ascending: true, nullsFirst: false })
        .limit(250),
      supabase
        .from('token_lifecycle')
        .select('token_mint, symbol, current_status, is_currently_top_200, last_top_200_rank, discovery_source')
        .eq('current_status', 'active')
        .order('is_currently_top_200', { ascending: false })
        .order('last_top_200_rank', { ascending: true, nullsFirst: false })
        .order('last_seen_at', { ascending: false })
        .limit(400),
    ]);

    if (watchlistErr) throw watchlistErr;
    if (feedErr) throw feedErr;
    if (lifecycleErr) throw lifecycleErr;

    const candidateMap = new Map<string, Candidate>();
    const upsertCandidate = (candidate: Candidate) => {
      const existing = candidateMap.get(candidate.token_mint);
      if (!existing || candidate.priority < existing.priority) {
        candidateMap.set(candidate.token_mint, candidate);
      }
    };

    for (const row of watchlistTokens ?? []) {
      upsertCandidate({
        token_mint: row.token_mint,
        symbol: row.token_symbol,
        priority: String(row.source || '').startsWith('funnel_feed:') ? 10 : 20,
        sourceLabel: 'watchlist',
        context: `${row.status ?? 'unknown'} · ${row.source ?? 'unknown'}`,
      });
    }

    for (const row of feedTokens ?? []) {
      upsertCandidate({
        token_mint: row.token_mint,
        symbol: row.symbol,
        priority: row.freshness_tier === 1 ? 30 : 40,
        sourceLabel: 'live_feed',
        context: `tier ${row.freshness_tier ?? '?'} · rank ${row.last_top_200_rank ?? 'n/a'}`,
      });
    }

    for (const row of lifecycleTokens ?? []) {
      upsertCandidate({
        token_mint: row.token_mint,
        symbol: row.symbol,
        priority: row.is_currently_top_200 ? 50 : 60,
        sourceLabel: 'lifecycle',
        context: `${row.discovery_source ?? 'unknown'} · rank ${row.last_top_200_rank ?? 'n/a'}`,
      });
    }

    const candidates = Array.from(candidateMap.values()).sort((a, b) => a.priority - b.priority);
    if (candidates.length === 0) {
      return new Response(JSON.stringify({ message: 'No candidate tokens found', scanned: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const since = new Date(Date.now() - maxAgeMins * 60 * 1000).toISOString();
    const recentSet = await readRecentSnapshotSet(supabase, candidates.map((t) => t.token_mint), since);
    const needsScan = candidates.filter((t) => !recentSet.has(t.token_mint));
    const batch = needsScan.slice(0, batchSize);

    console.log(`[feed-health-scanner] Candidates: ${candidates.length} total | ${recentSet.size} fresh | ${needsScan.length} stale | processing ${batch.length}`);

    let scanned = 0;
    let failed = 0;
    const results: { mint: string; symbol: string; status: string; source: string }[] = [];

    const workGroups = chunk(batch, concurrency);
    for (let groupIndex = 0; groupIndex < workGroups.length; groupIndex++) {
      const group = workGroups[groupIndex];
      const groupResults = await Promise.all(group.map(async (token) => {
        try {
          console.log(`[feed-health-scanner] Scanning ${token.symbol || token.token_mint.slice(0, 8)} from ${token.sourceLabel} (${token.context || 'n/a'})`);
          const { error } = await supabase.functions.invoke('bagless-holders-report', {
            body: { tokenMint: token.token_mint, source: 'feed_health_scanner' },
          });

          if (error) {
            return {
              mint: token.token_mint,
              symbol: token.symbol || '?',
              source: token.sourceLabel,
              status: `error: ${(error as Error).message}`,
            };
          }

          return {
            mint: token.token_mint,
            symbol: token.symbol || '?',
            source: token.sourceLabel,
            status: 'ok',
          };
        } catch (e) {
          return {
            mint: token.token_mint,
            symbol: token.symbol || '?',
            source: token.sourceLabel,
            status: `exception: ${(e as Error).message}`,
          };
        }
      }));

      for (const result of groupResults) {
        results.push(result);
        if (result.status === 'ok') scanned++;
        else failed++;
      }

      if (groupIndex < workGroups.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }

    const summary = {
      candidates: candidates.length,
      alreadyRecent: recentSet.size,
      needsScan: needsScan.length,
      batchSize: batch.length,
      concurrency,
      scanned,
      failed,
      results,
    };

    console.log(`[feed-health-scanner] Done: ${scanned} scanned, ${failed} failed`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[feed-health-scanner] Fatal: ${(err as Error).message}`);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
