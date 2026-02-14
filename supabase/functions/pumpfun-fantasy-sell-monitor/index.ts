import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('pumpfun-fantasy-sell-monitor');

/**
 * PUMPFUN FANTASY SELL MONITOR
 * 
 * Purpose: Monitor fantasy positions, simulate 90% sell at 1.5x target, track moonbags
 * Schedule: Every minute via cron
 * 
 * Logic:
 * 1. Fetch all open and moonbag fantasy positions
 * 2. Get current prices in batch
 * 3. For 'open' positions: check if target hit (1.5x) -> simulate 90% sell -> create moonbag
 * 4. For 'moonbag' positions: monitor for exit conditions (LP removal, 70% drawdown)
 * 5. Update all P&L calculations
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

interface MonitorConfig {
  fantasy_target_multiplier: number;
  fantasy_sell_percentage: number;
  fantasy_moonbag_percentage: number;
  fantasy_moonbag_drawdown_limit: number;
  fantasy_moonbag_volume_check: boolean;
}

interface MonitorStats {
  positionsChecked: number;
  pricesUpdated: number;
  targetsSold: number;
  moonbagsCreated: number;
  moonbagsClosed: number;
  lpRemovalDetected: number;
  drawdownExits: number;
  learningsCreated: number;
  errors: string[];
  durationMs: number;
}

// Outcome types for AI learning
type TradeOutcome = 'success' | 'partial_win' | 'loss' | 'rug' | 'slow_bleed';

interface OutcomeClassification {
  outcome: TradeOutcome;
  notes: string;
  correctSignals: string[];
  wrongSignals: string[];
  shouldHaveAvoided: boolean;
}

// Get config
async function getConfig(supabase: any): Promise<MonitorConfig> {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('fantasy_target_multiplier, fantasy_sell_percentage, fantasy_moonbag_percentage, fantasy_moonbag_drawdown_limit, fantasy_moonbag_volume_check')
    .limit(1)
    .single();

  return {
    fantasy_target_multiplier: data?.fantasy_target_multiplier ?? 1.5,
    fantasy_sell_percentage: data?.fantasy_sell_percentage ?? 90,
    fantasy_moonbag_percentage: data?.fantasy_moonbag_percentage ?? 10,
    fantasy_moonbag_drawdown_limit: data?.fantasy_moonbag_drawdown_limit ?? 70,
    fantasy_moonbag_volume_check: data?.fantasy_moonbag_volume_check ?? true,
  };
}

// Get SOL price
async function getSolPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const data = await response.json();
    return data?.data?.['So11111111111111111111111111111111111111112']?.price || 200;
  } catch {
    return 200;
  }
}

// Batch fetch prices from multiple sources (watchlist, PumpFun, DexScreener, Jupiter)
async function batchFetchPrices(mints: string[], supabase: any): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  
  if (mints.length === 0) return priceMap;

  let watchlistCount = 0;
  let pumpfunCount = 0;
  let dexscreenerCount = 0;
  let jupiterCount = 0;

  // 1. FIRST: Get prices from pumpfun_watchlist (already being updated by enricher)
  try {
    const { data: watchlistPrices } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, price_usd')
      .in('token_mint', mints)
      .not('price_usd', 'is', null);

    if (watchlistPrices) {
      for (const wp of watchlistPrices) {
        if (wp.price_usd && wp.price_usd > 0) {
          priceMap.set(wp.token_mint, wp.price_usd);
          watchlistCount++;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching watchlist prices:', error);
  }

  // Find mints still missing prices
  let missingMints = mints.filter(m => !priceMap.has(m));
  
  if (missingMints.length === 0) {
    console.log(`📈 Prices: ${priceMap.size}/${mints.length} (watchlist: ${watchlistCount})`);
    return priceMap;
  }

  // 2. SECOND: Try PumpFun API for bonding curve tokens
  for (const mint of missingMints) {
    try {
      const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.usd_market_cap && data?.total_supply) {
          const priceUsd = data.usd_market_cap / (data.total_supply / 1e6);
          priceMap.set(mint, priceUsd);
          pumpfunCount++;
        }
      }
      await new Promise(r => setTimeout(r, 100)); // Rate limit
    } catch (e) {
      // Continue to next source
    }
  }

  // Find mints still missing
  missingMints = mints.filter(m => !priceMap.has(m));
  
  if (missingMints.length === 0) {
    console.log(`📈 Prices: ${priceMap.size}/${mints.length} (watchlist: ${watchlistCount}, pumpfun: ${pumpfunCount})`);
    return priceMap;
  }

  // 3. THIRD: Try DexScreener for graduated tokens
  for (const mint of missingMints) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      if (response.ok) {
        const data = await response.json();
        if (data?.pairs?.[0]?.priceUsd) {
          priceMap.set(mint, parseFloat(data.pairs[0].priceUsd));
          dexscreenerCount++;
        }
      }
      await new Promise(r => setTimeout(r, 100)); // Rate limit
    } catch (e) {
      // Continue
    }
  }

  // Find mints still missing
  missingMints = mints.filter(m => !priceMap.has(m));

  // 4. LAST: Jupiter API as final fallback (for graduated tokens on DEXes)
  if (missingMints.length > 0) {
    try {
      const batchSize = 100;
      for (let i = 0; i < missingMints.length; i += batchSize) {
        const batch = missingMints.slice(i, i + batchSize);
        const response = await fetch(`https://api.jup.ag/price/v2?ids=${batch.join(',')}`);
        const data = await response.json();
        
        for (const mint of batch) {
          if (data?.data?.[mint]?.price) {
            priceMap.set(mint, data.data[mint].price);
            jupiterCount++;
          }
        }
        
        if (i + batchSize < missingMints.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  console.log(`📈 Prices: ${priceMap.size}/${mints.length} (watchlist: ${watchlistCount}, pumpfun: ${pumpfunCount}, dex: ${dexscreenerCount}, jupiter: ${jupiterCount})`);
  
  // Log missing prices for debugging
  const stillMissing = mints.filter(m => !priceMap.has(m));
  if (stillMissing.length > 0) {
    console.log(`⚠️ Still missing prices for: ${stillMissing.join(', ')}`);
  }

  return priceMap;
}

// Check liquidity for moonbag positions
async function checkLiquidity(mint: string): Promise<{ liquidityUsd: number | null; lpRemoved: boolean }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const data = await response.json();
    const pair = data?.pairs?.[0];
    
    if (!pair) {
      // No pair found = likely LP removed
      return { liquidityUsd: null, lpRemoved: true };
    }

    const liquidityUsd = pair.liquidity?.usd || 0;
    
    // Consider LP removed if liquidity drops below $500
    const lpRemoved = liquidityUsd < 500;
    
    return { liquidityUsd, lpRemoved };
  } catch (error) {
    console.error(`Error checking liquidity for ${mint}:`, error);
    return { liquidityUsd: null, lpRemoved: false };
  }
}

// Classify trade outcome for AI learning
function classifyOutcome(
  position: any,
  exitReason: string,
  totalPnlPercent: number,
  peakMultiplier: number,
  timeSinceEntryMins: number,
  timeSincePeakMins: number
): OutcomeClassification {
  const correctSignals: string[] = [];
  const wrongSignals: string[] = [];
  let outcome: TradeOutcome;
  let notes = '';
  let shouldHaveAvoided = false;

  // Determine outcome based on exit conditions and P&L
  if (exitReason === 'lp_removed') {
    if (totalPnlPercent > 0) {
      outcome = 'partial_win';
      notes = `LP removed after hitting target. Got out with ${totalPnlPercent.toFixed(1)}% profit before rug.`;
      correctSignals.push('hit_target_before_rug');
    } else {
      outcome = 'rug';
      notes = `LP removed. Price peaked at ${peakMultiplier.toFixed(2)}x but rugged before we could exit.`;
      wrongSignals.push('did_not_hit_target');
      
      if (timeSinceEntryMins < 30) {
        wrongSignals.push('token_too_young');
        notes += ` Token was only ${timeSinceEntryMins}m old.`;
      }
    }
  } else if (exitReason === 'drawdown') {
    if (totalPnlPercent > 20) {
      outcome = 'success';
      notes = `Exited moonbag on drawdown with ${totalPnlPercent.toFixed(1)}% total profit.`;
      correctSignals.push('hit_target', 'moonbag_profit');
    } else if (totalPnlPercent > 0) {
      outcome = 'partial_win';
      notes = `Hit target but moonbag lost value. Total: ${totalPnlPercent.toFixed(1)}% profit.`;
      correctSignals.push('hit_target');
      wrongSignals.push('moonbag_lost_value');
    } else {
      outcome = 'loss';
      notes = `Never hit target, closed on drawdown at ${totalPnlPercent.toFixed(1)}%.`;
      wrongSignals.push('missed_target');
      
      if (peakMultiplier < 1.2) {
        outcome = 'slow_bleed';
        notes = `Slow bleed - never gained momentum. Peak was only ${peakMultiplier.toFixed(2)}x.`;
        wrongSignals.push('no_momentum');
        shouldHaveAvoided = true;
      }
    }
  } else {
    // General classification for other exit reasons
    if (totalPnlPercent > 20) {
      outcome = 'success';
      notes = `Successful trade with ${totalPnlPercent.toFixed(1)}% profit.`;
      correctSignals.push('profitable_trade');
    } else if (totalPnlPercent > 0) {
      outcome = 'partial_win';
      notes = `Small profit: ${totalPnlPercent.toFixed(1)}%.`;
    } else if (totalPnlPercent > -30) {
      outcome = 'loss';
      notes = `Loss: ${totalPnlPercent.toFixed(1)}%.`;
      wrongSignals.push('unprofitable_trade');
    } else {
      outcome = 'rug';
      notes = `Major loss: ${totalPnlPercent.toFixed(1)}%. Likely rug or major dump.`;
      wrongSignals.push('major_loss');
      shouldHaveAvoided = true;
    }
  }

  // Analyze entry conditions for signals
  if (position.entry_rugcheck_score) {
    if (position.entry_rugcheck_score > 5000 && (outcome === 'rug' || outcome === 'loss')) {
      wrongSignals.push('high_rugcheck_score_ignored');
      notes += ` High RugCheck score (${position.entry_rugcheck_score}) was a warning sign.`;
    } else if (position.entry_rugcheck_score < 3000 && (outcome === 'success' || outcome === 'partial_win')) {
      correctSignals.push('low_rugcheck_score');
    }
  }

  if (position.entry_holder_count) {
    if (position.entry_holder_count < 20 && (outcome === 'rug' || outcome === 'loss')) {
      wrongSignals.push('too_few_holders');
      shouldHaveAvoided = true;
    } else if (position.entry_holder_count >= 25 && position.entry_holder_count <= 50 && outcome === 'success') {
      correctSignals.push('ideal_holder_count');
    }
  }

  if (position.entry_market_cap_usd) {
    if (position.entry_market_cap_usd > 15000 && outcome === 'rug') {
      notes += ` Entry MC was high ($${position.entry_market_cap_usd.toFixed(0)}), may have entered too late.`;
      wrongSignals.push('entry_mc_too_high');
    } else if (position.entry_market_cap_usd >= 5600 && position.entry_market_cap_usd <= 10000 && outcome === 'success') {
      correctSignals.push('ideal_entry_mc');
    }
  }

  return { outcome, notes, correctSignals, wrongSignals, shouldHaveAvoided };
}

// Create learning record from closed position
async function createLearningRecord(
  supabase: any,
  position: any,
  classification: OutcomeClassification,
  timeToPeakMins: number,
  timeToExitMins: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pumpfun_trade_learnings')
      .insert({
        fantasy_position_id: position.id,
        token_mint: position.token_mint,
        token_symbol: position.token_symbol,
        
        // Entry conditions
        entry_market_cap_usd: position.entry_market_cap_usd,
        entry_holder_count: position.entry_holder_count,
        entry_volume_sol: position.entry_volume_24h_sol,
        entry_token_age_mins: position.entry_token_age_mins,
        entry_signal_strength: position.entry_signal_strength_raw,
        entry_rugcheck_score: position.entry_rugcheck_score,
        entry_bonding_curve_pct: position.entry_bonding_curve_pct,
        
        // Outcome
        outcome: classification.outcome,
        final_pnl_percent: position.total_pnl_percent || 0,
        peak_multiplier: position.peak_multiplier || 1.0,
        time_to_peak_mins: timeToPeakMins,
        time_to_exit_mins: timeToExitMins,
        
        // Signals
        correct_signals: classification.correctSignals,
        wrong_signals: classification.wrongSignals,
        should_have_avoided: classification.shouldHaveAvoided,
        
        // Calculate optimal ranges based on this trade
        optimal_market_cap_min: classification.outcome === 'success' ? 
          Math.max(5000, (position.entry_market_cap_usd || 0) * 0.8) : null,
        optimal_market_cap_max: classification.outcome === 'success' ?
          Math.min(15000, (position.entry_market_cap_usd || 0) * 1.2) : null,
        optimal_holder_count_min: classification.outcome === 'success' && position.entry_holder_count ?
          Math.max(20, position.entry_holder_count - 10) : null,
        optimal_holder_count_max: classification.outcome === 'success' && position.entry_holder_count ?
          Math.min(60, position.entry_holder_count + 10) : null,
        
        // Notes
        analysis_notes: classification.notes,
      });

    if (error) {
      console.error('Error creating learning record:', error);
      return false;
    }

    console.log(`📚 LEARNING CREATED: ${position.token_symbol} | Outcome: ${classification.outcome} | Signals: +${classification.correctSignals.length}/-${classification.wrongSignals.length}`);
    return true;
  } catch (error) {
    console.error('Error in createLearningRecord:', error);
    return false;
  }
}

// Main monitoring logic
async function monitorPositions(supabase: any): Promise<MonitorStats> {
  const startTime = Date.now();
  const stats: MonitorStats = {
    positionsChecked: 0,
    pricesUpdated: 0,
    targetsSold: 0,
    moonbagsCreated: 0,
    moonbagsClosed: 0,
    lpRemovalDetected: 0,
    drawdownExits: 0,
    learningsCreated: 0,
    errors: [],
    durationMs: 0,
  };

  console.log('📊 FANTASY SELL MONITOR: Starting monitoring cycle...');

  const config = await getConfig(supabase);

  // Get all active positions (open and moonbag)
  const { data: positions, error } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('*')
    .in('status', ['open', 'moonbag'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching positions:', error);
    stats.errors.push(error.message);
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  if (!positions?.length) {
    console.log('📋 No active positions to monitor');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  console.log(`📋 Monitoring ${positions.length} active positions`);

  // Get SOL price
  const solPrice = await getSolPrice();

  // Batch fetch all prices using multiple sources
  const mints = [...new Set(positions.map((p: any) => p.token_mint))];
  const priceMap = await batchFetchPrices(mints, supabase);

  const now = new Date().toISOString();

  for (const position of positions) {
    stats.positionsChecked++;

    try {
      const currentPriceUsd = priceMap.get(position.token_mint);
      
      if (!currentPriceUsd) {
        console.log(`⚠️ No price for ${position.token_symbol}, skipping`);
        continue;
      }

      const currentPriceSol = currentPriceUsd / solPrice;
      const multiplier = currentPriceUsd / position.entry_price_usd;
      
      // Track peak
      const isNewPeak = currentPriceUsd > (position.peak_price_usd || 0);
      
      if (position.status === 'open') {
        // Calculate current unrealized P&L
        const currentValue = position.token_amount * currentPriceSol;
        const unrealizedPnlSol = currentValue - position.entry_amount_sol;
        const unrealizedPnlPercent = ((currentValue / position.entry_amount_sol) - 1) * 100;

        // Check if target hit
        if (multiplier >= position.target_multiplier) {
          // TARGET HIT! Simulate 100% sell (no moonbag)
          console.log(`🎯 TARGET HIT: ${position.token_symbol} @ ${multiplier.toFixed(2)}x (target: ${position.target_multiplier}x)`);

          // Calculate full sell
          const fullSellValueSol = position.token_amount * currentPriceSol;
          const realizedPnlSol = fullSellValueSol - position.entry_amount_sol;
          const realizedPnlPercent = ((fullSellValueSol / position.entry_amount_sol) - 1) * 100;

          // Classify outcome
          const outcome = realizedPnlPercent > 0 ? 'success' : 'loss';

          // Update position to closed (100% sell, no moonbag)
          await supabase
            .from('pumpfun_fantasy_positions')
            .update({
              status: 'closed',
              current_price_usd: currentPriceUsd,
              current_price_sol: currentPriceSol,
              main_sold_at: now,
              main_sold_price_usd: currentPriceUsd,
              main_sold_amount_sol: fullSellValueSol,
              main_realized_pnl_sol: realizedPnlSol,
              moonbag_active: false,
              moonbag_token_amount: 0,
              moonbag_entry_value_sol: 0,
              moonbag_current_value_sol: 0,
              moonbag_drawdown_pct: 0,
              sell_percentage: 100,
              moonbag_percentage: 0,
              total_realized_pnl_sol: realizedPnlSol,
              total_pnl_percent: realizedPnlPercent,
              exit_at: now,
              exit_price_usd: currentPriceUsd,
              exit_reason: 'target_hit',
              peak_price_usd: isNewPeak ? currentPriceUsd : position.peak_price_usd,
              peak_multiplier: isNewPeak ? multiplier : position.peak_multiplier,
              peak_at: isNewPeak ? now : position.peak_at,
              outcome,
              outcome_classified_at: now,
              updated_at: now,
            })
            .eq('id', position.id);

          stats.targetsSold++;
          
          console.log(`💰 SOLD 100%: ${position.token_symbol} | +${realizedPnlSol.toFixed(4)} SOL (${realizedPnlPercent.toFixed(1)}%)`);

        } else {
          // Just update current price and P&L
          await supabase
            .from('pumpfun_fantasy_positions')
            .update({
              current_price_usd: currentPriceUsd,
              current_price_sol: currentPriceSol,
              unrealized_pnl_sol: unrealizedPnlSol,
              unrealized_pnl_percent: unrealizedPnlPercent,
              peak_price_usd: isNewPeak ? currentPriceUsd : position.peak_price_usd,
              peak_multiplier: isNewPeak ? multiplier : position.peak_multiplier,
              peak_at: isNewPeak ? now : position.peak_at,
              updated_at: now,
            })
            .eq('id', position.id);

          stats.pricesUpdated++;
        }

      } else if (position.status === 'moonbag') {
        // Monitor moonbag for exit conditions
        const moonbagValueSol = position.moonbag_token_amount * currentPriceSol;
        
        // Calculate drawdown from moonbag peak (not entry peak)
        const moonbagPeakPriceUsd = position.moonbag_peak_price_usd || position.main_sold_price_usd || position.peak_price_usd;
        const isNewMoonbagPeak = currentPriceUsd > moonbagPeakPriceUsd;
        const effectivePeak = isNewMoonbagPeak ? currentPriceUsd : moonbagPeakPriceUsd;
        const drawdownPct = ((effectivePeak - currentPriceUsd) / effectivePeak) * 100;

        // Check LP status
        const { liquidityUsd, lpRemoved } = await checkLiquidity(position.token_mint);

        let shouldExit = false;
        let exitReason = '';

        if (lpRemoved) {
          shouldExit = true;
          exitReason = 'lp_removed';
          stats.lpRemovalDetected++;
          console.log(`🚨 LP REMOVED: ${position.token_symbol}`);
        } else if (drawdownPct >= config.fantasy_moonbag_drawdown_limit) {
          shouldExit = true;
          exitReason = 'drawdown';
          stats.drawdownExits++;
          console.log(`📉 DRAWDOWN EXIT: ${position.token_symbol} @ ${drawdownPct.toFixed(1)}% drawdown`);
        }

        if (shouldExit) {
          // Calculate final moonbag P&L
          const moonbagRealizedPnlSol = moonbagValueSol - position.moonbag_entry_value_sol;
          const totalRealizedPnlSol = (position.main_realized_pnl_sol || 0) + moonbagRealizedPnlSol;
          const totalPnlPercent = ((totalRealizedPnlSol / position.entry_amount_sol)) * 100;

          // Calculate timing for learning
          const entryTime = new Date(position.entry_at).getTime();
          const peakTime = position.peak_at ? new Date(position.peak_at).getTime() : entryTime;
          const exitTime = new Date(now).getTime();
          const timeSinceEntryMins = Math.floor((exitTime - entryTime) / (1000 * 60));
          const timeToPeakMins = Math.floor((peakTime - entryTime) / (1000 * 60));
          const timeSincePeakMins = Math.floor((exitTime - peakTime) / (1000 * 60));

          // Classify outcome for AI learning
          const classification = classifyOutcome(
            position,
            exitReason,
            totalPnlPercent,
            position.peak_multiplier || 1.0,
            timeSinceEntryMins,
            timeSincePeakMins
          );

          await supabase
            .from('pumpfun_fantasy_positions')
            .update({
              status: 'closed',
              current_price_usd: currentPriceUsd,
              current_price_sol: currentPriceSol,
              moonbag_active: false,
              moonbag_current_value_sol: moonbagValueSol,
              moonbag_drawdown_pct: drawdownPct,
              exit_at: now,
              exit_price_usd: currentPriceUsd,
              exit_reason: exitReason,
              total_realized_pnl_sol: totalRealizedPnlSol,
              total_pnl_percent: totalPnlPercent,
              lp_checked_at: now,
              lp_liquidity_usd: liquidityUsd,
              // Outcome classification
              outcome: classification.outcome,
              outcome_classified_at: now,
              outcome_notes: classification.notes,
              time_to_peak_mins: timeToPeakMins,
              updated_at: now,
            })
            .eq('id', position.id);

          // Create learning record
          const learningCreated = await createLearningRecord(
            supabase,
            {
              ...position,
              total_pnl_percent: totalPnlPercent,
              peak_multiplier: position.peak_multiplier || 1.0,
            },
            classification,
            timeToPeakMins,
            timeSinceEntryMins
          );
          
          if (learningCreated) {
            stats.learningsCreated++;
          }

          stats.moonbagsClosed++;
          
          console.log(`🏁 MOONBAG CLOSED: ${position.token_symbol} | Outcome: ${classification.outcome.toUpperCase()} | ${exitReason} | Final P&L: ${totalRealizedPnlSol >= 0 ? '+' : ''}${totalRealizedPnlSol.toFixed(4)} SOL (${totalPnlPercent.toFixed(1)}%)`);

        } else {
          // Just update moonbag tracking
          await supabase
            .from('pumpfun_fantasy_positions')
            .update({
              current_price_usd: currentPriceUsd,
              current_price_sol: currentPriceSol,
              moonbag_current_value_sol: moonbagValueSol,
              moonbag_peak_price_usd: isNewMoonbagPeak ? currentPriceUsd : moonbagPeakPriceUsd,
              moonbag_drawdown_pct: drawdownPct,
              lp_checked_at: now,
              lp_liquidity_usd: liquidityUsd,
              updated_at: now,
            })
            .eq('id', position.id);

          stats.pricesUpdated++;
        }

        // Rate limiting for LP checks
        await new Promise(r => setTimeout(r, 100));
      }

    } catch (error) {
      console.error(`Error processing ${position.token_symbol}:`, error);
      stats.errors.push(`${position.token_symbol}: ${String(error)}`);
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 FANTASY SELL MONITOR COMPLETE: ${stats.positionsChecked} checked, ${stats.targetsSold} targets hit, ${stats.moonbagsClosed} moonbags closed (${stats.durationMs}ms)`);

  return stats;
}

// Get summary stats
async function getSummaryStats(supabase: any) {
  const { data: positions } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('*');

  if (!positions?.length) {
    return {
      totalPositions: 0,
      openPositions: 0,
      moonbagPositions: 0,
      closedPositions: 0,
      targetsHit: 0,
      winRate: 0,
      totalInvested: 0,
      totalRealizedPnl: 0,
      avgPnlPerTrade: 0,
    };
  }

  const openPositions = positions.filter((p: any) => p.status === 'open');
  const moonbagPositions = positions.filter((p: any) => p.status === 'moonbag');
  const closedPositions = positions.filter((p: any) => p.status === 'closed');
  const targetsHit = positions.filter((p: any) => p.main_sold_at !== null);
  const winningTrades = closedPositions.filter((p: any) => p.total_realized_pnl_sol > 0);

  const totalInvested = positions.reduce((sum: number, p: any) => sum + (p.entry_amount_sol || 0), 0);
  const totalRealizedPnl = closedPositions.reduce((sum: number, p: any) => sum + (p.total_realized_pnl_sol || 0), 0);
  const unrealizedPnl = openPositions.reduce((sum: number, p: any) => sum + (p.unrealized_pnl_sol || 0), 0);
  const moonbagPnl = moonbagPositions.reduce((sum: number, p: any) => sum + (p.main_realized_pnl_sol || 0), 0);

  return {
    totalPositions: positions.length,
    openPositions: openPositions.length,
    moonbagPositions: moonbagPositions.length,
    closedPositions: closedPositions.length,
    targetsHit: targetsHit.length,
    winRate: closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0,
    totalInvested,
    totalRealizedPnl,
    unrealizedPnl,
    moonbagPnl,
    avgPnlPerTrade: closedPositions.length > 0 ? totalRealizedPnl / closedPositions.length : 0,
    targetHitRate: positions.length > 0 ? (targetsHit.length / positions.length) * 100 : 0,
  };
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

    console.log(`🎯 pumpfun-fantasy-sell-monitor action: ${action}`);

    switch (action) {
      case 'monitor': {
        const stats = await monitorPositions(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'stats': {
        const stats = await getSummaryStats(supabase);
        return jsonResponse({ success: true, ...stats });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-fantasy-sell-monitor:', error);
    return errorResponse(String(error), 500);
  }
});
