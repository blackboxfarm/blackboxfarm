import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenData {
  price: number;
  symbol: string | null;
  athPrice?: number;
  athAt?: string;
}

interface ChannelConfig {
  id: string;
  close_enough_threshold_pct: number | null;
  peak_trailing_stop_enabled: boolean | null;
  peak_trailing_stop_threshold: number | null;
  peak_trailing_stop_pct: number | null;
}

interface FantasyPosition {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  entry_price_usd: number;
  entry_amount_usd: number;
  token_amount: number | null;
  target_sell_multiplier: number | null;
  stop_loss_pct: number | null;
  stop_loss_enabled: boolean | null;
  is_active: boolean;
  status: string;
  peak_price_usd: number | null;
  peak_price_at: string | null;
  peak_multiplier: number | null;
  sold_price_usd: number | null;
  trail_tracking_enabled: boolean | null;
  trail_peak_price_usd: number | null;
  trail_low_price_usd: number | null;
  created_at: string;
  ath_price_usd: number | null;
  ath_at: string | null;
  ath_multiplier: number | null;
  ath_source: string | null;
  channel_config_id: string | null;
  near_miss_logged: boolean | null;
  peak_trailing_stop_enabled: boolean | null;
  peak_trailing_stop_pct: number | null;
}

// Fetch token prices and symbols in batch from Jupiter + DexScreener
async function fetchTokenData(tokenMints: string[]): Promise<Record<string, TokenData>> {
  const tokenData: Record<string, TokenData> = {};
  
  if (tokenMints.length === 0) return tokenData;
  
  try {
    // Jupiter supports batching up to 100 tokens
    const batchSize = 100;
    for (let i = 0; i < tokenMints.length; i += batchSize) {
      const batch = tokenMints.slice(i, i + batchSize);
      const ids = batch.join(',');
      
      const response = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
      const data = await response.json();
      
      if (data.data) {
        for (const mint of batch) {
          if (data.data[mint]?.price) {
            tokenData[mint] = {
              price: parseFloat(data.data[mint].price),
              symbol: null
            };
          }
        }
      }
    }
  } catch (error) {
    console.error('[telegram-fantasy-price-monitor] Error fetching Jupiter prices:', error);
  }
  
  // Use DexScreener for missing prices AND to get symbols
  const mintsNeedingData = tokenMints.filter(m => !tokenData[m] || !tokenData[m].symbol);
  for (const mint of mintsNeedingData) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await response.json();
      const pair = data.pairs?.[0];
      if (pair) {
        tokenData[mint] = {
          price: tokenData[mint]?.price || parseFloat(pair.priceUsd || '0'),
          symbol: pair.baseToken?.symbol || null
        };
      }
    } catch (error) {
      console.error(`[telegram-fantasy-price-monitor] Error fetching DexScreener data for ${mint}:`, error);
    }
  }
  
  return tokenData;
}

// Fetch ATH data from GeckoTerminal OHLCV - ONLY after position creation date
async function fetchATHData(
  tokenMint: string, 
  entryPriceUsd: number, 
  positionCreatedAt: string
): Promise<{ athPrice: number; athAt: string; athMultiplier: number; athSource: 'observed' | 'historical' } | null> {
  try {
    const positionDate = new Date(positionCreatedAt);
    
    // First find pool on GeckoTerminal
    const searchRes = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${tokenMint}&network=solana`);
    const searchData = await searchRes.json();
    const pool = searchData?.data?.[0];
    
    if (!pool) {
      console.log(`[telegram-fantasy-price-monitor] No pool found for ${tokenMint} on GeckoTerminal`);
      return null;
    }
    
    const poolAddress = pool.attributes?.address || pool.id?.split('_')?.[1];
    if (!poolAddress) return null;
    
    // Try hourly first for more precision
    const hourlyRes = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/hour?limit=168`
    );
    const hourlyData = await hourlyRes.json();
    
    let candles = hourlyData?.data?.attributes?.ohlcv_list || [];
    
    // If no hourly data, try daily
    if (candles.length === 0) {
      const ohlcvRes = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/day?limit=30`
      );
      const ohlcvData = await ohlcvRes.json();
      candles = ohlcvData?.data?.attributes?.ohlcv_list || [];
    }
    
    if (candles.length === 0) return null;
    
    let athPrice = 0;
    let athTimestamp = 0;
    let foundAfterPosition = false;
    
    for (const candle of candles) {
      const candleTime = new Date(candle[0] * 1000);
      const high = parseFloat(candle[2]); // High price
      
      // ONLY consider candles AFTER position creation
      if (candleTime >= positionDate && high > athPrice) {
        athPrice = high;
        athTimestamp = candle[0];
        foundAfterPosition = true;
      }
    }
    
    // If no candles after position date, this is historical ATH (not useful)
    if (!foundAfterPosition || athPrice <= 0) {
      console.log(`[telegram-fantasy-price-monitor] No ATH found after position creation for ${tokenMint}`);
      return null;
    }
    
    return {
      athPrice,
      athAt: new Date(athTimestamp * 1000).toISOString(),
      athMultiplier: entryPriceUsd > 0 ? athPrice / entryPriceUsd : 0,
      athSource: 'observed' // We only return data observed after position creation
    };
  } catch (error) {
    console.error(`[telegram-fantasy-price-monitor] Error fetching ATH for ${tokenMint}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[telegram-fantasy-price-monitor] Starting price monitor scan...');

    // Calculate 12-hour cutoff
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    console.log(`[telegram-fantasy-price-monitor] 12-hour cutoff: ${twelveHoursAgo}`);

    // Fetch channel configs for close-enough and trailing stop settings
    const { data: channelConfigs } = await supabase
      .from('telegram_channel_config')
      .select('id, close_enough_threshold_pct, peak_trailing_stop_enabled, peak_trailing_stop_threshold, peak_trailing_stop_pct');
    
    const configMap: Record<string, ChannelConfig> = {};
    for (const config of (channelConfigs || [])) {
      configMap[config.id] = config;
    }

    // Get ALL ACTIVE open fantasy positions (we'll filter intelligently)
    const { data: allPositions, error: fetchError } = await supabase
      .from('telegram_fantasy_positions')
      .select('*')
      .eq('status', 'open')
      .eq('is_active', true);

    // Also fetch sold positions that have trail tracking enabled (within 12 hours only)
    const { data: soldPositions, error: soldFetchError } = await supabase
      .from('telegram_fantasy_positions')
      .select('*')
      .eq('status', 'sold')
      .eq('trail_tracking_enabled', true)
      .gt('created_at', twelveHoursAgo);

    if (fetchError) {
      console.error('[telegram-fantasy-price-monitor] Error fetching positions:', fetchError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch fantasy positions'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    // Smart pruning:
    // - Under 12 hours: always monitor (dipping is OK)
    // - Over 12 hours: only monitor if showing positive momentum towards target
    const now = new Date();
    const positions = (allPositions || []).filter((p: FantasyPosition) => {
      const createdAt = new Date(p.created_at);
      const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      
      if (ageHours <= 12) {
        return true; // Under 12 hours - always monitor
      }
      
      // Over 12 hours - check if price is moving towards target
      const currentPrice = p.current_price_usd || 0;
      const entryPrice = p.entry_price_usd || 0;
      
      if (currentPrice <= 0 || entryPrice <= 0) {
        console.log(`[telegram-fantasy-price-monitor] Pruning ${p.token_symbol || p.token_mint.slice(0, 8)}: no price data, age ${ageHours.toFixed(1)}h`);
        return false; // No price data - don't waste API calls
      }
      
      const currentMultiplier = currentPrice / entryPrice;
      
      // Keep if price is at least 0.5x (not totally crashed) AND showing some life
      if (currentMultiplier >= 0.5) {
        return true; // Still has potential
      }
      
      console.log(`[telegram-fantasy-price-monitor] Pruning ${p.token_symbol || p.token_mint.slice(0, 8)}: ${currentMultiplier.toFixed(2)}x at ${ageHours.toFixed(1)}h old`);
      return false;
    });

    const allOpenPositions = positions;
    const allSoldPositions = soldPositions || [];
    const prunedCount = (allPositions?.length || 0) - allOpenPositions.length;
    
    if (allOpenPositions.length === 0 && allSoldPositions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No positions to monitor after pruning',
        updated: 0,
        autoSold: 0,
        trailsUpdated: 0,
        pruned: prunedCount
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[telegram-fantasy-price-monitor] Monitoring ${allOpenPositions.length} positions (pruned ${prunedCount} old/crashed), ${allSoldPositions.length} sold with trail tracking`);

    // Get unique token mints from both open and sold positions
    const allMints = [
      ...allOpenPositions.map(p => p.token_mint),
      ...allSoldPositions.map(p => p.token_mint)
    ];
    const tokenMints = [...new Set(allMints)];
    
    // Fetch current prices and symbols
    const tokenData = await fetchTokenData(tokenMints);
    console.log(`[telegram-fantasy-price-monitor] Got data for ${Object.keys(tokenData).length} tokens`);

    // Track results
    let updatedCount = 0;
    let autoSoldCount = 0;
    let trailsUpdated = 0;
    let athUpdated = 0;
    let nearMissCount = 0;
    let closeEnoughSells = 0;
    let trailingStopSells = 0;
    const autoSells: any[] = [];
    const updates: any[] = [];
    const trailUpdates: any[] = [];
    const athUpdates: any[] = [];
    const nearMisses: any[] = [];

    // Process open positions
    for (const position of allOpenPositions as FantasyPosition[]) {
      const data = tokenData[position.token_mint];
      
      if (!data?.price) {
        console.log(`[telegram-fantasy-price-monitor] No price data for ${position.token_mint}`);
        continue;
      }

      const entryPrice = position.entry_price_usd;
      const entryAmount = position.entry_amount_usd;
      const tokenAmount = position.token_amount || (entryPrice > 0 ? entryAmount / entryPrice : 0);
      const currentValue = tokenAmount * data.price;
      const currentMultiplier = entryPrice > 0 ? data.price / entryPrice : 0;
      const targetMultiplier = position.target_sell_multiplier || 2.0;
      const stopLossPct = position.stop_loss_pct || 50;
      const stopLossEnabled = position.stop_loss_enabled !== false;
      
      // Get channel config for close-enough and trailing stop settings
      const channelConfig = position.channel_config_id ? configMap[position.channel_config_id] : null;
      const closeEnoughThresholdPct = channelConfig?.close_enough_threshold_pct || 95;
      const closeEnoughMultiplier = targetMultiplier * (closeEnoughThresholdPct / 100);
      
      // Peak trailing stop config (from channel or position)
      const peakTrailingEnabled = position.peak_trailing_stop_enabled || channelConfig?.peak_trailing_stop_enabled || false;
      const peakTrailingThreshold = channelConfig?.peak_trailing_stop_threshold || 1.5;
      const peakTrailingStopPct = position.peak_trailing_stop_pct || channelConfig?.peak_trailing_stop_pct || 20;

      // Calculate PnL
      const pnlUsd = currentValue - entryAmount;
      const pnlPercent = entryAmount > 0 ? ((currentValue - entryAmount) / entryAmount) * 100 : 0;

      // Check if target hit - AUTO SELL
      if (currentMultiplier >= targetMultiplier) {
        console.log(`[telegram-fantasy-price-monitor] TARGET HIT for ${position.token_symbol || position.token_mint}: ${currentMultiplier.toFixed(2)}x >= ${targetMultiplier}x`);
        
        const { error: sellError } = await supabase
          .from('telegram_fantasy_positions')
          .update({
            status: 'sold',
            sold_at: new Date().toISOString(),
            sold_price_usd: data.price,
            current_price_usd: data.price,
            realized_pnl_usd: pnlUsd,
            realized_pnl_percent: pnlPercent,
            is_active: false,
            auto_sell_triggered: true,
            token_symbol: data.symbol || position.token_symbol
          })
          .eq('id', position.id);

        if (!sellError) {
          autoSoldCount++;
          autoSells.push({
            id: position.id,
            token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
            reason: 'target_hit',
            multiplier: currentMultiplier.toFixed(2),
            targetMultiplier: targetMultiplier,
            pnlUsd: pnlUsd.toFixed(2),
            pnlPercent: pnlPercent.toFixed(2)
          });
        }
        continue;
      }

      // Check "Close Enough" - sell if within threshold % of target (e.g., 95%)
      if (currentMultiplier >= closeEnoughMultiplier && closeEnoughThresholdPct < 100) {
        console.log(`[telegram-fantasy-price-monitor] CLOSE ENOUGH for ${position.token_symbol || position.token_mint}: ${currentMultiplier.toFixed(2)}x >= ${closeEnoughMultiplier.toFixed(2)}x (${closeEnoughThresholdPct}% of ${targetMultiplier}x)`);
        
        const { error: sellError } = await supabase
          .from('telegram_fantasy_positions')
          .update({
            status: 'sold',
            sold_at: new Date().toISOString(),
            sold_price_usd: data.price,
            current_price_usd: data.price,
            realized_pnl_usd: pnlUsd,
            realized_pnl_percent: pnlPercent,
            is_active: false,
            auto_sell_triggered: true,
            close_enough_triggered: true,
            token_symbol: data.symbol || position.token_symbol
          })
          .eq('id', position.id);

        if (!sellError) {
          autoSoldCount++;
          closeEnoughSells++;
          autoSells.push({
            id: position.id,
            token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
            reason: 'close_enough',
            multiplier: currentMultiplier.toFixed(2),
            targetMultiplier: targetMultiplier,
            closeEnoughThreshold: closeEnoughThresholdPct,
            pnlUsd: pnlUsd.toFixed(2),
            pnlPercent: pnlPercent.toFixed(2)
          });
        }
        continue;
      }

      // Check Peak Trailing Stop - if enabled and peak was above threshold, check for drop
      const peakMultiplier = position.peak_multiplier || 0;
      if (peakTrailingEnabled && peakMultiplier >= peakTrailingThreshold) {
        const dropFromPeakPct = ((peakMultiplier - currentMultiplier) / peakMultiplier) * 100;
        
        if (dropFromPeakPct >= peakTrailingStopPct) {
          console.log(`[telegram-fantasy-price-monitor] PEAK TRAILING STOP for ${position.token_symbol || position.token_mint}: dropped ${dropFromPeakPct.toFixed(1)}% from peak ${peakMultiplier.toFixed(2)}x`);
          
          const { error: sellError } = await supabase
            .from('telegram_fantasy_positions')
            .update({
              status: 'sold',
              sold_at: new Date().toISOString(),
              sold_price_usd: data.price,
              current_price_usd: data.price,
              realized_pnl_usd: pnlUsd,
              realized_pnl_percent: pnlPercent,
              is_active: false,
              auto_sell_triggered: true,
              peak_trailing_stop_triggered: true,
              token_symbol: data.symbol || position.token_symbol
            })
            .eq('id', position.id);

          if (!sellError) {
            autoSoldCount++;
            trailingStopSells++;
            autoSells.push({
              id: position.id,
              token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
              reason: 'peak_trailing_stop',
              multiplier: currentMultiplier.toFixed(2),
              peakMultiplier: peakMultiplier.toFixed(2),
              dropFromPeakPct: dropFromPeakPct.toFixed(1),
              pnlUsd: pnlUsd.toFixed(2),
              pnlPercent: pnlPercent.toFixed(2)
            });
          }
          continue;
        }
      }

      // Check stop-loss - AUTO SELL
      if (stopLossEnabled && pnlPercent <= -stopLossPct) {
        console.log(`[telegram-fantasy-price-monitor] STOP LOSS for ${position.token_symbol || position.token_mint}: ${pnlPercent.toFixed(2)}% <= -${stopLossPct}%`);
        
        const { error: sellError } = await supabase
          .from('telegram_fantasy_positions')
          .update({
            status: 'sold',
            sold_at: new Date().toISOString(),
            sold_price_usd: data.price,
            current_price_usd: data.price,
            realized_pnl_usd: pnlUsd,
            realized_pnl_percent: pnlPercent,
            is_active: false,
            auto_sell_triggered: true,
            stop_loss_triggered: true,
            token_symbol: data.symbol || position.token_symbol
          })
          .eq('id', position.id);

        if (!sellError) {
          autoSoldCount++;
          autoSells.push({
            id: position.id,
            token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
            reason: 'stop_loss',
            lossPercent: pnlPercent.toFixed(2),
            stopLossPct: stopLossPct,
            pnlUsd: pnlUsd.toFixed(2)
          });
        }
        continue;
      }

      // Check for near-miss (90%+ of target but not yet hit) - LOG IT
      const nearMissThresholdPct = 90;
      const nearMissMultiplier = targetMultiplier * (nearMissThresholdPct / 100);
      if (currentMultiplier >= nearMissMultiplier && !position.near_miss_logged) {
        console.log(`[telegram-fantasy-price-monitor] NEAR MISS for ${position.token_symbol || position.token_mint}: ${currentMultiplier.toFixed(2)}x (${((currentMultiplier / targetMultiplier) * 100).toFixed(1)}% of ${targetMultiplier}x target)`);
        nearMissCount++;
        nearMisses.push({
          id: position.id,
          token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
          currentMultiplier: currentMultiplier.toFixed(2),
          targetMultiplier: targetMultiplier,
          percentOfTarget: ((currentMultiplier / targetMultiplier) * 100).toFixed(1)
        });
      }

      // Regular update - update prices AND track peaks
      const updateObj: Record<string, any> = {
        current_price_usd: data.price,
        unrealized_pnl_usd: pnlUsd,
        unrealized_pnl_percent: pnlPercent
      };
      
      // Log near miss
      if (currentMultiplier >= nearMissMultiplier && !position.near_miss_logged) {
        updateObj.near_miss_logged = true;
        updateObj.near_miss_multiplier = currentMultiplier;
        updateObj.near_miss_at = new Date().toISOString();
      }
      
      if (data.symbol && !position.token_symbol) {
        updateObj.token_symbol = data.symbol;
      }

      // Track peak price - update if current price is higher than recorded peak
      const currentPeakPrice = position.peak_price_usd || 0;
      if (data.price > currentPeakPrice) {
        updateObj.peak_price_usd = data.price;
        updateObj.peak_price_at = new Date().toISOString();
        updateObj.peak_multiplier = currentMultiplier;
        console.log(`[telegram-fantasy-price-monitor] New peak for ${position.token_symbol || position.token_mint}: ${data.price} (${currentMultiplier.toFixed(2)}x)`);
      }

      // Only fetch ATH if not already set (reduces API calls significantly)
      // Also mark ATH source as 'observed' since we only fetch after position creation
      if (!position.ath_price_usd) {
        const athData = await fetchATHData(position.token_mint, entryPrice, position.created_at);
        if (athData) {
          updateObj.ath_price_usd = athData.athPrice;
          updateObj.ath_at = athData.athAt;
          updateObj.ath_multiplier = athData.athMultiplier;
          updateObj.ath_source = athData.athSource;
          athUpdated++;
          athUpdates.push({
            id: position.id,
            token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
            athPrice: athData.athPrice,
            athMultiplier: athData.athMultiplier.toFixed(2),
            athAt: athData.athAt,
            athSource: athData.athSource
          });
          console.log(`[telegram-fantasy-price-monitor] ATH (observed) for ${position.token_symbol || position.token_mint}: $${athData.athPrice} (${athData.athMultiplier.toFixed(2)}x)`);
        }
      }

      const { error: updateError } = await supabase
        .from('telegram_fantasy_positions')
        .update(updateObj)
        .eq('id', position.id);

      if (!updateError) {
        updatedCount++;
        updates.push({
          id: position.id,
          token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
          currentPrice: data.price,
          multiplier: currentMultiplier.toFixed(2),
          targetMultiplier: targetMultiplier,
          progressToTarget: ((currentMultiplier / targetMultiplier) * 100).toFixed(1),
          pnlUsd: pnlUsd.toFixed(2),
          pnlPercent: pnlPercent.toFixed(2),
          peakMultiplier: Math.max(currentMultiplier, position.peak_multiplier || 0).toFixed(2)
        });
      }
    }

    // Process sold positions for trail tracking
    for (const position of allSoldPositions as FantasyPosition[]) {
      const data = tokenData[position.token_mint];
      
      if (!data?.price) continue;
      
      const soldPrice = position.sold_price_usd || position.entry_price_usd;
      const trailMultiplier = soldPrice > 0 ? data.price / soldPrice : 0;
      
      const trailUpdateObj: Record<string, any> = {
        trail_current_price_usd: data.price,
        trail_last_updated_at: new Date().toISOString()
      };
      
      // Track peak after sale
      const currentTrailPeak = position.trail_peak_price_usd || soldPrice;
      if (data.price > currentTrailPeak) {
        trailUpdateObj.trail_peak_price_usd = data.price;
        trailUpdateObj.trail_peak_multiplier = trailMultiplier;
        trailUpdateObj.trail_peak_at = new Date().toISOString();
        console.log(`[telegram-fantasy-price-monitor] New trail peak for ${position.token_symbol || position.token_mint}: ${data.price} (${trailMultiplier.toFixed(2)}x since sell)`);
      }
      
      // Track low after sale
      const currentTrailLow = position.trail_low_price_usd || data.price;
      if (data.price < currentTrailLow) {
        trailUpdateObj.trail_low_price_usd = data.price;
        trailUpdateObj.trail_low_at = new Date().toISOString();
      }
      
      const { error: trailError } = await supabase
        .from('telegram_fantasy_positions')
        .update(trailUpdateObj)
        .eq('id', position.id);
      
      if (!trailError) {
        trailsUpdated++;
        trailUpdates.push({
          id: position.id,
          token: position.token_symbol || position.token_mint.slice(0, 8),
          currentPrice: data.price,
          soldPrice: soldPrice,
          trailMultiplier: trailMultiplier.toFixed(2),
          trailPeak: Math.max(data.price, currentTrailPeak).toFixed(8)
        });
      }
    }

    console.log(`[telegram-fantasy-price-monitor] Updated ${updatedCount} open positions, auto-sold ${autoSoldCount} (close-enough: ${closeEnoughSells}, trailing-stop: ${trailingStopSells}), trails updated ${trailsUpdated}, ATH updated ${athUpdated}, near misses ${nearMissCount}, pruned ${prunedCount}`);

    return new Response(JSON.stringify({
      success: true,
      updated: updatedCount,
      autoSold: autoSoldCount,
      closeEnoughSells,
      trailingStopSells,
      trailsUpdated: trailsUpdated,
      athUpdated: athUpdated,
      nearMissCount,
      pruned: prunedCount,
      totalOpenPositions: allOpenPositions.length,
      totalSoldPositions: allSoldPositions.length,
      updates,
      autoSells,
      trailUpdates,
      athUpdates,
      nearMisses,
      timestamp: new Date().toISOString()
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[telegram-fantasy-price-monitor] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
