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

  // -- Step 1: cache --
  if (!force) {
    const t = await timed(() => getCachedToken(supabase, mint, 5 * 60 * 1000));
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
    } else {
      steps.push({ step: 'cache', ok: false, ms: t.ms, reason: 'miss_or_stale' });
    }
  } else {
    steps.push({ step: 'cache', ok: false, ms: 0, reason: 'force=true bypassed cache' });
  }

  // -- Step 2: identity (DexScreener primary, Pump.fun fallback) --
  {
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
    } else {
      // Fallback: unified launchpad resolver (Pump.fun / Bags.fm / Bonk / Meteora)
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
      } else {
        steps.push({
          step: 'identity',
          ok: false,
          ms: dx.ms + lp.ms,
          reason: `DexScreener: ${dx.error ?? 'no pairs'} · launchpad(${lp.result?.launchpad ?? '?'}): ${lp.result?.reason ?? lp.error ?? 'no record'}`,
        });
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
    } else {
      steps.push({
        step: 'creator',
        ok: false,
        ms: cr.ms,
        reason: cr.result?.errors?.join('; ') || cr.error || 'all sources empty',
      });
    }
  } else {
    steps.push({ step: 'creator', ok: true, source: 'cache', ms: 0, detail: `${creatorWallet.slice(0, 6)}…${creatorWallet.slice(-4)}` });
  }

  // -- Step 4: mesh ingest --
  {
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
  }

  // -- Step 5: social mesh enrichment (best-effort fire & verify) --
  {
    const hs = await timed(() =>
      supabase.functions.invoke('harvest-token-socials', { body: { mint, force: true } }),
    );
    steps.push({
      step: 'socials',
      ok: !hs.error && !(hs.result as any)?.error,
      source: 'harvest-token-socials',
      ms: hs.ms,
      detail: hs.result ? `harvested` : undefined,
      reason: hs.error ?? (hs.result as any)?.error?.message,
    });

    if (identity.twitterUrl) {
      const xc = await timed(() =>
        supabase.functions.invoke('x-community-enricher', { body: { mint, twitterUrl: identity.twitterUrl } }),
      );
      steps.push({
        step: 'x-community',
        ok: !xc.error,
        source: 'x-community-enricher',
        ms: xc.ms,
        detail: xc.result ? 'enriched' : undefined,
        reason: xc.error,
      });
    } else {
      steps.push({ step: 'x-community', ok: false, ms: 0, reason: 'no twitter handle to enrich' });
    }
  }

  // -- Step 6: holders snapshot (best-effort) --
  {
    const h = await timed(() =>
      supabase.functions.invoke('capture-holder-snapshot', { body: { token_mint: mint } }),
    );
    steps.push({
      step: 'holders',
      ok: !h.error,
      source: 'capture-holder-snapshot',
      ms: h.ms,
      detail: h.result ? 'snapshot captured' : undefined,
      reason: h.error,
    });
  }

  // -- Step 7: write-back to autopsy_candidates if requested --
  if (candidate_id) {
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
            x_url: identity.twitterUrl ?? undefined,
            tg_url: identity.telegramUrl ?? undefined,
            website_url: identity.websiteUrl ?? undefined,
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
  }

  const okCount = steps.filter(s => s.ok).length;
  const overallOk = okCount >= 4; // identity + mesh-ingest + at least 2 enrichments

  return new Response(
    JSON.stringify({
      ok: overallOk,
      mint,
      identity,
      creatorWallet,
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