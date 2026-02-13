// Pump.fun Curve Health Analyzer
// Analyzes emerging bonding curve patterns to identify ideal buy-in opportunities

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('pumpfun-curve-analyzer');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Curve analysis thresholds
const CURVE_CONFIG = {
  // Price zones (in USD)
  start_zone: { min: 0.0000020, max: 0.0000035 },
  target_zone: { min: 0.0000070, max: 0.0000150 },
  
  // Time targets (minutes)
  ideal_time_to_target: { min: 5, max: 15 },
  max_age_for_analysis: 30, // Only analyze tokens under 30 mins old
  
  // Buyer diversity
  min_unique_buyers: 5,
  ideal_unique_buyers: 10,
  max_whale_percentage: 25, // No single holder > 25%
  
  // Dev behavior
  dev_holding_healthy_min: 5, // Dev should hold at least 5%
  dev_holding_warning_max: 40, // Dev holding > 40% is risky
  
  // Volume health
  min_buy_sell_ratio: 1.5, // Buy volume should be 1.5x sell volume
  
  // Score thresholds
  auto_buy_threshold: 70,
  watch_threshold: 50,
};

interface CurveMetrics {
  tokenMint: string;
  symbol: string;
  currentPrice: number;
  startPrice: number | null;
  priceChange: number;
  ageMinutes: number;
  uniqueBuyers: number;
  totalBuys: number;
  totalSells: number;
  buyVolumeSol: number;
  sellVolumeSol: number;
  largestHolderPct: number;
  devHoldingPct: number;
  devBought: boolean;
  devSold: boolean;
  bondingCurvePct: number;
  priceCandles: { time: number; price: number }[];
}

interface CurveHealthResult {
  tokenMint: string;
  symbol: string;
  healthScore: number;
  recommendation: 'BUY' | 'WATCH' | 'SKIP';
  signals: {
    name: string;
    score: number;
    weight: number;
    contribution: number;
    detail: string;
  }[];
  metrics: CurveMetrics;
  analysis: {
    curveShape: 'emerging_arc' | 'spike' | 'flat' | 'declining' | 'volatile';
    pricePosition: 'start_zone' | 'mid_zone' | 'target_zone' | 'past_target';
    buyerQuality: 'excellent' | 'good' | 'fair' | 'poor';
    devTrust: 'high' | 'medium' | 'low' | 'unknown';
  };
  timestamp: string;
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Fetch token trades from pump.fun API
async function fetchTokenTrades(tokenMint: string): Promise<any[]> {
  try {
    const response = await fetch(
      `https://frontend-api-v3.pump.fun/trades/latest/${tokenMint}?limit=100`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error('Error fetching trades:', error);
    return [];
  }
}

// Fetch token info from pump.fun
async function fetchTokenInfo(tokenMint: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://frontend-api-v3.pump.fun/coins/${tokenMint}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching token info:', error);
    return null;
  }
}

// Calculate curve metrics from trades
function calculateMetrics(tokenInfo: any, trades: any[]): CurveMetrics {
  const now = Date.now();
  const createdAt = tokenInfo.created_timestamp || now;
  const ageMinutes = (now - createdAt) / 60000;
  
  // Analyze trades
  const buyTrades = trades.filter(t => t.is_buy === true);
  const sellTrades = trades.filter(t => t.is_buy === false);
  
  const uniqueBuyers = new Set(buyTrades.map(t => t.user)).size;
  const buyVolumeSol = buyTrades.reduce((sum, t) => sum + (t.sol_amount || 0) / 1e9, 0);
  const sellVolumeSol = sellTrades.reduce((sum, t) => sum + (t.sol_amount || 0) / 1e9, 0);
  
  // Find largest holder from trades
  const holderBalances: Record<string, number> = {};
  for (const trade of trades) {
    const wallet = trade.user;
    const tokenAmount = (trade.token_amount || 0) / 1e6;
    if (trade.is_buy) {
      holderBalances[wallet] = (holderBalances[wallet] || 0) + tokenAmount;
    } else {
      holderBalances[wallet] = (holderBalances[wallet] || 0) - tokenAmount;
    }
  }
  
  const totalSupply = tokenInfo.total_supply ? tokenInfo.total_supply / 1e6 : 1000000000;
  const largestHolder = Math.max(...Object.values(holderBalances), 0);
  const largestHolderPct = (largestHolder / totalSupply) * 100;
  
  // Dev analysis
  const devWallet = tokenInfo.creator;
  const devTrades = trades.filter(t => t.user === devWallet);
  const devBuyTrades = devTrades.filter(t => t.is_buy === true);
  const devSellTrades = devTrades.filter(t => t.is_buy === false);
  const devBought = devBuyTrades.length > 0;
  const devSold = devSellTrades.length > 0;
  
  const devBalance = holderBalances[devWallet] || 0;
  const devHoldingPct = (devBalance / totalSupply) * 100;
  
  // Price candles (simplified - just track price over time)
  const priceCandles = trades
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(t => ({
      time: t.timestamp,
      price: t.token_amount && t.sol_amount 
        ? (t.sol_amount / 1e9) / (t.token_amount / 1e6)
        : 0
    }))
    .filter(c => c.price > 0);
  
  const currentPrice = tokenInfo.usd_market_cap && tokenInfo.total_supply
    ? tokenInfo.usd_market_cap / (tokenInfo.total_supply / 1e6)
    : priceCandles.length > 0 ? priceCandles[priceCandles.length - 1].price : 0;
  
  const startPrice = priceCandles.length > 0 ? priceCandles[0].price : null;
  const priceChange = startPrice ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
  
  // Bonding curve progress
  const bondingCurvePct = tokenInfo.bonding_curve_progress 
    ? tokenInfo.bonding_curve_progress * 100 
    : Math.min(100, (tokenInfo.usd_market_cap || 0) / 690000 * 100);
  
  return {
    tokenMint: tokenInfo.mint,
    symbol: tokenInfo.symbol || 'UNKNOWN',
    currentPrice,
    startPrice,
    priceChange,
    ageMinutes,
    uniqueBuyers,
    totalBuys: buyTrades.length,
    totalSells: sellTrades.length,
    buyVolumeSol,
    sellVolumeSol,
    largestHolderPct,
    devHoldingPct,
    devBought,
    devSold,
    bondingCurvePct,
    priceCandles,
  };
}

// Calculate price slope smoothness (lower variance = smoother)
function calculateSlopeSmootnness(candles: { time: number; price: number }[]): number {
  if (candles.length < 3) return 50; // Not enough data
  
  // Calculate price deltas
  const deltas: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const priceDelta = (candles[i].price - candles[i-1].price) / candles[i-1].price;
    deltas.push(priceDelta);
  }
  
  if (deltas.length === 0) return 50;
  
  // Calculate variance of deltas
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / deltas.length;
  
  // Convert variance to score (lower variance = higher score)
  // Variance of 0.01 (1%) is considered acceptable
  const smoothnessScore = Math.max(0, Math.min(100, 100 - (variance * 1000)));
  
  return smoothnessScore;
}

// Determine curve shape
function determineCurveShape(metrics: CurveMetrics): 'emerging_arc' | 'spike' | 'flat' | 'declining' | 'volatile' {
  const { priceChange, priceCandles, ageMinutes } = metrics;
  
  if (priceCandles.length < 3) return 'flat';
  
  // Check for spike pattern (rapid rise followed by fall)
  const midIndex = Math.floor(priceCandles.length / 2);
  const firstHalfAvg = priceCandles.slice(0, midIndex).reduce((s, c) => s + c.price, 0) / midIndex;
  const secondHalfAvg = priceCandles.slice(midIndex).reduce((s, c) => s + c.price, 0) / (priceCandles.length - midIndex);
  
  if (secondHalfAvg < firstHalfAvg * 0.7) return 'declining';
  
  // Check smoothness for volatility
  const smoothness = calculateSlopeSmootnness(priceCandles);
  if (smoothness < 30) return 'volatile';
  
  // Check for spike (too fast)
  if (priceChange > 200 && ageMinutes < 3) return 'spike';
  
  // Ideal emerging arc
  if (priceChange > 50 && priceChange < 400 && smoothness > 50) return 'emerging_arc';
  
  if (priceChange < 20) return 'flat';
  
  return 'emerging_arc';
}

// Calculate curve health score
function calculateHealthScore(metrics: CurveMetrics): CurveHealthResult {
  const signals: CurveHealthResult['signals'] = [];
  
  // 1. Unique Buyers (25%)
  const buyerScore = Math.min(100, (metrics.uniqueBuyers / CURVE_CONFIG.ideal_unique_buyers) * 100);
  signals.push({
    name: 'unique_buyers',
    score: buyerScore,
    weight: 0.25,
    contribution: buyerScore * 0.25,
    detail: `${metrics.uniqueBuyers} unique buyers (target: ${CURVE_CONFIG.ideal_unique_buyers}+)`
  });
  
  // 2. Price Slope Smoothness (20%)
  const smoothnessScore = calculateSlopeSmootnness(metrics.priceCandles);
  signals.push({
    name: 'slope_smoothness',
    score: smoothnessScore,
    weight: 0.20,
    contribution: smoothnessScore * 0.20,
    detail: `Curve smoothness: ${smoothnessScore.toFixed(0)}%`
  });
  
  // 3. Dev Behavior (20%)
  let devScore = 50; // Neutral default
  if (metrics.devBought && !metrics.devSold) {
    devScore = 100; // Best: dev bought and holding
  } else if (metrics.devBought && metrics.devSold) {
    devScore = 40; // Caution: dev sold some
  } else if (!metrics.devBought && metrics.devSold) {
    devScore = 10; // Bad: dev only selling
  } else if (metrics.devHoldingPct > CURVE_CONFIG.dev_holding_warning_max) {
    devScore = 30; // Too much concentration
  }
  signals.push({
    name: 'dev_behavior',
    score: devScore,
    weight: 0.20,
    contribution: devScore * 0.20,
    detail: `Dev bought: ${metrics.devBought}, sold: ${metrics.devSold}, holding: ${metrics.devHoldingPct.toFixed(1)}%`
  });
  
  // 4. Volume Trend (15%)
  const buySellRatio = metrics.sellVolumeSol > 0 
    ? metrics.buyVolumeSol / metrics.sellVolumeSol 
    : metrics.buyVolumeSol > 0 ? 10 : 0;
  const volumeScore = Math.min(100, (buySellRatio / CURVE_CONFIG.min_buy_sell_ratio) * 50 + 
    (metrics.totalBuys > metrics.totalSells ? 25 : 0) +
    (metrics.buyVolumeSol > 1 ? 25 : metrics.buyVolumeSol * 25));
  signals.push({
    name: 'volume_trend',
    score: volumeScore,
    weight: 0.15,
    contribution: volumeScore * 0.15,
    detail: `Buy/Sell ratio: ${buySellRatio.toFixed(2)}x, Buy vol: ${metrics.buyVolumeSol.toFixed(2)} SOL`
  });
  
  // 5. Time-to-Zone (10%)
  let timeScore = 50;
  if (metrics.ageMinutes >= CURVE_CONFIG.ideal_time_to_target.min && 
      metrics.ageMinutes <= CURVE_CONFIG.ideal_time_to_target.max) {
    timeScore = 100;
  } else if (metrics.ageMinutes < CURVE_CONFIG.ideal_time_to_target.min) {
    timeScore = 60; // A bit early, but okay
  } else if (metrics.ageMinutes > CURVE_CONFIG.max_age_for_analysis) {
    timeScore = 20; // Too old
  }
  signals.push({
    name: 'time_to_zone',
    score: timeScore,
    weight: 0.10,
    contribution: timeScore * 0.10,
    detail: `Age: ${metrics.ageMinutes.toFixed(1)} mins (ideal: ${CURVE_CONFIG.ideal_time_to_target.min}-${CURVE_CONFIG.ideal_time_to_target.max})`
  });
  
  // 6. Whale Dominance (10%)
  const whaleScore = metrics.largestHolderPct <= CURVE_CONFIG.max_whale_percentage 
    ? 100 
    : Math.max(0, 100 - (metrics.largestHolderPct - CURVE_CONFIG.max_whale_percentage) * 3);
  signals.push({
    name: 'whale_dominance',
    score: whaleScore,
    weight: 0.10,
    contribution: whaleScore * 0.10,
    detail: `Largest holder: ${metrics.largestHolderPct.toFixed(1)}% (max: ${CURVE_CONFIG.max_whale_percentage}%)`
  });
  
  // Calculate total score
  const healthScore = signals.reduce((sum, s) => sum + s.contribution, 0);
  
  // Determine recommendation
  let recommendation: 'BUY' | 'WATCH' | 'SKIP' = 'SKIP';
  if (healthScore >= CURVE_CONFIG.auto_buy_threshold) {
    recommendation = 'BUY';
  } else if (healthScore >= CURVE_CONFIG.watch_threshold) {
    recommendation = 'WATCH';
  }
  
  // Determine curve shape
  const curveShape = determineCurveShape(metrics);
  
  // Price position
  let pricePosition: 'start_zone' | 'mid_zone' | 'target_zone' | 'past_target' = 'mid_zone';
  if (metrics.currentPrice <= CURVE_CONFIG.start_zone.max) {
    pricePosition = 'start_zone';
  } else if (metrics.currentPrice >= CURVE_CONFIG.target_zone.min && 
             metrics.currentPrice <= CURVE_CONFIG.target_zone.max) {
    pricePosition = 'target_zone';
  } else if (metrics.currentPrice > CURVE_CONFIG.target_zone.max) {
    pricePosition = 'past_target';
  }
  
  // Buyer quality
  let buyerQuality: 'excellent' | 'good' | 'fair' | 'poor' = 'fair';
  if (metrics.uniqueBuyers >= 10 && metrics.largestHolderPct < 15) {
    buyerQuality = 'excellent';
  } else if (metrics.uniqueBuyers >= 5 && metrics.largestHolderPct < 25) {
    buyerQuality = 'good';
  } else if (metrics.uniqueBuyers < 3 || metrics.largestHolderPct > 40) {
    buyerQuality = 'poor';
  }
  
  // Dev trust
  let devTrust: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
  if (metrics.devBought && !metrics.devSold && metrics.devHoldingPct > 5) {
    devTrust = 'high';
  } else if (metrics.devBought && metrics.devSold) {
    devTrust = 'medium';
  } else if (metrics.devSold && !metrics.devBought) {
    devTrust = 'low';
  }
  
  return {
    tokenMint: metrics.tokenMint,
    symbol: metrics.symbol,
    healthScore: Math.round(healthScore * 10) / 10,
    recommendation,
    signals,
    metrics,
    analysis: {
      curveShape,
      pricePosition,
      buyerQuality,
      devTrust,
    },
    timestamp: new Date().toISOString(),
  };
}

// Analyze multiple tokens from watchlist
async function analyzeWatchlistTokens(supabase: any): Promise<CurveHealthResult[]> {
  const results: CurveHealthResult[] = [];
  
  // Fetch watching tokens that are in the emerging phase
  const { data: watchlist, error } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'watching')
    .order('first_seen_at', { ascending: false })
    .limit(20);
  
  if (error || !watchlist) {
    console.error('Error fetching watchlist:', error);
    return results;
  }
  
  console.log(`Analyzing ${watchlist.length} tokens from watchlist`);
  
  for (const token of watchlist) {
    try {
      const tokenInfo = await fetchTokenInfo(token.token_mint);
      if (!tokenInfo) continue;
      
      const trades = await fetchTokenTrades(token.token_mint);
      if (trades.length < 3) continue; // Not enough data
      
      const metrics = calculateMetrics(tokenInfo, trades);
      const result = calculateHealthScore(metrics);
      
      results.push(result);
      
      // Update watchlist with curve analysis
      await supabase
        .from('pumpfun_watchlist')
        .update({
          metadata: {
            ...(token.metadata || {}),
            curve_health_score: result.healthScore,
            curve_shape: result.analysis.curveShape,
            buyer_quality: result.analysis.buyerQuality,
            dev_trust: result.analysis.devTrust,
            last_curve_analysis: result.timestamp,
          }
        })
        .eq('id', token.id);
      
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
      
    } catch (error) {
      console.error(`Error analyzing ${token.token_mint}:`, error);
    }
  }
  
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "analyze";

    if (action === "analyze-watchlist") {
      // Analyze all watching tokens
      const results = await analyzeWatchlistTokens(supabase);
      
      const buyRecommendations = results.filter(r => r.recommendation === 'BUY');
      const watchRecommendations = results.filter(r => r.recommendation === 'WATCH');
      
      return ok({
        success: true,
        analyzed: results.length,
        recommendations: {
          buy: buyRecommendations.length,
          watch: watchRecommendations.length,
          skip: results.length - buyRecommendations.length - watchRecommendations.length,
        },
        buyTargets: buyRecommendations.map(r => ({
          mint: r.tokenMint,
          symbol: r.symbol,
          score: r.healthScore,
          curveShape: r.analysis.curveShape,
          buyerQuality: r.analysis.buyerQuality,
        })),
        results,
        timestamp: new Date().toISOString(),
      });
    }

    // Single token analysis
    let body: { tokenMint?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Check query params
      body = { tokenMint: url.searchParams.get("tokenMint") || undefined };
    }

    const { tokenMint } = body;
    if (!tokenMint) {
      return bad("tokenMint is required");
    }

    console.log(`Analyzing curve for token: ${tokenMint}`);

    const tokenInfo = await fetchTokenInfo(tokenMint);
    if (!tokenInfo) {
      return bad("Token not found on pump.fun");
    }

    const trades = await fetchTokenTrades(tokenMint);
    if (trades.length < 3) {
      return ok({
        tokenMint,
        symbol: tokenInfo.symbol,
        healthScore: 0,
        recommendation: 'SKIP',
        reason: 'Insufficient trade data',
        tradesFound: trades.length,
      });
    }

    const metrics = calculateMetrics(tokenInfo, trades);
    const result = calculateHealthScore(metrics);

    return ok(result);

  } catch (error) {
    console.error("Curve analyzer error:", error);
    return bad(`Analyzer error: ${error.message}`, 500);
  }
});
