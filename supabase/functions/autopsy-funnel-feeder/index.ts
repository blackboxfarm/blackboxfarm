/**
 * autopsy-funnel-feeder
 *
 * Cron-driven candidate funnel for the BlackBox Autopsy pipeline.
 * Pulls dead/dying tokens from multiple sources and upserts into autopsy_candidates
 * with a candidate_score, death_cause guess, tier (A/B/C), and signals.
 *
 * Sources (union, deduped by token_mint):
 *   1. token_lifecycle  — mcap < $1k OR liquidity < $500 (current floor)
 *   2. pumpfun_watchlist — status='dead' tokens
 *   3. dex-top-200 dropouts — tokens that fell out of dex_top_200 in last 7d
 *   4. ATH-collapsed — token_lifecycle with ATH > $50k AND current < 5% of ATH
 *   5. admin manual queue — autopsy_candidates rows already inserted with source_feed='admin_manual'
 *
 * Tier-A candidates (clear coordinated rugs / atomic snipes / LP pulls) get queued first.
 * Tier-C (organic deaths) only enqueued when admin flags them manually.
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
import { assertDbWrite, assertUpsert } from '../_shared/db-assert.ts';
import { classifyDeath, classifyCurveDeath, DEATH_TAXONOMY, tierFor, type DeathCauseId } from '../_shared/autopsy-taxonomy.ts';
import { fetchPumpFunCoin } from '../_shared/pumpfun-fetch.ts';

const PUMPFUN_LAMB_MIN_CURVE_PCT = 75;
const PUMPFUN_LAMB_MAX_CURVE_PCT = 99.5;
const PUMPFUN_TOKEN_SUPPLY = 1_000_000_000;
const PUMPFUN_INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000;

function peakMcapUsd(row: { market_cap_usd?: number | null; price_ath_usd?: number | null; price_peak?: number | null }): number {
  return Math.max(
    Number(row.market_cap_usd ?? 0),
    Number(row.price_ath_usd ?? 0) * PUMPFUN_TOKEN_SUPPLY,
    Number(row.price_peak ?? 0) * PUMPFUN_TOKEN_SUPPLY,
  );
}

function liveCurveProgressFromPump(coin: any): number | null {
  const realTokenReserves = Number(coin?.real_token_reserves ?? NaN);
  if (!Number.isFinite(realTokenReserves)) return null;
  const tokensSold = PUMPFUN_INITIAL_REAL_TOKEN_RESERVES - realTokenReserves;
  return Math.max(0, Math.min(100, (tokensSold / PUMPFUN_INITIAL_REAL_TOKEN_RESERVES) * 100));
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FunnelStats {
  source_token_lifecycle: number;
  source_pumpfun_watchlist: number;
  source_ath_collapsed: number;
  total_unique: number;
  inserted: number;
  updated: number;
  tier_A: number;
  tier_B: number;
  tier_C: number;
  errors: number;
}

function scoreCandidate(input: {
  cause: DeathCauseId;
  confidence: number;
  athMcap: number;
  ageHours: number;
}): number {
  // Higher score = more interesting to autopsy first.
  // Heuristic: malicious causes + high ATH + recent death > everything else.
  const def = DEATH_TAXONOMY[input.cause];
  const intentMul = def?.intent === 'malicious' ? 1.5
    : def?.intent === 'negligent' ? 1.0
    : 0.5;
  const athBoost = Math.min(50, Math.log10(Math.max(1, input.athMcap)) * 10);
  const recencyBoost = input.ageHours < 168 ? 20 : 0; // bonus for tokens that died this week
  return Math.round((input.confidence * intentMul + athBoost + recencyBoost) * 10) / 10;
}

Deno.serve(withRunLog('autopsy-funnel-feeder', async (req) => {
  if (!await isFunctionEnabled('autopsy-funnel-feeder')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const body = await req.json().catch(() => ({}));
  // `limit` = per-source pull cap. We dedupe across sources so total unique can be lower.
  const limit = Math.min(body.limit || 5000, 20000);

  const stats: FunnelStats = {
    source_token_lifecycle: 0,
    source_pumpfun_watchlist: 0,
    source_ath_collapsed: 0,
    total_unique: 0,
    inserted: 0,
    updated: 0,
    tier_A: 0, tier_B: 0, tier_C: 0,
    errors: 0,
  };
  const debugSample: any[] = [];
  const skipReasons = { tierC_lowATH_nonPumpfun: 0, promoted_pumpfun: 0, processed: 0 };

  await assertDbWrite(
    supabase
      .from('autopsy_candidates')
      .delete()
      .eq('source_feed', 'pumpfun_curve_death')
      .or(`bonding_curve_pct.is.null,bonding_curve_pct.lt.${PUMPFUN_LAMB_MIN_CURVE_PCT},bonding_curve_pct.gte.${PUMPFUN_LAMB_MAX_CURVE_PCT}`),
    'autopsy_candidates',
    'DELETE stale non-Lamb curve deaths'
  );

  const candidatesByMint = new Map<string, {
    token_mint: string;
    ticker?: string;
    token_name?: string;
    source_feed: string;
    ath_mcap_usd?: number;
    current_mcap_usd?: number;
    liquidity_usd?: number;
    age_hours?: number;
    creator_wallet?: string;
    bonding_curve_pct?: number;
    dev_sold?: boolean | null;
    dev_holding_pct?: number | null;
    linked_wallet_count?: number | null;
    bundled_buy_count?: number | null;
    price_peak?: number | null;
    price_current?: number | null;
    image_url?: string | null;
  }>();

  // ── 1. token_lifecycle dead floor ─────────────────────────────
  const { data: lifecycleDead } = await supabase
    .from('token_lifecycle')
    .select('token_mint, market_cap, liquidity_usd, created_at, ath_24h_usd')
    .or('market_cap.lt.1000,liquidity_usd.lt.500')
    .is('autopsy_at', null)
    .not('token_mint', 'is', null)
    .limit(limit);

  for (const t of lifecycleDead ?? []) {
    if (!t.token_mint) continue;
    const ageHours = t.created_at ? (Date.now() - new Date(t.created_at).getTime()) / 3600000 : 0;
    candidatesByMint.set(t.token_mint, {
      token_mint: t.token_mint,
      source_feed: 'token_lifecycle',
      ath_mcap_usd: t.ath_24h_usd ?? undefined,
      current_mcap_usd: t.market_cap ?? undefined,
      liquidity_usd: t.liquidity_usd ?? undefined,
      age_hours: ageHours,
    });
    stats.source_token_lifecycle++;
  }

  // ── 2. pumpfun_watchlist Lambs (75% <= curve ATH < 100%, never graduated) ─────
  // IMPORTANT: Lambs are selected ONLY by recorded bonding-curve progress.
  // ATH market cap is display/context only; it must never fake curve progress.
  const { data: pfLambs } = await supabase
    .from('pumpfun_watchlist')
    .select(`
      token_mint, token_symbol, token_name, market_cap_usd, liquidity_usd,
      creator_wallet, first_seen_at, status, removal_reason, bonding_curve_pct,
      dev_sold, dev_holding_pct, linked_wallet_count, bundled_buy_count,
      price_peak, price_current, price_ath_usd, image_url, is_graduated
    `)
    .eq('status', 'dead')
    .not('is_graduated', 'is', true)
    .gte('bonding_curve_pct', PUMPFUN_LAMB_MIN_CURVE_PCT)
    .lt('bonding_curve_pct', PUMPFUN_LAMB_MAX_CURVE_PCT)
    .not('token_mint', 'is', null)
    .limit(limit);

  for (const t of pfLambs ?? []) {
    if (!t.token_mint) continue;
    const peakMcap = peakMcapUsd(t);
    const livePump = await fetchPumpFunCoin(t.token_mint, 'autopsy-funnel-feeder-lamb-verify');
    const liveProgress = liveCurveProgressFromPump(livePump);
    if (livePump?.complete === true || livePump?.raydium_pool || (liveProgress ?? 0) >= PUMPFUN_LAMB_MAX_CURVE_PCT) {
      await assertDbWrite(
        supabase
          .from('pumpfun_watchlist')
          .update({ is_graduated: true, graduated_at: new Date().toISOString(), last_processor: 'autopsy-funnel-feeder-lamb-verify' })
          .eq('token_mint', t.token_mint),
        'pumpfun_watchlist',
        'UPDATE graduated Lamb false-positive'
      );
      continue;
    }
    const ageHours = t.first_seen_at ? (Date.now() - new Date(t.first_seen_at).getTime()) / 3600000 : 0;
    const existing = candidatesByMint.get(t.token_mint);
    // Curve deaths win source attribution — they're our highest-signal feed.
    candidatesByMint.set(t.token_mint, {
      ...(existing ?? {}),
      token_mint: t.token_mint,
      source_feed: 'pumpfun_curve_death',
      ticker: t.token_symbol ?? existing?.ticker,
      token_name: t.token_name ?? existing?.token_name,
      ath_mcap_usd: Math.max(existing?.ath_mcap_usd ?? 0, peakMcap),
      current_mcap_usd: t.market_cap_usd ?? existing?.current_mcap_usd,
      liquidity_usd: t.liquidity_usd ?? existing?.liquidity_usd,
      creator_wallet: t.creator_wallet ?? existing?.creator_wallet,
      age_hours: existing?.age_hours ?? ageHours,
      bonding_curve_pct: Number(t.bonding_curve_pct),
      dev_sold: t.dev_sold,
      dev_holding_pct: t.dev_holding_pct,
      linked_wallet_count: t.linked_wallet_count,
      bundled_buy_count: t.bundled_buy_count,
      price_peak: t.price_peak,
      price_current: t.price_current,
      image_url: t.image_url ?? null,
    });
    if (!existing) stats.source_pumpfun_watchlist++;
  }

  // ── 3. ATH-collapsed (>$50k ATH but now <5% of ATH) ───────────
  const { data: athCollapsed } = await supabase
    .from('token_lifecycle')
    .select('token_mint, market_cap, liquidity_usd, created_at, ath_24h_usd')
    .gt('ath_24h_usd', 50000)
    .is('autopsy_at', null)
    .not('token_mint', 'is', null)
    .limit(limit);

  for (const t of athCollapsed ?? []) {
    if (!t.token_mint || !t.ath_24h_usd) continue;
    const ratio = (t.market_cap ?? 0) / t.ath_24h_usd;
    if (ratio >= 0.05) continue;
    const ageHours = t.created_at ? (Date.now() - new Date(t.created_at).getTime()) / 3600000 : 0;
    const existing = candidatesByMint.get(t.token_mint);
    candidatesByMint.set(t.token_mint, {
      ...(existing ?? { token_mint: t.token_mint, source_feed: 'ath_collapsed' }),
      ath_mcap_usd: t.ath_24h_usd,
      current_mcap_usd: t.market_cap ?? existing?.current_mcap_usd,
      liquidity_usd: t.liquidity_usd ?? existing?.liquidity_usd,
      age_hours: existing?.age_hours ?? ageHours,
    });
    if (!existing) stats.source_ath_collapsed++;
  }

  stats.total_unique = candidatesByMint.size;

  // ── Batch-fetch dev_behavior_scores for all known creators (avoids N+1 timeout) ──
  const creatorWallets = [...new Set(
    [...candidatesByMint.values()].map(c => c.creator_wallet).filter(Boolean) as string[]
  )];
  const devScoreByWallet = new Map<string, any>();
  // chunk in 500s to stay under PostgREST in() limits
  for (let i = 0; i < creatorWallets.length; i += 500) {
    const chunk = creatorWallets.slice(i, i + 500);
    const { data: rows } = await supabase
      .from('dev_behavior_scores')
      .select('wallet_address, dump_velocity_score, lp_pull_score, supply_retention_pct, risk_tier')
      .in('wallet_address', chunk);
    for (const r of rows ?? []) devScoreByWallet.set(r.wallet_address, r);
  }

  // ── Batch count: prior dead tokens per creator (used by curve_wallet_washer) ──
  const priorDeadByCreator = new Map<string, number>();
  for (let i = 0; i < creatorWallets.length; i += 500) {
    const chunk = creatorWallets.slice(i, i + 500);
    const { data: priors } = await supabase
      .from('pumpfun_watchlist')
      .select('creator_wallet')
      .in('creator_wallet', chunk)
      .eq('status', 'dead');
    for (const r of priors ?? []) {
      if (!r.creator_wallet) continue;
      priorDeadByCreator.set(r.creator_wallet, (priorDeadByCreator.get(r.creator_wallet) ?? 0) + 1);
    }
  }

  // ── Classify + upsert ────────────────────────────────────────
  for (const c of candidatesByMint.values()) {
    try {
      const devScore = c.creator_wallet ? devScoreByWallet.get(c.creator_wallet) : null;

      let cause: DeathCauseId;
      let confidence: number;
      let matchedSignals: string[];

      if (c.source_feed === 'pumpfun_curve_death') {
        // Curve-aware classifier — uses pumpfun_watchlist signals directly.
        const priorDead = c.creator_wallet
          ? Math.max(0, (priorDeadByCreator.get(c.creator_wallet) ?? 0) - 1) // exclude this token
          : 0;
        const out = classifyCurveDeath({
          bondingCurvePct: c.bonding_curve_pct ?? 75,
          ageHours: c.age_hours ?? 0,
          devSold: c.dev_sold,
          devHoldingPct: c.dev_holding_pct,
          linkedWalletCount: c.linked_wallet_count,
          bundledBuyCount: c.bundled_buy_count,
          pricePeak: c.price_peak,
          priceCurrent: c.price_current,
          creatorPriorDeadTokens: priorDead,
        });
        cause = out.cause;
        confidence = out.confidence;
        matchedSignals = out.matchedSignals;
      } else {
        const out = classifyDeath({
          ageHours: c.age_hours ?? 0,
          mcap: c.current_mcap_usd ?? 0,
          liquidity: c.liquidity_usd ?? 0,
          athMcap: c.ath_mcap_usd ?? 0,
          dumpVelocity: devScore?.dump_velocity_score ?? 0,
          lpPullScore: devScore?.lp_pull_score ?? 0,
          devBuyPct: 100 - (devScore?.supply_retention_pct ?? 100),
          hasMaliciousDump: (devScore?.dump_velocity_score ?? 0) > 60,
        });
        cause = out.cause;
        confidence = out.confidence;
        matchedSignals = out.matchedSignals;
      }

      const tier = tierFor(cause);
      const intent = DEATH_TAXONOMY[cause]?.intent ?? 'neutral';
      const score = scoreCandidate({
        cause, confidence,
        athMcap: c.ath_mcap_usd ?? 0,
        ageHours: c.age_hours ?? 0,
      });

      // Skip Tier-C unless ATH was meaningful (>$10k) — too noisy otherwise.
      // EXCEPTION: curve-death Lambs are always kept (already gated to 75% <= curve < 100%).
      let effectiveTier = tier;
      if (c.source_feed === 'pumpfun_curve_death' || c.source_feed === 'admin_manual') {
        if (effectiveTier === 'C') effectiveTier = 'B';
        skipReasons.promoted_pumpfun++;
      } else if (tier === 'C' && (c.ath_mcap_usd ?? 0) < 10000) {
        skipReasons.tierC_lowATH_nonPumpfun++;
        if (debugSample.length < 3) debugSample.push({ mint: c.token_mint, source: c.source_feed, tier, ath: c.ath_mcap_usd, cause });
        continue;
      }
      skipReasons.processed++;

      await assertUpsert(
        supabase
          .from('autopsy_candidates')
          .upsert({
            token_mint: c.token_mint,
            ticker: c.ticker,
            token_name: c.token_name,
            source_feed: c.source_feed,
            candidate_score: score,
            death_cause: cause,
            death_intent: intent,
            death_confidence: confidence,
            matched_signals: matchedSignals,
            tier: effectiveTier,
            ath_mcap_usd: c.ath_mcap_usd,
            current_mcap_usd: c.current_mcap_usd,
            liquidity_usd: c.liquidity_usd,
            age_hours: c.age_hours,
            creator_wallet: c.creator_wallet,
            bonding_curve_pct: c.bonding_curve_pct ?? null,
            // status only set on insert; preserve on conflict by using onConflict ignore for status field
          }, { onConflict: 'token_mint', ignoreDuplicates: false })
          .select('id, status')
          .single(),
        'autopsy_candidates'
      );

      stats.inserted++;
      if (effectiveTier === 'A') stats.tier_A++;
      else if (effectiveTier === 'B') stats.tier_B++;
      else stats.tier_C++;
    } catch (e) {
      stats.errors++;
      console.error(`[autopsy-funnel-feeder] Error on ${c.token_mint}:`, e);
    }
  }

  console.log('[autopsy-funnel-feeder] complete', stats);
  console.log('[autopsy-funnel-feeder] skipReasons', skipReasons, 'sample', debugSample);

  return new Response(JSON.stringify({ success: true, stats }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));