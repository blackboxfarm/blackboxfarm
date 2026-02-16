import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusApiKey, getHeliusRpcUrl } from '../_shared/helius-client.ts';
enableHeliusTracking('pumpfun-watchlist-monitor');

/**
 * PUMPFUN WATCHLIST MONITOR v2 — MOMENTUM SCORING ENGINE
 * 
 * REPLACES binary pass/fail gates with a WEIGHTED SCORING SYSTEM.
 * 
 * Data-driven scoring based on analysis of 395 fantasy positions:
 * - Winners avg: 387 holders, 241 SOL vol, rugcheck 4847, $677k mcap, 1.84x peak
 * - Losers avg: 194 holders, 140 SOL vol, rugcheck 9322, $1.1M mcap, 1.06x peak
 * 
 * KEY INSIGHTS:
 * - 500+ holders = 39% win rate (vs 8.5% for 50-100)
 * - 200+ SOL volume = 33% win rate (vs 5.6% for <10 SOL)
 * - Rugcheck 6001-10000 = DEATH ZONE (5.6% win rate)
 * - Mcap $50k-100k = 38% win rate (vs 5% for <$5k)
 * - Volume ACCELERATION matters more than absolute volume
 * - Dev reputation completely ignored = massive blind spot
 * 
 * SCORING: Token must score >= 70/100 to qualify for fantasy
 * Score components:
 *   Holder Score (0-25): Based on holder count with steep curve
 *   Volume Score (0-25): Based on 24h volume with surge bonus
 *   Safety Score (0-25): RugCheck + dev reputation + authority checks
 *   Momentum Score (0-25): Price/volume/holder acceleration (deltas)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

// Rate limiting config
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const CALL_DELAY_MS = 100;
const TOKENS_PER_RUN = 50;
const SKIP_RECENTLY_CHECKED_MINUTES = 3;

// MINIMUM SCORE THRESHOLD for fantasy qualification
const MIN_QUALIFICATION_SCORE = 50;

interface MonitorStats {
  tokensChecked: number;
  tokensUpdated: number;
  promoted: number;
  markedDead: number;
  markedStale: number;
  devSellRejected: number;
  errors: number;
  durationMs: number;
  promotedTokens: string[];
  deadTokens: string[];
  devSellTokens: string[];
  skippedRecent: number;
  rugcheckRejected: number;
  rugcheckTokens: string[];
  scoreBreakdowns: Array<{ symbol: string; total: number; holder: number; volume: number; safety: number; momentum: number; qualified: boolean }>;
}

interface TokenMetrics {
  holders: number;
  volume24hSol: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  bondingCurvePct: number | null;
  buys: number;
  sells: number;
}

interface RugCheckRisk {
  name: string;
  value: string;
  description: string;
  score: number;
  level: 'danger' | 'warn' | 'info' | 'good';
}

interface RugCheckResult {
  score: number;
  normalised: number;
  risks: RugCheckRisk[];
  passed: boolean;
  hasCriticalRisk: boolean;
  criticalRiskNames: string[];
  error?: string;
}

interface QualificationScore {
  total: number;
  holderScore: number;
  volumeScore: number;
  safetyScore: number;
  momentumScore: number;
  breakdown: string;
  disqualifyReasons: string[];
}

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with exponential backoff for rate limiting
async function fetchWithBackoff(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, backing off ${backoffMs}ms (attempt ${attempt + 1})`);
        await delay(backoffMs);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`Fetch error, backing off ${backoffMs}ms: ${error}`);
      await delay(backoffMs);
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// === MAYHEM MODE CHECK ===
async function checkMayhemMode(tokenMint: string): Promise<boolean> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) return false;
    
    const data = await response.json();
    const totalSupply = data.total_supply || 0;
    const program = data.program || null;
    
    const MAYHEM_PROGRAM_ID = 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e';
    const MAYHEM_SUPPLY = 2000000000000000;
    
    const isMayhem = program === MAYHEM_PROGRAM_ID || totalSupply >= MAYHEM_SUPPLY;
    
    if (isMayhem) {
      console.log(`   🔥 MAYHEM DETECTED: program=${program?.slice(0,8) || 'unknown'}, supply=${totalSupply}`);
    }
    
    return isMayhem;
  } catch (error) {
    console.error(`Error checking mayhem for ${tokenMint}:`, error);
    return false;
  }
}

// Fetch actual holder count from Helius
async function fetchHeliusHolderCount(mint: string): Promise<number> {
  const heliusApiKey = getHeliusApiKey();
  if (!heliusApiKey) return 0;

  try {
    const response = await fetch(getHeliusRpcUrl(heliusApiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'holder-count',
        method: 'getTokenAccounts',
        params: { mint, limit: 500 }
      })
    });

    if (!response.ok) return 0;
    const data = await response.json();
    if (data.error || !data.result) return 0;
    
    const accounts = data.result.token_accounts || [];
    const activeHolders = accounts.filter((a: any) => Number(a.amount || 0) > 0).length;
    
    console.log(`   👥 Helius holder count: ${mint.slice(0, 8)} - ${activeHolders} holders`);
    return activeHolders;
  } catch (error) {
    console.error(`Error fetching Helius holder count for ${mint}:`, error);
    return 0;
  }
}

// Calculate dust holder percentage
async function calculateDustHolderPct(mint: string, priceUsd: number | null, decimals = 6): Promise<number | null> {
  if (!priceUsd || priceUsd <= 0) return null;
  
  const heliusApiKey = getHeliusApiKey();
  if (!heliusApiKey) return null;

  try {
    const response = await fetch(getHeliusRpcUrl(heliusApiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dust-check',
        method: 'getTokenAccounts',
        params: { mint, limit: 500 }
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (data.error || !data.result) return null;

    const accounts = data.result.token_accounts || [];
    const activeAccounts = accounts.filter((a: any) => Number(a.amount || 0) > 0);
    
    if (activeAccounts.length === 0) return null;

    const DUST_THRESHOLD_USD = 2;
    let dustCount = 0;
    
    for (const account of activeAccounts) {
      const rawAmount = Number(account.amount || 0);
      const tokenAmount = rawAmount / Math.pow(10, decimals);
      const valueUsd = tokenAmount * priceUsd;
      if (valueUsd < DUST_THRESHOLD_USD) dustCount++;
    }

    const dustPct = (dustCount / activeAccounts.length) * 100;
    console.log(`   🧹 Dust check: ${mint.slice(0, 8)} - ${dustCount}/${activeAccounts.length} holders are dust (${dustPct.toFixed(1)}%)`);
    return dustPct;
  } catch (error) {
    console.error(`Error calculating dust for ${mint}:`, error);
    return null;
  }
}

// Fetch Helius metrics
async function fetchHeliusMetrics(mint: string): Promise<TokenMetrics | null> {
  const heliusApiKey = getHeliusApiKey();
  if (!heliusApiKey) return null;

  try {
    const [assetResponse, holderCount] = await Promise.all([
      fetch(getHeliusRpcUrl(heliusApiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-token-metrics',
          method: 'getAsset',
          params: { id: mint }
        })
      }),
      fetchHeliusHolderCount(mint),
    ]);

    let pricePerToken: number | null = null;
    let supply = 0;
    let decimals = 6;

    if (assetResponse.ok) {
      const data = await assetResponse.json();
      if (!data.error && data.result) {
        const tokenInfo = data.result.token_info || {};
        supply = tokenInfo.supply || 0;
        decimals = tokenInfo.decimals || 6;
        pricePerToken = tokenInfo.price_info?.price_per_token || null;
      }
    }

    return {
      holders: holderCount,
      volume24hSol: 0,
      priceUsd: pricePerToken,
      liquidityUsd: null,
      marketCapUsd: pricePerToken && supply ? (pricePerToken * supply / Math.pow(10, decimals)) : null,
      bondingCurvePct: null,
      buys: 0,
      sells: 0,
    };
  } catch (error) {
    console.error(`Error fetching Helius metrics for ${mint}:`, error);
    return null;
  }
}

// Fetch DexScreener metrics
async function fetchDexScreenerMetrics(mint: string): Promise<TokenMetrics | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) return null;
    const data = await response.json();
    const pair = data?.pairs?.[0];
    if (!pair) return null;

    const priceUsd = parseFloat(pair.priceUsd) || 0;
    const volume24h = parseFloat(pair.volume?.h24) || 0;
    const liquidity = parseFloat(pair.liquidity?.usd) || 0;
    const marketCap = parseFloat(pair.marketCap) || (pair.fdv ? parseFloat(pair.fdv) : null);
    const txns24h = pair.txns?.h24 || {};
    const estimatedHolders = Math.min((txns24h.buys || 0) + (txns24h.sells || 0), 1000);
    const solPrice = priceUsd > 0 && pair.priceNative ? (priceUsd / parseFloat(pair.priceNative)) : 200;
    const volumeSol = volume24h / solPrice;

    return {
      holders: estimatedHolders,
      volume24hSol: volumeSol,
      priceUsd,
      liquidityUsd: liquidity,
      marketCapUsd: marketCap,
      bondingCurvePct: null,
      buys: txns24h.buys || 0,
      sells: txns24h.sells || 0,
    };
  } catch (error) {
    console.error(`Error fetching DexScreener metrics for ${mint}:`, error);
    return null;
  }
}

// Fetch Jupiter price
async function fetchJupiterPrice(mint: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data?.[mint]?.price || null;
  } catch {
    return null;
  }
}

// Composite metric fetcher
async function fetchPumpFunMetrics(mint: string): Promise<TokenMetrics | null> {
  // Try pump.fun first
  try {
    const response = await fetchWithBackoff(
      `https://frontend-api.pump.fun/coins/${mint}`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (response.ok) {
      const data = await response.json();
      const virtualSolReserves = data.virtual_sol_reserves || 0;
      const virtualTokenReserves = data.virtual_token_reserves || 0;
      const totalSupply = data.total_supply || 1000000000000000;
      const priceUsd = data.usd_market_cap ? data.usd_market_cap / (totalSupply / 1e6) : null;
      const bondingCurveTokens = virtualTokenReserves / 1e6;
      const maxBondingCurveTokens = 800000000;
      const bondingCurvePct = Math.min(100, Math.max(0, (bondingCurveTokens / maxBondingCurveTokens) * 100));
      
      return {
        holders: data.holder_count || 0,
        volume24hSol: (data.volume_24h || 0) / 1e9,
        priceUsd,
        liquidityUsd: virtualSolReserves > 0 ? (virtualSolReserves / 1e9) * 200 : null,
        marketCapUsd: data.usd_market_cap || null,
        bondingCurvePct: data.complete ? 0 : bondingCurvePct,
        buys: data.buy_count || 0,
        sells: data.sell_count || 0,
      };
    }
  } catch (e) {
    console.log(`   ⚠️ pump.fun fetch error for ${mint}, using composite fallback...`);
  }

  // Composite fallback
  const [heliusMetrics, dexMetrics] = await Promise.all([
    fetchHeliusMetrics(mint),
    fetchDexScreenerMetrics(mint),
  ]);

  if (heliusMetrics || dexMetrics) {
    const holders = (heliusMetrics?.holders || 0) > 0 ? heliusMetrics!.holders : (dexMetrics?.holders || 0);
    const priceUsd = heliusMetrics?.priceUsd || dexMetrics?.priceUsd || null;
    const volume = dexMetrics?.volume24hSol || heliusMetrics?.volume24hSol || 0;
    const marketCap = heliusMetrics?.marketCapUsd || dexMetrics?.marketCapUsd || null;
    const liquidity = dexMetrics?.liquidityUsd || heliusMetrics?.liquidityUsd || null;

    return {
      holders,
      volume24hSol: volume,
      priceUsd,
      liquidityUsd: liquidity,
      marketCapUsd: marketCap,
      bondingCurvePct: null,
      buys: dexMetrics?.buys || 0,
      sells: dexMetrics?.sells || 0,
    };
  }

  // Jupiter price fallback
  const jupPrice = await fetchJupiterPrice(mint);
  if (jupPrice) {
    const holderCount = await fetchHeliusHolderCount(mint);
    return { holders: holderCount, volume24hSol: 0, priceUsd: jupPrice, liquidityUsd: null, marketCapUsd: null, bondingCurvePct: null, buys: 0, sells: 0 };
  }

  console.log(`   ❌ All fallbacks failed for ${mint}`);
  return null;
}

// Get current SOL price
async function getSolPrice(supabase: any): Promise<number> {
  try {
    const { data } = await supabase.from('sol_price_cache').select('price_usd').order('updated_at', { ascending: false }).limit(1).single();
    return data?.price_usd || 200;
  } catch {
    return 200;
  }
}

// RugCheck for buy gate
async function fetchRugCheckForBuyGate(mint: string, config: any): Promise<RugCheckResult> {
  const defaultResult: RugCheckResult = {
    score: 0, normalised: 0, risks: [], passed: false, hasCriticalRisk: false, criticalRiskNames: [],
  };

  try {
    await delay(config.rugcheck_rate_limit_ms || 500);
    
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return { ...defaultResult, passed: true, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const rawScore = data.score || 0;
    const normalised = Math.min(100, Math.max(0, rawScore / 10));
    
    const risks: RugCheckRisk[] = (data.risks || []).map((r: any) => ({
      name: r.name || 'Unknown', value: r.value || '', description: r.description || '',
      score: r.score || 0, level: r.level || 'info',
    }));
    
    const criticalRiskList: string[] = config.rugcheck_critical_risks || [
      'Freeze Authority still enabled', 'Mint Authority still enabled',
      'Low Liquidity', 'Copycat token',
      'Top 10 holders own high percentage', 'Single holder owns high percentage',
    ];
    
    const dangerRisks = risks.filter(r => r.level === 'danger');
    const criticalRiskNames = dangerRisks
      .filter(r => criticalRiskList.some(cr => r.name.toLowerCase().includes(cr.toLowerCase())))
      .map(r => r.name);
    
    const hasCriticalRisk = criticalRiskNames.length > 0;
    const minScore = config.min_rugcheck_score || 50;
    const passed = normalised >= minScore && !hasCriticalRisk;
    
    return { score: rawScore, normalised, risks, passed, hasCriticalRisk, criticalRiskNames };
  } catch (error) {
    return { ...defaultResult, passed: true, error: String(error) };
  }
}

// Get monitor config
async function getConfig(supabase: any) {
  const { data } = await supabase.from('pumpfun_monitor_config').select('*').limit(1).single();

  return {
    is_enabled: data?.is_enabled ?? true,
    min_watch_time_minutes: data?.min_watch_time_minutes ?? 2,
    max_watch_time_minutes: data?.max_watch_time_minutes ?? 600,
    dead_holder_threshold: data?.dead_holder_threshold ?? 3,
    dead_volume_threshold_sol: data?.dead_volume_threshold_sol ?? 0.01,
    qualification_holder_count: data?.qualification_holder_count ?? 20,
    qualification_volume_sol: data?.qualification_volume_sol ?? 0.5,
    max_bundle_score: data?.max_bundle_score ?? 70,
    max_single_wallet_pct: data?.max_single_wallet_pct ?? 15,
    min_rugcheck_score: data?.min_rugcheck_score ?? 50,
    rugcheck_critical_risks: data?.rugcheck_critical_risks ?? [
      'Freeze Authority still enabled', 'Mint Authority still enabled',
      'Low Liquidity', 'Copycat token',
      'Top 10 holders own high percentage', 'Single holder owns high percentage',
    ],
    rugcheck_recheck_minutes: data?.rugcheck_recheck_minutes ?? 30,
    rugcheck_rate_limit_ms: data?.rugcheck_rate_limit_ms ?? 500,
    signal_strong_holder_threshold: data?.signal_strong_holder_threshold ?? 50,
    signal_strong_volume_threshold_sol: data?.signal_strong_volume_threshold_sol ?? 2.0,
    signal_strong_rugcheck_threshold: data?.signal_strong_rugcheck_threshold ?? 70,
    min_market_cap_usd: data?.min_market_cap_usd ?? 5000,
    max_market_cap_usd: data?.max_market_cap_usd ?? 12000,
    min_holder_count_fantasy: data?.min_holder_count_fantasy ?? 100,
    max_rugcheck_score_fantasy: data?.max_rugcheck_score_fantasy ?? 5000,
    min_volume_sol_fantasy: data?.min_volume_sol_fantasy ?? 5,
    max_dust_holder_pct: data?.max_dust_holder_pct ?? 25,
    // New v2 scoring thresholds
    min_qualification_score: data?.min_qualification_score ?? MIN_QUALIFICATION_SCORE,
  };
}

// ═══════════════════════════════════════════════════════════════════
// ████ MOMENTUM SCORING ENGINE v2 ████
// ═══════════════════════════════════════════════════════════════════

function calculateHolderScore(holders: number): number {
  // Rescaled for bonding curve tokens (pre-Raydium, typically <200 holders)
  if (holders >= 100) return 25;
  if (holders >= 75) return 20;
  if (holders >= 60) return 16;
  if (holders >= 49) return 12;
  if (holders >= 30) return 7;
  return 2;
}

function calculateVolumeScore(volumeSol: number, buys: number, sells: number): number {
  // Data: 200+ SOL = 33% win, 50-200 = 28%, 10-50 = 18%, <10 = 5.6%
  // Buy/sell ratio bonus: more buys than sells = accumulation phase
  // Rescaled for bonding curve volumes (pre-Raydium, typically <50 SOL)
  let base = 0;
  if (volumeSol >= 50) base = 25;
  else if (volumeSol >= 30) base = 20;
  else if (volumeSol >= 20) base = 16;
  else if (volumeSol >= 10) base = 12;
  else if (volumeSol >= 5) base = 7;
  else base = 2;

  // Buy pressure bonus: if buys significantly outpace sells
  const totalTxns = buys + sells;
  if (totalTxns > 10) {
    const buyRatio = buys / totalTxns;
    if (buyRatio >= 0.65) base = Math.min(25, base + 5); // Strong buy pressure
    else if (buyRatio >= 0.55) base = Math.min(25, base + 2);
    else if (buyRatio < 0.35) base = Math.max(0, base - 5); // Heavy selling
  }

  return base;
}

function calculateSafetyScore(
  rugcheckScore: number | null,
  rugcheckPassed: boolean,
  hasCriticalRisk: boolean,
  devReputation: { trustLevel: string | null; tokensRugged: number; totalLaunched: number; reputationScore: number | null } | null,
  dustPct: number | null,
  maxSingleWalletPct: number | null,
  mintAuthorityRevoked: boolean | null,
  freezeAuthorityRevoked: boolean | null,
  metrics?: { marketCapUsd?: number } | null,
): number {
  // Start with base safety
  let score = 12;

  // RugCheck scoring — DATA: 2001-4000 best (24% win), 6001-10000 DEATH (5.6%)
  if (rugcheckScore !== null) {
    if (rugcheckScore <= 2000) score += 5;
    else if (rugcheckScore <= 4000) score += 7; // Sweet spot
    else if (rugcheckScore <= 5000) score += 3;
    else if (rugcheckScore <= 6000) score += 0;
    else if (rugcheckScore <= 10000) score -= 8; // DEATH ZONE
    else score -= 12; // Extremely risky
  }

  // Critical risk = instant penalty
  if (hasCriticalRisk) score -= 10;
  if (!rugcheckPassed) score -= 5;

  // Authority checks
  if (mintAuthorityRevoked === true) score += 2;
  if (freezeAuthorityRevoked === true) score += 1;
  if (mintAuthorityRevoked === false) score -= 5; // Mint authority NOT revoked = danger
  if (freezeAuthorityRevoked === false) score -= 3;

  // Dev reputation gate — THE BIGGEST BLIND SPOT IN v1
  if (devReputation) {
    const rep = devReputation;
    if (rep.reputationScore !== null) {
      if (rep.reputationScore >= 70) score += 5; // Trusted dev
      else if (rep.reputationScore >= 40) score += 2;
      else if (rep.reputationScore < 20) score -= 8; // Known bad actor
    }
    if (rep.tokensRugged > 0) score -= Math.min(15, rep.tokensRugged * 5); // Each rug = -5
    if (rep.trustLevel === 'scammer' || rep.trustLevel === 'serial_rugger') score -= 15;
    if (rep.trustLevel === 'legitimate_builder') score += 5;
    if (rep.totalLaunched > 10 && rep.tokensRugged === 0) score += 3; // Prolific safe dev
  }

  // Dust holders — SKIP penalty for tokens under $15k mcap
  // On cheap pump.fun tokens, nearly everyone has <$2 worth so dust% is meaningless
  const tokenMcapForDust = metrics?.marketCapUsd ?? 0;
  if (dustPct !== null && tokenMcapForDust >= 15000) {
    if (dustPct > 50) score -= 5;
    else if (dustPct > 30) score -= 3;
    else if (dustPct < 10) score += 2; // Very clean holder base
  } else if (dustPct !== null && tokenMcapForDust < 15000) {
    // Low mcap = dust is expected, only penalize extreme cases
    if (dustPct < 10) score += 1; // Reward if somehow clean at low mcap
  }

  // Whale concentration
  if (maxSingleWalletPct !== null) {
    if (maxSingleWalletPct > 30) score -= 5;
    else if (maxSingleWalletPct > 20) score -= 3;
    else if (maxSingleWalletPct < 5) score += 2;
  }

  return Math.max(0, Math.min(25, score));
}

function calculateMomentumScore(
  token: any,
  metrics: TokenMetrics,
): number {
  let score = 12; // Neutral base so first-time evaluations aren't penalized

  // Holder growth: compare current to previous
  const prevHolders = token.holder_count_prev || token.holder_count || 0;
  const holderGrowth = prevHolders > 0 ? (metrics.holders - prevHolders) / prevHolders : 0;
  
  if (holderGrowth > 0.2) score += 8; // >20% growth since last check = surging
  else if (holderGrowth > 0.1) score += 5;
  else if (holderGrowth > 0.05) score += 3;
  else if (holderGrowth < -0.1) score -= 5; // Holders leaving = bad
  else if (holderGrowth < 0) score -= 2;

  // Volume acceleration: compare to previous
  const prevVolume = token.volume_sol_prev || 0;
  const volumeGrowth = prevVolume > 0 ? (metrics.volume24hSol - prevVolume) / prevVolume : 0;
  
  if (volumeGrowth > 0.5) score += 6; // Volume surging >50%
  else if (volumeGrowth > 0.2) score += 4;
  else if (volumeGrowth > 0) score += 2;
  else if (volumeGrowth < -0.3) score -= 5; // Volume collapsing

  // Price momentum
  const prevPrice = token.price_usd_prev || 0;
  const currentPrice = metrics.priceUsd || 0;
  if (prevPrice > 0 && currentPrice > 0) {
    const priceChange = (currentPrice - prevPrice) / prevPrice;
    if (priceChange > 0.15) score += 4; // Price up >15%
    else if (priceChange > 0.05) score += 2;
    else if (priceChange < -0.2) score -= 4; // Dumping
    else if (priceChange < -0.1) score -= 2;
  }

  // Use delta fields if available
  if (token.holders_delta_3m != null && token.holders_delta_3m > 10) score += 3;
  if (token.volume_delta_3m != null && token.volume_delta_3m > 5) score += 2;
  if (token.buy_pressure_3m != null && token.buy_pressure_3m > 0.7) score += 3;

  return Math.max(0, Math.min(25, score));
}

// Look up dev reputation from database
async function getDevReputation(supabase: any, creatorWallet: string | null): Promise<{
  trustLevel: string | null;
  tokensRugged: number;
  totalLaunched: number;
  reputationScore: number | null;
} | null> {
  if (!creatorWallet) return null;

  try {
    const { data } = await supabase
      .from('dev_wallet_reputation')
      .select('trust_level, tokens_rugged, total_tokens_launched, reputation_score')
      .eq('wallet_address', creatorWallet)
      .maybeSingle();

    if (!data) return null;

    return {
      trustLevel: data.trust_level,
      tokensRugged: data.tokens_rugged || 0,
      totalLaunched: data.total_tokens_launched || 0,
      reputationScore: data.reputation_score,
    };
  } catch {
    return null;
  }
}

// Full qualification score calculator
async function calculateQualificationScore(
  token: any,
  metrics: TokenMetrics,
  rugcheckResult: RugCheckResult | null,
  devReputation: any,
  dustPct: number | null,
): Promise<QualificationScore> {
  const disqualifyReasons: string[] = [];

  // Hard disqualifiers (instant reject regardless of score)
  if (rugcheckResult?.hasCriticalRisk) {
    disqualifyReasons.push(`critical_risk:${rugcheckResult.criticalRiskNames.join(',')}`);
  }
  if (devReputation?.trustLevel === 'scammer' || devReputation?.trustLevel === 'serial_rugger') {
    disqualifyReasons.push(`known_bad_dev:${devReputation.trustLevel}`);
  }
  if (devReputation?.tokensRugged >= 3) {
    disqualifyReasons.push(`serial_rugger:${devReputation.tokensRugged}_rugs`);
  }

  const holderScore = calculateHolderScore(metrics.holders);
  const volumeScore = calculateVolumeScore(metrics.volume24hSol, metrics.buys, metrics.sells);
  const safetyScore = calculateSafetyScore(
    rugcheckResult?.score ?? token.rugcheck_score ?? null,
    rugcheckResult?.passed ?? token.rugcheck_passed ?? true,
    rugcheckResult?.hasCriticalRisk ?? false,
    devReputation,
    dustPct,
    token.max_single_wallet_pct,
    token.mint_authority_revoked,
    token.freeze_authority_revoked,
    metrics,
  );
  const momentumScore = calculateMomentumScore(token, metrics);

  const total = holderScore + volumeScore + safetyScore + momentumScore;

  const breakdown = `H:${holderScore}/25 V:${volumeScore}/25 S:${safetyScore}/25 M:${momentumScore}/25 = ${total}/100`;

  return { total, holderScore, volumeScore, safetyScore, momentumScore, breakdown, disqualifyReasons };
}

// ═══════════════════════════════════════════════════════════════════

// Main monitoring logic
async function monitorWatchlistTokens(supabase: any): Promise<MonitorStats> {
  const startTime = Date.now();
  const stats: MonitorStats = {
    tokensChecked: 0, tokensUpdated: 0, promoted: 0, markedDead: 0, markedStale: 0,
    devSellRejected: 0, errors: 0, durationMs: 0, promotedTokens: [], deadTokens: [],
    devSellTokens: [], skippedRecent: 0, rugcheckRejected: 0, rugcheckTokens: [],
    scoreBreakdowns: [],
  };

  console.log('👁️ WATCHLIST MONITOR v2 (MOMENTUM SCORING): Starting...');

  const config = await getConfig(supabase);
  if (!config.is_enabled) {
    console.log('⏸️ Monitor disabled');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  const solPrice = await getSolPrice(supabase);
  const now = new Date();
  const skipCutoff = new Date(now.getTime() - SKIP_RECENTLY_CHECKED_MINUTES * 60 * 1000).toISOString();

  const { data: watchingTokens, error: fetchError } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'watching')
    .or(`last_checked_at.is.null,last_checked_at.lt.${skipCutoff}`)
    .order('holder_count', { ascending: false })
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(TOKENS_PER_RUN);

  if (fetchError) {
    console.error('Error fetching watchlist:', fetchError);
    stats.errors++;
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  console.log(`📋 Processing ${watchingTokens?.length || 0} watching tokens`);

  const tokens = watchingTokens || [];
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    
    for (const token of batch) {
      try {
        stats.tokensChecked++;

        // === DEV BEHAVIOR CHECK (HIGHEST PRIORITY) ===
        // NEW LOGIC: Only reject if dev sold >75% of holdings (retains <25% of original)
        // A dev taking partial profits while keeping skin in the game is NORMAL
        const currentBondingCurvePct = token.bonding_curve_pct ?? null;
        const currentMcapForDevCheck = token.market_cap_usd ?? 0;
        const isConfirmedOnBondingCurve = currentBondingCurvePct !== null && currentBondingCurvePct > 5;
        const skipDevSoldCheck = isConfirmedOnBondingCurve && currentMcapForDevCheck < 10000;
        
        if (token.dev_sold === true && !skipDevSoldCheck) {
          const tokenAgeMinutes = (now.getTime() - new Date(token.first_seen_at).getTime()) / 60000;
          const devHoldingPct = token.dev_holding_pct ?? null;
          const devBoughtBack = token.dev_bought_back === true;
          const currentMcap = token.market_cap_usd ?? token.market_cap_sol ?? 0;
          const isCrashedToken = currentMcap < 4000;
          
          // Only consider it a "dump" if dev holds < 1% (sold >99% — near full exit)
          const isFullExit = devHoldingPct !== null && devHoldingPct < 1;
          // Partial dump: dev sold most but not all (holds 1-5%)
          const isHeavyDump = devHoldingPct !== null && devHoldingPct < 5;
          
          if (isFullExit && tokenAgeMinutes < 30 && !devBoughtBack) {
            console.log(`💀 DEV EXITED: ${token.token_symbol} - holds ${devHoldingPct?.toFixed(2)}% - age: ${tokenAgeMinutes.toFixed(0)}m - REJECT`);
            await supabase.from('pumpfun_watchlist').update({
              status: 'rejected', rejection_type: 'permanent', rejection_reason: 'dev_full_exit',
              rejection_reasons: ['dev_full_exit', 'young_token_abandon'],
              removed_at: now.toISOString(), removal_reason: `Dev fully exited (${devHoldingPct?.toFixed(2)}%) at ${tokenAgeMinutes.toFixed(0)}m`,
              last_checked_at: now.toISOString(), last_processor: 'watchlist-monitor-v2',
            }).eq('id', token.id);
            // TRIGGER RUG EVENT PROCESSOR
            try {
              await supabase.functions.invoke('rug-event-processor', {
                body: {
                  token_mint: token.token_mint, token_symbol: token.token_symbol, token_name: token.token_name,
                  creator_wallet: token.creator_wallet, rug_type: 'dev_full_exit',
                  evidence: { dev_holding_pct: devHoldingPct, price_at_rug: metrics.priceUsd, price_ath: token.price_ath_usd, market_cap_at_rug: metrics.marketCapUsd, holder_count: metrics.holders, volume_sol: metrics.volume24hSol },
                  triggered_by: 'watchlist-monitor-v2',
                },
              });
            } catch (e) { console.warn('Rug event processor failed:', e); }
            stats.devSellRejected++;
            stats.devSellTokens.push(`${token.token_symbol} (dev exit ${devHoldingPct?.toFixed(1)}% @ ${tokenAgeMinutes.toFixed(0)}m)`);
            continue;
          }
          
          // Dev dumped + token crashed below $4k = dead
          if (isCrashedToken && isHeavyDump && !devBoughtBack) {
            await supabase.from('pumpfun_watchlist').update({
              status: 'rejected', rejection_type: 'permanent', rejection_reason: 'dev_sold_crashed',
              rejection_reasons: ['dev_sold', 'token_crashed'],
              removed_at: now.toISOString(), removal_reason: `Dev dumped to ${devHoldingPct?.toFixed(1)}% + token crashed to $${currentMcap.toFixed(0)}`,
              last_checked_at: now.toISOString(), last_processor: 'watchlist-monitor-v2',
            }).eq('id', token.id);
            // TRIGGER RUG EVENT PROCESSOR
            try {
              await supabase.functions.invoke('rug-event-processor', {
                body: {
                  token_mint: token.token_mint, token_symbol: token.token_symbol, token_name: token.token_name,
                  creator_wallet: token.creator_wallet, rug_type: 'dev_sold_crashed',
                  evidence: { dev_holding_pct: devHoldingPct, price_at_rug: metrics.priceUsd, price_ath: token.price_ath_usd, market_cap_at_rug: currentMcap, holder_count: metrics.holders, volume_sol: metrics.volume24hSol },
                  triggered_by: 'watchlist-monitor-v2',
                },
              });
            } catch (e) { console.warn('Rug event processor failed:', e); }
            stats.devSellRejected++;
            stats.devSellTokens.push(`${token.token_symbol} (crashed $${currentMcap.toFixed(0)})`);
            continue;
          }
          
          if (devBoughtBack) {
            console.log(`⚠️ DEV REBOUGHT: ${token.token_symbol} - continuing`);
          } else if (devHoldingPct !== null && devHoldingPct >= 5) {
            // Dev still holds 5%+ — this is normal profit taking, continue watching
            console.log(`ℹ️ DEV PARTIAL SELL: ${token.token_symbol} - still holds ${devHoldingPct.toFixed(2)}% — OK`);
          } else if (isFullExit && tokenAgeMinutes >= 30) {
            // Full exit after 30min — reject
            await supabase.from('pumpfun_watchlist').update({
              status: 'rejected', rejection_type: 'permanent', rejection_reason: 'dev_full_exit',
              rejection_reasons: ['dev_full_exit'], removed_at: now.toISOString(),
              removal_reason: `Dev fully exited (${devHoldingPct?.toFixed(2)}%) after ${tokenAgeMinutes.toFixed(0)}m`,
              last_checked_at: now.toISOString(), last_processor: 'watchlist-monitor-v2',
            }).eq('id', token.id);
            // TRIGGER RUG EVENT PROCESSOR
            try {
              await supabase.functions.invoke('rug-event-processor', {
                body: {
                  token_mint: token.token_mint, token_symbol: token.token_symbol, token_name: token.token_name,
                  creator_wallet: token.creator_wallet, rug_type: 'dev_full_exit',
                  evidence: { dev_holding_pct: devHoldingPct, price_at_rug: metrics.priceUsd, price_ath: token.price_ath_usd, market_cap_at_rug: token.market_cap_usd, holder_count: metrics.holders, volume_sol: metrics.volume24hSol },
                  triggered_by: 'watchlist-monitor-v2',
                },
              });
            } catch (e) { console.warn('Rug event processor failed:', e); }
            stats.devSellRejected++;
            stats.devSellTokens.push(`${token.token_symbol} (dev exit @ ${tokenAgeMinutes.toFixed(0)}m)`);
            continue;
          } else if (isHeavyDump && !isFullExit) {
            // Dev holds 1-5% — warn but keep watching
            console.log(`⚠️ DEV LOW HOLDINGS: ${token.token_symbol} - ${devHoldingPct?.toFixed(2)}% — watching closely`);
          }
        }
        
        if (token.dev_launched_new === true) {
          await supabase.from('pumpfun_watchlist').update({
            status: 'rejected', rejection_type: 'permanent', rejection_reason: 'dev_launched_new',
            rejection_reasons: ['dev_launched_new'], removed_at: now.toISOString(),
            removal_reason: 'Developer launched new token', last_checked_at: now.toISOString(),
            last_processor: 'watchlist-monitor-v2',
          }).eq('id', token.id);
          stats.devSellRejected++;
          stats.devSellTokens.push(`${token.token_symbol} (dev launched new)`);
          continue;
        }

        // === EARLY MCAP GATE — reject immediately if way over cap ===
        const earlyMcap = token.market_cap_usd ?? 0;
        if (earlyMcap > config.max_market_cap_usd * 2) {
          console.log(`🚫 EARLY MCAP REJECT: ${token.token_symbol} — $${earlyMcap.toFixed(0)} > $${(config.max_market_cap_usd * 2).toFixed(0)}`);
          await supabase.from('pumpfun_watchlist').update({
            status: 'rejected', rejection_type: 'permanent', rejection_reason: 'mcap_exceeded',
            rejection_reasons: ['mcap_exceeded'], removed_at: now.toISOString(),
            removal_reason: `Market cap $${earlyMcap.toFixed(0)} exceeds 2x max`,
            last_checked_at: now.toISOString(), last_processor: 'watchlist-monitor-v2',
          }).eq('id', token.id);
          continue;
        }

        // Fetch current metrics
        const metrics = await fetchPumpFunMetrics(token.token_mint);
        const watchingMinutesNow = (now.getTime() - new Date(token.first_seen_at).getTime()) / 60000;
        
        if (!metrics) {
          console.log(`⚠️ No metrics for ${token.token_symbol} (age: ${watchingMinutesNow.toFixed(0)}m)`);
          
          if (watchingMinutesNow > 60) {
            await supabase.from('pumpfun_watchlist').update({
              status: 'dead', rejection_type: 'soft', removed_at: now.toISOString(),
              removal_reason: `API failed, ${watchingMinutesNow.toFixed(0)}m old`,
              last_checked_at: now.toISOString(), last_processor: 'watchlist-monitor-v2',
            }).eq('id', token.id);
            stats.markedDead++;
            stats.deadTokens.push(`${token.token_symbol} (API fail)`);
          } else if (watchingMinutesNow > 30 && (token.holder_count || 0) <= 1) {
            await supabase.from('pumpfun_watchlist').update({
              status: 'dead', rejection_type: 'soft', removed_at: now.toISOString(),
              removal_reason: `API failed, ${token.holder_count || 0} holders`,
              last_checked_at: now.toISOString(), last_processor: 'watchlist-monitor-v2',
            }).eq('id', token.id);
            stats.markedDead++;
            stats.deadTokens.push(`${token.token_symbol} (1 holder)`);
          }
          stats.errors++;
          continue;
        }

        await delay(CALL_DELAY_MS);

        const txCount = metrics.buys + metrics.sells;
        const watchingMinutes = watchingMinutesNow;
        const newMetricsHash = `${metrics.holders}-${metrics.volume24hSol.toFixed(4)}-${metrics.priceUsd?.toFixed(8) || '0'}`;
        const isStale = token.metrics_hash === newMetricsHash;

        const updates: any = {
          last_checked_at: now.toISOString(),
          check_count: (token.check_count || 0) + 1,
          holder_count_prev: token.holder_count,
          volume_sol_prev: token.volume_sol,
          price_usd_prev: token.price_usd,
          holder_count: metrics.holders,
          volume_sol: metrics.volume24hSol,
          tx_count: txCount,
          price_usd: metrics.priceUsd,
          market_cap_usd: metrics.marketCapUsd,
          liquidity_usd: metrics.liquidityUsd,
          bonding_curve_pct: metrics.bondingCurvePct,
          holder_count_peak: Math.max(token.holder_count_peak || 0, metrics.holders),
          price_ath_usd: Math.max(token.price_ath_usd || 0, metrics.priceUsd || 0),
          metrics_hash: newMetricsHash,
          consecutive_stale_checks: isStale ? (token.consecutive_stale_checks || 0) + 1 : 0,
          last_processor: 'watchlist-monitor-v2',
          is_graduated: metrics.bondingCurvePct !== null && metrics.bondingCurvePct <= 5,
          graduated_at: (metrics.bondingCurvePct !== null && metrics.bondingCurvePct <= 5 && !token.is_graduated) 
            ? now.toISOString() : token.graduated_at,
        };

        // === MAYHEM CHECK ===
        let isMayhemToken = false;
        if (!token.mayhem_checked) {
          isMayhemToken = await checkMayhemMode(token.token_mint);
          updates.mayhem_checked = true;
          if (isMayhemToken) {
            updates.status = 'rejected';
            updates.rejection_type = 'permanent';
            updates.rejection_reason = 'mayhem_mode';
            updates.rejection_reasons = ['mayhem_mode'];
            updates.removed_at = now.toISOString();
            updates.permanent_reject = true;
            await supabase.from('pumpfun_watchlist').update(updates).eq('id', token.id);
            stats.errors++;
            continue;
          }
        }

        // === BASIC QUALIFICATION CHECK (must pass minimum before scoring) ===
        const passesWalletConcentration = token.max_single_wallet_pct === null || 
          token.max_single_wallet_pct <= config.max_single_wallet_pct;

        if (watchingMinutes >= config.min_watch_time_minutes && 
            metrics.holders >= config.qualification_holder_count && 
            metrics.volume24hSol >= config.qualification_volume_sol &&
            (token.bundle_score === null || token.bundle_score <= config.max_bundle_score) &&
            passesWalletConcentration) {
          
          // === MOMENTUM SCORING ENGINE v2 ===
          // Instead of binary red flag gates, compute a weighted score
          
          // === LARP CHECK — verify socials reference the token ===
          // Only check once (first time token reaches scoring phase)
          if (!token.larp_checked && (token.website || token.twitter || token.telegram)) {
            try {
              console.log(`   🎭 Running LARP check for ${token.token_symbol}...`);
              const larpResponse = await supabase.functions.invoke('social-larp-detector', {
                body: {
                  token_mint: token.token_mint,
                  token_name: token.token_name,
                  token_symbol: token.token_symbol,
                  website: token.website,
                  twitter: token.twitter,
                  telegram: token.telegram,
                  creator_wallet: token.creator_wallet,
                  triggered_by: 'watchlist-monitor-v2',
                },
              });

              if (larpResponse.data?.result?.isLarp) {
                const larpResult = larpResponse.data.result;
                console.log(`   🎭 LARP DETECTED: ${token.token_symbol} — ${larpResult.verdict} (${larpResult.confidence}%)`);
                updates.status = 'rejected';
                updates.rejection_type = 'permanent';
                updates.rejection_reason = 'larp_detected';
                updates.rejection_reasons = ['larp_detected', ...larpResult.flags];
                updates.removed_at = now.toISOString();
                updates.removal_reason = `LARP: ${larpResult.verdict} — socials don't reference token. Flags: ${larpResult.flags.join(', ')}`;
                updates.larp_checked = true;
                updates.larp_result = larpResult;
                updates.last_processor = 'watchlist-monitor-v2';
                await supabase.from('pumpfun_watchlist').update(updates).eq('id', token.id);
                stats.errors++; // Count as rejected
                continue;
              }

              updates.larp_checked = true;
              updates.larp_result = larpResponse.data?.result || null;
              console.log(`   ✅ LARP check passed: ${token.token_symbol} — ${larpResponse.data?.result?.verdict || 'ok'}`);
            } catch (e) {
              console.warn(`   ⚠️ LARP check failed for ${token.token_symbol}:`, e);
              updates.larp_checked = true; // Don't retry on error
            }
          }

          // Re-verify RugCheck if stale
          const rugcheckAge = token.rugcheck_checked_at 
            ? (now.getTime() - new Date(token.rugcheck_checked_at).getTime()) / 60000 
            : Infinity;
          
          let rugcheckResult: RugCheckResult | null = null;
          if (rugcheckAge > config.rugcheck_recheck_minutes) {
            rugcheckResult = await fetchRugCheckForBuyGate(token.token_mint, config);
            updates.rugcheck_score = rugcheckResult.score;
            updates.rugcheck_normalised = rugcheckResult.normalised;
            updates.rugcheck_risks = rugcheckResult.risks;
            updates.rugcheck_passed = rugcheckResult.passed;
            updates.rugcheck_checked_at = now.toISOString();
            updates.rugcheck_version = (token.rugcheck_version || 0) + 1;
          }

          // Calculate dust
          const dustPct = await calculateDustHolderPct(token.token_mint, metrics.priceUsd);
          updates.dust_holder_pct = dustPct;

          // Look up dev reputation
          const devReputation = await getDevReputation(supabase, token.creator_wallet);

          // CALCULATE THE SCORE
          const score = await calculateQualificationScore(
            token, metrics, rugcheckResult, devReputation, dustPct
          );

          console.log(`   📊 SCORE: ${token.token_symbol} — ${score.breakdown}${score.disqualifyReasons.length ? ' ⛔ DQ: ' + score.disqualifyReasons.join(', ') : ''}`);

          stats.scoreBreakdowns.push({
            symbol: token.token_symbol,
            total: score.total,
            holder: score.holderScore,
            volume: score.volumeScore,
            safety: score.safetyScore,
            momentum: score.momentumScore,
            qualified: score.total >= config.min_qualification_score && score.disqualifyReasons.length === 0,
          });

          // Hard disqualifiers override score
          if (score.disqualifyReasons.length > 0) {
            console.log(`   ⛔ DISQUALIFIED: ${token.token_symbol} - ${score.disqualifyReasons.join(', ')}`);
            updates.status = 'rejected';
            updates.rejection_type = 'permanent';
            updates.rejection_reason = `disqualified:${score.disqualifyReasons[0]}`;
            updates.rejection_reasons = score.disqualifyReasons;
            updates.removed_at = now.toISOString();
            updates.removal_reason = `DQ: ${score.disqualifyReasons.join(', ')} (score: ${score.total})`;
          }
          // Score too low
          else if (score.total < config.min_qualification_score) {
            console.log(`   🚩 SCORE TOO LOW: ${token.token_symbol} — ${score.total}/${config.min_qualification_score} — continuing to watch`);
            // Don't reject — let it keep watching in case score improves
            updates.priority_score = score.total;
          }
          // QUALIFIED!
          else {
            // MAX MCAP GATE: Reject if market cap exceeds max threshold
            const currentMcapUsd = metrics.marketCapUsd || 0;
            if (currentMcapUsd > config.max_market_cap_usd * 2) {
              // Way over cap — reject permanently, it's not coming back
              console.log(`   🚫 MCAP WAY OVER: ${token.token_symbol} — $${currentMcapUsd.toFixed(0)} > $${(config.max_market_cap_usd * 2).toFixed(0)} — REJECTED`);
              updates.status = 'rejected';
              updates.rejection_type = 'permanent';
              updates.rejection_reason = 'mcap_exceeded';
              updates.rejection_reasons = ['mcap_exceeded'];
              updates.removed_at = now.toISOString();
              updates.removal_reason = `Market cap $${currentMcapUsd.toFixed(0)} exceeds 2x max ($${config.max_market_cap_usd})`;
              updates.priority_score = score.total;
            } else if (currentMcapUsd > config.max_market_cap_usd) {
              console.log(`   🚫 MCAP TOO HIGH: ${token.token_symbol} — $${currentMcapUsd.toFixed(0)} > $${config.max_market_cap_usd} max`);
              updates.priority_score = score.total;
              // Slightly over — keep watching in case it drops back
            }
            // BONDING CURVE GATE: Must still be on bonding curve (not graduated)
            else if (token.is_graduated === true) {
              console.log(`   🚫 GRADUATED: ${token.token_symbol} — already on Raydium, skipping`);
              updates.priority_score = score.total;
              // Don't promote graduated tokens
            }
            else {
            const signalStrength = score.total >= 80 ? 'strong' : 'weak';
            
            updates.status = 'qualified';
            updates.qualified_at = now.toISOString();
            updates.signal_strength = signalStrength;
            updates.priority_score = score.total;
            updates.price_at_qualified_usd = metrics.priceUsd;
            updates.qualification_reason = `SCORE:${score.total}/100 ${score.breakdown} | Holders:${metrics.holders} Vol:${metrics.volume24hSol.toFixed(2)}SOL Mcap:$${(metrics.marketCapUsd || 0).toFixed(0)} RugCheck:${rugcheckResult?.score ?? token.rugcheck_score ?? 'N/A'} DevRep:${devReputation?.reputationScore ?? 'unknown'}`;
            
            stats.promoted++;
            stats.promotedTokens.push(`${token.token_symbol} (SCORE:${score.total} ${signalStrength.toUpperCase()})`);
            console.log(`🎉 PROMOTED [${signalStrength.toUpperCase()} ${score.total}/100]: ${token.token_symbol}`);

            // Add to buy candidates
            await supabase.from('pumpfun_buy_candidates').upsert({
              token_mint: token.token_mint,
              token_name: token.token_name,
              token_symbol: token.token_symbol,
              creator_wallet: token.creator_wallet,
              volume_sol_5m: metrics.volume24hSol,
              volume_usd_5m: metrics.volume24hSol * solPrice,
              holder_count: metrics.holders,
              transaction_count: txCount,
              bundle_score: token.bundle_score,
              bonding_curve_pct: metrics.bondingCurvePct,
              status: 'pending',
              detected_at: now.toISOString(),
              metadata: { 
                qualification_score: score.total,
                score_breakdown: score.breakdown,
                signal_strength: signalStrength,
                dev_reputation: devReputation?.reputationScore ?? null,
                dev_trust_level: devReputation?.trustLevel ?? null,
                dust_pct: dustPct,
              },
            }, { onConflict: 'token_mint' });
          }
          }
        }
        
        // === DEAD CHECKS (unchanged from v1) ===
        if (watchingMinutes > config.max_watch_time_minutes) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Exceeded max watch time: ${watchingMinutes.toFixed(0)}m`;
          stats.markedDead++;
          stats.deadTokens.push(`${token.token_symbol} (max time)`);
        }
        else if (watchingMinutes > 30 && metrics.holders <= 1 && metrics.volume24hSol <= 0.001) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Zombie: ${watchingMinutes.toFixed(0)}m, ${metrics.holders} holders`;
          stats.markedDead++;
          stats.deadTokens.push(`${token.token_symbol} (zombie)`);
        }
        else if (watchingMinutes > 60 && metrics.holders < 5) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Low activity after 1h: ${metrics.holders} holders`;
          stats.markedDead++;
          stats.deadTokens.push(`${token.token_symbol} (low 1h)`);
        }
        else if (watchingMinutes > 15 && metrics.holders < config.dead_holder_threshold && metrics.volume24hSol < config.dead_volume_threshold_sol) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `${watchingMinutes.toFixed(0)}m, ${metrics.holders} holders, ${metrics.volume24hSol.toFixed(3)} SOL`;
          stats.markedDead++;
          stats.deadTokens.push(`${token.token_symbol} (${metrics.holders} holders)`);
        }
        else if (updates.consecutive_stale_checks >= 4 && watchingMinutes > 8) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Stale: ${updates.consecutive_stale_checks} checks, ${watchingMinutes.toFixed(0)}m`;
          stats.markedStale++;
        }

        // Update token
        const { error: updateError } = await supabase.from('pumpfun_watchlist').update(updates).eq('id', token.id);
        if (updateError) {
          console.error(`Error updating ${token.token_symbol}:`, updateError);
          stats.errors++;
        } else {
          stats.tokensUpdated++;
        }

      } catch (error) {
        console.error(`Error processing ${token.token_symbol}:`, error);
        stats.errors++;
      }
    }
    
    if (i + BATCH_SIZE < tokens.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ████ QUALIFIED DECAY CHECK — demote qualified tokens that dumped ████
  // ═══════════════════════════════════════════════════════════════════
  const QUALIFIED_DECAY_MCAP_THRESHOLD = 3000; // $3k
  try {
    const { data: qualifiedTokens } = await supabase
      .from('pumpfun_watchlist')
      .select('id, token_mint, token_symbol, market_cap_usd, qualified_at, creator_wallet, token_name')
      .eq('status', 'qualified')
      .limit(30);

    if (qualifiedTokens && qualifiedTokens.length > 0) {
      console.log(`🔄 QUALIFIED DECAY: Checking ${qualifiedTokens.length} qualified tokens...`);
      
      for (const qt of qualifiedTokens) {
        try {
          // Re-fetch live MCap from pump.fun
          const liveMetrics = await fetchPumpFunMetrics(qt.token_mint);
          if (!liveMetrics) continue;
          
          const liveMcap = liveMetrics.marketCapUsd || 0;
          
          if (liveMcap < QUALIFIED_DECAY_MCAP_THRESHOLD) {
            console.log(`📉 QUALIFIED DECAY: ${qt.token_symbol} — MCap $${liveMcap.toFixed(0)} < $${QUALIFIED_DECAY_MCAP_THRESHOLD} — DEMOTING`);
            
            await supabase.from('pumpfun_watchlist').update({
              status: 'rejected',
              rejection_type: 'soft',
              rejection_reason: 'post_qualify_dump',
              rejection_reasons: ['post_qualify_dump', 'mcap_crashed'],
              removed_at: now.toISOString(),
              removal_reason: `Qualified token dumped: MCap $${liveMcap.toFixed(0)} < $${QUALIFIED_DECAY_MCAP_THRESHOLD}`,
              market_cap_usd: liveMcap,
              price_usd: liveMetrics.priceUsd,
              holder_count: liveMetrics.holders,
              volume_sol: liveMetrics.volume24hSol,
              last_checked_at: now.toISOString(),
              last_processor: 'watchlist-monitor-v2-decay',
            }).eq('id', qt.id);
            
            // Also remove from buy candidates
            await supabase.from('pumpfun_buy_candidates')
              .update({ status: 'rejected' })
              .eq('token_mint', qt.token_mint)
              .eq('status', 'pending');
            
            stats.markedDead++;
            stats.deadTokens.push(`${qt.token_symbol} (qualified_decay $${liveMcap.toFixed(0)})`);
          } else {
            // Update live metrics for qualified tokens too
            await supabase.from('pumpfun_watchlist').update({
              market_cap_usd: liveMcap,
              price_usd: liveMetrics.priceUsd,
              holder_count: liveMetrics.holders,
              volume_sol: liveMetrics.volume24hSol,
              last_checked_at: now.toISOString(),
            }).eq('id', qt.id);
          }
          
          await delay(CALL_DELAY_MS);
        } catch (e) {
          console.warn(`Error checking qualified decay for ${qt.token_symbol}:`, e);
        }
      }
    }
  } catch (e) {
    console.warn('Qualified decay check failed:', e);
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 MONITOR v2 COMPLETE: ${stats.tokensChecked} checked, ${stats.promoted} promoted, ${stats.markedDead} dead, ${stats.devSellRejected} dev-rejected, ${stats.rugcheckRejected} rugcheck-rejected (${stats.durationMs}ms)`);
  if (stats.scoreBreakdowns.length > 0) {
    console.log(`📊 SCORE BREAKDOWNS:`);
    for (const s of stats.scoreBreakdowns) {
      console.log(`   ${s.qualified ? '✅' : '❌'} ${s.symbol}: ${s.total}/100 (H:${s.holder} V:${s.volume} S:${s.safety} M:${s.momentum})`);
    }
  }

  return stats;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'monitor';

    console.log(`🎯 pumpfun-watchlist-monitor v2 action: ${action}`);

    switch (action) {
      case 'monitor': {
        const stats = await monitorWatchlistTokens(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'status': {
        const { count: watchingCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'watching');

        const { count: staleCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'watching')
          .gte('consecutive_stale_checks', 3);

        return jsonResponse({
          success: true,
          status: 'healthy',
          watchingCount: watchingCount || 0,
          staleCount: staleCount || 0,
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-watchlist-monitor:', error);
    return errorResponse(String(error), 500);
  }
});
