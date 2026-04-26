import { withRunLog } from '../_shared/run-logger.ts';

/**
 * Token Vigil — Death detector + Post-mortem / Mid-growth assessor
 * 
 * Runs on a cron (every 5 min via orchestrator).
 * 1. Seeds vigil from token_lifecycle (recently active tokens)
 * 2. Scans watched tokens for death signals
 * 3. When death detected: triggers full post-mortem snapshot
 * 4. When token > 100K mcap and healthy: triggers mid-growth snapshot
 * 
 * Death signals (user-defined):
 * - >90% price drop from peak
 * - Massive dust increase (dust% > 50%)
 * - Volume collapse (< $500/hr)
 */

import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { trackFunnelStage } from '../_shared/funnel-tracker.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 20;
const DEATH_PRICE_DROP_PCT = 90;
const DEATH_DUST_PCT = 50;
const DEATH_VOLUME_FLOOR = 500; // $500/hr
const MID_GROWTH_MCAP_THRESHOLD = 100_000;

interface VigilToken {
  id: string;
  token_mint: string;
  symbol: string;
  name: string;
  peak_mcap_usd: number;
  peak_holders: number;
  peak_price_usd: number;
  peak_volume_1h: number;
  current_mcap_usd: number;
  current_price_usd: number;
  current_volume_1h: number;
  current_dust_pct: number;
  status: string;
  post_mortem_id: string | null;
  mid_growth_id: string | null;
  scan_count: number;
}

Deno.serve(withRunLog('token-vigil', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const stats = { seeded: 0, scanned: 0, deaths: 0, midGrowth: 0, errors: 0 };

  try {
    // Check for manual seed request
    const body = await req.json().catch(() => ({}));
    const manualSeed = body.seed === true;

    // Step 1: Seed vigil from MULTIPLE sources (not just token_lifecycle)
    // Source A: token_lifecycle (recently active, >$5K mcap)
    const { data: lifecycleTokens } = await supabase
      .from('token_lifecycle')
      .select('token_mint, symbol, name, market_cap, price_usd, volume_24h')
      .gt('last_seen_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .gt('market_cap', 5000)
      .limit(50);

    // Source B: holders_intel_seen_tokens (curated tokens from user scans)
    const { data: seenTokens } = await supabase
      .from('holders_intel_seen_tokens')
      .select('token_mint, symbol, name, market_cap_at_discovery')
      .gt('last_seen_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('last_seen_at', { ascending: false })
      .limit(manualSeed ? 200 : 30);

    // Source C: scraped_tokens (top-200 DexScreener scraper — wider net)
    const { data: scrapedTokens } = await supabase
      .from('scraped_tokens')
      .select('token_mint, symbol, name, market_cap, price_usd')
      .gt('last_seen_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .gt('market_cap', 3000)
      .order('market_cap', { ascending: false })
      .limit(manualSeed ? 200 : 30);

    // Merge and deduplicate by token_mint
    const seedMap = new Map<string, any>();
    for (const t of (lifecycleTokens || [])) {
      seedMap.set(t.token_mint, {
        token_mint: t.token_mint, symbol: t.symbol, name: t.name,
        mcap: t.market_cap || 0, price: t.price_usd || 0, vol24: t.volume_24h || 0,
      });
    }
    for (const t of (scrapedTokens || [])) {
      if (!seedMap.has(t.token_mint)) {
        seedMap.set(t.token_mint, {
          token_mint: t.token_mint, symbol: t.symbol, name: t.name,
          mcap: t.market_cap || 0, price: t.price_usd || 0, vol24: 0,
        });
      }
    }
    for (const t of (seenTokens || [])) {
      if (!seedMap.has(t.token_mint)) {
        seedMap.set(t.token_mint, {
          token_mint: t.token_mint, symbol: t.symbol, name: t.name,
          mcap: t.market_cap_at_discovery || 0, price: 0, vol24: 0,
        });
      }
    }

    console.log(`[vigil] Seeding from ${seedMap.size} unique tokens (lifecycle=${lifecycleTokens?.length || 0}, seen=${seenTokens?.length || 0}, scraped=${scrapedTokens?.length || 0})`);

    for (const t of seedMap.values()) {
      const { error } = await supabase.from('token_vigil').upsert({
        token_mint: t.token_mint,
        symbol: t.symbol,
        name: t.name,
        peak_mcap_usd: Math.max(t.mcap, 0),
        peak_price_usd: Math.max(t.price, 0),
        peak_volume_1h: Math.max((t.vol24) / 24, 0),
        current_mcap_usd: t.mcap,
        current_price_usd: t.price,
        current_volume_1h: (t.vol24) / 24,
      }, { onConflict: 'token_mint', ignoreDuplicates: true });
      if (!error) stats.seeded++;
    }

    // Step 2: Fetch tokens to scan (watching or declining, not yet assessed as dead)
    const { data: watchList } = await supabase
      .from('token_vigil')
      .select('*')
      .in('status', ['watching', 'declining'])
      .order('last_scanned_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    if (!watchList || watchList.length === 0) {
      return new Response(JSON.stringify({ ...stats, elapsed: Date.now() - startTime }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: For each token, fetch fresh data from DexScreener
    for (const vigil of watchList as VigilToken[]) {
      try {
        stats.scanned++;
        
        // Fetch current market data from DexScreener
        const dexResp = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${vigil.token_mint}`,
          { signal: AbortSignal.timeout(8000) }
        );
        
        if (!dexResp.ok) {
          console.warn(`[vigil] DexScreener ${dexResp.status} for ${vigil.symbol}`);
          continue;
        }

        const dexData = await dexResp.json();
        const pair = dexData.pairs?.[0];
        if (!pair) {
          // No pairs found — token might be dead already
          await updateVigilMetrics(supabase, vigil, 0, 0, 0, vigil.current_dust_pct);
          continue;
        }

        const currentMcap = pair.marketCap || pair.fdv || 0;
        const currentPrice = parseFloat(pair.priceUsd || '0');
        const volume1h = pair.volume?.h1 || 0;
        const currentDustPct = vigil.current_dust_pct; // Updated by holders report

        // Update peaks
        const newPeakMcap = Math.max(vigil.peak_mcap_usd || 0, currentMcap);
        const newPeakPrice = Math.max(vigil.peak_price_usd || 0, currentPrice);
        const newPeakVolume = Math.max(vigil.peak_volume_1h || 0, volume1h);

        // Calculate drops
        const priceDropPct = newPeakPrice > 0 
          ? ((newPeakPrice - currentPrice) / newPeakPrice) * 100 
          : 0;
        const volumeDropPct = newPeakVolume > 0
          ? ((newPeakVolume - volume1h) / newPeakVolume) * 100
          : 0;

        // Update vigil record
        await supabase.from('token_vigil').update({
          peak_mcap_usd: newPeakMcap,
          peak_price_usd: newPeakPrice,
          peak_volume_1h: newPeakVolume,
          current_mcap_usd: currentMcap,
          current_price_usd: currentPrice,
          current_volume_1h: volume1h,
          price_drop_from_peak_pct: priceDropPct,
          volume_drop_from_peak_pct: volumeDropPct,
          last_scanned_at: new Date().toISOString(),
          scan_count: (vigil.scan_count || 0) + 1,
        }).eq('id', vigil.id);

        // Death detection: >90% price drop + (dust > 50% OR volume < $500)
        const isDead = priceDropPct >= DEATH_PRICE_DROP_PCT && 
          (currentDustPct >= DEATH_DUST_PCT || volume1h < DEATH_VOLUME_FLOOR);

        if (isDead && !vigil.post_mortem_id) {
          console.log(`[vigil] 💀 DEATH DETECTED: ${vigil.symbol} — ${priceDropPct.toFixed(0)}% drop, dust ${currentDustPct.toFixed(0)}%, vol $${volume1h.toFixed(0)}/hr`);
          
          // Trigger full post-mortem
          const postMortemId = await captureAssessment(
            supabase, supabaseUrl, supabaseServiceKey,
            vigil, 'post_mortem', pair
          );

          if (postMortemId) {
            await supabase.from('token_vigil').update({
              status: 'dead',
              death_detected_at: new Date().toISOString(),
              post_mortem_id: postMortemId,
            }).eq('id', vigil.id);
            stats.deaths++;
            await trackFunnelStage(supabase as any, 'dead', 1);
          }
        }
        // Mid-growth assessment: > 100K mcap, still watching, not yet assessed
        else if (
          currentMcap >= MID_GROWTH_MCAP_THRESHOLD && 
          !vigil.mid_growth_id &&
          vigil.status === 'watching'
        ) {
          console.log(`[vigil] 📈 MID-GROWTH: ${vigil.symbol} — $${(currentMcap / 1000).toFixed(0)}K mcap`);
          
          const midGrowthId = await captureAssessment(
            supabase, supabaseUrl, supabaseServiceKey,
            vigil, 'mid_growth', pair
          );

          if (midGrowthId) {
            await supabase.from('token_vigil').update({
              mid_growth_id: midGrowthId,
              status: 'thriving',
            }).eq('id', vigil.id);
            stats.midGrowth++;
          }
        }
        // Mark declining if dropping but not dead yet
        else if (priceDropPct >= 50 && vigil.status === 'watching') {
          await supabase.from('token_vigil').update({ status: 'declining' }).eq('id', vigil.id);
        }

        // Rate limit DexScreener
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        stats.errors++;
        console.error(`[vigil] Error scanning ${vigil.symbol}:`, err);
      }
    }
  } catch (err) {
    console.error('[vigil] Fatal error:', err);
    stats.errors++;
  }

  const elapsed = Date.now() - startTime;
  console.log(`[token-vigil] ${JSON.stringify(stats)}, ${elapsed}ms`);

  return new Response(
    JSON.stringify({ ...stats, elapsed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}));

async function updateVigilMetrics(
  supabase: any, vigil: VigilToken,
  mcap: number, price: number, volume: number, dust: number
) {
  await supabase.from('token_vigil').update({
    current_mcap_usd: mcap,
    current_price_usd: price,
    current_volume_1h: volume,
    current_dust_pct: dust,
    last_scanned_at: new Date().toISOString(),
    scan_count: (vigil.scan_count || 0) + 1,
  }).eq('id', vigil.id);
}

/**
 * Capture a full assessment snapshot by calling bagless-holders-report
 * and enriching with dev reputation + early warnings
 */
async function captureAssessment(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  vigil: VigilToken,
  assessmentType: 'post_mortem' | 'mid_growth',
  dexPair: any,
): Promise<string | null> {
  try {
    // Call bagless-holders-report for full snapshot
    const reportResp = await fetch(`${supabaseUrl}/functions/v1/bagless-holders-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ tokenMint: vigil.token_mint }),
    });

    let reportData: any = null;
    if (reportResp.ok) {
      reportData = await reportResp.json();
    } else {
      console.warn(`[vigil] Report fetch failed for ${vigil.symbol}: ${reportResp.status}`);
    }

    // Fetch dev reputation
    let devData: any = null;
    const devWallet = reportData?.potentialDevWallet?.address || reportData?.creatorInfo?.wallet;
    if (devWallet) {
      const { data: dev } = await supabase
        .from('dev_wallet_reputation')
        .select('*')
        .eq('wallet_address', devWallet)
        .maybeSingle();
      devData = dev;
    }

    // Fetch early warnings
    const { data: warnings } = await supabase
      .from('token_early_warnings')
      .select('warning_type, severity, plain_text, scan_count')
      .eq('token_mint', vigil.token_mint);

    // Calculate token age
    const pairCreatedAt = dexPair?.pairCreatedAt || reportData?.vitality?.pairCreatedAt;
    const tokenAgeMinutes = pairCreatedAt 
      ? Math.round((Date.now() - pairCreatedAt) / 60000)
      : null;

    // Determine cause of death for post-mortems
    let causeOfDeath: string | null = null;
    let outcome = 'pending';
    
    if (assessmentType === 'post_mortem') {
      const priceDropPct = vigil.peak_price_usd > 0
        ? ((vigil.peak_price_usd - (reportData?.tokenPriceUSD || 0)) / vigil.peak_price_usd) * 100
        : 0;
      
      if (priceDropPct >= 98) causeOfDeath = 'rug';
      else if (priceDropPct >= 90 && tokenAgeMinutes && tokenAgeMinutes < 120) causeOfDeath = 'pump_dump';
      else if (priceDropPct >= 90) causeOfDeath = 'slow_bleed';
      else causeOfDeath = 'organic_decline';
      
      outcome = causeOfDeath;
    } else {
      outcome = 'survived';
    }

    // Build the assessment record
    const tiers = reportData?.simpleTiers || {};
    const dist = reportData?.distributionStats || {};
    const vitality = reportData?.vitality || {};
    const health = reportData?.healthScore || {};

    const assessment = {
      token_mint: vigil.token_mint,
      symbol: vigil.symbol,
      name: vigil.name,
      assessment_type: assessmentType,
      outcome,
      cause_of_death: causeOfDeath,
      token_age_minutes: tokenAgeMinutes,
      
      price_usd: reportData?.tokenPriceUSD || dexPair?.priceUsd || 0,
      mcap_usd: reportData?.marketCap || dexPair?.marketCap || 0,
      ath_usd: vigil.peak_price_usd,
      price_drop_from_ath_pct: (vigil as any).price_drop_from_peak_pct,
      volume_1h: vitality?.volume?.h1 || 0,
      volume_24h: vitality?.volume?.h24 || 0,
      volume_mcap_ratio: reportData?.marketCap > 0 
        ? (vitality?.volume?.h24 || 0) / reportData.marketCap 
        : 0,
      liquidity_usd: vitality?.liquidityUsd || 0,
      lp_pct_of_supply: reportData?.lpPercentageOfSupply || 0,

      total_holders: reportData?.totalHolders || 0,
      real_holders: reportData?.realHolders || 0,
      dust_wallets: reportData?.dustWallets || 0,
      dust_pct: reportData?.dustPercentage || 0,
      whale_count: tiers?.whales?.count || 0,
      whale_pct: tiers?.whales?.percentage || 0,
      whale_supply_pct: tiers?.whales?.supplyPercentage || 0,
      serious_count: tiers?.serious?.count || 0,
      serious_pct: tiers?.serious?.percentage || 0,
      serious_supply_pct: tiers?.serious?.supplyPercentage || 0,
      retail_count: tiers?.retail?.count || 0,
      retail_pct: tiers?.retail?.percentage || 0,
      retail_supply_pct: tiers?.retail?.supplyPercentage || 0,
      top5_pct: dist?.top5Percentage || 0,
      top10_pct: dist?.top10Percentage || 0,
      top20_pct: dist?.top20Percentage || 0,
      tier_divergence: Math.abs((tiers?.whales?.percentage || 0) - (tiers?.retail?.percentage || 0)),

      buys_1h: vitality?.txns?.h1?.buys || 0,
      sells_1h: vitality?.txns?.h1?.sells || 0,
      buy_sell_ratio: (vitality?.txns?.h1?.sells || 1) > 0
        ? (vitality?.txns?.h1?.buys || 0) / (vitality?.txns?.h1?.sells || 1)
        : 0,
      buys_5m: vitality?.txns?.m5?.buys || 0,
      sells_5m: vitality?.txns?.m5?.sells || 0,

      health_score: health?.score || 0,
      health_grade: health?.grade || 'F',
      phase: health?.phase || 'unknown',
      stability_score: reportData?.stabilityScore || 0,

      dev_wallet: devWallet || null,
      dev_holding_pct: reportData?.potentialDevWallet?.percentageOfSupply || 0,
      dev_sold_all: reportData?.potentialDevWallet?.detectionMethod === 'creator_api_sold',
      dev_reputation_score: devData?.reputation_score || null,
      dev_trust_level: devData?.trust_level || null,
      dev_total_launches: devData?.total_tokens_launched || null,
      dev_tokens_rugged: devData?.tokens_rugged || null,
      dev_is_serial_spammer: devData?.is_serial_spammer || false,
      dev_pattern: devData?.dev_pattern || null,

      has_twitter: !!reportData?.socials?.twitter,
      has_telegram: !!reportData?.socials?.telegram,
      has_website: !!reportData?.socials?.website,
      dex_paid: reportData?.dexStatus?.hasDexPaid || false,
      active_boosts: reportData?.dexStatus?.activeBoosts || 0,

      bundled_pct: reportData?.insidersGraph?.bundledPercentage || 0,
      insider_cluster_count: reportData?.insiderClusters?.length || 0,
      fresh_wallet_pct: reportData?.freshWallets?.freshWalletPercentage || 0,

      active_warnings: warnings || [],
      risk_flags: reportData?.riskFlags || [],
      raw_report_data: reportData,
    };

    const { data: inserted, error } = await supabase
      .from('token_assessments')
      .insert(assessment)
      .select('id')
      .single();

    if (error) {
      console.error(`[vigil] Failed to insert ${assessmentType} for ${vigil.symbol}:`, error);
      return null;
    }

    console.log(`[vigil] ✅ ${assessmentType} captured for ${vigil.symbol} — id: ${inserted.id}`);
    return inserted.id;
  } catch (err) {
    console.error(`[vigil] captureAssessment error for ${vigil.symbol}:`, err);
    return null;
  }
}
