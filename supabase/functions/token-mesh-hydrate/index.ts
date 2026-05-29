/**
 * token-mesh-hydrate
 *
 * Universal hydration waterfall for any mint paste / autopsy add / oracle
 * lookup / bubble-map entry. Guarantees a populated mesh row before any
 * downstream consumer (autopsy writer, AI summary, oracle scoring) runs.
 *
 * Steps (each returns a structured verdict — never silently empty):
 *   1. cache         token_lifecycle <5min hit
 *   2. identity      DexScreener -> Pump.fun (ticker / name / socials / mcap / liq)
 *   3. creator       resolveTokenCreator (Pump.fun -> Helius DAS -> on-chain)
 *   4. mesh-ingest   ingestPublicCAQuery (token + creator + socials + queue + bump)
 *   5. socials       harvest-token-socials + x-community-enricher (fire & verify)
 *   6. holders       capture-holder-snapshot + ath-backfill (fire & verify)
 *   7. write-back    upsert into autopsy_candidates (if candidate_id passed)
 *
 * Body: { mint: string, candidate_id?: uuid, surface: string, force?: boolean }
 * Returns: { ok, mint, identity, creator, steps: HydrationStep[] }
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertUpdate } from '../_shared/db-assert.ts';
import { getCachedToken } from '../_shared/mesh-cache.ts';
import { ingestPublicCAQuery } from '../_shared/mesh-ingest.ts';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';
import { fetchDexScreenerData } from '../_shared/dexscreener-api.ts';
import { fetchLaunchpadCoin, detectLaunchpad } from '../_shared/launchpad-fetch.ts';
import { detectCopycatPattern, type CopycatVerdict } from '../_shared/copycat-detector.ts';
import { emitPipelineEvent } from '../_shared/pipeline-events.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export interface HydrationStep {
  step: string;
  ok: boolean;
  source?: string;
  ms: number;
  detail?: string;
  reason?: string;
}

interface HydrateBody {
  mint: string;
  candidate_id?: string;
  surface?: string;
  force?: boolean;
}

function isValidMint(m: unknown): m is string {
  if (typeof m !== 'string') return false;
  const t = m.trim();
  return t.length >= 30 && t.length <= 50 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(t);
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, ms: Date.now() - t0 };
  } catch (e) {
    return { result: null, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Run `fn` with a hard timeout. Used to budget best-effort downstream invokes
 * so the parent function can never hit the 150s edge idle-timeout cap.
 */
async function timedWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<{ result: T | null; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const result = await Promise.race<T>([
      fn(),
      new Promise<T>((_, rej) =>
        setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return { result, ms: Date.now() - t0 };
  } catch (e) {
    return { result: null, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: HydrateBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { mint, candidate_id, surface = 'unknown', force = false } = body;
  if (!isValidMint(mint)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_mint' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const steps: HydrationStep[] = [];
  const PHASE = 'mesh-hydrate';
  const emit = (
    step: string,
    status: 'running' | 'ok' | 'fail' | 'skipped' | 'info',
    detail?: string | null,
    reason?: string | null,
    outcome?: 'value_present' | 'confirmed_empty' | 'fetch_failed' | null,
  ) => emitPipelineEvent(supabase, {
    candidateId: candidate_id ?? null,
    phase: PHASE,
    step,
    status,
    detail,
    reason,
    outcome,
  });

  await emit('hydrate', 'running', `mint=${mint.slice(0, 6)}…${mint.slice(-4)} surface=${surface}`);
  const identity: {
    ticker?: string | null;
    name?: string | null;
    twitterUrl?: string | null;
    telegramUrl?: string | null;
    websiteUrl?: string | null;
    marketCapUsd?: number | null;
    liquidityUsd?: number | null;
    priceUsd?: number | null;
    athMcapUsd?: number | null;
    imageUrl?: string | null;
    createdAt?: string | null;
  } = {};
  let creatorWallet: string | null = null;
  let copycatVerdict: CopycatVerdict | null = null;

  // -- Step 1: cache --
  // Autopsies analyse dead tokens whose identity/creator/ATH/socials never
  // change. For that surface we widen the cache window to 30 days so we
  // don't burn DexScreener/Pump.fun/Helius credits re-fetching immutable data.
  const cacheTtlMs = surface === 'autopsy_pipeline'
    ? 30 * 24 * 60 * 60 * 1000  // 30 days
    : 5 * 60 * 1000;            // 5 minutes (live surfaces)
  const cacheLabel = surface === 'autopsy_pipeline' ? '<30d (autopsy)' : '<5m';
  if (!force) {
    await emit('cache', 'running', `check token_lifecycle ${cacheLabel}`);
    const t = await timed(() => getCachedToken(supabase, mint, cacheTtlMs));
    if (t.result) {
      identity.ticker = t.result.symbol ?? null;
      identity.name = t.result.name ?? null;
      identity.marketCapUsd = t.result.market_cap ?? null;
      creatorWallet = t.result.creator_wallet ?? null;
      steps.push({
        step: 'cache',
        ok: true,
        source: 'token_lifecycle',
        ms: t.ms,
        detail: `${identity.ticker ?? '?'} cached ${t.result.updated_at}`,
      });
      await emit('cache', 'ok', `${identity.ticker ?? '?'} cached`, null, 'value_present');
    } else {
      steps.push({ step: 'cache', ok: false, ms: t.ms, reason: 'miss_or_stale' });
      await emit('cache', 'skipped', 'miss_or_stale → falling through', null, 'confirmed_empty');
    }
  } else {
    steps.push({ step: 'cache', ok: false, ms: 0, reason: 'force=true bypassed cache' });
    await emit('cache', 'skipped', 'force=true bypassed cache');
  }

  // -- Step 2: identity (DexScreener primary, Pump.fun fallback) --
  {
    await emit('identity', 'running', 'DexScreener → Pump.fun fallback');
    const dx = await timed(() => fetchDexScreenerData(mint));
    if (dx.result && dx.result.pairs.length > 0) {
      const best = dx.result.pairs[0];
      identity.ticker ||= best.baseToken?.symbol ?? null;
      identity.name ||= best.baseToken?.name ?? null;
      identity.priceUsd ||= dx.result.priceUsd || null;
      identity.liquidityUsd ||= dx.result.vitality.liquidityUsd || null;
      identity.marketCapUsd ||= best.marketCap ?? best.fdv ?? null;
      identity.twitterUrl ||= dx.result.socials.twitter ?? null;
      identity.telegramUrl ||= dx.result.socials.telegram ?? null;
      identity.websiteUrl ||= dx.result.socials.website ?? null;
      steps.push({
        step: 'identity',
        ok: true,
        source: 'dexscreener',
        ms: dx.ms,
        detail: `${identity.ticker ?? '?'} · mcap=$${Math.round(identity.marketCapUsd ?? 0)} · liq=$${Math.round(identity.liquidityUsd ?? 0)}`,
      });
      await emit('identity', 'ok', `${identity.ticker ?? '?'} via dexscreener · mcap=$${Math.round(identity.marketCapUsd ?? 0)}`, null, 'value_present');
    } else {
      // Fallback: unified launchpad resolver (Pump.fun / Bags.fm / Bonk / Meteora)
      await emit('identity-launchpad', 'running', 'DexScreener empty → launchpad resolver');
      const lp = await timed(() => fetchLaunchpadCoin(mint, 'token-mesh-hydrate'));
      if (lp.result?.data) {
        const d = lp.result.data;
        identity.ticker ||= d.symbol ?? null;
        identity.name ||= d.name ?? null;
        identity.twitterUrl ||= d.twitter ?? null;
        identity.telegramUrl ||= d.telegram ?? null;
        identity.websiteUrl ||= d.website ?? null;
        identity.marketCapUsd ||= d.marketCapUsd ?? null;
        identity.athMcapUsd ||= d.athMarketCapUsd ?? null;
        identity.imageUrl ||= d.imageUri ?? null;
        identity.createdAt ||= d.createdAt ?? null;
        creatorWallet ||= d.creator ?? null;
        steps.push({
          step: 'identity',
          ok: true,
          source: d.launchpad,
          ms: dx.ms + lp.ms,
          detail: `${identity.ticker ?? '?'} (DexScreener empty — ${d.launchpad} fallback)`,
        });
        await emit('identity-launchpad', 'ok', `${identity.ticker ?? '?'} via ${d.launchpad}`, null, 'value_present');
      } else {
        steps.push({
          step: 'identity',
          ok: false,
          ms: dx.ms + lp.ms,
          reason: `DexScreener: ${dx.error ?? 'no pairs'} · launchpad(${lp.result?.launchpad ?? '?'}): ${lp.result?.reason ?? lp.error ?? 'no record'}`,
        });
        await emit('identity', 'fail', null, `DexScreener: ${dx.error ?? 'no pairs'} · launchpad: ${lp.result?.reason ?? lp.error ?? 'no record'}`, 'fetch_failed');
      }
    }
  }

  // -- Step 2b: opportunistic launchpad enrichment --
  // DexScreener handled identity but didn't fill ATH / image / createdAt.
  // Route through the unified resolver — Pump.fun returns full data,
  // Bags.fm returns creator/socials, Bonk/Meteora return null cleanly.
  if (
    (identity.athMcapUsd == null || identity.imageUrl == null || identity.createdAt == null) &&
    detectLaunchpad(mint) !== 'unknown'
  ) {
    await emit('launchpad-enrich', 'running', 'fetching ATH / image / createdAt');
    const lp2 = await timed(() => fetchLaunchpadCoin(mint, 'token-mesh-hydrate-enrich'));
    if (lp2.result?.data) {
      const d = lp2.result.data;
      identity.athMcapUsd ||= d.athMarketCapUsd ?? null;
      identity.marketCapUsd ||= d.marketCapUsd ?? null;
      identity.imageUrl ||= d.imageUri ?? null;
      identity.createdAt ||= d.createdAt ?? null;
      identity.twitterUrl ||= d.twitter ?? null;
      identity.telegramUrl ||= d.telegram ?? null;
      identity.websiteUrl ||= d.website ?? null;
      creatorWallet ||= d.creator ?? null;
      steps.push({
        step: 'launchpad-enrich',
        ok: true,
        source: d.launchpad,
        ms: lp2.ms,
        detail: `ath=${identity.athMcapUsd ?? '—'} · img=${identity.imageUrl ? 'yes' : 'no'}`,
      });
      await emit('launchpad-enrich', 'ok', `ath=${identity.athMcapUsd ?? '—'} · img=${identity.imageUrl ? 'y' : 'n'}`, null, 'value_present');
    } else {
      await emit('launchpad-enrich', 'skipped', 'no extra data returned', null, 'confirmed_empty');
    }
  }

  // -- Step 2c: persist Pump.fun-derived facts to token_lifecycle + pumpfun_watchlist --
  // Same write that autopsy-writer does, but we do it during initial hydration so
  // any subsequent reader (autopsy, oracle, AI) sees a fully populated mesh row.
  if (identity.athMcapUsd || identity.imageUrl || identity.marketCapUsd) {
    const lifecyclePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (identity.athMcapUsd && identity.athMcapUsd > 0) lifecyclePatch.ath_24h_usd = identity.athMcapUsd;
    if (identity.marketCapUsd && identity.marketCapUsd > 0) lifecyclePatch.market_cap = identity.marketCapUsd;
    if (identity.imageUrl) lifecyclePatch.image_url = identity.imageUrl;
    await supabase.from('token_lifecycle').update(lifecyclePatch).eq('token_mint', mint);

    const wlPatch: Record<string, unknown> = {};
    if (identity.athMcapUsd && identity.athMcapUsd > 0) wlPatch.ath_market_cap_usd = identity.athMcapUsd;
    if (identity.marketCapUsd && identity.marketCapUsd > 0) wlPatch.market_cap_usd = identity.marketCapUsd;
    if (identity.imageUrl) wlPatch.image_url = identity.imageUrl;
    if (Object.keys(wlPatch).length > 0) {
      await supabase.from('pumpfun_watchlist').update(wlPatch).eq('token_mint', mint);
    }
  }

  // -- Step 3: creator resolution --
  if (!creatorWallet) {
    await emit('creator', 'running', 'Pump.fun → Helius DAS → on-chain');
    const cr = await timed(() => resolveTokenCreator(mint, supabase));
    if (cr.result?.creatorWallet) {
      creatorWallet = cr.result.creatorWallet;
      steps.push({
        step: 'creator',
        ok: true,
        source: cr.result.source,
        ms: cr.ms,
        detail: `${creatorWallet.slice(0, 6)}…${creatorWallet.slice(-4)} (conf ${cr.result.confidence})`,
      });
      await emit('creator', 'ok', `${creatorWallet.slice(0, 6)}…${creatorWallet.slice(-4)} via ${cr.result.source} conf ${cr.result.confidence}`, null, 'value_present');
    } else {
      steps.push({
        step: 'creator',
        ok: false,
        ms: cr.ms,
        reason: cr.result?.errors?.join('; ') || cr.error || 'all sources empty',
      });
      await emit('creator', 'fail', null, cr.result?.errors?.join('; ') || cr.error || 'all sources empty', 'fetch_failed');
    }
  } else {
    steps.push({ step: 'creator', ok: true, source: 'cache', ms: 0, detail: `${creatorWallet.slice(0, 6)}…${creatorWallet.slice(-4)}` });
    await emit('creator', 'ok', `${creatorWallet.slice(0, 6)}…${creatorWallet.slice(-4)} (from cache)`, null, 'value_present');
  }

  // -- Step 4: mesh ingest --
  {
    await emit('mesh-ingest', 'running', 'mesh + post-queue + bump_seen_token');
    const mi = await timed(() =>
      ingestPublicCAQuery(supabase, {
        mint,
        source: surface,
        symbol: identity.ticker ?? null,
        name: identity.name ?? null,
        creatorWallet,
        marketCap: identity.marketCapUsd ?? null,
        twitterUrl: identity.twitterUrl ?? null,
        telegramUrl: identity.telegramUrl ?? null,
        websiteUrl: identity.websiteUrl ?? null,
        enqueueForPost: true,
      }),
    );
    steps.push({
      step: 'mesh-ingest',
      ok: mi.error ? false : true,
      source: 'mesh-ingest',
      ms: mi.ms,
      detail: mi.error ? undefined : 'mesh + post-queue + bump_seen_token fired',
      reason: mi.error,
    });
    await emit('mesh-ingest', mi.error ? 'fail' : 'ok', mi.error ? null : 'mesh + post-queue + bump_seen_token fired', mi.error, mi.error ? 'fetch_failed' : 'value_present');
  }

  // -- Step 5: social mesh enrichment (best-effort fire & verify) --
  {
    await emit('socials', 'running', 'harvest-token-socials (45s timeout)');
    const hs = await timedWithTimeout(
      () => supabase.functions.invoke('harvest-token-socials', { body: { mint, force: true } }),
      45_000,
    );
    const hsErrMsg = hs.error ?? (hs.result as any)?.error?.message;
    const hsTimedOut = !!hsErrMsg && /timed?\s*out|timeout/i.test(hsErrMsg);
    steps.push({
      step: 'socials',
      ok: !hs.error && !(hs.result as any)?.error,
      source: 'harvest-token-socials',
      ms: hs.ms,
      detail: hs.result ? `harvested` : undefined,
      reason: hsErrMsg,
      // Marker so downstream socials-backfill can demote a timeout-only failure
      // to 'skipped' once it confirms which links were actually recovered.
      // (kept on the in-memory step object only)
      // @ts-ignore — extra field tolerated by downstream consumers
      timed_out: hsTimedOut,
    });
    {
      const ok = !hs.error && !(hs.result as any)?.error;
      // If the harvester merely hit its 45 s budget (very common — the X scrape
      // can stall while the mesh data is already in token_social_links), don't
      // scream 'fail' yet. Mark 'skipped' with the reason; the next step
      // (socials-backfill) is the source of truth and will confirm what we got.
      const status: 'ok' | 'fail' | 'skipped' = ok
        ? 'ok'
        : hsTimedOut ? 'skipped' : 'fail';
      await emit('socials', status,
        ok ? `harvested in ${hs.ms}ms`
          : hsTimedOut ? 'budget exceeded — deferring to socials-backfill'
          : null,
        ok ? null : hsErrMsg,
        ok ? 'value_present' : hsTimedOut ? 'confirmed_empty' : 'fetch_failed');
    }

    if (identity.twitterUrl) {
      await emit('x-community', 'running', `enriching ${identity.twitterUrl}`);
      const xc = await timedWithTimeout(
        () => supabase.functions.invoke('x-community-enricher', { body: { mint, twitterUrl: identity.twitterUrl } }),
        45_000,
      );
      steps.push({
        step: 'x-community',
        ok: !xc.error,
        source: 'x-community-enricher',
        ms: xc.ms,
        detail: xc.result ? 'enriched' : undefined,
        reason: xc.error,
      });
      await emit('x-community', xc.error ? 'fail' : 'ok', xc.error ? null : `enriched in ${xc.ms}ms`, xc.error, xc.error ? 'fetch_failed' : 'value_present');
    } else {
      steps.push({ step: 'x-community', ok: false, ms: 0, reason: 'no twitter handle to enrich' });
      await emit('x-community', 'skipped', 'no twitter handle on this token', null, 'confirmed_empty');
    }
  }

  // -- Step 6: holders snapshot (best-effort) --
  {
    await emit('holders', 'running', 'capture-holder-snapshot (45s timeout)');
    const h = await timedWithTimeout(
      () => supabase.functions.invoke('capture-holder-snapshot', { body: { token_mint: mint } }),
      45_000,
    );
    steps.push({
      step: 'holders',
      ok: !h.error,
      source: 'capture-holder-snapshot',
      ms: h.ms,
      detail: h.result ? 'snapshot captured' : undefined,
      reason: h.error,
    });
    await emit('holders', h.error ? 'fail' : 'ok', h.error ? null : `snapshot captured in ${h.ms}ms`, h.error, h.error ? 'fetch_failed' : 'value_present');
  }

  // -- Step 6a: weak-theme copycat detection (Pump.fun-only — needs creator history) --
  if (creatorWallet && detectLaunchpad(mint) === 'pumpfun') {
    await emit('copycat-scan', 'running', 'analyzing creator history');
    const cc = await timed(() => detectCopycatPattern(creatorWallet!, 'token-mesh-hydrate', mint));
    if (cc.result) {
      copycatVerdict = cc.result;
      // Persist to dev_wallet_reputation.metadata for downstream surfaces
      await supabase
        .from('dev_wallet_reputation')
        .update({
          metadata: {
            copycat: {
              verdict: cc.result.verdict,
              caution: cc.result.cautionMessage,
              clusters: cc.result.clusters.map(c => ({ theme: c.theme, count: c.members.length })),
              failureRate: cc.result.failureRate,
              medianAthUsd: cc.result.medianAthUsd,
              launchesLast30d: cc.result.launchesLast30d,
              totalPriorTokens: cc.result.totalPriorTokens,
              analyzedAt: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_address', creatorWallet);
      steps.push({
        step: 'copycat-scan',
        ok: true,
        source: 'pumpfun-creator-history',
        ms: cc.ms,
        detail: `${cc.result.verdict}${cc.result.cautionMessage ? ' — ' + cc.result.cautionMessage : ''}`,
      });
      await emit('copycat-scan', 'ok', `${cc.result.verdict}${cc.result.cautionMessage ? ' — ' + cc.result.cautionMessage : ''}`, null, 'value_present');
    } else {
      steps.push({
        step: 'copycat-scan',
        ok: false,
        ms: cc.ms,
        reason: cc.error ?? 'no creator history available',
      });
      await emit('copycat-scan', 'skipped', null, cc.error ?? 'no creator history available', 'confirmed_empty');
    }
  }

  // -- Step 6b: backfill identity socials from token_social_links --
  // Harvest may discover TG/X/website that DexScreener/Pump.fun didn't surface.
  // Without this, downstream callers (autopsy queue) gate features like
  // tg-deep-pull on identity.telegramUrl and silently skip them. The MCUNC bug.
  if (!identity.twitterUrl || !identity.telegramUrl || !identity.websiteUrl) {
    await emit('socials-backfill', 'running', 'reading token_social_links');
    const { data: links } = await supabase
      .from('token_social_links')
      .select('platform, link_type, url, is_current')
      .eq('token_mint', mint)
      .neq('is_current', false);
    for (const l of links ?? []) {
      const blob = `${l.platform ?? ''} ${l.link_type ?? ''} ${l.url ?? ''}`.toLowerCase();
      if (!l.url) continue;
      if (!identity.twitterUrl && (blob.includes('twitter') || blob.includes('x.com') || blob.includes('/x/'))) {
        identity.twitterUrl = l.url;
      }
      if (!identity.telegramUrl && (blob.includes('telegram') || blob.includes('t.me'))) {
        identity.telegramUrl = l.url;
      }
      if (!identity.websiteUrl && (blob.includes('website') || blob.includes('homepage'))) {
        identity.websiteUrl = l.url;
      }
    }
    steps.push({
      step: 'socials-backfill',
      ok: true,
      source: 'token_social_links',
      ms: 0,
      detail: `tw=${identity.twitterUrl ? 'y' : 'n'} tg=${identity.telegramUrl ? 'y' : 'n'} web=${identity.websiteUrl ? 'y' : 'n'}`,
    });
    await emit('socials-backfill', 'ok', `tw=${identity.twitterUrl ? 'y' : 'n'} tg=${identity.telegramUrl ? 'y' : 'n'} web=${identity.websiteUrl ? 'y' : 'n'}`, null, 'value_present');
  }

  // -- Step 7: write-back to autopsy_candidates if requested --
  if (candidate_id) {
    await emit('write-back', 'running', 'updating autopsy_candidates');
    const social_completeness =
      [identity.twitterUrl, identity.telegramUrl, identity.websiteUrl].filter(Boolean).length;

    const wb = await timed(async () => {
      // Read existing attempts so we can increment.
      const { data: existing } = await supabase
        .from('autopsy_candidates')
        .select('hydration_attempts')
        .eq('id', candidate_id)
        .maybeSingle();
      const attempts = (existing?.hydration_attempts ?? 0) + 1;

      return assertUpdate(
        supabase
          .from('autopsy_candidates')
          .update({
            ticker: identity.ticker ?? undefined,
            token_name: identity.name ?? undefined,
            creator_wallet: creatorWallet ?? undefined,
            current_mcap_usd: identity.marketCapUsd ?? undefined,
            liquidity_usd: identity.liquidityUsd ?? undefined,
            social_completeness,
            hydration_status: { steps },
            hydrated_at: new Date().toISOString(),
            hydration_attempts: attempts,
          })
          .eq('id', candidate_id),
        'autopsy_candidates.write-back',
      );
    });
    steps.push({
      step: 'write-back',
      ok: !wb.error,
      source: 'autopsy_candidates',
      ms: wb.ms,
      detail: wb.error ? undefined : `social_completeness=${social_completeness}`,
      reason: wb.error,
    });
    await emit('write-back', wb.error ? 'fail' : 'ok', wb.error ? null : `social_completeness=${social_completeness}/3`, wb.error, wb.error ? 'fetch_failed' : 'value_present');
  }

  const okCount = steps.filter(s => s.ok).length;
  const overallOk = okCount >= 4; // identity + mesh-ingest + at least 2 enrichments
  await emit('hydrate', overallOk ? 'ok' : 'fail',
    `${okCount}/${steps.length} sub-steps succeeded`,
    overallOk ? null : 'too few enrichments succeeded',
    overallOk ? 'value_present' : 'fetch_failed');

  // Stamp telegram_insider_token_lifecycle.mesh_hydrated_at so the
  // no-lube-orchestrate Big Picture eligibility gate can advance. We stamp
  // on overallOk; partial runs leave the row untouched so a retry can fix it.
  if (overallOk) {
    try {
      await supabase
        .from('telegram_insider_token_lifecycle')
        .update({ mesh_hydrated_at: new Date().toISOString() })
        .eq('token_mint', mint);
    } catch (e) {
      console.warn('[token-mesh-hydrate] stamp mesh_hydrated_at failed (non-fatal):', (e as Error).message);
    }
  }

  return new Response(
    JSON.stringify({
      ok: overallOk,
      mint,
      identity,
      creatorWallet,
      copycat: copycatVerdict,
      surface,
      steps,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

Deno.serve(withRunLog('token-mesh-hydrate', handle));