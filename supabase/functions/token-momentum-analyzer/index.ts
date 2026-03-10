import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { detectTokenPhase, type TokenPhase, type TokenPhaseResult } from "../_shared/token-phase.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MomentumMetrics {
  volume_5m: number | null;
  volume_1h: number | null;
  volume_6h: number | null;
  volume_24h: number | null;
  volume_surge_ratio: number | null;
  buys_5m: number | null;
  sells_5m: number | null;
  buys_1h: number | null;
  sells_1h: number | null;
  buy_sell_ratio_5m: number | null;
  buy_sell_ratio_1h: number | null;
  price_usd: number | null;
  price_change_5m: number | null;
  price_change_1h: number | null;
  price_change_6h: number | null;
  price_change_24h: number | null;
  price_trend: 'surging' | 'rising' | 'stable' | 'falling' | 'crashing' | null;
  age_minutes: number | null;
  market_cap: number | null;
  liquidity_usd: number | null;
  is_fresh: boolean;
  txns_5m: number | null;
  txns_1h: number | null;
}

interface MomentumSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  signal: string;
  weight: number;
}

interface MomentumAnalysis {
  momentum_score: number;
  recommendation: 'SURGE' | 'RISING' | 'FLAT' | 'FALLING';
  action: 'BUY_NOW' | 'WATCH' | 'SKIP';
  phase: TokenPhase;
  phase_label: string;
  metrics: MomentumMetrics;
  signals: MomentumSignal[];
  analyzed_at: string;
}

// ── Phase-weighted thresholds ──
interface PhaseThresholds {
  volumeSurge: { high: number; elevated: number; low: number };
  buySell: { strong: number; positive: number; selling: number; heavySelling: number };
  priceChange5m: { surging: number; rising: number; dumping: number; falling: number };
  txns5m: { high: number; low: number };
  // Weight multipliers for each signal category (sum should ~= 1.0)
  weights: { volume: number; buySell: number; price5m: number; price1h: number; activity: number };
}

const PHASE_THRESHOLDS: Record<TokenPhase, PhaseThresholds> = {
  on_curve: {
    // On curve: volume windows barely exist, so lower thresholds
    volumeSurge: { high: 2, elevated: 1.2, low: 0.3 },
    buySell: { strong: 1.5, positive: 1.1, selling: 0.6, heavySelling: 0.4 },
    priceChange5m: { surging: 15, rising: 5, dumping: -15, falling: -8 },
    txns5m: { high: 20, low: 2 },
    weights: { volume: 0.10, buySell: 0.35, price5m: 0.30, price1h: 0.05, activity: 0.20 },
  },
  fresh: {
    // Fresh: emphasize buy pressure and activity, volume starting to matter
    volumeSurge: { high: 3, elevated: 1.5, low: 0.4 },
    buySell: { strong: 1.8, positive: 1.2, selling: 0.55, heavySelling: 0.4 },
    priceChange5m: { surging: 12, rising: 4, dumping: -12, falling: -6 },
    txns5m: { high: 30, low: 3 },
    weights: { volume: 0.20, buySell: 0.30, price5m: 0.20, price1h: 0.10, activity: 0.20 },
  },
  established: {
    // Established: standard balanced thresholds
    volumeSurge: { high: 4, elevated: 2, low: 0.5 },
    buySell: { strong: 2, positive: 1.2, selling: 0.5, heavySelling: 0.4 },
    priceChange5m: { surging: 10, rising: 3, dumping: -10, falling: -5 },
    txns5m: { high: 50, low: 5 },
    weights: { volume: 0.25, buySell: 0.20, price5m: 0.15, price1h: 0.20, activity: 0.20 },
  },
  mature: {
    // Mature: raise the bar — need bigger moves to matter, weight trends over noise
    volumeSurge: { high: 5, elevated: 2.5, low: 0.5 },
    buySell: { strong: 2.5, positive: 1.3, selling: 0.5, heavySelling: 0.35 },
    priceChange5m: { surging: 8, rising: 2, dumping: -8, falling: -4 },
    txns5m: { high: 80, low: 10 },
    weights: { volume: 0.25, buySell: 0.15, price5m: 0.10, price1h: 0.25, activity: 0.25 },
  },
};

// Fetch DexScreener data
async function fetchDexScreenerMetrics(tokenMint: string) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (!response.ok) {
      console.error(`DexScreener error: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const pair = data.pairs?.[0];
    if (!pair) {
      console.log(`[momentum] No pair found for ${tokenMint}`);
      return null;
    }
    return {
      price: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
      marketCap: pair.marketCap || null,
      liquidity: pair.liquidity?.usd || null,
      pairCreatedAt: pair.pairCreatedAt || null,
      dexId: pair.dexId || null,
      priceChange: {
        m5: pair.priceChange?.m5 ?? null,
        h1: pair.priceChange?.h1 ?? null,
        h6: pair.priceChange?.h6 ?? null,
        h24: pair.priceChange?.h24 ?? null,
      },
      volume: {
        m5: pair.volume?.m5 ?? null,
        h1: pair.volume?.h1 ?? null,
        h6: pair.volume?.h6 ?? null,
        h24: pair.volume?.h24 ?? null,
      },
      txns: {
        m5: pair.txns?.m5 ? { buys: pair.txns.m5.buys || 0, sells: pair.txns.m5.sells || 0 } : null,
        h1: pair.txns?.h1 ? { buys: pair.txns.h1.buys || 0, sells: pair.txns.h1.sells || 0 } : null,
        h6: pair.txns?.h6 ? { buys: pair.txns.h6.buys || 0, sells: pair.txns.h6.sells || 0 } : null,
        h24: pair.txns?.h24 ? { buys: pair.txns.h24.buys || 0, sells: pair.txns.h24.sells || 0 } : null,
      },
    };
  } catch (error) {
    console.error('[momentum] DexScreener fetch error:', error);
    return null;
  }
}

// Phase-weighted momentum scoring
function calculateMomentumScore(metrics: MomentumMetrics, phase: TokenPhase): {
  score: number;
  signals: MomentumSignal[];
  recommendation: 'SURGE' | 'RISING' | 'FLAT' | 'FALLING';
  action: 'BUY_NOW' | 'WATCH' | 'SKIP';
} {
  const t = PHASE_THRESHOLDS[phase];
  const signals: MomentumSignal[] = [];
  let totalScore = 50; // Start neutral

  // ── Volume Surge (phase-weighted) ──
  const maxVolWeight = t.weights.volume * 100;
  if (metrics.volume_surge_ratio !== null) {
    if (metrics.volume_surge_ratio >= t.volumeSurge.high) {
      const weight = Math.min(maxVolWeight, maxVolWeight * 0.7 + (metrics.volume_surge_ratio - t.volumeSurge.high) * 2);
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Volume surge ${metrics.volume_surge_ratio.toFixed(1)}x above average`, weight });
    } else if (metrics.volume_surge_ratio >= t.volumeSurge.elevated) {
      const weight = maxVolWeight * 0.4;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Volume elevated ${metrics.volume_surge_ratio.toFixed(1)}x`, weight });
    } else if (metrics.volume_surge_ratio < t.volumeSurge.low) {
      const weight = -(maxVolWeight * 0.5);
      totalScore += weight;
      signals.push({ type: 'bearish', signal: 'Low volume activity', weight });
    }
  }

  // ── Buy/Sell Ratio 5m (phase-weighted) ──
  const maxBsWeight = t.weights.buySell * 100;
  if (metrics.buy_sell_ratio_5m !== null) {
    if (metrics.buy_sell_ratio_5m >= t.buySell.strong) {
      const weight = Math.min(maxBsWeight, maxBsWeight * 0.6 + (metrics.buy_sell_ratio_5m - t.buySell.strong) * 3);
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Strong buying pressure (${metrics.buy_sell_ratio_5m.toFixed(2)}x buys vs sells)`, weight });
    } else if (metrics.buy_sell_ratio_5m >= t.buySell.positive) {
      const weight = maxBsWeight * 0.3;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `More buyers than sellers (${metrics.buy_sell_ratio_5m.toFixed(2)}x)`, weight });
    } else if (metrics.buy_sell_ratio_5m < t.buySell.heavySelling) {
      const weight = -(maxBsWeight * 0.8);
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `Heavy selling pressure (${metrics.buy_sell_ratio_5m.toFixed(2)}x buys vs sells)`, weight });
    } else if (metrics.buy_sell_ratio_5m < t.buySell.selling) {
      const weight = -(maxBsWeight * 0.4);
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `More sells than buys (${metrics.buy_sell_ratio_5m.toFixed(2)}x)`, weight });
    }
  }

  // ── Price Change 5m (phase-weighted) ──
  const maxP5Weight = t.weights.price5m * 100;
  if (metrics.price_change_5m !== null) {
    if (metrics.price_change_5m >= t.priceChange5m.surging) {
      const weight = Math.min(maxP5Weight, maxP5Weight * 0.6 + (metrics.price_change_5m - t.priceChange5m.surging) * 0.5);
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Price surging +${metrics.price_change_5m.toFixed(1)}% in 5m`, weight });
    } else if (metrics.price_change_5m >= t.priceChange5m.rising) {
      const weight = maxP5Weight * 0.35;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Price rising +${metrics.price_change_5m.toFixed(1)}% in 5m`, weight });
    } else if (metrics.price_change_5m <= t.priceChange5m.dumping) {
      const weight = -maxP5Weight;
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `Price dumping ${metrics.price_change_5m.toFixed(1)}% in 5m`, weight });
    } else if (metrics.price_change_5m <= t.priceChange5m.falling) {
      const weight = -(maxP5Weight * 0.6);
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `Price falling ${metrics.price_change_5m.toFixed(1)}% in 5m`, weight });
    }
  }

  // ── Price Change 1h (phase-weighted) ──
  const maxP1hWeight = t.weights.price1h * 100;
  if (metrics.price_change_1h !== null) {
    if (metrics.price_change_1h >= 50) {
      totalScore += maxP1hWeight;
      signals.push({ type: 'bullish', signal: `Strong 1h momentum +${metrics.price_change_1h.toFixed(1)}%`, weight: maxP1hWeight });
    } else if (metrics.price_change_1h >= 20) {
      const weight = maxP1hWeight * 0.5;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Good 1h momentum +${metrics.price_change_1h.toFixed(1)}%`, weight });
    } else if (metrics.price_change_1h <= -30) {
      totalScore -= maxP1hWeight;
      signals.push({ type: 'bearish', signal: `Weak 1h trend ${metrics.price_change_1h.toFixed(1)}%`, weight: -maxP1hWeight });
    }
  }

  // ── Transaction Activity (phase-weighted) ──
  const maxActWeight = t.weights.activity * 100;
  if (metrics.txns_5m !== null) {
    if (metrics.txns_5m > t.txns5m.high) {
      const weight = maxActWeight * 0.5;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `High activity (${metrics.txns_5m} txns in 5m)`, weight });
    } else if (metrics.txns_5m < t.txns5m.low) {
      const weight = -(maxActWeight * 0.5);
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `Low activity (only ${metrics.txns_5m} txns in 5m)`, weight });
    }
  }

  const finalScore = Math.max(0, Math.min(100, totalScore));

  let recommendation: 'SURGE' | 'RISING' | 'FLAT' | 'FALLING';
  let action: 'BUY_NOW' | 'WATCH' | 'SKIP';

  if (finalScore >= 75) {
    recommendation = 'SURGE';
    action = 'BUY_NOW';
  } else if (finalScore >= 55) {
    recommendation = 'RISING';
    action = 'BUY_NOW';
  } else if (finalScore >= 40) {
    recommendation = 'FLAT';
    action = 'WATCH';
  } else {
    recommendation = 'FALLING';
    action = 'SKIP';
  }

  return { score: finalScore, signals, recommendation, action };
}

function determinePriceTrend(priceChange5m: number | null): MomentumMetrics['price_trend'] {
  if (priceChange5m === null) return null;
  if (priceChange5m >= 10) return 'surging';
  if (priceChange5m >= 3) return 'rising';
  if (priceChange5m <= -10) return 'crashing';
  if (priceChange5m <= -3) return 'falling';
  return 'stable';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint } = await req.json();

    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'tokenMint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[momentum] Analyzing momentum for ${tokenMint}`);

    const dexData = await fetchDexScreenerMetrics(tokenMint);

    if (!dexData) {
      return new Response(
        JSON.stringify({ error: 'No pair data found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Phase detection ──
    const phaseResult: TokenPhaseResult = detectTokenPhase({
      pairCreatedAt: dexData.pairCreatedAt,
      liquidityUsd: dexData.liquidity,
      dexId: dexData.dexId,
    });

    const ageMinutes = phaseResult.ageMinutes;

    // Volume surge ratio
    const volume5m = dexData.volume.m5;
    const volume1h = dexData.volume.h1;
    let volumeSurgeRatio: number | null = null;
    if (volume5m !== null && volume1h !== null && volume1h > 0) {
      const avg5mFromHour = volume1h / 12;
      volumeSurgeRatio = avg5mFromHour > 0 ? volume5m / avg5mFromHour : null;
    }

    // Buy/sell ratios
    const buySellRatio5m = dexData.txns.m5
      ? (dexData.txns.m5.sells > 0 ? dexData.txns.m5.buys / dexData.txns.m5.sells : (dexData.txns.m5.buys > 0 ? 10 : 1))
      : null;
    const buySellRatio1h = dexData.txns.h1
      ? (dexData.txns.h1.sells > 0 ? dexData.txns.h1.buys / dexData.txns.h1.sells : (dexData.txns.h1.buys > 0 ? 10 : 1))
      : null;

    const metrics: MomentumMetrics = {
      volume_5m: volume5m,
      volume_1h: volume1h,
      volume_6h: dexData.volume.h6,
      volume_24h: dexData.volume.h24,
      volume_surge_ratio: volumeSurgeRatio,
      buys_5m: dexData.txns.m5?.buys ?? null,
      sells_5m: dexData.txns.m5?.sells ?? null,
      buys_1h: dexData.txns.h1?.buys ?? null,
      sells_1h: dexData.txns.h1?.sells ?? null,
      buy_sell_ratio_5m: buySellRatio5m,
      buy_sell_ratio_1h: buySellRatio1h,
      price_usd: dexData.price,
      price_change_5m: dexData.priceChange.m5,
      price_change_1h: dexData.priceChange.h1,
      price_change_6h: dexData.priceChange.h6,
      price_change_24h: dexData.priceChange.h24,
      price_trend: determinePriceTrend(dexData.priceChange.m5),
      age_minutes: ageMinutes,
      market_cap: dexData.marketCap,
      liquidity_usd: dexData.liquidity,
      is_fresh: ageMinutes !== null && ageMinutes <= 60,
      txns_5m: dexData.txns.m5 ? dexData.txns.m5.buys + dexData.txns.m5.sells : null,
      txns_1h: dexData.txns.h1 ? dexData.txns.h1.buys + dexData.txns.h1.sells : null,
    };

    // Phase-weighted scoring
    const { score, signals, recommendation, action } = calculateMomentumScore(metrics, phaseResult.phase);

    const analysis: MomentumAnalysis = {
      momentum_score: Math.round(score),
      recommendation,
      action,
      phase: phaseResult.phase,
      phase_label: phaseResult.label,
      metrics,
      signals,
      analyzed_at: new Date().toISOString(),
    };

    console.log(`[momentum] ${tokenMint}: Phase=${phaseResult.phase}, Score=${analysis.momentum_score}, ${recommendation} -> ${action}`);

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[momentum] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
