import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MomentumMetrics {
  // Volume Analysis
  volume_5m: number | null;
  volume_1h: number | null;
  volume_6h: number | null;
  volume_24h: number | null;
  volume_surge_ratio: number | null;  // 5m volume vs (1h/12) average
  
  // Buy/Sell Pressure (transaction counts)
  buys_5m: number | null;
  sells_5m: number | null;
  buys_1h: number | null;
  sells_1h: number | null;
  buy_sell_ratio_5m: number | null;
  buy_sell_ratio_1h: number | null;
  
  // Price Momentum
  price_usd: number | null;
  price_change_5m: number | null;
  price_change_1h: number | null;
  price_change_6h: number | null;
  price_change_24h: number | null;
  price_trend: 'surging' | 'rising' | 'stable' | 'falling' | 'crashing' | null;
  
  // Token Info
  age_minutes: number | null;
  market_cap: number | null;
  liquidity_usd: number | null;
  is_fresh: boolean;  // Under 60 minutes
  
  // Trading Activity
  txns_5m: number | null;
  txns_1h: number | null;
}

interface MomentumSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  signal: string;
  weight: number;  // Contribution to score
}

interface MomentumAnalysis {
  momentum_score: number;  // 0-100
  recommendation: 'SURGE' | 'RISING' | 'FLAT' | 'FALLING';
  action: 'BUY_NOW' | 'WATCH' | 'SKIP';
  metrics: MomentumMetrics;
  signals: MomentumSignal[];
  analyzed_at: string;
}

// Fetch DexScreener data with detailed metrics
async function fetchDexScreenerMetrics(tokenMint: string): Promise<{
  price: number | null;
  marketCap: number | null;
  liquidity: number | null;
  pairCreatedAt: number | null;
  priceChange: {
    m5: number | null;
    h1: number | null;
    h6: number | null;
    h24: number | null;
  };
  volume: {
    m5: number | null;
    h1: number | null;
    h6: number | null;
    h24: number | null;
  };
  txns: {
    m5: { buys: number; sells: number } | null;
    h1: { buys: number; sells: number } | null;
    h6: { buys: number; sells: number } | null;
    h24: { buys: number; sells: number } | null;
  };
}> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (!response.ok) {
      console.error(`DexScreener error: ${response.status}`);
      return {
        price: null, marketCap: null, liquidity: null, pairCreatedAt: null,
        priceChange: { m5: null, h1: null, h6: null, h24: null },
        volume: { m5: null, h1: null, h6: null, h24: null },
        txns: { m5: null, h1: null, h6: null, h24: null }
      };
    }
    
    const data = await response.json();
    const pair = data.pairs?.[0];
    
    if (!pair) {
      console.log(`[momentum] No pair found for ${tokenMint}`);
      return {
        price: null, marketCap: null, liquidity: null, pairCreatedAt: null,
        priceChange: { m5: null, h1: null, h6: null, h24: null },
        volume: { m5: null, h1: null, h6: null, h24: null },
        txns: { m5: null, h1: null, h6: null, h24: null }
      };
    }
    
    return {
      price: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
      marketCap: pair.marketCap || null,
      liquidity: pair.liquidity?.usd || null,
      pairCreatedAt: pair.pairCreatedAt || null,
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
      }
    };
  } catch (error) {
    console.error('[momentum] DexScreener fetch error:', error);
    return {
      price: null, marketCap: null, liquidity: null, pairCreatedAt: null,
      priceChange: { m5: null, h1: null, h6: null, h24: null },
      volume: { m5: null, h1: null, h6: null, h24: null },
      txns: { m5: null, h1: null, h6: null, h24: null }
    };
  }
}

// Calculate momentum score based on weighted factors
function calculateMomentumScore(metrics: MomentumMetrics): {
  score: number;
  signals: MomentumSignal[];
  recommendation: 'SURGE' | 'RISING' | 'FLAT' | 'FALLING';
  action: 'BUY_NOW' | 'WATCH' | 'SKIP';
} {
  const signals: MomentumSignal[] = [];
  let totalScore = 50; // Start at neutral
  
  // ========== Volume Surge (30% weight) ==========
  if (metrics.volume_surge_ratio !== null) {
    if (metrics.volume_surge_ratio >= 4) {
      const weight = Math.min(30, 20 + (metrics.volume_surge_ratio - 4) * 2);
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Volume surge ${metrics.volume_surge_ratio.toFixed(1)}x above average`, weight });
    } else if (metrics.volume_surge_ratio >= 2) {
      const weight = 10 + (metrics.volume_surge_ratio - 2) * 5;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Volume elevated ${metrics.volume_surge_ratio.toFixed(1)}x`, weight });
    } else if (metrics.volume_surge_ratio < 0.5) {
      const weight = -15;
      totalScore += weight;
      signals.push({ type: 'bearish', signal: 'Low volume activity', weight });
    }
  }
  
  // ========== Buy/Sell Ratio 5m (25% weight) ==========
  if (metrics.buy_sell_ratio_5m !== null) {
    if (metrics.buy_sell_ratio_5m >= 2) {
      const weight = Math.min(25, 15 + (metrics.buy_sell_ratio_5m - 2) * 5);
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Strong buying pressure (${metrics.buy_sell_ratio_5m.toFixed(2)}x buys vs sells)`, weight });
    } else if (metrics.buy_sell_ratio_5m >= 1.2) {
      const weight = 8;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `More buyers than sellers (${metrics.buy_sell_ratio_5m.toFixed(2)}x)`, weight });
    } else if (metrics.buy_sell_ratio_5m < 0.5) {
      const weight = -20;
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `Heavy selling pressure (${metrics.buy_sell_ratio_5m.toFixed(2)}x buys vs sells)`, weight });
    } else if (metrics.buy_sell_ratio_5m < 0.8) {
      const weight = -10;
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `More sells than buys (${metrics.buy_sell_ratio_5m.toFixed(2)}x)`, weight });
    }
  }
  
  // ========== Price Change 5m (25% weight) ==========
  if (metrics.price_change_5m !== null) {
    if (metrics.price_change_5m >= 10) {
      const weight = Math.min(25, 15 + (metrics.price_change_5m - 10) * 0.5);
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Price surging +${metrics.price_change_5m.toFixed(1)}% in 5m`, weight });
    } else if (metrics.price_change_5m >= 3) {
      const weight = 8 + (metrics.price_change_5m - 3) * 1;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Price rising +${metrics.price_change_5m.toFixed(1)}% in 5m`, weight });
    } else if (metrics.price_change_5m <= -10) {
      const weight = -25;
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `Price dumping ${metrics.price_change_5m.toFixed(1)}% in 5m`, weight });
    } else if (metrics.price_change_5m <= -5) {
      const weight = -15;
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `Price falling ${metrics.price_change_5m.toFixed(1)}% in 5m`, weight });
    }
  }
  
  // ========== Token Freshness (10% weight) ==========
  if (metrics.age_minutes !== null) {
    if (metrics.age_minutes <= 15) {
      const weight = 10;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Very fresh token (${metrics.age_minutes}m old)`, weight });
    } else if (metrics.age_minutes <= 60) {
      const weight = 5;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Fresh token (${metrics.age_minutes}m old)`, weight });
    } else if (metrics.age_minutes >= 1440) { // Over 24 hours
      const weight = -5;
      totalScore += weight;
      signals.push({ type: 'neutral', signal: `Older token (${Math.floor(metrics.age_minutes / 60)}h old)`, weight });
    }
  }
  
  // ========== Price Change 1h (10% weight) ==========
  if (metrics.price_change_1h !== null) {
    if (metrics.price_change_1h >= 50) {
      const weight = 10;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Strong 1h momentum +${metrics.price_change_1h.toFixed(1)}%`, weight });
    } else if (metrics.price_change_1h >= 20) {
      const weight = 5;
      totalScore += weight;
      signals.push({ type: 'bullish', signal: `Good 1h momentum +${metrics.price_change_1h.toFixed(1)}%`, weight });
    } else if (metrics.price_change_1h <= -30) {
      const weight = -10;
      totalScore += weight;
      signals.push({ type: 'bearish', signal: `Weak 1h trend ${metrics.price_change_1h.toFixed(1)}%`, weight });
    }
  }
  
  // ========== Transaction Activity ==========
  if (metrics.txns_5m !== null && metrics.txns_5m > 50) {
    const weight = 5;
    totalScore += weight;
    signals.push({ type: 'bullish', signal: `High activity (${metrics.txns_5m} txns in 5m)`, weight });
  } else if (metrics.txns_5m !== null && metrics.txns_5m < 5) {
    const weight = -10;
    totalScore += weight;
    signals.push({ type: 'bearish', signal: `Low activity (only ${metrics.txns_5m} txns in 5m)`, weight });
  }
  
  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, totalScore));
  
  // Determine recommendation
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

// Determine price trend from changes
function determinePriceTrend(priceChange5m: number | null, priceChange1h: number | null): MomentumMetrics['price_trend'] {
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
    
    // Fetch DexScreener data
    const dexData = await fetchDexScreenerMetrics(tokenMint);
    
    // Calculate age
    const ageMinutes = dexData.pairCreatedAt 
      ? Math.floor((Date.now() - dexData.pairCreatedAt) / 60000)
      : null;
    
    // Calculate volume surge ratio (5m volume vs 1h average per 5 minutes)
    const volume5m = dexData.volume.m5;
    const volume1h = dexData.volume.h1;
    let volumeSurgeRatio: number | null = null;
    if (volume5m !== null && volume1h !== null && volume1h > 0) {
      const avg5mFromHour = volume1h / 12;
      volumeSurgeRatio = avg5mFromHour > 0 ? volume5m / avg5mFromHour : null;
    }
    
    // Calculate buy/sell ratios
    const buySellRatio5m = dexData.txns.m5 
      ? (dexData.txns.m5.sells > 0 ? dexData.txns.m5.buys / dexData.txns.m5.sells : (dexData.txns.m5.buys > 0 ? 10 : 1))
      : null;
    const buySellRatio1h = dexData.txns.h1
      ? (dexData.txns.h1.sells > 0 ? dexData.txns.h1.buys / dexData.txns.h1.sells : (dexData.txns.h1.buys > 0 ? 10 : 1))
      : null;
    
    // Build metrics object
    const metrics: MomentumMetrics = {
      // Volume
      volume_5m: volume5m,
      volume_1h: volume1h,
      volume_6h: dexData.volume.h6,
      volume_24h: dexData.volume.h24,
      volume_surge_ratio: volumeSurgeRatio,
      
      // Buy/Sell
      buys_5m: dexData.txns.m5?.buys ?? null,
      sells_5m: dexData.txns.m5?.sells ?? null,
      buys_1h: dexData.txns.h1?.buys ?? null,
      sells_1h: dexData.txns.h1?.sells ?? null,
      buy_sell_ratio_5m: buySellRatio5m,
      buy_sell_ratio_1h: buySellRatio1h,
      
      // Price
      price_usd: dexData.price,
      price_change_5m: dexData.priceChange.m5,
      price_change_1h: dexData.priceChange.h1,
      price_change_6h: dexData.priceChange.h6,
      price_change_24h: dexData.priceChange.h24,
      price_trend: determinePriceTrend(dexData.priceChange.m5, dexData.priceChange.h1),
      
      // Token Info
      age_minutes: ageMinutes,
      market_cap: dexData.marketCap,
      liquidity_usd: dexData.liquidity,
      is_fresh: ageMinutes !== null && ageMinutes <= 60,
      
      // Activity
      txns_5m: dexData.txns.m5 ? dexData.txns.m5.buys + dexData.txns.m5.sells : null,
      txns_1h: dexData.txns.h1 ? dexData.txns.h1.buys + dexData.txns.h1.sells : null,
    };
    
    // Calculate momentum score
    const { score, signals, recommendation, action } = calculateMomentumScore(metrics);
    
    const analysis: MomentumAnalysis = {
      momentum_score: Math.round(score),
      recommendation,
      action,
      metrics,
      signals,
      analyzed_at: new Date().toISOString()
    };
    
    console.log(`[momentum] ${tokenMint}: Score ${analysis.momentum_score}, ${recommendation} -> ${action}`);
    console.log(`[momentum] Signals: ${signals.map(s => `${s.type}: ${s.signal}`).join(', ')}`);
    
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
