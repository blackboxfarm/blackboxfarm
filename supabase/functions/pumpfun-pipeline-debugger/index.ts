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

interface ApiCall {
  name: string;
  url: string;
  method: string;
  status: number;
  durationMs: number;
  requestBody?: any;
  responseData?: any;
}

interface LogicCheck {
  name: string;
  description: string;
  threshold?: string;
  actualValue?: any;
  passed: boolean;
  reason?: string;
}

interface StageResult {
  stage: number;
  stageName: string;
  status: 'passed' | 'failed' | 'soft_rejected';
  durationMs: number;
  apiCalls: ApiCall[];
  logicChecks: LogicCheck[];
  decision: string;
  nextStage?: number;
  rawData?: any;
}

const SOLANA_TRACKER_API = "https://data.solanatracker.io";
const PUMP_API = "https://frontend-api.pump.fun";
const RUGCHECK_API = "https://api.rugcheck.xyz/v1";

async function timedFetch(name: string, url: string, options: RequestInit = {}): Promise<{ call: ApiCall; data: any }> {
  const start = Date.now();
  try {
    const response = await fetch(url, options);
    const durationMs = Date.now() - start;
    let data = null;
    
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      call: {
        name,
        url,
        method: options.method || 'GET',
        status: response.status,
        durationMs,
        responseData: data
      },
      data
    };
  } catch (err: any) {
    return {
      call: {
        name,
        url,
        method: options.method || 'GET',
        status: 0,
        durationMs: Date.now() - start,
        responseData: { error: err.message }
      },
      data: null
    };
  }
}

// Stage 0: Token Discovery
async function runStage0(tokenMint: string): Promise<StageResult> {
  const start = Date.now();
  const apiCalls: ApiCall[] = [];
  const logicChecks: LogicCheck[] = [];
  let overallPassed = true;

  // 1. Fetch token from Solana Tracker
  const { call: stCall, data: stData } = await timedFetch(
    'Solana Tracker Token Info',
    `${SOLANA_TRACKER_API}/tokens/${tokenMint}`
  );
  apiCalls.push(stCall);

  if (!stData || stCall.status !== 200) {
    logicChecks.push({
      name: 'Token Exists',
      description: 'Token found on Solana Tracker',
      passed: false,
      reason: 'Token not found or API error'
    });
    overallPassed = false;
  } else {
    logicChecks.push({
      name: 'Token Exists',
      description: 'Token found on Solana Tracker',
      actualValue: { name: stData.token?.name, symbol: stData.token?.symbol },
      passed: true
    });
  }

  // 2. Check Mayhem Mode via pump.fun
  const { call: pumpCall, data: pumpData } = await timedFetch(
    'pump.fun Token Info',
    `${PUMP_API}/coins/${tokenMint}`
  );
  apiCalls.push(pumpCall);

  const MAYHEM_PROGRAM = 'MAyhSmzXzV1pTf7iLcQ3E8VGLbineBEoU8pPkhPCMTv';
  const MAYHEM_SUPPLY_THRESHOLD = 2000000000000000;

  if (pumpData) {
    const isMayhem = pumpData.program === MAYHEM_PROGRAM || 
                     (pumpData.total_supply && pumpData.total_supply >= MAYHEM_SUPPLY_THRESHOLD);
    
    logicChecks.push({
      name: 'Mayhem Mode Check',
      description: 'Token is NOT in Mayhem Mode (high supply gambling token)',
      threshold: `program !== ${MAYHEM_PROGRAM.slice(0,8)}... AND supply < ${MAYHEM_SUPPLY_THRESHOLD.toLocaleString()}`,
      actualValue: { program: pumpData.program?.slice(0,8), supply: pumpData.total_supply },
      passed: !isMayhem,
      reason: isMayhem ? 'Token is Mayhem Mode - auto-reject' : undefined
    });
    
    if (isMayhem) overallPassed = false;
  }

  // 3. Check Bundle Score via holders
  const { call: holdersCall, data: holdersData } = await timedFetch(
    'Solana Tracker Holders',
    `${SOLANA_TRACKER_API}/tokens/${tokenMint}/holders`
  );
  apiCalls.push(holdersCall);

  if (holdersData && Array.isArray(holdersData)) {
    const sortedHolders = holdersData.slice(0, 10);
    const top10Pct = sortedHolders.reduce((sum: number, h: any) => sum + (h.percentage || 0), 0);
    const top5Pct = sortedHolders.slice(0, 5).reduce((sum: number, h: any) => sum + (h.percentage || 0), 0);
    const bundleScore = Math.round((top5Pct * 0.6 + top10Pct * 0.4));
    
    logicChecks.push({
      name: 'Bundle Score Check',
      description: 'Top holder concentration is not too high (anti-bundle)',
      threshold: 'Bundle Score < 70',
      actualValue: { bundleScore, top5Pct: top5Pct.toFixed(2), top10Pct: top10Pct.toFixed(2) },
      passed: bundleScore < 70,
      reason: bundleScore >= 70 ? 'High bundle score indicates concentrated holdings' : undefined
    });
    
    if (bundleScore >= 70) overallPassed = false;
  }

  return {
    stage: 0,
    stageName: 'Token Discovery',
    status: overallPassed ? 'passed' : 'failed',
    durationMs: Date.now() - start,
    apiCalls,
    logicChecks,
    decision: overallPassed ? 'Token passes initial discovery checks' : 'Token rejected at discovery stage',
    nextStage: overallPassed ? 1 : undefined,
    rawData: { stData, pumpData, holdersData }
  };
}

// Stage 1: Authority Check
async function runStage1(tokenMint: string): Promise<StageResult> {
  const start = Date.now();
  const apiCalls: ApiCall[] = [];
  const logicChecks: LogicCheck[] = [];
  let overallPassed = true;

  const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
  if (!heliusApiKey) {
    return {
      stage: 1,
      stageName: 'Authority Check',
      status: 'failed',
      durationMs: Date.now() - start,
      apiCalls: [],
      logicChecks: [{ name: 'API Key Check', description: 'Helius API key configured', passed: false, reason: 'Missing HELIUS_API_KEY' }],
      decision: 'Cannot run authority check without Helius API key'
    };
  }

  // Get mint account info via Helius
  const { call: mintCall, data: mintData } = await timedFetch(
    'Helius Mint Account Info',
    `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [tokenMint, { encoding: 'jsonParsed' }]
      })
    }
  );
  apiCalls.push({ ...mintCall, url: mintCall.url.replace(heliusApiKey, 'REDACTED') });

  if (mintData?.result?.value?.data?.parsed?.info) {
    const info = mintData.result.value.data.parsed.info;
    
    // Check mint authority
    const mintAuthorityRevoked = info.mintAuthority === null;
    logicChecks.push({
      name: 'Mint Authority Revoked',
      description: 'No one can mint new tokens',
      threshold: 'mintAuthority === null',
      actualValue: info.mintAuthority || 'null (revoked)',
      passed: mintAuthorityRevoked,
      reason: !mintAuthorityRevoked ? 'Mint authority still active - can create infinite tokens' : undefined
    });
    if (!mintAuthorityRevoked) overallPassed = false;

    // Check freeze authority
    const freezeAuthorityRevoked = info.freezeAuthority === null;
    logicChecks.push({
      name: 'Freeze Authority Revoked',
      description: 'No one can freeze token accounts',
      threshold: 'freezeAuthority === null',
      actualValue: info.freezeAuthority || 'null (revoked)',
      passed: freezeAuthorityRevoked,
      reason: !freezeAuthorityRevoked ? 'Freeze authority active - can freeze holder wallets' : undefined
    });
    if (!freezeAuthorityRevoked) overallPassed = false;

    // Check supply
    const supply = parseFloat(info.supply || '0');
    const standardSupply = 1000000000000000; // 1B with 6 decimals
    const supplyVariance = Math.abs(supply - standardSupply) / standardSupply;
    const supplyOk = supplyVariance <= 0.01;
    
    logicChecks.push({
      name: 'Standard Supply',
      description: 'Supply matches pump.fun standard (±1%)',
      threshold: '1,000,000,000,000,000 ±1%',
      actualValue: supply.toLocaleString(),
      passed: supplyOk,
      reason: !supplyOk ? `Supply variance: ${(supplyVariance * 100).toFixed(2)}%` : undefined
    });
    // Supply check is informational, don't fail on it
  } else {
    logicChecks.push({
      name: 'Mint Account Parse',
      description: 'Successfully parsed mint account data',
      passed: false,
      reason: 'Could not parse mint account info'
    });
    overallPassed = false;
  }

  return {
    stage: 1,
    stageName: 'Authority Check',
    status: overallPassed ? 'passed' : 'failed',
    durationMs: Date.now() - start,
    apiCalls,
    logicChecks,
    decision: overallPassed ? 'Token authorities properly revoked' : 'Token has dangerous authorities - REJECT',
    nextStage: overallPassed ? 2 : undefined,
    rawData: mintData
  };
}

// Stage 2: RugCheck Analysis
async function runStage2(tokenMint: string): Promise<StageResult> {
  const start = Date.now();
  const apiCalls: ApiCall[] = [];
  const logicChecks: LogicCheck[] = [];
  let overallPassed = true;
  let softRejected = false;

  const { call: rugCall, data: rugData } = await timedFetch(
    'RugCheck Report',
    `${RUGCHECK_API}/tokens/${tokenMint}/report/summary`
  );
  apiCalls.push(rugCall);

  if (!rugData || rugCall.status !== 200) {
    logicChecks.push({
      name: 'RugCheck API Response',
      description: 'Successfully fetched RugCheck report',
      passed: false,
      reason: 'RugCheck API error or token not found'
    });
    softRejected = true;
  } else {
    // Check for critical risks
    const criticalRisks = ['freeze', 'mint', 'copycat', 'mutable_metadata'];
    const foundCritical = rugData.risks?.filter((r: any) => 
      criticalRisks.some(c => r.name?.toLowerCase().includes(c) && r.level === 'danger')
    ) || [];

    logicChecks.push({
      name: 'No Critical Risks',
      description: 'Token has no freeze/mint/copycat risks',
      threshold: 'No danger-level critical risks',
      actualValue: foundCritical.length > 0 ? foundCritical.map((r: any) => r.name) : 'None found',
      passed: foundCritical.length === 0,
      reason: foundCritical.length > 0 ? `Critical risks: ${foundCritical.map((r: any) => r.name).join(', ')}` : undefined
    });
    if (foundCritical.length > 0) overallPassed = false;

    // Check normalized score
    const score = rugData.score || 0;
    const normalizedScore = Math.round(score / 10); // Assuming 0-1000 scale
    
    logicChecks.push({
      name: 'Risk Score Threshold',
      description: 'RugCheck score is acceptable',
      threshold: 'Normalized score ≥ 50',
      actualValue: { rawScore: score, normalized: normalizedScore },
      passed: normalizedScore >= 50,
      reason: normalizedScore < 50 ? 'Low RugCheck score indicates high risk' : undefined
    });
    if (normalizedScore < 50) softRejected = true;

    // Show all risks for transparency
    if (rugData.risks?.length > 0) {
      logicChecks.push({
        name: 'All Detected Risks',
        description: 'Complete list of RugCheck findings',
        actualValue: rugData.risks.map((r: any) => ({ name: r.name, level: r.level })),
        passed: true // Informational
      });
    }
  }

  return {
    stage: 2,
    stageName: 'RugCheck Analysis',
    status: !overallPassed ? 'failed' : softRejected ? 'soft_rejected' : 'passed',
    durationMs: Date.now() - start,
    apiCalls,
    logicChecks,
    decision: !overallPassed ? 'Critical risks detected - PERMANENT REJECT' : 
              softRejected ? 'Low score - SOFT REJECT (may retry)' : 
              'Token passes RugCheck analysis',
    nextStage: overallPassed && !softRejected ? 3 : undefined,
    rawData: rugData
  };
}

// Stage 3: Holder Analysis
async function runStage3(tokenMint: string): Promise<StageResult> {
  const start = Date.now();
  const apiCalls: ApiCall[] = [];
  const logicChecks: LogicCheck[] = [];
  let overallPassed = true;

  // Fetch holders
  const { call: holdersCall, data: holdersData } = await timedFetch(
    'Solana Tracker Holders',
    `${SOLANA_TRACKER_API}/tokens/${tokenMint}/holders`
  );
  apiCalls.push(holdersCall);

  if (!holdersData || !Array.isArray(holdersData)) {
    logicChecks.push({
      name: 'Holders Data',
      description: 'Successfully fetched holder data',
      passed: false,
      reason: 'Could not fetch holders'
    });
    overallPassed = false;
  } else {
    const totalHolders = holdersData.length;
    
    logicChecks.push({
      name: 'Holder Count',
      description: 'Number of unique holders',
      actualValue: totalHolders,
      passed: totalHolders >= 10
    });

    // Calculate Gini coefficient
    const holdings = holdersData.map((h: any) => h.percentage || 0).sort((a: number, b: number) => a - b);
    let giniSum = 0;
    for (let i = 0; i < holdings.length; i++) {
      giniSum += (2 * (i + 1) - holdings.length - 1) * holdings[i];
    }
    const gini = holdings.length > 0 ? giniSum / (holdings.length * holdings.reduce((a: number, b: number) => a + b, 0)) : 0;
    
    logicChecks.push({
      name: 'Gini Coefficient',
      description: 'Measure of holder concentration (0=equal, 1=one holder has all)',
      threshold: 'Gini < 0.8',
      actualValue: gini.toFixed(4),
      passed: gini < 0.8,
      reason: gini >= 0.8 ? 'Very high concentration - likely bundled' : undefined
    });
    if (gini >= 0.8) overallPassed = false;

    // Check for fresh wallets (simplified - would need transaction history for real check)
    const top10 = holdersData.slice(0, 10);
    
    logicChecks.push({
      name: 'Top 10 Holders',
      description: 'Distribution among top holders',
      actualValue: top10.map((h: any) => ({
        wallet: h.wallet?.slice(0, 8) + '...',
        pct: (h.percentage || 0).toFixed(2) + '%'
      })),
      passed: true // Informational
    });

    // Bundle detection via transaction timing would go here
    logicChecks.push({
      name: 'Bundle Detection',
      description: 'Check for coordinated buys in same block',
      actualValue: 'Requires transaction analysis (skipped in debug)',
      passed: true,
      reason: 'Full bundle detection requires Helius transaction history'
    });
  }

  return {
    stage: 3,
    stageName: 'Holder Analysis',
    status: overallPassed ? 'passed' : 'failed',
    durationMs: Date.now() - start,
    apiCalls,
    logicChecks,
    decision: overallPassed ? 'Holder distribution acceptable' : 'Holder analysis failed - likely bundled',
    nextStage: overallPassed ? 4 : undefined,
    rawData: { holderCount: holdersData?.length, topHolders: holdersData?.slice(0, 10) }
  };
}

// Stage 4: Dev Wallet Check
async function runStage4(tokenMint: string): Promise<StageResult> {
  const start = Date.now();
  const apiCalls: ApiCall[] = [];
  const logicChecks: LogicCheck[] = [];
  let overallPassed = true;

  // First, get creator wallet from pump.fun
  const { call: pumpCall, data: pumpData } = await timedFetch(
    'pump.fun Token Info',
    `${PUMP_API}/coins/${tokenMint}`
  );
  apiCalls.push(pumpCall);

  if (!pumpData?.creator) {
    logicChecks.push({
      name: 'Creator Wallet Found',
      description: 'Token has identifiable creator',
      passed: false,
      reason: 'Could not identify creator wallet'
    });
    // Don't fail - might be from different launchpad
    return {
      stage: 4,
      stageName: 'Dev Wallet Check',
      status: 'passed',
      durationMs: Date.now() - start,
      apiCalls,
      logicChecks: [{
        name: 'Creator Wallet',
        description: 'Unable to identify creator - skipping dev checks',
        passed: true,
        reason: 'Token may be from non-pump.fun launchpad'
      }],
      decision: 'Could not identify dev wallet - proceeding with caution',
      nextStage: 5
    };
  }

  const creatorWallet = pumpData.creator;
  logicChecks.push({
    name: 'Creator Wallet Found',
    description: 'Token creator identified',
    actualValue: creatorWallet.slice(0, 12) + '...',
    passed: true
  });

  // Check if dev created newer tokens
  const { call: userCoinsCall, data: userCoinsData } = await timedFetch(
    'pump.fun User Created Coins',
    `${PUMP_API}/coins/user-created-coins/${creatorWallet}?limit=10`
  );
  apiCalls.push(userCoinsCall);

  if (userCoinsData && Array.isArray(userCoinsData)) {
    const thisTokenIndex = userCoinsData.findIndex((c: any) => c.mint === tokenMint);
    const newerTokens = userCoinsData.slice(0, thisTokenIndex);
    
    logicChecks.push({
      name: 'No Newer Tokens',
      description: 'Dev has not launched new tokens after this one',
      threshold: 'No tokens created after current token',
      actualValue: newerTokens.length > 0 ? newerTokens.map((t: any) => t.symbol) : 'None',
      passed: newerTokens.length === 0,
      reason: newerTokens.length > 0 ? `Dev launched ${newerTokens.length} newer tokens - may have abandoned this one` : undefined
    });
    
    if (newerTokens.length > 0) overallPassed = false;

    logicChecks.push({
      name: 'Dev Token History',
      description: 'Total tokens created by this developer',
      actualValue: userCoinsData.length,
      passed: true // Informational
    });
  }

  // Would check for dev sells via Helius here
  logicChecks.push({
    name: 'Dev Sell Detection',
    description: 'Check if dev has sold tokens',
    actualValue: 'Requires transaction analysis (skipped in debug)',
    passed: true,
    reason: 'Full sell detection requires Helius transaction history'
  });

  return {
    stage: 4,
    stageName: 'Dev Wallet Check',
    status: overallPassed ? 'passed' : 'failed',
    durationMs: Date.now() - start,
    apiCalls,
    logicChecks,
    decision: overallPassed ? 'Dev wallet checks passed' : 'Dev has abandoned token or sold - REJECT',
    nextStage: overallPassed ? 5 : undefined,
    rawData: { creator: creatorWallet, creatorCoins: userCoinsData?.slice(0, 5) }
  };
}

// Stage 5: Metrics Monitor
async function runStage5(tokenMint: string): Promise<StageResult> {
  const start = Date.now();
  const apiCalls: ApiCall[] = [];
  const logicChecks: LogicCheck[] = [];

  // Fetch from multiple sources
  const { call: pumpCall, data: pumpData } = await timedFetch(
    'pump.fun Metrics',
    `${PUMP_API}/coins/${tokenMint}`
  );
  apiCalls.push(pumpCall);

  // DexScreener for additional data
  const { call: dexCall, data: dexData } = await timedFetch(
    'DexScreener Pairs',
    `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
  );
  apiCalls.push(dexCall);

  // Compile metrics
  const metrics: any = {};

  if (pumpData) {
    metrics.holderCount = pumpData.holder_count;
    metrics.bondingCurveProgress = pumpData.bonding_curve_progress;
    metrics.marketCap = pumpData.usd_market_cap;
    metrics.volume24h = pumpData.volume?.h24;

    logicChecks.push({
      name: 'pump.fun Metrics',
      description: 'Core metrics from pump.fun',
      actualValue: {
        holders: metrics.holderCount,
        bondingCurve: `${((metrics.bondingCurveProgress || 0) * 100).toFixed(2)}%`,
        marketCap: `$${(metrics.marketCap || 0).toLocaleString()}`
      },
      passed: true
    });

    // Bonding curve check
    const bcProgress = metrics.bondingCurveProgress || 0;
    logicChecks.push({
      name: 'Bonding Curve Position',
      description: 'Token is still on bonding curve (not graduated)',
      threshold: 'Progress < 100%',
      actualValue: `${(bcProgress * 100).toFixed(2)}%`,
      passed: bcProgress < 1,
      reason: bcProgress >= 1 ? 'Token has graduated from bonding curve' : undefined
    });
  }

  if (dexData?.pairs?.[0]) {
    const pair = dexData.pairs[0];
    metrics.dexPrice = pair.priceUsd;
    metrics.dexLiquidity = pair.liquidity?.usd;
    metrics.dexVolume24h = pair.volume?.h24;
    metrics.priceChange5m = pair.priceChange?.m5;
    metrics.priceChange1h = pair.priceChange?.h1;

    logicChecks.push({
      name: 'DexScreener Metrics',
      description: 'Market data from DexScreener',
      actualValue: {
        price: `$${metrics.dexPrice}`,
        liquidity: `$${(metrics.dexLiquidity || 0).toLocaleString()}`,
        volume24h: `$${(metrics.dexVolume24h || 0).toLocaleString()}`,
        priceChange5m: `${metrics.priceChange5m || 0}%`,
        priceChange1h: `${metrics.priceChange1h || 0}%`
      },
      passed: true
    });
  }

  // Holder threshold check
  const holderCount = metrics.holderCount || 0;
  logicChecks.push({
    name: 'Holder Count Threshold',
    description: 'Minimum holders for qualification',
    threshold: 'holders ≥ 20',
    actualValue: holderCount,
    passed: holderCount >= 20
  });

  return {
    stage: 5,
    stageName: 'Metrics Monitor',
    status: 'passed', // Metrics stage is informational
    durationMs: Date.now() - start,
    apiCalls,
    logicChecks,
    decision: 'Metrics collected from all sources',
    nextStage: 6,
    rawData: metrics
  };
}

// Stage 6: Qualification Gate
async function runStage6(tokenMint: string, supabase: any): Promise<StageResult> {
  const start = Date.now();
  const apiCalls: ApiCall[] = [];
  const logicChecks: LogicCheck[] = [];
  let signalStrength: 'STRONG' | 'WEAK' | 'NONE' = 'NONE';

  // Fetch current config
  const { data: config } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .single();

  const thresholds = {
    minHolders: config?.min_holders_to_qualify || 20,
    minVolume: config?.min_volume_sol || 0.5,
    minWatchTime: config?.min_watch_time_sec || 120
  };

  logicChecks.push({
    name: 'Configuration Loaded',
    description: 'Qualification thresholds from config',
    actualValue: thresholds,
    passed: true
  });

  // Check watchlist entry
  const { data: watchlistEntry } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('token_mint', tokenMint)
    .single();

  if (!watchlistEntry) {
    logicChecks.push({
      name: 'Watchlist Entry',
      description: 'Token is in watchlist',
      passed: false,
      reason: 'Token not found in watchlist - run stages 0-5 first'
    });
    
    return {
      stage: 6,
      stageName: 'Qualification Gate',
      status: 'failed',
      durationMs: Date.now() - start,
      apiCalls,
      logicChecks,
      decision: 'Token not in watchlist - cannot qualify'
    };
  }

  // Check holder threshold
  const meetsHolders = (watchlistEntry.holders || 0) >= thresholds.minHolders;
  logicChecks.push({
    name: 'Holder Threshold',
    description: 'Meets minimum holder count',
    threshold: `holders ≥ ${thresholds.minHolders}`,
    actualValue: watchlistEntry.holders,
    passed: meetsHolders
  });

  // Check watch time
  const watchedForSec = watchlistEntry.first_seen_at 
    ? Math.floor((Date.now() - new Date(watchlistEntry.first_seen_at).getTime()) / 1000)
    : 0;
  const meetsWatchTime = watchedForSec >= thresholds.minWatchTime;
  logicChecks.push({
    name: 'Watch Time',
    description: 'Token watched for minimum duration',
    threshold: `watched ≥ ${thresholds.minWatchTime}s`,
    actualValue: `${watchedForSec}s`,
    passed: meetsWatchTime
  });

  // Re-verify with RugCheck
  const { call: rugCall, data: rugData } = await timedFetch(
    'RugCheck Re-verification',
    `${RUGCHECK_API}/tokens/${tokenMint}/report/summary`
  );
  apiCalls.push(rugCall);

  const passesRugcheck = rugData && !rugData.risks?.some((r: any) => 
    r.level === 'danger' && ['freeze', 'mint'].some(k => r.name?.toLowerCase().includes(k))
  );
  logicChecks.push({
    name: 'RugCheck Re-verification',
    description: 'Final safety check before qualification',
    actualValue: passesRugcheck ? 'No critical risks' : 'Critical risks detected',
    passed: passesRugcheck
  });

  // Calculate signal strength
  const allChecksPassed = meetsHolders && meetsWatchTime && passesRugcheck;
  if (allChecksPassed) {
    signalStrength = (watchlistEntry.holders || 0) >= thresholds.minHolders * 2 ? 'STRONG' : 'WEAK';
  }

  logicChecks.push({
    name: 'Signal Strength',
    description: 'Final qualification signal',
    actualValue: signalStrength,
    passed: signalStrength !== 'NONE'
  });

  return {
    stage: 6,
    stageName: 'Qualification Gate',
    status: allChecksPassed ? 'passed' : 'failed',
    durationMs: Date.now() - start,
    apiCalls,
    logicChecks,
    decision: allChecksPassed 
      ? `Token QUALIFIED with ${signalStrength} signal` 
      : 'Token does not meet qualification criteria',
    rawData: { watchlistEntry, signalStrength }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, tokenMint, stage } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (action === 'run_stage') {
      if (!tokenMint) {
        return jsonResponse({ error: 'tokenMint required' }, 400);
      }

      let result: StageResult;
      
      switch (stage) {
        case 0:
          result = await runStage0(tokenMint);
          break;
        case 1:
          result = await runStage1(tokenMint);
          break;
        case 2:
          result = await runStage2(tokenMint);
          break;
        case 3:
          result = await runStage3(tokenMint);
          break;
        case 4:
          result = await runStage4(tokenMint);
          break;
        case 5:
          result = await runStage5(tokenMint);
          break;
        case 6:
          result = await runStage6(tokenMint, supabase);
          break;
        default:
          return jsonResponse({ error: `Invalid stage: ${stage}` }, 400);
      }

      console.log(`[Pipeline Debugger] Stage ${stage} for ${tokenMint}: ${result.status} (${result.durationMs}ms)`);
      return jsonResponse(result);
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (err: any) {
    console.error('[Pipeline Debugger] Error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
});
