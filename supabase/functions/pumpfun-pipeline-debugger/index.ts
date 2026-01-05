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
  
  // Initialize filter breakdown with order
  const filterBreakdown: Record<string, { count: number; order: number; description: string }> = {};
  Object.entries(FILTER_CONFIG).forEach(([key, config]) => {
    filterBreakdown[key] = { count: 0, order: config.order, description: config.description };
  });

  // Get existing watchlist mints for duplicate check
  const { data: watchlist } = await supabase
    .from('pumpfun_watchlist')
    .select('token_mint')
    .in('status', ['watching', 'qualified', 'bought']);

  const existingMints = new Set((watchlist || []).map((w: any) => w.token_mint));

  for (const token of tokens) {
    let rejected_reason = null;
    let rejected_detail = '';

    // Filter 1: Mayhem Mode (check if flagged)
    if (token.isMayhem) {
      rejected_reason = 'mayhem_mode';
      rejected_detail = 'Flagged as mayhem/spam';
    }
    // Filter 2: Null name/ticker
    else if (!token.symbol || !token.name || token.symbol.trim() === '' || token.name.trim() === '') {
      rejected_reason = 'null_name_ticker';
      rejected_detail = `Name: "${token.name || 'null'}", Ticker: "${token.symbol || 'null'}"`;
    }
    // Filter 3: Duplicate
    else if (existingMints.has(token.mint)) {
      rejected_reason = 'duplicate';
      rejected_detail = 'Already in watchlist';
    }
    // Filter 4: Emoji/unicode
    else if (/[^\x00-\x7F]/.test(token.symbol)) {
      rejected_reason = 'emoji_unicode';
      rejected_detail = `Contains non-ASCII: "${token.symbol}"`;
    }
    // Filter 5: Ticker too long (> 12 chars)
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
async function getWatchlistStatus(supabase: any): Promise<any> {
  console.log('[Step 3] Getting watchlist status (LIVE)');

  const { data: watchlist, error } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'watching')
    .order('last_checked_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[Step 3] Watchlist fetch error:', error);
    return { error: error.message };
  }

  const tokens = watchlist || [];
  const staleCount = tokens.filter((t: any) => t.stale_count >= 3).length;
  const deadCount = tokens.filter((t: any) => t.status === 'dead' || (t.holder_count !== null && t.holder_count < 3)).length;
  const healthyCount = tokens.length - staleCount - deadCount;

  // Detailed metrics for each token
  const recentUpdates = tokens.slice(0, 20).map((t: any) => {
    const watchedFor = t.first_seen_at ? Math.floor((Date.now() - new Date(t.first_seen_at).getTime()) / 60000) : 0;
    return {
      mint: t.token_mint,
      symbol: t.token_symbol || t.token_mint?.slice(0, 6),
      name: t.token_name,
      holders: t.holder_count || 0,
      holdersPrev: t.prev_holder_count || t.holder_count || 0,
      volume: t.volume_sol || 0,
      volumePrev: t.prev_volume_sol || t.volume_sol || 0,
      price: t.price_usd || 0,
      bondingPct: t.bonding_curve_pct || 0,
      watchedMins: watchedFor,
      lastUpdate: t.last_checked_at,
      staleCount: t.stale_count || 0,
      creatorWallet: t.creator_wallet,
    };
  });

  // Metrics sources info
  const metricsInfo = {
    holder_count: { sources: ['pump.fun', 'Helius RPC'], purpose: 'Detect growth/distribution' },
    volume_sol: { sources: ['pump.fun', 'DexScreener'], purpose: 'Detect trading activity' },
    price_usd: { sources: ['pump.fun', 'DexScreener', 'Jupiter'], purpose: 'Track valuation changes' },
    bonding_curve_pct: { sources: ['pump.fun'], purpose: 'Track graduation progress' },
  };

  return {
    totalWatching: tokens.length,
    staleCount,
    deadCount,
    healthyCount,
    metricsInfo,
    recentUpdates,
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

  // Get config from DB or use defaults
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

// Signal strength scoring factors
const SIGNAL_SCORING = {
  dev_reputation_high: { points: 20, threshold: 70, description: 'Dev reputation > 70' },
  dev_stable_after_dump: { points: 15, description: 'Dev has "stable_after_dump" pattern' },
  known_good_twitter: { points: 10, description: 'Known good X/Twitter account' },
  survived_5_mins: { points: 10, description: 'Token survived > 5 mins with volume' },
  rugcheck_high: { points: 10, threshold: 70, description: 'RugCheck score > 70' },
  holders_50plus: { points: 10, threshold: 50, description: 'Holders > 50' },
  bonding_50plus: { points: 10, threshold: 50, description: 'Bonding curve > 50%' },
  dex_paid_profile: { points: 5, description: 'Has DEX paid profile' },
};

// Calculate signal strength score
function calculateSignalScore(token: any, devReputation: any): { score: number; factors: any[] } {
  let score = 0;
  const factors: any[] = [];

  // Dev reputation > 70
  if ((devReputation?.reputation_score || 50) >= SIGNAL_SCORING.dev_reputation_high.threshold) {
    score += SIGNAL_SCORING.dev_reputation_high.points;
    factors.push({ factor: 'dev_reputation_high', points: SIGNAL_SCORING.dev_reputation_high.points, value: devReputation?.reputation_score });
  }

  // Dev has stable_after_dump pattern
  if ((devReputation?.tokens_stable_after_dump || 0) > 0) {
    score += SIGNAL_SCORING.dev_stable_after_dump.points;
    factors.push({ factor: 'dev_stable_after_dump', points: SIGNAL_SCORING.dev_stable_after_dump.points, value: devReputation?.tokens_stable_after_dump });
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

  // DEX paid profile
  if (token.metadata?.dex_paid || token.dex_paid) {
    score += SIGNAL_SCORING.dex_paid_profile.points;
    factors.push({ factor: 'dex_paid_profile', points: SIGNAL_SCORING.dex_paid_profile.points, value: true });
  }

  return { score, factors };
}

// Map score to signal strength tier
function scoreToSignalStrength(score: number): string {
  if (score >= 71) return 'very_strong';
  if (score >= 51) return 'strong';
  if (score >= 31) return 'moderate';
  return 'weak';
}

// Step 5: Dev Wallet Check with enhanced behavior analysis
async function runDevChecks(supabase: any): Promise<any> {
  console.log('[Step 5] Running dev wallet checks (LIVE)');

  const { data: qualified } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'qualified')
    .limit(20);

  const passed: any[] = [];
  const failed: any[] = [];

  // Check dev reputation from our new table
  for (const token of (qualified || [])) {
    let devReputation = null;
    if (token.creator_wallet) {
      const { data: rep } = await supabase
        .from('dev_wallet_reputation')
        .select('*')
        .eq('wallet_address', token.creator_wallet)
        .single();
      devReputation = rep;
    }

    // Calculate signal score
    const { score: signalScore, factors: scoreFactors } = calculateSignalScore(token, devReputation);
    const signalStrength = scoreToSignalStrength(signalScore);

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
      avgDumpThenPumpPct: devReputation?.avg_dump_then_pump_pct || null,
      signalScore,
      signalStrength,
      scoreFactors,
    };

    // Check for known bad actors
    if (devReputation?.trust_level === 'blacklisted') {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `Blacklisted dev: ${devReputation?.tokens_rugged || 0} rugs`,
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
    } else if (token.dev_sold && !devReputation?.tokens_stable_after_dump) {
      // Dev sold BUT doesn't have stable_after_dump pattern = bad
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
      // PASSED - include signal scoring
      passed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        devInfo,
        // Special flag: dev sold but has stable_after_dump pattern = HIGH SIGNAL
        devDumpedButStable: token.dev_sold && (devReputation?.tokens_stable_after_dump || 0) > 0,
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
    signalScoring: SIGNAL_SCORING,
    passed,
    failed,
  };
}

// Step 6: Get Buy Queue with tiered amounts based on signal scoring
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

  // Get today's buy count
  const today = new Date().toISOString().split('T')[0];
  const { count: dailyBuys } = await supabase
    .from('pumpfun_watchlist')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'bought')
    .gte('bought_at', today);

  // Process each token with signal scoring
  const queue = await Promise.all((readyToBuy || []).map(async (t: any) => {
    // Get dev reputation for scoring
    let devReputation = null;
    if (t.creator_wallet) {
      const { data: rep } = await supabase
        .from('dev_wallet_reputation')
        .select('*')
        .eq('wallet_address', t.creator_wallet)
        .single();
      devReputation = rep;
    }

    // Calculate signal score
    const { score: signalScore, factors: scoreFactors } = calculateSignalScore(t, devReputation);
    const signalStrength = scoreToSignalStrength(signalScore);
    const buyTier = BUY_TIERS[signalStrength as keyof typeof BUY_TIERS] || BUY_TIERS.moderate;
    
    return {
      mint: t.token_mint,
      symbol: t.token_symbol,
      name: t.token_name,
      priceUsd: t.price_usd || 0,
      onCurve: (t.bonding_curve_pct || 0) < 100,
      signalScore,
      signalStrength,
      scoreFactors,
      buyAmountUsd: buyTier.amount_usd,
      tierDescription: buyTier.description,
      devReputation: devReputation?.reputation_score || 50,
      devTrustLevel: devReputation?.trust_level || 'unknown',
      devDumpedButStable: t.dev_sold && (devReputation?.tokens_stable_after_dump || 0) > 0,
      executed: false,
    };
  }));

  // Sort by signal score descending
  queue.sort((a, b) => b.signalScore - a.signalScore);

  return {
    fantasyMode: config.fantasy_mode_enabled ?? true,
    queueCount: queue.length,
    dailyBuys: dailyBuys || 0,
    dailyCap: config.daily_buy_cap || 20,
    buyTiers: BUY_TIERS,
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

  // Get token info
  const { data: token } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('token_mint', tokenMint)
    .single();

  if (!token) {
    return { error: 'Token not found' };
  }

  // Insert lifecycle record
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
