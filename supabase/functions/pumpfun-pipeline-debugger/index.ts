import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Filter configuration with explanations
const FILTER_CONFIG = {
  mayhem_mode: {
    order: 1,
    name: 'Mayhem Mode',
    description: 'Token flagged as mayhem/spam by pump.fun detection',
  },
  null_name_ticker: {
    order: 2,
    name: 'Null Name/Ticker',
    description: 'Token has empty or missing name/ticker - obvious garbage',
  },
  duplicate: {
    order: 3,
    name: 'Duplicate Ticker',
    description: 'Token already exists in our watchlist system',
  },
  emoji_unicode: {
    order: 4,
    name: 'Emoji/Unicode',
    description: 'Ticker contains non-ASCII characters - common scam signal',
  },
  ticker_too_long: {
    order: 5,
    name: 'Ticker > 12 chars',
    description: 'Ticker exceeds 12 characters - unusual for legitimate tokens',
    threshold: 12,
  },
};

// Qualification thresholds
const QUALIFICATION_CONFIG = {
  min_holders: { value: 20, description: 'Minimum holder count for qualification' },
  min_volume_sol: { value: 0.5, description: 'Minimum volume in SOL' },
  min_watch_time_sec: { value: 120, description: 'Minimum seconds on watchlist before qualifying' },
  min_rugcheck_score: { value: 50, description: 'Minimum RugCheck safety score' },
};

// Tiered buy amounts based on signal strength
const BUY_TIERS = {
  weak: { amount_usd: 2, description: 'Passed filters but poor metrics' },
  moderate: { amount_usd: 10, description: 'Good metrics, unknown dev' },
  strong: { amount_usd: 20, description: 'Strong metrics, neutral dev' },
  very_strong: { amount_usd: 50, description: 'Known good dev, great metrics' },
};

// Buy guardrails configuration
const BUY_GUARDRAILS = {
  min_price_usd: 0.000008,
  max_price_usd: 0.0000125,
  max_spike_ratio: 5, // Don't buy if already 5x from mint
  min_time_after_spike_mins: 5, // Wait 5 mins after spike
  max_crash_from_peak_pct: 60, // Don't buy if crashed >60% from peak
  max_insider_pct: 20, // Max 20% held by linked wallets
};

// Enhanced signal scoring with dev patterns
const SIGNAL_SCORING = {
  // Positive patterns
  pattern_diamond_dev: { points: 25, description: 'Dev held through bonding (past tokens)' },
  pattern_buyback_dev: { points: 20, description: 'Dev recycles creator rewards as buybacks' },
  dev_reputation_high: { points: 20, threshold: 70, description: 'Dev reputation > 70' },
  dev_stable_after_dump: { points: 15, description: 'Dev has "stable_after_dump" pattern' },
  price_in_ideal_range: { points: 15, description: 'Price in $0.000008 - $0.0000125 range' },
  survived_spike: { points: 10, description: 'Token spiked but stabilized' },
  low_insider_pct: { points: 10, threshold: 10, description: 'Insider % < 10%' },
  known_good_twitter: { points: 10, description: 'Known good X/Twitter account' },
  survived_5_mins: { points: 10, description: 'Token survived > 5 mins with volume' },
  rugcheck_high: { points: 10, threshold: 70, description: 'RugCheck score > 70' },
  holders_50plus: { points: 10, threshold: 50, description: 'Holders > 50' },
  bonding_50plus: { points: 10, threshold: 50, description: 'Bonding curve > 50%' },
  pattern_hidden_whale_good: { points: 10, description: 'Hidden whale but dev is trusted' },
  dex_paid_profile: { points: 5, description: 'Has DEX paid profile' },
  
  // Negative patterns (penalties)
  pattern_wash_bundler: { points: -10, description: 'Wash trading / bundling detected' },
  pattern_wallet_washer: { points: -15, description: 'Dev sells to own wallets' },
  pattern_hidden_whale_unknown: { points: -15, description: 'Hidden whale, unknown dev' },
  high_insider_pct: { points: -15, threshold: 20, description: 'Insider % > 20%' },
  price_already_spiked: { points: -20, description: 'Already >5x from mint' },
  crashed_from_peak: { points: -25, description: 'Down >60% from peak' },
  pattern_spike_kill: { points: -30, description: 'Spike & kill pattern (BLACKLIST)', blacklist: true },
};

// Step 1: Token Discovery - Fetch newest tokens with full data
async function runDiscovery(supabase: any): Promise<any> {
  console.log('[Step 1] Running token discovery (LIVE)');
  const startTime = Date.now();

  try {
    const { data: tokens, error } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_symbol, token_name, market_cap_sol, created_at, created_at_blockchain, status, creator_wallet, holder_count, volume_sol')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const formattedTokens = (tokens || []).map((t: any) => ({
      mint: t.token_mint,
      symbol: t.token_symbol || '',
      name: t.token_name || '',
      marketCapSol: t.market_cap_sol || 0,
      status: t.status,
      createdAt: t.created_at,
      createdAtBlockchain: t.created_at_blockchain,
      creatorWallet: t.creator_wallet,
      holderCount: t.holder_count,
      volumeSol: t.volume_sol,
    }));

    return {
      source: 'pumpfun_watchlist (WebSocket)',
      fetchedCount: formattedTokens.length,
      fetchTimeMs: Date.now() - startTime,
      tokens: formattedTokens,
    };
  } catch (err: any) {
    console.error('[Step 1] Discovery error:', err);
    return {
      source: 'pumpfun_watchlist',
      fetchedCount: 0,
      fetchTimeMs: Date.now() - startTime,
      tokens: [],
      error: err?.message ?? String(err),
    };
  }
}

// Step 2: Intake Filtering - Apply filters in priority order
async function runIntake(supabase: any): Promise<any> {
  console.log('[Step 2] Running intake filtering (LIVE)');

  const discovery = await runDiscovery(supabase);
  const tokens = discovery.tokens || [];

  const passed: any[] = [];
  const rejected: any[] = [];
  
  const filterBreakdown: Record<string, { count: number; order: number; description: string }> = {};
  Object.entries(FILTER_CONFIG).forEach(([key, config]) => {
    filterBreakdown[key] = { count: 0, order: config.order, description: config.description };
  });

  const { data: watchlist } = await supabase
    .from('pumpfun_watchlist')
    .select('token_mint')
    .in('status', ['watching', 'qualified', 'bought']);

  const existingMints = new Set((watchlist || []).map((w: any) => w.token_mint));

  for (const token of tokens) {
    let rejected_reason = null;
    let rejected_detail = '';

    if (token.isMayhem) {
      rejected_reason = 'mayhem_mode';
      rejected_detail = 'Flagged as mayhem/spam';
    }
    else if (!token.symbol || !token.name || token.symbol.trim() === '' || token.name.trim() === '') {
      rejected_reason = 'null_name_ticker';
      rejected_detail = `Name: "${token.name || 'null'}", Ticker: "${token.symbol || 'null'}"`;
    }
    else if (existingMints.has(token.mint)) {
      rejected_reason = 'duplicate';
      rejected_detail = 'Already in watchlist';
    }
    else if (/[^\x00-\x7F]/.test(token.symbol)) {
      rejected_reason = 'emoji_unicode';
      rejected_detail = `Contains non-ASCII: "${token.symbol}"`;
    }
    else if (token.symbol.length > FILTER_CONFIG.ticker_too_long.threshold) {
      rejected_reason = 'ticker_too_long';
      rejected_detail = `Length: ${token.symbol.length} chars (max: ${FILTER_CONFIG.ticker_too_long.threshold})`;
    }

    if (rejected_reason) {
      filterBreakdown[rejected_reason].count++;
      rejected.push({ ...token, reason: rejected_reason, detail: rejected_detail });
    } else {
      passed.push(token);
    }
  }

  return {
    inputCount: tokens.length,
    passedCount: passed.length,
    rejectedCount: rejected.length,
    filterConfig: FILTER_CONFIG,
    filterBreakdown,
    passed,
    rejected,
  };
}

// Step 3: Watchlist Monitoring - Get current status with metric details
// FIXED: Now includes pending_triage tokens and shows proper analysis
async function getWatchlistStatus(supabase: any): Promise<any> {
  console.log('[Step 3] Getting watchlist status (LIVE)');

  // Get both watching AND pending_triage tokens
  const { data: watchlist, error } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['watching', 'pending_triage'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[Step 3] Watchlist fetch error:', error);
    return { error: error.message };
  }

  const tokens = watchlist || [];
  
  // Count by status
  const pendingTriageCount = tokens.filter((t: any) => t.status === 'pending_triage').length;
  const watchingCount = tokens.filter((t: any) => t.status === 'watching').length;
  const staleCount = tokens.filter((t: any) => t.stale_count >= 3).length;
  const deadCount = tokens.filter((t: any) => t.holder_count !== null && t.holder_count < 3).length;
  const healthyCount = watchingCount - staleCount - deadCount;

  const recentUpdates = tokens.slice(0, 30).map((t: any) => {
    const createdAt = t.created_at_blockchain || t.created_at;
    const watchedFor = createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000) : 0;
    
    // Calculate deltas for watching tokens
    const holderDelta = (t.holder_count || 0) - (t.holder_count_prev || t.holder_count || 0);
    const volumeDelta = (t.volume_sol || 0) - (t.volume_sol_prev || t.volume_sol || 0);
    
    return {
      mint: t.token_mint,
      symbol: t.token_symbol || t.token_mint?.slice(0, 6),
      name: t.token_name,
      status: t.status,
      holders: t.holder_count || 0,
      holdersPrev: t.holder_count_prev || t.holder_count || 0,
      holderDelta,
      volume: t.volume_sol || 0,
      volumePrev: t.volume_sol_prev || t.volume_sol || 0,
      volumeDelta,
      price: t.price_usd || 0,
      pricePeak: t.price_peak || t.price_usd || 0,
      bondingPct: t.bonding_curve_pct || 0,
      watchedMins: watchedFor,
      lastUpdate: t.last_checked_at,
      staleCount: t.stale_count || 0,
      creatorWallet: t.creator_wallet,
      insiderPct: t.insider_pct || 0,
      wasSpikedAndKilled: t.was_spiked_and_killed || false,
      // Metrics trend analysis
      trend: holderDelta > 0 ? 'growing' : holderDelta < 0 ? 'declining' : 'stable',
      isHealthy: (t.holder_count || 0) >= 5 && (t.volume_sol || 0) > 0.01,
    };
  });

  const metricsInfo = {
    holder_count: { sources: ['pump.fun', 'Helius RPC'], purpose: 'Detect growth/distribution' },
    volume_sol: { sources: ['pump.fun', 'DexScreener'], purpose: 'Detect trading activity' },
    price_usd: { sources: ['pump.fun', 'DexScreener', 'Jupiter'], purpose: 'Track valuation changes' },
    bonding_curve_pct: { sources: ['pump.fun'], purpose: 'Track graduation progress' },
    insider_pct: { sources: ['Early trade analysis'], purpose: 'Detect linked wallet holdings' },
  };

  // Summary stats
  const growingTokens = recentUpdates.filter(t => t.trend === 'growing').length;
  const decliningTokens = recentUpdates.filter(t => t.trend === 'declining').length;
  const spikedAndKilledTokens = recentUpdates.filter(t => t.wasSpikedAndKilled).length;

  return {
    totalTokens: tokens.length,
    pendingTriageCount,
    watchingCount,
    staleCount,
    deadCount,
    healthyCount,
    growingTokens,
    decliningTokens,
    spikedAndKilledTokens,
    metricsInfo,
    recentUpdates,
    // Pipeline health check
    pipelineHealth: {
      triageBacklog: pendingTriageCount > 20 ? 'warning' : 'ok',
      watchlistActive: watchingCount > 0 ? 'ok' : 'empty',
      staleRatio: watchingCount > 0 ? ((staleCount / watchingCount) * 100).toFixed(1) + '%' : '0%',
    },
  };
}

// Step 4: Qualification Gate - Check with visible thresholds
async function runQualification(supabase: any): Promise<any> {
  console.log('[Step 4] Running qualification (LIVE)');

  const { data: watching } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'watching');

  const tokens = watching || [];
  const qualified: any[] = [];
  const softRejected: any[] = [];
  const stillWatching: any[] = [];

  const { data: configData } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .single();

  const config = {
    min_holders: configData?.min_holders_to_qualify || QUALIFICATION_CONFIG.min_holders.value,
    min_volume_sol: configData?.min_volume_sol || QUALIFICATION_CONFIG.min_volume_sol.value,
    min_watch_time_sec: configData?.min_watch_time_sec || QUALIFICATION_CONFIG.min_watch_time_sec.value,
    min_rugcheck_score: configData?.min_rugcheck_score || QUALIFICATION_CONFIG.min_rugcheck_score.value,
  };

  for (const token of tokens) {
    const watchedFor = token.first_seen_at ? (Date.now() - new Date(token.first_seen_at).getTime()) / 1000 : 0;

    const checks = {
      holders: { passed: (token.holder_count || 0) >= config.min_holders, value: token.holder_count || 0, threshold: config.min_holders },
      volume: { passed: (token.volume_sol || 0) >= config.min_volume_sol, value: token.volume_sol || 0, threshold: config.min_volume_sol },
      watchTime: { passed: watchedFor >= config.min_watch_time_sec, value: Math.floor(watchedFor), threshold: config.min_watch_time_sec },
      rugcheck: { passed: !token.rugcheck_score || token.rugcheck_score >= config.min_rugcheck_score, value: token.rugcheck_score || 'N/A', threshold: config.min_rugcheck_score },
    };

    const allPassed = checks.holders.passed && checks.volume.passed && checks.watchTime.passed && checks.rugcheck.passed;
    const failedRugcheck = token.rugcheck_score && token.rugcheck_score < config.min_rugcheck_score;

    if (allPassed) {
      qualified.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        holders: token.holder_count,
        volume: token.volume_sol,
        rugScore: token.rugcheck_score,
        checks,
        signalStrength: token.signal_strength || 'moderate',
      });
    } else if (failedRugcheck) {
      softRejected.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `Low RugCheck score: ${token.rugcheck_score} (min: ${config.min_rugcheck_score})`,
        checks,
      });
    } else {
      stillWatching.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        checks,
      });
    }
  }

  return {
    checkedCount: tokens.length,
    qualifiedCount: qualified.length,
    softRejectedCount: softRejected.length,
    stillWatchingCount: stillWatching.length,
    thresholds: config,
    qualificationConfig: QUALIFICATION_CONFIG,
    qualified,
    softRejected,
  };
}

// Calculate signal strength score with patterns and guardrails
function calculateSignalScore(token: any, devReputation: any): { score: number; factors: any[]; penalties: any[] } {
  let score = 0;
  const factors: any[] = [];
  const penalties: any[] = [];

  // Dev reputation > 70
  if ((devReputation?.reputation_score || 50) >= SIGNAL_SCORING.dev_reputation_high.threshold) {
    score += SIGNAL_SCORING.dev_reputation_high.points;
    factors.push({ factor: 'dev_reputation_high', points: SIGNAL_SCORING.dev_reputation_high.points, value: devReputation?.reputation_score });
  }

  // Pattern: Diamond Dev
  if ((devReputation?.pattern_diamond_dev || 0) > 0) {
    score += SIGNAL_SCORING.pattern_diamond_dev.points;
    factors.push({ factor: 'pattern_diamond_dev', points: SIGNAL_SCORING.pattern_diamond_dev.points, value: devReputation?.pattern_diamond_dev });
  }

  // Pattern: Buyback Dev
  if ((devReputation?.pattern_buyback_dev || 0) > 0) {
    score += SIGNAL_SCORING.pattern_buyback_dev.points;
    factors.push({ factor: 'pattern_buyback_dev', points: SIGNAL_SCORING.pattern_buyback_dev.points, value: devReputation?.pattern_buyback_dev });
  }

  // Dev has stable_after_dump pattern
  if ((devReputation?.tokens_stable_after_dump || 0) > 0) {
    score += SIGNAL_SCORING.dev_stable_after_dump.points;
    factors.push({ factor: 'dev_stable_after_dump', points: SIGNAL_SCORING.dev_stable_after_dump.points, value: devReputation?.tokens_stable_after_dump });
  }

  // Price in ideal range
  const priceUsd = token.price_usd || 0;
  if (priceUsd >= BUY_GUARDRAILS.min_price_usd && priceUsd <= BUY_GUARDRAILS.max_price_usd) {
    score += SIGNAL_SCORING.price_in_ideal_range.points;
    factors.push({ factor: 'price_in_ideal_range', points: SIGNAL_SCORING.price_in_ideal_range.points, value: `$${priceUsd.toFixed(10)}` });
  }

  // Low insider %
  const insiderPct = token.insider_pct || 0;
  if (insiderPct < SIGNAL_SCORING.low_insider_pct.threshold) {
    score += SIGNAL_SCORING.low_insider_pct.points;
    factors.push({ factor: 'low_insider_pct', points: SIGNAL_SCORING.low_insider_pct.points, value: `${insiderPct.toFixed(1)}%` });
  }

  // Known good Twitter account
  if (devReputation?.twitter_accounts?.length > 0 && devReputation?.trust_level === 'trusted') {
    score += SIGNAL_SCORING.known_good_twitter.points;
    factors.push({ factor: 'known_good_twitter', points: SIGNAL_SCORING.known_good_twitter.points, value: devReputation?.twitter_accounts?.[0] });
  }

  // Token survived > 5 mins with volume
  const watchedMins = token.first_seen_at ? (Date.now() - new Date(token.first_seen_at).getTime()) / 60000 : 0;
  if (watchedMins >= 5 && (token.volume_sol || 0) > 0.1) {
    score += SIGNAL_SCORING.survived_5_mins.points;
    factors.push({ factor: 'survived_5_mins', points: SIGNAL_SCORING.survived_5_mins.points, value: `${watchedMins.toFixed(1)} mins` });
  }

  // Survived spike
  if (token.spike_detected_at && !token.was_spiked_and_killed) {
    score += SIGNAL_SCORING.survived_spike.points;
    factors.push({ factor: 'survived_spike', points: SIGNAL_SCORING.survived_spike.points, value: 'Token stabilized after spike' });
  }

  // RugCheck score > 70
  if ((token.rugcheck_score || 0) >= SIGNAL_SCORING.rugcheck_high.threshold) {
    score += SIGNAL_SCORING.rugcheck_high.points;
    factors.push({ factor: 'rugcheck_high', points: SIGNAL_SCORING.rugcheck_high.points, value: token.rugcheck_score });
  }

  // Holders > 50
  if ((token.holder_count || 0) >= SIGNAL_SCORING.holders_50plus.threshold) {
    score += SIGNAL_SCORING.holders_50plus.points;
    factors.push({ factor: 'holders_50plus', points: SIGNAL_SCORING.holders_50plus.points, value: token.holder_count });
  }

  // Bonding curve > 50%
  if ((token.bonding_curve_pct || 0) >= SIGNAL_SCORING.bonding_50plus.threshold) {
    score += SIGNAL_SCORING.bonding_50plus.points;
    factors.push({ factor: 'bonding_50plus', points: SIGNAL_SCORING.bonding_50plus.points, value: `${token.bonding_curve_pct}%` });
  }

  // Pattern: Hidden Whale (good if trusted dev)
  if ((devReputation?.pattern_hidden_whale || 0) > 0) {
    if (devReputation?.trust_level === 'trusted') {
      score += SIGNAL_SCORING.pattern_hidden_whale_good.points;
      factors.push({ factor: 'pattern_hidden_whale_good', points: SIGNAL_SCORING.pattern_hidden_whale_good.points, value: 'Trusted dev with secondary wallets' });
    } else {
      score += SIGNAL_SCORING.pattern_hidden_whale_unknown.points;
      penalties.push({ factor: 'pattern_hidden_whale_unknown', points: SIGNAL_SCORING.pattern_hidden_whale_unknown.points, value: 'Unknown dev with secondary wallets' });
    }
  }

  // DEX paid profile
  if (token.metadata?.dex_paid || token.dex_paid) {
    score += SIGNAL_SCORING.dex_paid_profile.points;
    factors.push({ factor: 'dex_paid_profile', points: SIGNAL_SCORING.dex_paid_profile.points, value: true });
  }

  // PENALTIES

  // Pattern: Wash Bundler
  if ((devReputation?.pattern_wash_bundler || 0) > 0) {
    score += SIGNAL_SCORING.pattern_wash_bundler.points;
    penalties.push({ factor: 'pattern_wash_bundler', points: SIGNAL_SCORING.pattern_wash_bundler.points, value: devReputation?.pattern_wash_bundler });
  }

  // Pattern: Wallet Washer
  if ((devReputation?.pattern_wallet_washer || 0) > 0) {
    score += SIGNAL_SCORING.pattern_wallet_washer.points;
    penalties.push({ factor: 'pattern_wallet_washer', points: SIGNAL_SCORING.pattern_wallet_washer.points, value: devReputation?.pattern_wallet_washer });
  }

  // High insider %
  if (insiderPct >= SIGNAL_SCORING.high_insider_pct.threshold) {
    score += SIGNAL_SCORING.high_insider_pct.points;
    penalties.push({ factor: 'high_insider_pct', points: SIGNAL_SCORING.high_insider_pct.points, value: `${insiderPct.toFixed(1)}%` });
  }

  // Price already spiked (>5x from mint)
  const priceAtMint = token.price_at_mint || 0;
  if (priceAtMint > 0 && priceUsd / priceAtMint >= BUY_GUARDRAILS.max_spike_ratio) {
    score += SIGNAL_SCORING.price_already_spiked.points;
    penalties.push({ factor: 'price_already_spiked', points: SIGNAL_SCORING.price_already_spiked.points, value: `${(priceUsd / priceAtMint).toFixed(1)}x from mint` });
  }

  // Crashed from peak
  const pricePeak = token.price_peak || priceUsd;
  if (pricePeak > 0 && priceUsd / pricePeak < (1 - BUY_GUARDRAILS.max_crash_from_peak_pct / 100)) {
    score += SIGNAL_SCORING.crashed_from_peak.points;
    penalties.push({ factor: 'crashed_from_peak', points: SIGNAL_SCORING.crashed_from_peak.points, value: `Down ${((1 - priceUsd / pricePeak) * 100).toFixed(0)}% from peak` });
  }

  // Pattern: Spike & Kill (BLACKLIST)
  if ((devReputation?.pattern_spike_kill || 0) > 0 || token.was_spiked_and_killed) {
    score += SIGNAL_SCORING.pattern_spike_kill.points;
    penalties.push({ factor: 'pattern_spike_kill', points: SIGNAL_SCORING.pattern_spike_kill.points, value: 'BLACKLISTED', blacklist: true });
  }

  return { score: Math.max(0, score), factors, penalties };
}

// Map score to signal strength tier
function scoreToSignalStrength(score: number): string {
  if (score >= 71) return 'very_strong';
  if (score >= 51) return 'strong';
  if (score >= 31) return 'moderate';
  return 'weak';
}

// Apply buy guardrails
function applyBuyGuardrails(token: any, devReputation: any): { passed: boolean; guards: any; failedGuards: string[] } {
  const priceUsd = token.price_usd || 0;
  const priceAtMint = token.price_at_mint || 0;
  const pricePeak = token.price_peak || priceUsd;
  const insiderPct = token.insider_pct || 0;

  const guards = {
    priceInRange: priceUsd >= BUY_GUARDRAILS.min_price_usd && priceUsd <= BUY_GUARDRAILS.max_price_usd,
    notSpikeThenKill: !token.was_spiked_and_killed,
    insiderPctOk: insiderPct < BUY_GUARDRAILS.max_insider_pct,
    notCrashedFromPeak: pricePeak <= 0 || (priceUsd / pricePeak) > (1 - BUY_GUARDRAILS.max_crash_from_peak_pct / 100),
    devNotBlacklisted: devReputation?.trust_level !== 'blacklisted' && (devReputation?.pattern_spike_kill || 0) === 0,
    notAlreadySpiked: priceAtMint <= 0 || (priceUsd / priceAtMint) < BUY_GUARDRAILS.max_spike_ratio,
    stableAfterSpike: !token.spike_detected_at || 
      (Date.now() - new Date(token.spike_detected_at).getTime() > BUY_GUARDRAILS.min_time_after_spike_mins * 60000),
  };

  const failedGuards = Object.entries(guards)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  return { passed: failedGuards.length === 0, guards, failedGuards };
}

// Step 5: Dev Wallet Check with enhanced behavior analysis
// PHASE 6: Added caching to avoid refetching static dev reputation data
async function runDevChecks(supabase: any): Promise<any> {
  console.log('[Step 5] Running dev wallet checks (LIVE)');

  const { data: qualified } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'qualified')
    .limit(20);

  const passed: any[] = [];
  const failed: any[] = [];
  const now = new Date();
  const DEV_CHECK_CACHE_MINS = 5; // Only re-check dev every 5 mins

  for (const token of (qualified || [])) {
    let devReputation = null;
    let fromCache = false;
    
    if (token.creator_wallet) {
      // Check if we need to re-fetch dev reputation (caching logic)
      const lastDevCheck = token.last_dev_check_at ? new Date(token.last_dev_check_at) : null;
      const needsRefresh = !lastDevCheck || 
        (now.getTime() - lastDevCheck.getTime() > DEV_CHECK_CACHE_MINS * 60 * 1000);
      
      if (needsRefresh) {
        const { data: rep } = await supabase
          .from('dev_wallet_reputation')
          .select('*')
          .eq('wallet_address', token.creator_wallet)
          .single();
        devReputation = rep;
        
        // Update last_dev_check_at on the token
        await supabase
          .from('pumpfun_watchlist')
          .update({ last_dev_check_at: now.toISOString() })
          .eq('id', token.id);
      } else {
        // Use cached data from token record if available
        const { data: rep } = await supabase
          .from('dev_wallet_reputation')
          .select('*')
          .eq('wallet_address', token.creator_wallet)
          .single();
        devReputation = rep;
        fromCache = true;
      }
    }

    // Calculate signal score with patterns
    const { score: signalScore, factors: scoreFactors, penalties } = calculateSignalScore(token, devReputation);
    const signalStrength = scoreToSignalStrength(signalScore);

    // Apply guardrails
    const guardrailResult = applyBuyGuardrails(token, devReputation);

    // Detect primary pattern
    let detectedPattern = token.detected_dev_pattern || null;
    if (!detectedPattern && devReputation) {
      if (devReputation.pattern_diamond_dev > 0) detectedPattern = 'diamond_dev';
      else if (devReputation.pattern_buyback_dev > 0) detectedPattern = 'buyback_dev';
      else if (devReputation.pattern_hidden_whale > 0) detectedPattern = 'hidden_whale';
      else if (devReputation.pattern_wash_bundler > 0) detectedPattern = 'wash_bundler';
      else if (devReputation.pattern_wallet_washer > 0) detectedPattern = 'wallet_washer';
      else if (devReputation.pattern_spike_kill > 0) detectedPattern = 'spike_kill';
    }

    const devInfo = {
      wallet: token.creator_wallet,
      reputation: devReputation?.reputation_score || 50,
      trustLevel: devReputation?.trust_level || 'unknown',
      tokensLaunched: devReputation?.total_tokens_launched || 0,
      tokensRugged: devReputation?.tokens_rugged || 0,
      tokensSuccessful: devReputation?.tokens_successful || 0,
      tokensStableAfterDump: devReputation?.tokens_stable_after_dump || 0,
      twitterAccounts: devReputation?.twitter_accounts || [],
      telegramGroups: devReputation?.telegram_groups || [],
      linkedWallets: devReputation?.linked_wallets || token.dev_secondary_wallets || [],
      patterns: {
        diamondDev: devReputation?.pattern_diamond_dev || 0,
        buybackDev: devReputation?.pattern_buyback_dev || 0,
        hiddenWhale: devReputation?.pattern_hidden_whale || 0,
        washBundler: devReputation?.pattern_wash_bundler || 0,
        walletWasher: devReputation?.pattern_wallet_washer || 0,
        spikeKill: devReputation?.pattern_spike_kill || 0,
      },
      detectedPattern,
      signalScore,
      signalStrength,
      scoreFactors,
      penalties,
      guardrails: guardrailResult,
    };

    // Check for blacklist/failure conditions
    if (devReputation?.trust_level === 'blacklisted' || (devReputation?.pattern_spike_kill || 0) > 0) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `Blacklisted dev: ${devReputation?.pattern_spike_kill || 0} spike/kills, ${devReputation?.tokens_rugged || 0} rugs`,
        devInfo,
      });
    } else if (devReputation?.trust_level === 'avoid' && devReputation?.tokens_rugged >= 3) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `High-risk dev: ${devReputation?.tokens_rugged} rugs, score ${devReputation?.reputation_score}`,
        devInfo,
      });
    } else if (!guardrailResult.passed) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `Guardrail failed: ${guardrailResult.failedGuards.join(', ')}`,
        devInfo,
      });
    } else if (token.dev_sold && !devReputation?.tokens_stable_after_dump) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: 'Dev sold tokens (no stable history)',
        devInfo,
      });
    } else if (token.dev_launched_new) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: 'Dev launched new token',
        devInfo,
      });
    } else {
      passed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        devInfo,
        devDumpedButStable: token.dev_sold && (devReputation?.tokens_stable_after_dump || 0) > 0,
        insiderPct: token.insider_pct || 0,
        priceUsd: token.price_usd,
      });
    }
  }

  return {
    checkedCount: (qualified || []).length,
    passedCount: passed.length,
    devSoldCount: failed.filter(f => f.reason.includes('sold')).length,
    newLaunchCount: failed.filter(f => f.reason.includes('new token')).length,
    blacklistedCount: failed.filter(f => f.reason.includes('Blacklisted')).length,
    highRiskCount: failed.filter(f => f.reason.includes('High-risk')).length,
    guardrailFailedCount: failed.filter(f => f.reason.includes('Guardrail')).length,
    signalScoring: SIGNAL_SCORING,
    buyGuardrails: BUY_GUARDRAILS,
    passed,
    failed,
  };
}

// Step 6: Get Buy Queue with tiered amounts and guardrails
async function getBuyQueue(supabase: any): Promise<any> {
  console.log('[Step 6] Getting buy queue (LIVE)');

  const { data: configData } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .single();

  const config = configData || {};

  const { data: readyToBuy } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'qualified')
    .eq('dev_check_passed', true)
    .limit(20);

  const today = new Date().toISOString().split('T')[0];
  const { count: dailyBuys } = await supabase
    .from('pumpfun_watchlist')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'bought')
    .gte('bought_at', today);

  const queue = await Promise.all((readyToBuy || []).map(async (t: any) => {
    let devReputation = null;
    if (t.creator_wallet) {
      const { data: rep } = await supabase
        .from('dev_wallet_reputation')
        .select('*')
        .eq('wallet_address', t.creator_wallet)
        .single();
      devReputation = rep;
    }

    const { score: signalScore, factors: scoreFactors, penalties } = calculateSignalScore(t, devReputation);
    const signalStrength = scoreToSignalStrength(signalScore);
    const buyTier = BUY_TIERS[signalStrength as keyof typeof BUY_TIERS] || BUY_TIERS.moderate;
    const guardrailResult = applyBuyGuardrails(t, devReputation);

    // Detect primary pattern
    let detectedPattern = t.detected_dev_pattern || null;
    if (!detectedPattern && devReputation) {
      if (devReputation.pattern_diamond_dev > 0) detectedPattern = 'diamond_dev';
      else if (devReputation.pattern_buyback_dev > 0) detectedPattern = 'buyback_dev';
      else if (devReputation.tokens_stable_after_dump > 0) detectedPattern = 'stable_after_dump';
    }

    return {
      mint: t.token_mint,
      symbol: t.token_symbol,
      name: t.token_name,
      priceUsd: t.price_usd || 0,
      onCurve: (t.bonding_curve_pct || 0) < 100,
      signalScore,
      signalStrength,
      scoreFactors,
      penalties,
      buyAmountUsd: buyTier.amount_usd,
      tierDescription: buyTier.description,
      devReputation: devReputation?.reputation_score || 50,
      devTrustLevel: devReputation?.trust_level || 'unknown',
      devDumpedButStable: t.dev_sold && (devReputation?.tokens_stable_after_dump || 0) > 0,
      detectedPattern,
      insiderPct: t.insider_pct || 0,
      guardrails: guardrailResult,
      recommendedAction: guardrailResult.passed ? `BUY $${buyTier.amount_usd}` : 'SKIP',
      executed: false,
    };
  }));

  // Sort by signal score descending, guardrail-passed first
  queue.sort((a, b) => {
    if (a.guardrails.passed && !b.guardrails.passed) return -1;
    if (!a.guardrails.passed && b.guardrails.passed) return 1;
    return b.signalScore - a.signalScore;
  });

  return {
    fantasyMode: config.fantasy_mode_enabled ?? true,
    queueCount: queue.length,
    passedGuardrails: queue.filter(q => q.guardrails.passed).length,
    failedGuardrails: queue.filter(q => !q.guardrails.passed).length,
    dailyBuys: dailyBuys || 0,
    dailyCap: config.daily_buy_cap || 20,
    buyTiers: BUY_TIERS,
    buyGuardrails: BUY_GUARDRAILS,
    signalScoring: SIGNAL_SCORING,
    queue,
  };
}

// Step 7: Get Positions
async function getPositions(supabase: any): Promise<any> {
  console.log('[Step 7] Getting positions (LIVE)');

  const { data: positions } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  const positionList = (positions || []).map((p: any) => ({
    mint: p.token_mint,
    symbol: p.token_symbol,
    entryPrice: p.entry_price_usd,
    currentPrice: p.current_price_usd,
    multiplier: p.entry_price_usd > 0 ? p.current_price_usd / p.entry_price_usd : 1,
    pnlPct: p.entry_price_usd > 0 ? ((p.current_price_usd - p.entry_price_usd) / p.entry_price_usd * 100) : 0,
    investedSol: p.invested_sol,
    signalStrength: p.signal_strength,
  }));

  const totalInvested = (positions || []).reduce((sum: number, p: any) => sum + (p.invested_sol || 0), 0);
  const unrealizedPnl = (positions || []).reduce((sum: number, p: any) => sum + (p.unrealized_pnl_sol || 0), 0);

  const { data: moonbags } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('*')
    .eq('is_moonbag', true)
    .order('sold_at', { ascending: false })
    .limit(10);

  const moonbagList = (moonbags || []).map((m: any) => ({
    mint: m.token_mint,
    symbol: m.token_symbol,
    soldPrice: m.sold_price_usd,
    currentPrice: m.current_price_usd,
    changeSinceSell: m.sold_price_usd > 0 ? ((m.current_price_usd - m.sold_price_usd) / m.sold_price_usd * 100) : 0,
  }));

  return {
    positionCount: positionList.length,
    totalInvested,
    unrealizedPnl,
    positions: positionList,
    moonbags: moonbagList,
  };
}

// Track token lifecycle for post-rejection analysis
async function trackLifecycle(supabase: any, tokenMint: string, decision: string, reason: string): Promise<any> {
  console.log('[Lifecycle] Tracking token:', tokenMint, 'Decision:', decision);

  const { data: token } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('token_mint', tokenMint)
    .single();

  if (!token) {
    return { error: 'Token not found' };
  }

  const { data, error } = await supabase
    .from('token_lifecycle_tracking')
    .insert({
      token_mint: tokenMint,
      our_decision: decision,
      decision_reason: reason,
      price_at_decision: token.price_usd,
      dev_wallet: token.creator_wallet,
    })
    .select()
    .single();

  if (error) {
    console.error('[Lifecycle] Insert error:', error);
    return { error: error.message };
  }

  return { success: true, record: data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const { action, tokenMint, decision, reason } = await req.json();
    console.log('[Pipeline Debugger] Action:', action);

    let result;
    switch (action) {
      case 'run_discovery':
        result = await runDiscovery(supabase);
        break;
      case 'run_intake':
        result = await runIntake(supabase);
        break;
      case 'get_watchlist_status':
        result = await getWatchlistStatus(supabase);
        break;
      case 'run_qualification':
        result = await runQualification(supabase);
        break;
      case 'run_dev_checks':
        result = await runDevChecks(supabase);
        break;
      case 'get_buy_queue':
        result = await getBuyQueue(supabase);
        break;
      case 'get_positions':
        result = await getPositions(supabase);
        break;
      case 'track_lifecycle':
        result = await trackLifecycle(supabase, tokenMint, decision, reason);
        break;
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    return jsonResponse(result);
  } catch (err: any) {
    console.error('[Pipeline Debugger] Error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
});
