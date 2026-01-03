import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN WATCHLIST MONITOR
 * 
 * Purpose: Monitor ALL watching tokens, update metrics, promote or demote
 * Schedule: Every 60-120 seconds via cron
 * 
 * Logic:
 * 1. Get ALL tokens with status 'watching' from database (batch of 50)
 * 2. Fetch current metrics for each token directly from pump.fun API
 * 3. Compare to previous metrics and update database
 * 4. CHECK DEV BEHAVIOR: If dev_sold or dev_launched_new -> immediate PERMANENT reject
 * 5. Promotion: If holders >= 20 AND volume >= 0.5 SOL AND watched >= 2 min -> 'qualified'
 * 6. Staleness: If NO changes for 3+ consecutive checks -> increment stale counter
 * 7. Dead check: If holders < 3 OR volume < 0.01 SOL after 15+ minutes -> 'dead'
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

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with exponential backoff for rate limiting
async function fetchWithBackoff(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
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

// Fetch token metrics from SolanaTracker API (better for pump.fun tokens)
async function fetchSolanaTrackerMetrics(mint: string): Promise<TokenMetrics | null> {
  try {
    const response = await fetch(`https://data.solanatracker.io/tokens/${mint}`, {
      headers: { 
        'Accept': 'application/json',
        'x-api-key': Deno.env.get('SOLANA_TRACKER_API_KEY') || '',
      }
    });

    if (!response.ok) {
      console.log(`   📊 SolanaTracker API error for ${mint}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (!data || data.error) {
      console.log(`   📊 SolanaTracker: No data for ${mint}`);
      return null;
    }

    const pools = data.pools || [];
    const mainPool = pools[0] || {};
    
    console.log(`   📊 SolanaTracker fallback: ${mint.slice(0, 8)} - ${data.token?.holder || 0} holders`);

    return {
      holders: data.token?.holder || 0,
      volume24hSol: (mainPool.volume?.h24 || 0) / (mainPool.price?.sol || 200),
      priceUsd: mainPool.price?.usd || null,
      liquidityUsd: mainPool.liquidity?.usd || null,
      marketCapUsd: data.token?.market_cap || null,
      bondingCurvePct: null, // SolanaTracker doesn't have bonding curve data
      buys: mainPool.txns?.h24?.buys || 0,
      sells: mainPool.txns?.h24?.sells || 0,
    };
  } catch (error) {
    console.error(`Error fetching SolanaTracker metrics for ${mint}:`, error);
    return null;
  }
}

// Fetch token metrics from DexScreener (fallback API - better for graduated tokens)
async function fetchDexScreenerMetrics(mint: string): Promise<TokenMetrics | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.log(`   📊 DexScreener API error for ${mint}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const pair = data?.pairs?.[0]; // Get first pair (usually SOL pair)

    if (!pair) {
      console.log(`   📊 DexScreener: No pairs found for ${mint}`);
      return null;
    }

    const priceUsd = parseFloat(pair.priceUsd) || 0;
    const volume24h = parseFloat(pair.volume?.h24) || 0;
    const liquidity = parseFloat(pair.liquidity?.usd) || 0;
    const marketCap = parseFloat(pair.marketCap) || (pair.fdv ? parseFloat(pair.fdv) : null);
    
    // Estimate holders from txns if available
    const txns24h = pair.txns?.h24 || {};
    const estimatedHolders = Math.min((txns24h.buys || 0) + (txns24h.sells || 0), 1000);

    // Convert volume USD to SOL (estimate using price)
    const solPrice = priceUsd > 0 && pair.priceNative ? (priceUsd / parseFloat(pair.priceNative)) : 200;
    const volumeSol = volume24h / solPrice;

    console.log(`   📊 DexScreener fallback: ${mint.slice(0, 8)} - $${priceUsd.toFixed(8)}, vol: ${volumeSol.toFixed(2)} SOL`);

    return {
      holders: estimatedHolders,
      volume24hSol: volumeSol,
      priceUsd: priceUsd,
      liquidityUsd: liquidity,
      marketCapUsd: marketCap,
      bondingCurvePct: null, // DexScreener doesn't have bonding curve data
      buys: txns24h.buys || 0,
      sells: txns24h.sells || 0,
    };
  } catch (error) {
    console.error(`Error fetching DexScreener metrics for ${mint}:`, error);
    return null;
  }
}

// Fetch just price from Jupiter (price-only fallback)
async function fetchJupiterPrice(mint: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const price = data?.data?.[mint]?.price;
    
    if (price) {
      console.log(`   💹 Jupiter price fallback: ${mint.slice(0, 8)} - $${price.toFixed(8)}`);
      return price;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching Jupiter price for ${mint}:`, error);
    return null;
  }
}

// Fetch token metrics from pump.fun API with fallbacks: SolanaTracker -> DexScreener -> Jupiter
async function fetchPumpFunMetrics(mint: string): Promise<TokenMetrics | null> {
  try {
    const response = await fetchWithBackoff(
      `https://frontend-api.pump.fun/coins/${mint}`,
      { headers: { 'Accept': 'application/json' } }
    );

    // If pump.fun returns 5xx error, try fallbacks
    if (response.status >= 500) {
      console.log(`   ⚠️ pump.fun API error ${response.status} for ${mint}, trying fallbacks...`);
      
      // Fallback 1: SolanaTracker (best for pump.fun tokens - has holder count)
      const stMetrics = await fetchSolanaTrackerMetrics(mint);
      if (stMetrics && stMetrics.holders > 0) {
        return stMetrics;
      }
      
      // Fallback 2: DexScreener (better for graduated tokens)
      const dexMetrics = await fetchDexScreenerMetrics(mint);
      if (dexMetrics && dexMetrics.priceUsd && dexMetrics.priceUsd > 0) {
        return dexMetrics;
      }
      
      // Fallback 3: Jupiter for price only (last resort)
      const jupPrice = await fetchJupiterPrice(mint);
      if (jupPrice) {
        return {
          holders: 0, // Unknown from Jupiter
          volume24hSol: 0, // Unknown from Jupiter
          priceUsd: jupPrice,
          liquidityUsd: null,
          marketCapUsd: null,
          bondingCurvePct: null,
          buys: 0,
          sells: 0,
        };
      }
      
      // All fallbacks failed
      console.log(`   ❌ All API fallbacks failed for ${mint}`);
      return null;
    }

    if (!response.ok) {
      if (response.status === 404) {
        return { holders: 0, volume24hSol: 0, priceUsd: null, liquidityUsd: null, marketCapUsd: null, bondingCurvePct: null, buys: 0, sells: 0 };
      }
      console.error(`pump.fun API error for ${mint}: ${response.status}`);
      
      // Try SolanaTracker first for non-5xx errors
      const stMetrics = await fetchSolanaTrackerMetrics(mint);
      if (stMetrics && stMetrics.holders > 0) {
        return stMetrics;
      }
      
      // Then DexScreener
      const dexMetrics = await fetchDexScreenerMetrics(mint);
      if (dexMetrics && dexMetrics.priceUsd && dexMetrics.priceUsd > 0) {
        return dexMetrics;
      }
      
      return null;
    }

    const data = await response.json();
    
    // Calculate bonding curve percentage
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
      priceUsd: priceUsd,
      liquidityUsd: virtualSolReserves > 0 ? (virtualSolReserves / 1e9) * 200 : null,
      marketCapUsd: data.usd_market_cap || null,
      bondingCurvePct: data.complete ? 0 : bondingCurvePct,
      buys: data.buy_count || 0,
      sells: data.sell_count || 0,
    };
  } catch (error) {
    console.error(`Error fetching pump.fun metrics for ${mint}:`, error);
    
    // Try SolanaTracker first on error
    const stMetrics = await fetchSolanaTrackerMetrics(mint);
    if (stMetrics && stMetrics.holders > 0) {
      return stMetrics;
    }
    
    // Then DexScreener
    const dexMetrics = await fetchDexScreenerMetrics(mint);
    if (dexMetrics && dexMetrics.priceUsd && dexMetrics.priceUsd > 0) {
      return dexMetrics;
    }
    
    return null;
  }
}

// Get current SOL price
async function getSolPrice(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from('sol_price_cache')
      .select('price_usd')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    return data?.price_usd || 200;
  } catch {
    return 200;
  }
}

// Fetch RugCheck analysis for buy gate verification
async function fetchRugCheckForBuyGate(mint: string, config: any): Promise<RugCheckResult> {
  const defaultResult: RugCheckResult = {
    score: 0,
    normalised: 0,
    risks: [],
    passed: false,
    hasCriticalRisk: false,
    criticalRiskNames: [],
  };

  try {
    // Rate limit delay
    await delay(config.rugcheck_rate_limit_ms || 500);
    
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.log(`   ⚠️ RugCheck API error: ${response.status} - failing open`);
      // Fail open - don't block buy if API is down
      return { ...defaultResult, passed: true, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    
    // Extract score (RugCheck score: 0-1000, higher = safer)
    const rawScore = data.score || 0;
    const normalised = Math.min(100, Math.max(0, rawScore / 10)); // Convert to 0-100
    
    // Extract risks
    const risks: RugCheckRisk[] = (data.risks || []).map((r: any) => ({
      name: r.name || 'Unknown',
      value: r.value || '',
      description: r.description || '',
      score: r.score || 0,
      level: r.level || 'info',
    }));
    
    // Check for critical risks
    const criticalRiskList: string[] = config.rugcheck_critical_risks || [
      'Freeze Authority still enabled',
      'Mint Authority still enabled',
      'Low Liquidity',
      'Copycat token',
      'Top 10 holders own high percentage',
      'Single holder owns high percentage',
    ];
    
    const dangerRisks = risks.filter(r => r.level === 'danger');
    const criticalRiskNames = dangerRisks
      .filter(r => criticalRiskList.some(cr => r.name.toLowerCase().includes(cr.toLowerCase())))
      .map(r => r.name);
    
    const hasCriticalRisk = criticalRiskNames.length > 0;
    const minScore = config.min_rugcheck_score || 50;
    const passed = normalised >= minScore && !hasCriticalRisk;
    
    return {
      score: rawScore,
      normalised,
      risks,
      passed,
      hasCriticalRisk,
      criticalRiskNames,
    };
  } catch (error) {
    console.error(`   ⚠️ RugCheck error for ${mint}:`, error);
    // Fail open - don't block buy if API call fails
    return { ...defaultResult, passed: true, error: String(error) };
  }
}

// Get monitor config
async function getConfig(supabase: any) {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .single();

  return {
    is_enabled: data?.is_enabled ?? true,
    min_watch_time_minutes: data?.min_watch_time_minutes ?? 2,
    max_watch_time_minutes: data?.max_watch_time_minutes ?? 60,
    dead_holder_threshold: data?.dead_holder_threshold ?? 3,
    dead_volume_threshold_sol: data?.dead_volume_threshold_sol ?? 0.01,
    qualification_holder_count: data?.qualification_holder_count ?? 20,
    qualification_volume_sol: data?.qualification_volume_sol ?? 0.5,
    max_bundle_score: data?.max_bundle_score ?? 70,
    max_single_wallet_pct: data?.max_single_wallet_pct ?? 15,
    // RugCheck thresholds
    min_rugcheck_score: data?.min_rugcheck_score ?? 50,
    rugcheck_critical_risks: data?.rugcheck_critical_risks ?? [
      'Freeze Authority still enabled',
      'Mint Authority still enabled',
      'Low Liquidity',
      'Copycat token',
      'Top 10 holders own high percentage',
      'Single holder owns high percentage',
    ],
    rugcheck_recheck_minutes: data?.rugcheck_recheck_minutes ?? 30,
    rugcheck_rate_limit_ms: data?.rugcheck_rate_limit_ms ?? 500,
    // Signal strength thresholds (Stage 11)
    signal_strong_holder_threshold: data?.signal_strong_holder_threshold ?? 50,
    signal_strong_volume_threshold_sol: data?.signal_strong_volume_threshold_sol ?? 2.0,
    signal_strong_rugcheck_threshold: data?.signal_strong_rugcheck_threshold ?? 70,
  };
}

// Determine signal strength classification (Stage 11)
function classifySignalStrength(
  metrics: TokenMetrics,
  rugcheckNormalised: number | null,
  config: any
): 'strong' | 'weak' {
  // SIGNAL_STRONG criteria:
  // - High holder count
  // - High volume
  // - High rugcheck score
  const passesHolders = metrics.holders >= config.signal_strong_holder_threshold;
  const passesVolume = metrics.volume24hSol >= config.signal_strong_volume_threshold_sol;
  const passesRugcheck = (rugcheckNormalised ?? 0) >= config.signal_strong_rugcheck_threshold;
  
  // Need to pass at least 2 of 3 criteria for STRONG
  const passCount = [passesHolders, passesVolume, passesRugcheck].filter(Boolean).length;
  
  return passCount >= 2 ? 'strong' : 'weak';
}

// Main monitoring logic with rate limiting
async function monitorWatchlistTokens(supabase: any): Promise<MonitorStats> {
  const startTime = Date.now();
  const stats: MonitorStats = {
    tokensChecked: 0,
    tokensUpdated: 0,
    promoted: 0,
    markedDead: 0,
    markedStale: 0,
    devSellRejected: 0,
    errors: 0,
    durationMs: 0,
    promotedTokens: [],
    deadTokens: [],
    devSellTokens: [],
    skippedRecent: 0,
    rugcheckRejected: 0,
    rugcheckTokens: [],
  };

  console.log('👁️ WATCHLIST MONITOR: Starting monitoring cycle...');

  const config = await getConfig(supabase);
  if (!config.is_enabled) {
    console.log('⏸️ Monitor disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  const solPrice = await getSolPrice(supabase);
  const now = new Date();
  const skipCutoff = new Date(now.getTime() - SKIP_RECENTLY_CHECKED_MINUTES * 60 * 1000).toISOString();

  // Get watching tokens, prioritize by: recently added, high holders, least recently checked
  // Skip tokens checked within last 3 minutes
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

  console.log(`📋 Processing ${watchingTokens?.length || 0} watching tokens (skipping recently checked)`);

  // Process in batches with rate limiting
  const tokens = watchingTokens || [];
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    
    // Process batch
    for (const token of batch) {
      try {
        stats.tokensChecked++;

        // === DEV BEHAVIOR CHECK (HIGHEST PRIORITY) ===
        // If dev has sold or launched a new token, PERMANENT reject immediately
        if (token.dev_sold === true) {
          console.log(`🚨 DEV SOLD: ${token.token_symbol} - PERMANENT REJECT`);
          
          await supabase
            .from('pumpfun_watchlist')
            .update({
              status: 'rejected',
              rejection_type: 'permanent',
              rejection_reason: 'dev_sold',
              rejection_reasons: ['dev_sold'],
              removed_at: now.toISOString(),
              removal_reason: 'Developer sold tokens',
              last_checked_at: now.toISOString(),
              last_processor: 'watchlist-monitor',
            })
            .eq('id', token.id);
            
          stats.devSellRejected++;
          stats.devSellTokens.push(`${token.token_symbol} (dev sold)`);
          continue;
        }
        
        if (token.dev_launched_new === true) {
          console.log(`🚨 DEV LAUNCHED NEW: ${token.token_symbol} - PERMANENT REJECT`);
          
          await supabase
            .from('pumpfun_watchlist')
            .update({
              status: 'rejected',
              rejection_type: 'permanent',
              rejection_reason: 'dev_launched_new',
              rejection_reasons: ['dev_launched_new'],
              removed_at: now.toISOString(),
              removal_reason: 'Developer launched a new token',
              last_checked_at: now.toISOString(),
              last_processor: 'watchlist-monitor',
            })
            .eq('id', token.id);
            
          stats.devSellRejected++;
          stats.devSellTokens.push(`${token.token_symbol} (dev launched new)`);
          continue;
        }

        // Fetch current metrics from pump.fun API
        const metrics = await fetchPumpFunMetrics(token.token_mint);
        
        if (!metrics) {
          console.log(`⚠️ Could not fetch metrics for ${token.token_symbol}`);
          stats.errors++;
          continue;
        }

        // Small delay between individual calls
        await delay(CALL_DELAY_MS);

        const txCount = metrics.buys + metrics.sells;
        const watchingMinutes = (now.getTime() - new Date(token.first_seen_at).getTime()) / 60000;

        // Generate metrics hash for staleness detection
        const newMetricsHash = `${metrics.holders}-${metrics.volume24hSol.toFixed(4)}-${metrics.priceUsd?.toFixed(8) || '0'}`;
        const isStale = token.metrics_hash === newMetricsHash;

        const updates: any = {
          last_checked_at: now.toISOString(),
          check_count: (token.check_count || 0) + 1,
          // Shift current to prev
          holder_count_prev: token.holder_count,
          volume_sol_prev: token.volume_sol,
          price_usd_prev: token.price_usd,
          // Set new current
          holder_count: metrics.holders,
          volume_sol: metrics.volume24hSol,
          tx_count: txCount,
          price_usd: metrics.priceUsd,
          market_cap_usd: metrics.marketCapUsd,
          liquidity_usd: metrics.liquidityUsd,
          bonding_curve_pct: metrics.bondingCurvePct,
          // Track peaks
          holder_count_peak: Math.max(token.holder_count_peak || 0, metrics.holders),
          price_ath_usd: Math.max(token.price_ath_usd || 0, metrics.priceUsd || 0),
        // Staleness tracking
        metrics_hash: newMetricsHash,
        consecutive_stale_checks: isStale ? (token.consecutive_stale_checks || 0) + 1 : 0,
        last_processor: 'watchlist-monitor',
        // Graduation detection - if bonding curve is 0 or null (complete), mark as graduated
        is_graduated: metrics.bondingCurvePct !== null && metrics.bondingCurvePct <= 5,
        graduated_at: (metrics.bondingCurvePct !== null && metrics.bondingCurvePct <= 5 && !token.is_graduated) 
          ? now.toISOString() 
          : token.graduated_at,
        };

        // === QUALIFICATION CHECK ===
        // Must pass all criteria including max_single_wallet_pct if we have the data
        const passesWalletConcentration = token.max_single_wallet_pct === null || 
          token.max_single_wallet_pct <= config.max_single_wallet_pct;
        
        if (watchingMinutes >= config.min_watch_time_minutes && 
            metrics.holders >= config.qualification_holder_count && 
            metrics.volume24hSol >= config.qualification_volume_sol &&
            (token.bundle_score === null || token.bundle_score <= config.max_bundle_score) &&
            passesWalletConcentration) {
          
          // === BUY GATE RUGCHECK RE-VERIFICATION ===
          // Check if rugcheck needs re-verification (stale or missing)
          const rugcheckAge = token.rugcheck_checked_at 
            ? (now.getTime() - new Date(token.rugcheck_checked_at).getTime()) / 60000 
            : Infinity;
          const needsRugcheckRecheck = rugcheckAge > config.rugcheck_recheck_minutes;
          
          let rugcheckPassed = token.rugcheck_passed === true;
          let rugcheckResult: RugCheckResult | null = null;
          
          if (needsRugcheckRecheck) {
            console.log(`   🔍 Re-verifying RugCheck for ${token.token_symbol} (last check: ${rugcheckAge.toFixed(0)}m ago)`);
            rugcheckResult = await fetchRugCheckForBuyGate(token.token_mint, config);
            rugcheckPassed = rugcheckResult.passed;
            
            // Update rugcheck fields
            updates.rugcheck_score = rugcheckResult.score;
            updates.rugcheck_normalised = rugcheckResult.normalised;
            updates.rugcheck_risks = rugcheckResult.risks;
            updates.rugcheck_passed = rugcheckResult.passed;
            updates.rugcheck_checked_at = now.toISOString();
            updates.rugcheck_version = (token.rugcheck_version || 0) + 1;
          }
          
          if (!rugcheckPassed) {
            // RugCheck failed - reject instead of promote
            console.log(`   ⛔ RUGCHECK FAILED at buy gate: ${token.token_symbol} - score: ${rugcheckResult?.normalised?.toFixed(0) || token.rugcheck_normalised || 'N/A'}`);
            updates.status = 'rejected';
            updates.rejection_type = rugcheckResult?.hasCriticalRisk ? 'permanent' : 'soft';
            updates.rejection_reason = `rugcheck_buy_gate:${rugcheckResult?.criticalRiskNames?.join(',') || 'low_score'}`;
            updates.rejection_reasons = ['rugcheck_buy_gate_failed'];
            updates.removed_at = now.toISOString();
            
            stats.rugcheckRejected++;
            stats.rugcheckTokens.push(`${token.token_symbol} (score: ${rugcheckResult?.normalised?.toFixed(0) || 'N/A'})`);
          } else {
            // All checks passed including RugCheck - classify signal strength and promote!
            const signalStrength = classifySignalStrength(
              metrics, 
              rugcheckResult?.normalised ?? token.rugcheck_normalised ?? null,
              config
            );
            
            updates.status = 'qualified';
            updates.qualified_at = now.toISOString();
            updates.signal_strength = signalStrength;
            updates.qualification_reason = `Holders: ${metrics.holders}, Volume: ${metrics.volume24hSol.toFixed(2)} SOL, Watched: ${watchingMinutes.toFixed(0)}m, Bundle: ${token.bundle_score || 'N/A'}, RugCheck: ${rugcheckResult?.normalised?.toFixed(0) || token.rugcheck_normalised || 'cached'}, Signal: ${signalStrength.toUpperCase()}`;
            
            stats.promoted++;
            stats.promotedTokens.push(`${token.token_symbol} (${metrics.holders} holders, ${metrics.volume24hSol.toFixed(2)} SOL, ${signalStrength.toUpperCase()})`);
            console.log(`🎉 PROMOTED [${signalStrength.toUpperCase()}]: ${token.token_symbol} - ${updates.qualification_reason}`);

            // Also add to buy candidates with signal strength
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
                watchlist_qualification: updates.qualification_reason,
                max_single_wallet_pct: token.max_single_wallet_pct,
                rugcheck_score: rugcheckResult?.normalised || token.rugcheck_normalised,
                signal_strength: signalStrength,
              },
            }, { onConflict: 'token_mint' });
          }
        }
        
        // === AGGRESSIVE DEAD CHECK === 
        // Multiple conditions to quickly remove dead tokens
        
        // Condition 1: Watched > max time (60 min default) = dead immediately
        if (watchingMinutes > config.max_watch_time_minutes) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Exceeded max watch time: ${watchingMinutes.toFixed(0)}m > ${config.max_watch_time_minutes}m`;
          
          stats.markedDead++;
          stats.deadTokens.push(`${token.token_symbol} (max time exceeded)`);
          console.log(`💀 DEAD (max time): ${token.token_symbol} - ${updates.removal_reason}`);
        }
        // Condition 2: Watched > 30 min with 1 holder and 0 volume = definitely dead
        else if (watchingMinutes > 30 && metrics.holders <= 1 && metrics.volume24hSol <= 0.001) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Zombie token: ${watchingMinutes.toFixed(0)}m with ${metrics.holders} holders, ${metrics.volume24hSol.toFixed(4)} SOL`;
          
          stats.markedDead++;
          stats.deadTokens.push(`${token.token_symbol} (zombie)`);
          console.log(`💀 DEAD (zombie): ${token.token_symbol} - ${updates.removal_reason}`);
        }
        // Condition 3: Watched > 60 min with < 5 holders = dead
        else if (watchingMinutes > 60 && metrics.holders < 5) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Low activity after 1h: ${metrics.holders} holders`;
          
          stats.markedDead++;
          stats.deadTokens.push(`${token.token_symbol} (low activity 1h)`);
          console.log(`💀 DEAD (low activity): ${token.token_symbol} - ${updates.removal_reason}`);
        }
        // Condition 4: Original dead check - 15+ min with very low metrics
        else if (watchingMinutes > 15 && metrics.holders < config.dead_holder_threshold && metrics.volume24hSol < config.dead_volume_threshold_sol) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Watched ${watchingMinutes.toFixed(0)}m, only ${metrics.holders} holders, ${metrics.volume24hSol.toFixed(3)} SOL`;
          
          stats.markedDead++;
          stats.deadTokens.push(`${token.token_symbol} (${metrics.holders} holders)`);
          console.log(`💀 DEAD: ${token.token_symbol} - ${updates.removal_reason}`);
        }
        // Condition 5: Stale check - no metric changes for multiple consecutive checks
        else if (updates.consecutive_stale_checks >= 4 && watchingMinutes > 8) {
          updates.status = 'dead';
          updates.rejection_type = 'soft';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Stale: No metric changes for ${updates.consecutive_stale_checks} checks over ${watchingMinutes.toFixed(0)}m`;
          
          stats.markedStale++;
          console.log(`🥀 STALE -> DEAD: ${token.token_symbol} (${updates.consecutive_stale_checks} stale checks)`);
        }

        // Update the token
        const { error: updateError } = await supabase
          .from('pumpfun_watchlist')
          .update(updates)
          .eq('id', token.id);

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
    
    // Delay between batches for rate limiting
    if (i + BATCH_SIZE < tokens.length) {
      console.log(`⏳ Batch complete, waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await delay(BATCH_DELAY_MS);
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 MONITOR COMPLETE: ${stats.tokensChecked} checked, ${stats.promoted} promoted, ${stats.markedDead} dead, ${stats.markedStale} stale, ${stats.devSellRejected} dev-rejected, ${stats.rugcheckRejected} rugcheck-rejected, ${stats.skippedRecent} skipped (${stats.durationMs}ms)`);

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

    console.log(`🎯 pumpfun-watchlist-monitor action: ${action}`);

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

        const { count: devSoldCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('dev_sold', true);

        return jsonResponse({
          success: true,
          status: 'healthy',
          watchingCount: watchingCount || 0,
          staleCount: staleCount || 0,
          devSoldCount: devSoldCount || 0,
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
