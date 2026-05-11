import { createClient } from 'npm:@supabase/supabase-js@2';
import { withRunLog } from '../_shared/run-logger.ts';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';
import { assertInsert, assertUpdate, assertUpsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CREATOR_TABLES = [
  'allstar_mint_alerts',
  'autopsy_backlog',
  'autopsy_candidates',
  'autopsy_tx_evidence',
  'developer_alerts',
  'developer_mint_alerts',
  'developer_tokens',
  'flip_positions',
  'funnel_feed_discoveries',
  'holders_intel_seen_tokens',
  'pumpfun_buy_candidates',
  'pumpfun_discovery_logs',
  'pumpfun_fantasy_positions',
  'pumpfun_rejected_backcheck',
  'pumpfun_rejection_events',
  'pumpfun_watchlist',
  'scraped_tokens',
  'telegram_insider_token_lifecycle',
  'token_lifecycle',
  'token_mint_watchdog',
  'token_projects',
  'token_search_results',
] as const;

const DEV_TABLES = [
  'proven_dev_tokens',
  'token_assessments',
  'token_lifecycle_scorecard',
  'token_lifecycle_tracking',
] as const;

type CreatorTable = typeof CREATOR_TABLES[number];
type DevTable = typeof DEV_TABLES[number];
type TargetTable = CreatorTable | DevTable;

interface TargetRow {
  table: TargetTable;
  mint: string;
  column: 'creator_wallet' | 'dev_wallet';
}

interface TableCaps {
  updatedAt: boolean;
  lastCheckedAt: boolean;
  lastFetchedAt: boolean;
  creatorFetchedAt: boolean;
}

const TABLE_CAPS: Record<TargetTable, TableCaps> = {
  allstar_mint_alerts: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  autopsy_backlog: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  autopsy_candidates: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  autopsy_tx_evidence: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  developer_alerts: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  developer_mint_alerts: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  developer_tokens: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  flip_positions: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  funnel_feed_discoveries: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: true },
  holders_intel_seen_tokens: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: true },
  pumpfun_buy_candidates: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  pumpfun_discovery_logs: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  pumpfun_fantasy_positions: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  pumpfun_rejected_backcheck: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  pumpfun_rejection_events: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  pumpfun_watchlist: { updatedAt: true, lastCheckedAt: true, lastFetchedAt: false, creatorFetchedAt: false },
  scraped_tokens: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: true },
  telegram_insider_token_lifecycle: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  token_lifecycle: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: true, creatorFetchedAt: false },
  token_mint_watchdog: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  token_projects: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  token_search_results: { updatedAt: false, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  proven_dev_tokens: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  token_assessments: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  token_lifecycle_scorecard: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
  token_lifecycle_tracking: { updatedAt: true, lastCheckedAt: false, lastFetchedAt: false, creatorFetchedAt: false },
};

const ORDER_COLUMN: Record<TargetTable, string> = {
  allstar_mint_alerts: 'created_at',
  autopsy_backlog: 'created_at',
  autopsy_candidates: 'created_at',
  autopsy_tx_evidence: 'created_at',
  developer_alerts: 'created_at',
  developer_mint_alerts: 'created_at',
  developer_tokens: 'created_at',
  flip_positions: 'created_at',
  funnel_feed_discoveries: 'discovered_at',
  holders_intel_seen_tokens: 'first_seen_at',
  pumpfun_buy_candidates: 'created_at',
  pumpfun_discovery_logs: 'created_at',
  pumpfun_fantasy_positions: 'created_at',
  pumpfun_rejected_backcheck: 'created_at',
  pumpfun_rejection_events: 'created_at',
  pumpfun_watchlist: 'discovered_at',
  scraped_tokens: 'created_at',
  telegram_insider_token_lifecycle: 'created_at',
  token_lifecycle: 'created_at',
  token_mint_watchdog: 'created_at',
  token_projects: 'created_at',
  token_search_results: 'created_at',
  proven_dev_tokens: 'created_at',
  token_assessments: 'created_at',
  token_lifecycle_scorecard: 'created_at',
  token_lifecycle_tracking: 'created_at',
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isLikelyAddress = (value: unknown): value is string => hasText(value) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());

async function selectMissingRows(supabase: any, table: TargetTable, column: 'creator_wallet' | 'dev_wallet', limit: number): Promise<TargetRow[]> {
  const orderCol = ORDER_COLUMN[table] ?? 'created_at';
  let { data, error } = await supabase
    .from(table)
    .select('token_mint')
    .not('token_mint', 'is', null)
    .or(`${column}.is.null,${column}.eq.`)
    .order(orderCol, { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    const retry = await supabase
      .from(table)
      .select('token_mint')
      .not('token_mint', 'is', null)
      .or(`${column}.is.null,${column}.eq.`)
      .limit(limit);
    if (retry.error) throw retry.error;
    data = retry.data;
  }
  return (data ?? [])
    .map((row: any) => String(row.token_mint ?? '').trim())
    .filter(isLikelyAddress)
    .map((mint: string) => ({ table, mint, column }));
}

async function buildTargets(supabase: any, explicitMints: string[], batchSize: number): Promise<TargetRow[]> {
  const targets: TargetRow[] = [];
  const seen = new Set<string>();
  const push = (target: TargetRow) => {
    const key = `${target.table}:${target.mint}:${target.column}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push(target);
    }
  };

  if (explicitMints.length > 0) {
    const mints = explicitMints.filter(isLikelyAddress).slice(0, batchSize);
    for (const table of CREATOR_TABLES) for (const mint of mints) push({ table, mint, column: 'creator_wallet' });
    for (const table of DEV_TABLES) for (const mint of mints) push({ table, mint, column: 'dev_wallet' });
    return targets.slice(0, batchSize);
  }

  const allSpecs: Array<{ table: TargetTable; column: 'creator_wallet' | 'dev_wallet' }> = [
    // PRIORITY: the 5 tables that feed master_token_directory.creator_wallet.
    // Resolving these moves the Dev Wallet Coverage metric directly.
    { table: 'pumpfun_watchlist', column: 'creator_wallet' as const },
    { table: 'holders_intel_seen_tokens', column: 'creator_wallet' as const },
    { table: 'scraped_tokens', column: 'creator_wallet' as const },
    { table: 'token_lifecycle', column: 'creator_wallet' as const },
    { table: 'funnel_feed_discoveries', column: 'creator_wallet' as const },
    // Then the rest of the derivative tables.
    ...CREATOR_TABLES
      .filter((t) => !['pumpfun_watchlist','holders_intel_seen_tokens','scraped_tokens','token_lifecycle','funnel_feed_discoveries'].includes(t))
      .map((table) => ({ table, column: 'creator_wallet' as const })),
    ...DEV_TABLES.map((table) => ({ table, column: 'dev_wallet' as const })),
  ];
  const perTable = Math.max(1, Math.ceil(batchSize / allSpecs.length));

  for (const spec of allSpecs) {
    const rows = await selectMissingRows(supabase, spec.table, spec.column, perTable);
    rows.forEach(push);
    if (targets.length >= batchSize) break;
  }

  return targets.slice(0, batchSize);
}

function truncateForLog(body: any): any {
  try {
    const str = JSON.stringify(body);
    if (str.length <= 4096) return body;
    return { _truncated: true, preview: str.slice(0, 4096) };
  } catch {
    return { _unstringifiable: true };
  }
}

function providerUrl(source: string, mint: string): string {
  switch (source) {
    case 'pumpfun': return `https://frontend-api.pump.fun/coins/${mint}`;
    case 'helius_das': return `https://mainnet.helius-rpc.com/?method=getAsset&id=${mint}`;
    case 'helius_rpc_onchain': return `https://mainnet.helius-rpc.com/?method=getSignaturesForAddress&address=${mint}`;
    case 'db_cache': return `internal://db_cache/${mint}`;
    default: return `internal://none/${mint}`;
  }
}

async function logBackfillEvent(supabase: any, row: {
  mint: string;
  table_name: string;
  column_name: string;
  solscan_url: string;
  http_status: number;
  duration_ms: number;
  from_cache: boolean;
  resolved_creator: string | null;
  error_message: string | null;
  response_preview: any;
}) {
  try {
    await assertInsert(
      supabase.from('creator_backfill_events').insert({
        ...row,
        function_name: 'backfill-creator-wallets',
        response_preview: truncateForLog(row.response_preview),
      }),
      'creator_backfill_events',
    );
  } catch (e) {
    console.warn('[backfill-creator-wallets][event-log] insert failed:', e instanceof Error ? e.message : e);
  }
}

function updatePayload(table: TargetTable, column: 'creator_wallet' | 'dev_wallet', creator: string) {
  const now = new Date().toISOString();
  const caps = TABLE_CAPS[table];
  const payload: Record<string, unknown> = { [column]: creator };
  if (caps.updatedAt) payload.updated_at = now;
  if (caps.lastCheckedAt) payload.last_checked_at = now;
  if (caps.lastFetchedAt) payload.last_fetched_at = now;
  if (caps.creatorFetchedAt) payload.creator_fetched_at = now;
  return payload;
}

async function updateMissingCreator(supabase: any, target: TargetRow, creator: string) {
  await assertUpdate(
    supabase
      .from(target.table)
      .update(updatePayload(target.table, target.column, creator))
      .eq('token_mint', target.mint)
      .or(`${target.column}.is.null,${target.column}.eq.`),
    target.table,
  );
}

async function seedDeveloperChain(supabase: any, mint: string, creator: string, source: string) {
  const profile = await assertUpsert(
    supabase.from('developer_profiles').upsert({
      master_wallet_address: creator,
      display_name: creator.slice(0, 8),
      source: `creator_backfill:${source}`,
      kyc_verified: false,
      trust_level: 'neutral',
      metadata: { seeded_from_token: mint, provider: source },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'master_wallet_address', ignoreDuplicates: false }).select('id').single(),
    'developer_profiles',
  );

  const developerId = profile?.id;

  if (developerId) {
    await assertUpsert(
      supabase.from('developer_tokens').upsert({
        developer_id: developerId,
        token_mint: mint,
        creator_wallet: creator,
        notes: `Auto-linked by creator backfill (${source})`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'developer_id,token_mint', ignoreDuplicates: false }),
      'developer_tokens',
    );
  }
}

// The master_token_directory matview sources `creator_wallet` ONLY from these 5
// tables (via COALESCE). If we resolve a creator for a mint that lives in
// flip_positions / autopsy_backlog / proven_dev_tokens / etc. but the matview
// source tables still have NULL, coverage never moves. Propagate to all of
// them whenever the row exists with a null creator.
const MATVIEW_SOURCE_TABLES: Array<{ table: string; column: 'creator_wallet'; orderCol?: string }> = [
  { table: 'pumpfun_watchlist', column: 'creator_wallet' },
  { table: 'holders_intel_seen_tokens', column: 'creator_wallet' },
  { table: 'scraped_tokens', column: 'creator_wallet' },
  { table: 'token_lifecycle', column: 'creator_wallet' },
  { table: 'funnel_feed_discoveries', column: 'creator_wallet' },
];

async function propagateToMatviewSources(supabase: any, mint: string, creator: string): Promise<number> {
  let writes = 0;
  for (const spec of MATVIEW_SOURCE_TABLES) {
    try {
      const payload = updatePayload(spec.table as TargetTable, spec.column, creator);
      const { error, count } = await supabase
        .from(spec.table)
        .update(payload, { count: 'exact' })
        .eq('token_mint', mint)
        .or(`${spec.column}.is.null,${spec.column}.eq.`);
      if (!error && (count ?? 0) > 0) writes += (count ?? 0);
    } catch (_) { /* best-effort propagation */ }
  }
  // ORPHAN FALLBACK: if no source table had a row for this mint, the matview
  // (which only reads creator_wallet from these 5 base tables) will never
  // surface our resolution. ~89% of missing-creator mints are orphans that
  // live only in reputation_mesh / token_social_links. Seed scraped_tokens
  // with a minimal row so the matview picks the creator up on next refresh.
  if (writes === 0) {
    try {
      const { error } = await supabase
        .from('scraped_tokens')
        .upsert(
          {
            token_mint: mint,
            creator_wallet: creator,
            creator_fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'token_mint', ignoreDuplicates: false },
        );
      if (!error) writes = 1;
    } catch (_) { /* best-effort */ }
  }
  return writes;
}

Deno.serve(withRunLog('backfill-creator-wallets', async (req, logger) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(body.batchSize ?? 100), 1), 400);
    const requestDelayMs = Math.min(Math.max(Number(body.requestDelayMs ?? 20), 0), 1000);
    const includeResults = body.includeResults === true;
    const tokenMints = Array.isArray(body.tokenMints)
      ? [...new Set(body.tokenMints.map((mint: unknown) => String(mint).trim()).filter(isLikelyAddress))]
      : [];

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const targets = await buildTargets(supabase, tokenMints, batchSize);
    logger?.info('Creator backfill targets claimed', { targets: targets.length, batchSize });

    type Lookup = { creator: string | null; source: string; confidence: number; errors: string[]; durationMs: number };
    const creatorCache = new Map<string, Lookup>();
    const results: any[] = [];
    const byTable: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let resolved = 0;
    let updated = 0;
    let misses = 0;
    let apiErrors = 0;
    let derivativeWrites = 0;

    for (const target of targets) {
      try {
        let lookup = creatorCache.get(target.mint);
        if (!lookup) {
          const start = Date.now();
          const errs: string[] = [];
          const resolution = await resolveTokenCreator(target.mint, supabase, errs);
          lookup = {
            creator: resolution.creatorWallet,
            source: resolution.source,
            confidence: resolution.confidence,
            errors: resolution.errors,
            durationMs: Date.now() - start,
          };
          creatorCache.set(target.mint, lookup);
          if (requestDelayMs > 0) await delay(requestDelayMs);
        }

        await logBackfillEvent(supabase, {
          mint: target.mint,
          table_name: target.table,
          column_name: target.column,
          solscan_url: providerUrl(lookup.source, target.mint),
          http_status: lookup.creator ? 200 : 404,
          duration_ms: lookup.durationMs,
          from_cache: lookup.source === 'db_cache',
          resolved_creator: lookup.creator,
          error_message: lookup.creator ? null : (lookup.errors.join(' | ') || 'creator_not_found'),
          response_preview: { source: lookup.source, confidence: lookup.confidence, creator: lookup.creator, errors: lookup.errors },
        });

        if (!lookup.creator) {
          misses++;
          if (lookup.errors.length > 0) apiErrors++;
          results.push({ ...target, success: false, source: lookup.source, errors: lookup.errors });
          continue;
        }

        resolved++;
        bySource[lookup.source] = (bySource[lookup.source] ?? 0) + 1;
        await updateMissingCreator(supabase, target, lookup.creator);
        updated++;
        byTable[target.table] = (byTable[target.table] ?? 0) + 1;

        // Propagate to the 5 matview-source tables so master_token_directory
        // coverage actually moves. No-op if those rows already have a creator
        // or the mint isn't present in that table.
        const propagated = await propagateToMatviewSources(supabase, target.mint, lookup.creator);
        if (propagated > 0) byTable['__matview_propagation__'] = (byTable['__matview_propagation__'] ?? 0) + propagated;

        if (target.table !== 'developer_tokens') {
          await seedDeveloperChain(supabase, target.mint, lookup.creator, lookup.source);
          derivativeWrites++;
        }

        results.push({ ...target, success: true, creator_wallet: lookup.creator, source: lookup.source, confidence: lookup.confidence });
      } catch (error) {
        if ((error as any)?.name === 'DbWriteError') throw error;
        apiErrors++;
        console.error(`[backfill-creator-wallets] ${target.table} ${target.mint} failed:`, error);
        results.push({ ...target, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (updated > 0) {
      supabase.rpc('refresh_master_token_directory')
        .then(({ error }: any) => { if (error) console.warn('[backfill-creator-wallets] directory refresh failed:', error.message); })
        .catch((e: any) => console.warn('[backfill-creator-wallets] directory refresh threw:', e?.message));
    }

    return new Response(JSON.stringify({
      message: `Creator backfill updated ${updated} of ${targets.length} claimed rows`,
      claimed: targets.length,
      resolved,
      updated,
      misses,
      apiErrors,
      derivativeWrites,
      uniqueLookups: creatorCache.size,
      byTable,
      bySource,
      results: includeResults ? results : undefined,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    console.error('Error in backfill-creator-wallets:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}));