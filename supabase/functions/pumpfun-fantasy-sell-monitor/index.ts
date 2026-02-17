import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { broadcastToBlackBox } from '../_shared/telegram-broadcast.ts';
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
  fantasy_stop_loss_pct: number;
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
    .select('fantasy_target_multiplier, fantasy_sell_percentage, fantasy_moonbag_percentage, fantasy_moonbag_drawdown_limit, fantasy_moonbag_volume_check, fantasy_stop_loss_pct')
    .limit(1)
    .single();

  return {
    fantasy_target_multiplier: data?.fantasy_target_multiplier ?? 1.5,
    fantasy_sell_percentage: data?.fantasy_sell_percentage ?? 90,
    fantasy_moonbag_percentage: data?.fantasy_moonbag_percentage ?? 10,
    fantasy_moonbag_drawdown_limit: data?.fantasy_moonbag_drawdown_limit ?? 70,
    fantasy_moonbag_volume_check: data?.fantasy_moonbag_volume_check ?? true,
    fantasy_stop_loss_pct: data?.fantasy_stop_loss_pct ?? 35,
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

// Batch fetch prices - Pump.fun bonding curve FIRST (these are all bonding curve tokens!), then DexScreener/Jupiter as fallback for graduated
async function batchFetchPrices(mints: string[], supabase: any): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  
  if (mints.length === 0) return priceMap;

  let pumpfunCount = 0;
  let dexscreenerCount = 0;
  let jupiterCount = 0;
  let watchlistCount = 0;

  // 1. PRIMARY: Pump.fun bonding curve API — deterministic, real-time, best source for pre-graduation tokens
  for (const mint of mints) {
    try {
      const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        // Use virtualSolReserves / virtualTokenReserves for deterministic bonding curve price
        if (data?.virtual_sol_reserves && data?.virtual_token_reserves) {
          const solReserves = data.virtual_sol_reserves / 1e9;
          const tokenReserves = data.virtual_token_reserves / 1e6;
          const priceSol = solReserves / tokenReserves;
          // Get SOL price to convert to USD — use solPrice passed to monitor
          // For now, derive from pump.fun's own usd_market_cap if available
          if (data.usd_market_cap && data.total_supply) {
            const mcapDerivedPrice = data.usd_market_cap / (data.total_supply / 1e6);
            // Cross-check: use bonding curve SOL price * SOL/USD from mcap ratio
            const impliedSolUsd = mcapDerivedPrice / priceSol;
            const priceUsd = priceSol * impliedSolUsd;
            if (priceUsd > 0) {
              priceMap.set(mint, priceUsd);
              pumpfunCount++;
            }
          }
        } else if (data?.usd_market_cap && data?.total_supply) {
          // Fallback: derive from mcap
          const priceUsd = data.usd_market_cap / (data.total_supply / 1e6);
          if (priceUsd > 0) {
            priceMap.set(mint, priceUsd);
            pumpfunCount++;
          }
        }
      }
      // Small delay between pump.fun requests
      if (mints.length > 1) await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      // Continue - pump.fun API can be flaky
    }
  }

  let missingMints = mints.filter(m => !priceMap.has(m));
  if (missingMints.length === 0) {
    console.log(`📈 Prices: ${priceMap.size}/${mints.length} (pumpfun: ${pumpfunCount}) ✅ bonding curve`);
    return priceMap;
  }

  // 2. FALLBACK: DexScreener (for graduated tokens that left the bonding curve)
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
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      // Continue
    }
  }

  missingMints = mints.filter(m => !priceMap.has(m));
  if (missingMints.length === 0) {
    console.log(`📈 Prices: ${priceMap.size}/${mints.length} (pumpfun: ${pumpfunCount}, dex: ${dexscreenerCount})`);
    return priceMap;
  }

  // 3. FALLBACK: Jupiter (for graduated tokens)
  if (missingMints.length > 0) {
    try {
      const batchSize = 100;
      for (let i = 0; i < missingMints.length; i += batchSize) {
        const batch = missingMints.slice(i, i + batchSize);
        const response = await fetch(`https://api.jup.ag/price/v2?ids=${batch.join(',')}`);
        const data = await response.json();
        
        for (const mint of batch) {
          if (data?.data?.[mint]?.price) {
            priceMap.set(mint, parseFloat(data.data[mint].price));
            jupiterCount++;
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  missingMints = mints.filter(m => !priceMap.has(m));
  if (missingMints.length === 0) {
    console.log(`📈 Prices: ${priceMap.size}/${mints.length} (pumpfun: ${pumpfunCount}, dex: ${dexscreenerCount}, jupiter: ${jupiterCount})`);
    return priceMap;
  }

  // 4. LAST RESORT: Watchlist cache (stale but better than nothing)
  try {
    const { data: watchlistPrices } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, price_usd')
      .in('token_mint', missingMints)
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

  console.log(`📈 Prices: ${priceMap.size}/${mints.length} (pumpfun: ${pumpfunCount}, dex: ${dexscreenerCount}, jupiter: ${jupiterCount}, watchlist: ${watchlistCount})`);
  
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

// ═══════════════════════════════════════════════════════════════════
// ████ PHASE 1: LOSS FEEDBACK LOOP ████
// ═══════════════════════════════════════════════════════════════════

/**
 * When a fantasy position closes as a loss or rug:
 * 1. Upsert the creator wallet into dev_wallet_reputation with incremented loss counters
 * 2. If dev has 3+ fantasy losses or 2+ rugs, auto-blacklist in pumpfun_blacklist
 * 3. Create reputation_mesh links for the Oracle
 */
async function feedbackLossToReputation(
  supabase: any,
  position: any,
  outcome: string,
  exitReason: string
): Promise<void> {
  try {
    // Get creator_wallet from the linked watchlist entry
    let creatorWallet: string | null = null;
    let tokenSymbol = position.token_symbol || 'unknown';
    let tokenMint = position.token_mint;

    if (position.watchlist_id) {
      const { data: watchlistEntry } = await supabase
        .from('pumpfun_watchlist')
        .select('creator_wallet, token_symbol, token_mint')
        .eq('id', position.watchlist_id)
        .maybeSingle();

      creatorWallet = watchlistEntry?.creator_wallet || null;
      tokenSymbol = watchlistEntry?.token_symbol || tokenSymbol;
      tokenMint = watchlistEntry?.token_mint || tokenMint;
    }

    if (!creatorWallet) {
      console.log(`⚠️ FEEDBACK: No creator_wallet for ${tokenSymbol}, skipping reputation update`);
      return;
    }

    const isLoss = outcome === 'loss' || outcome === 'slow_bleed';
    const isRug = outcome === 'rug';
    const isWin = outcome === 'success' || outcome === 'partial_win';
    const now = new Date().toISOString();

    // 1. Upsert into dev_wallet_reputation
    const { data: existing } = await supabase
      .from('dev_wallet_reputation')
      .select('id, fantasy_loss_count, fantasy_win_count, tokens_rugged, trust_level, auto_blacklisted')
      .eq('wallet_address', creatorWallet)
      .maybeSingle();

    if (existing) {
      const updates: any = { updated_at: now, last_activity_at: now };
      
      if (isLoss || isRug) {
        updates.fantasy_loss_count = (existing.fantasy_loss_count || 0) + 1;
        updates.last_fantasy_loss_at = now;
        if (isRug) {
          updates.tokens_rugged = (existing.tokens_rugged || 0) + 1;
        }
      } else if (isWin) {
        updates.fantasy_win_count = (existing.fantasy_win_count || 0) + 1;
        updates.last_fantasy_win_at = now;
      }

      // Auto-classify trust level based on accumulated data
      const newLossCount = updates.fantasy_loss_count ?? existing.fantasy_loss_count ?? 0;
      const newRugCount = updates.tokens_rugged ?? existing.tokens_rugged ?? 0;
      const newWinCount = updates.fantasy_win_count ?? existing.fantasy_win_count ?? 0;

      if (newRugCount >= 3 || (newLossCount >= 5 && newWinCount === 0)) {
        updates.trust_level = 'serial_rugger';
      } else if (newRugCount >= 2 || (newLossCount >= 3 && newWinCount === 0)) {
        updates.trust_level = 'repeat_loser';
      }

      await supabase.from('dev_wallet_reputation').update(updates).eq('id', existing.id);
      console.log(`📊 FEEDBACK: Updated dev reputation for ${creatorWallet.slice(0, 8)}... | Losses: ${newLossCount}, Rugs: ${newRugCount}, Wins: ${newWinCount}`);

      // 2. Auto-blacklist if thresholds met
      const shouldBlacklist = !existing.auto_blacklisted && (
        newRugCount >= 2 || 
        (newLossCount >= 3 && newWinCount === 0) ||
        newLossCount >= 5
      );

      if (shouldBlacklist) {
        // Check if already in blacklist
        const { data: existingBlacklist } = await supabase
          .from('pumpfun_blacklist')
          .select('id')
          .eq('identifier', creatorWallet)
          .maybeSingle();

        if (!existingBlacklist) {
          await supabase.from('pumpfun_blacklist').insert({
            entry_type: 'wallet',
            identifier: creatorWallet,
            risk_level: newRugCount >= 2 ? 'critical' : 'high',
            blacklist_reason: `Auto-blacklisted: ${newLossCount} fantasy losses, ${newRugCount} rugs, ${newWinCount} wins`,
            tags: ['auto_classified', 'fantasy_feedback', isRug ? 'rugger' : 'serial_loser'],
            evidence_notes: `Tokens: ${tokenSymbol} (${tokenMint}). Last exit: ${exitReason}`,
            source: 'fantasy-sell-monitor',
            added_by: 'system_auto',
            is_active: true,
            auto_classified: true,
            linked_wallets: [creatorWallet],
            linked_token_mints: [tokenMint],
          });

          // Mark as auto-blacklisted in dev_wallet_reputation
          await supabase.from('dev_wallet_reputation')
            .update({ auto_blacklisted: true, auto_blacklisted_at: now })
            .eq('id', existing.id);

          console.log(`🚫 AUTO-BLACKLISTED: ${creatorWallet.slice(0, 8)}... | Losses: ${newLossCount}, Rugs: ${newRugCount}`);
        }
      }
    } else {
      // Create new reputation entry
      await supabase.from('dev_wallet_reputation').insert({
        wallet_address: creatorWallet,
        total_tokens_launched: 1,
        tokens_rugged: isRug ? 1 : 0,
        fantasy_loss_count: (isLoss || isRug) ? 1 : 0,
        fantasy_win_count: isWin ? 1 : 0,
        last_fantasy_loss_at: (isLoss || isRug) ? now : null,
        last_fantasy_win_at: isWin ? now : null,
        trust_level: isRug ? 'suspicious' : 'unknown',
        reputation_score: isRug ? 20 : (isLoss ? 35 : 50),
        first_seen_at: now,
        last_activity_at: now,
      });
      console.log(`📊 FEEDBACK: Created dev reputation for ${creatorWallet.slice(0, 8)}... | Outcome: ${outcome}`);
    }

    // 3. Feed into reputation_mesh
    if (isLoss || isRug) {
      const meshRelationship = isRug ? 'created_rug_token' : 'created_loss_token';
      
      // Check if link already exists
      const { data: existingMesh } = await supabase
        .from('reputation_mesh')
        .select('id')
        .eq('source_type', 'wallet')
        .eq('source_id', creatorWallet)
        .eq('linked_type', 'token_mint')
        .eq('linked_id', tokenMint)
        .maybeSingle();

      if (!existingMesh) {
        await supabase.from('reputation_mesh').insert({
          source_type: 'wallet',
          source_id: creatorWallet,
          linked_type: 'token_mint',
          linked_id: tokenMint,
          relationship: meshRelationship,
          confidence: isRug ? 95 : 75,
          evidence: {
            outcome,
            exit_reason: exitReason,
            pnl_percent: position.total_pnl_percent,
            token_symbol: tokenSymbol,
            recorded_at: now,
          },
          discovered_via: 'fantasy-sell-monitor-feedback',
        });
        console.log(`🕸️ MESH: Linked ${creatorWallet.slice(0, 8)}... → ${tokenSymbol} (${meshRelationship})`);
      }
    }

  } catch (error) {
    console.error('Error in feedbackLossToReputation:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// ████ AUTO LOSS TAGGER ████
// ═══════════════════════════════════════════════════════════════════

/**
 * Deterministic auto-tagger: assigns loss_tags based on exit reason,
 * watchlist flags, entry metrics, and cross-references with blacklist/mesh.
 * Runs on every loss/rug close to reduce manual review overhead.
 */
async function autoTagLoss(
  supabase: any,
  position: any,
  exitReason: string,
  outcome: string,
  multiplier: number
): Promise<string[]> {
  const tags: Set<string> = new Set();

  try {
    // ── 1. Exit-reason-based tags (deterministic) ──
    if (exitReason === 'lp_removed') tags.add('rug_pull');
    if (exitReason === 'dev_sold' || exitReason === 'watchlist_bombed') tags.add('dev_dump');
    if (exitReason === 'watchlist_dead' || exitReason === 'dead_no_price') tags.add('stale_dead');
    if (exitReason === 'stop_loss' && multiplier < 0.5) tags.add('pump_and_dump');
    if (exitReason.startsWith('stale_')) tags.add('stale_dead');
    if (exitReason.startsWith('dead_dump_')) tags.add('slow_bleed');

    // ── 2. Price-pattern-based tags ──
    const peakMult = position.peak_multiplier || 1.0;
    if (peakMult < 1.1 && outcome === 'loss') tags.add('no_volume');
    if (peakMult >= 1.5 && multiplier < 0.5) tags.add('pump_and_dump');
    if (peakMult < 1.2 && multiplier < 0.7) tags.add('slow_bleed');

    // ── 3. Entry-metric-based tags ──
    if (position.entry_rugcheck_score && position.entry_rugcheck_score > 5000) tags.add('honeypot');
    if (position.entry_holder_count && position.entry_holder_count < 15) tags.add('bundled_wallets');

    // ── 4. Cross-reference watchlist for deeper context ──
    if (position.watchlist_id) {
      const { data: watchlist } = await supabase
        .from('pumpfun_watchlist')
        .select('creator_wallet, dev_sold, bundle_analysis_score, has_bump_bot, linked_twitter, linked_telegram, linked_website, socials_verified, status')
        .eq('id', position.watchlist_id)
        .maybeSingle();

      if (watchlist) {
        if (watchlist.dev_sold) tags.add('dev_dump');
        if (watchlist.has_bump_bot) tags.add('bump_bot');
        if (watchlist.bundle_analysis_score && watchlist.bundle_analysis_score > 50) tags.add('bundled_wallets');

        // Fake socials: has links but not verified, or no links at all
        const hasAnySocial = watchlist.linked_twitter || watchlist.linked_telegram || watchlist.linked_website;
        if (hasAnySocial && watchlist.socials_verified === false) tags.add('fake_socials');

        // ── 5. Cross-reference blacklist & reputation mesh ──
        if (watchlist.creator_wallet) {
          // Check if dev is in blacklist
          const { data: blacklisted } = await supabase
            .from('pumpfun_blacklist')
            .select('id, reason')
            .eq('identifier', watchlist.creator_wallet)
            .maybeSingle();

          if (blacklisted) {
            tags.add('dev_dump');
            // If reason mentions specific patterns, add those tags
            const reason = (blacklisted.reason || '').toLowerCase();
            if (reason.includes('rug')) tags.add('rug_pull');
            if (reason.includes('serial')) tags.add('dev_dump');
          }

          // Check reputation mesh for connected bad actors
          const { data: meshLinks } = await supabase
            .from('reputation_mesh')
            .select('relationship, linked_type, linked_id, confidence')
            .eq('source_id', watchlist.creator_wallet)
            .in('relationship', ['created_rug_token', 'created_loss_token', 'co_mod', 'funded_by', 'same_team'])
            .gte('confidence', 60)
            .limit(10);

          if (meshLinks && meshLinks.length > 0) {
            const rugLinks = meshLinks.filter((m: any) => m.relationship === 'created_rug_token');
            const lossLinks = meshLinks.filter((m: any) => m.relationship === 'created_loss_token');
            const teamLinks = meshLinks.filter((m: any) => ['co_mod', 'funded_by', 'same_team'].includes(m.relationship));

            if (rugLinks.length >= 2) tags.add('rug_pull');
            if (lossLinks.length >= 3) tags.add('dev_dump');
            if (teamLinks.length >= 2) tags.add('bundled_wallets');
          }

          // Check dev_wallet_reputation for repeat offender
          const { data: devRep } = await supabase
            .from('dev_wallet_reputation')
            .select('fantasy_loss_count, tokens_rugged, trust_level, auto_blacklisted')
            .eq('wallet_address', watchlist.creator_wallet)
            .maybeSingle();

          if (devRep) {
            if (devRep.auto_blacklisted) tags.add('dev_dump');
            if ((devRep.tokens_rugged || 0) >= 2) tags.add('rug_pull');
            if (devRep.trust_level === 'serial_rugger') tags.add('rug_pull');
          }
        }
      }
    }

    // ── 6. Write tags to position ──
    const tagArray = Array.from(tags);
    if (tagArray.length > 0) {
      await supabase
        .from('pumpfun_fantasy_positions')
        .update({ loss_tags: tagArray })
        .eq('id', position.id);
      
      console.log(`🏷️ AUTO-TAGGED: ${position.token_symbol} → [${tagArray.join(', ')}]`);
    }

    return tagArray;
  } catch (error) {
    console.error(`Error in autoTagLoss for ${position.token_symbol}:`, error);
    return [];
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

  // Cross-reference watchlist for rug detection (dev_sold, bombed, etc.)
  const openMints = positions.filter((p: any) => p.status === 'open').map((p: any) => p.token_mint);
  const ruggedMints = new Set<string>();
  const rugReasons = new Map<string, string>();

  if (openMints.length > 0) {
    const { data: watchlistStatus } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_symbol, status, dev_sold')
      .in('token_mint', openMints);

    if (watchlistStatus) {
      for (const w of watchlistStatus) {
        if (w.dev_sold === true) {
          ruggedMints.add(w.token_mint);
          rugReasons.set(w.token_mint, 'dev_sold');
        } else if (['bombed', 'rejected', 'dead'].includes(w.status)) {
          ruggedMints.add(w.token_mint);
          rugReasons.set(w.token_mint, `watchlist_${w.status}`);
        }
      }
    }

    if (ruggedMints.size > 0) {
      console.log(`🚨 RUG DETECTED: ${ruggedMints.size} position(s) flagged for immediate exit`);
    }
  }

  const now = new Date().toISOString();

  for (const position of positions) {
    stats.positionsChecked++;

    try {
      // RUG DETECTION: Immediately close if watchlist flagged dev_sold or bombed
      if (position.status === 'open' && ruggedMints.has(position.token_mint)) {
        const rugReason = rugReasons.get(position.token_mint) || 'rug_detected';
        const currentPriceUsd = priceMap.get(position.token_mint) || position.current_price_usd || position.entry_price_usd * 0.5;
        const currentPriceSol = currentPriceUsd / solPrice;
        const multiplier = currentPriceUsd / position.entry_price_usd;
        const realizedPnlPercent = (multiplier - 1) * 100;
        const realizedPnlSol = position.entry_amount_sol * (multiplier - 1);
        const fullSellValueSol = position.entry_amount_sol * multiplier;

        console.log(`🚨 RUG EXIT: ${position.token_symbol} | Reason: ${rugReason} | ${multiplier.toFixed(3)}x`);

        // Atomic: only update if still open (prevents duplicate from concurrent invocations)
        const { data: rugUpdated } = await supabase.from('pumpfun_fantasy_positions').update({
          status: 'closed', current_price_usd: currentPriceUsd, current_price_sol: currentPriceSol,
          main_sold_at: now, main_sold_price_usd: currentPriceUsd, main_sold_amount_sol: fullSellValueSol,
          main_realized_pnl_sol: realizedPnlSol, sell_percentage: 100, moonbag_percentage: 0,
          moonbag_active: false, moonbag_token_amount: 0, moonbag_entry_value_sol: 0, moonbag_current_value_sol: 0,
          total_realized_pnl_sol: realizedPnlSol, total_pnl_percent: realizedPnlPercent,
          exit_at: now, exit_price_usd: currentPriceUsd, exit_reason: rugReason,
          peak_price_usd: position.peak_price_usd, peak_multiplier: position.peak_multiplier,
          outcome: 'rug', outcome_classified_at: now, updated_at: now,
        }).eq('id', position.id).eq('status', 'open').select('id');

        // Skip if another invocation already closed it
        if (!rugUpdated || rugUpdated.length === 0) {
          console.log(`⏭️ SKIP duplicate RUG EXIT for ${position.token_symbol}`);
          continue;
        }

        // PHASE 1: Feed loss back into reputation system
        await feedbackLossToReputation(supabase, position, 'rug', rugReason);
        // AUTO-TAG: Deterministic loss tagging + blacklist/mesh cross-ref
        await autoTagLoss(supabase, position, rugReason, 'rug', multiplier);
        stats.targetsSold++;

        const rugMsg = `🚨 Fantasy RUG EXIT: $${position.token_symbol}\n` +
          `📉 Exit: $${currentPriceUsd.toFixed(8)} (${multiplier.toFixed(3)}x)\n` +
          `💸 P&L: ${realizedPnlSol.toFixed(4)} SOL (${realizedPnlPercent.toFixed(1)}%)\n` +
          `📊 Entry was: $${position.entry_price_usd.toFixed(8)}\n` +
          `❌ Reason: ${rugReason} — token is dead\n` +
          `🔗 https://pump.fun/coin/${position.token_mint}`;

        await supabase.from('admin_notifications').insert({
          notification_type: 'fantasy_sell',
          title: `🚨 Fantasy RUG EXIT: $${position.token_symbol}`,
          message: rugMsg,
          metadata: { mint: position.token_mint, symbol: position.token_symbol, exit_reason: rugReason, pnl_sol: realizedPnlSol, pnl_pct: realizedPnlPercent, multiplier },
        }).then(() => {}).catch(() => {});

        // DISABLED: Only broadcast profitable sells to BlackBox
        // broadcastToBlackBox(supabase, rugMsg).catch(e => console.error('TG broadcast error:', e));
        continue;
      }

      const currentPriceUsd = priceMap.get(position.token_mint);
      
      if (!currentPriceUsd) {
        // If no price available and position is older than 6 hours, auto-close as dead
        const positionAgeHours = (Date.now() - new Date(position.created_at).getTime()) / (1000 * 60 * 60);
        if (positionAgeHours > 6 && position.status === 'open') {
          console.log(`💀 AUTO-CLOSE (no price, ${positionAgeHours.toFixed(1)}h old): ${position.token_symbol}`);
          const lastKnownPriceSol = position.current_price_sol || position.entry_price_sol * 0.01;
          const lastKnownPriceUsd = position.current_price_usd || position.entry_price_usd * 0.01;
          const exitValueSol = position.token_amount * lastKnownPriceSol;
          const realizedPnlSol = exitValueSol - position.entry_amount_sol;
          const realizedPnlPercent = ((exitValueSol / position.entry_amount_sol) - 1) * 100;
          await supabase.from('pumpfun_fantasy_positions').update({
            status: 'closed', current_price_usd: lastKnownPriceUsd, current_price_sol: lastKnownPriceSol,
            main_sold_at: now, main_sold_price_usd: lastKnownPriceUsd, main_sold_amount_sol: exitValueSol,
            main_realized_pnl_sol: realizedPnlSol, sell_percentage: 100, moonbag_percentage: 0,
            moonbag_active: false, moonbag_token_amount: 0, moonbag_entry_value_sol: 0, moonbag_current_value_sol: 0,
            total_realized_pnl_sol: realizedPnlSol, total_pnl_percent: realizedPnlPercent,
            exit_at: now, exit_price_usd: lastKnownPriceUsd, exit_reason: 'dead_no_price',
            outcome: 'loss', outcome_classified_at: now, updated_at: now,
          }).eq('id', position.id);
          // PHASE 1: Feed loss back into reputation system
          await feedbackLossToReputation(supabase, { ...position, total_pnl_percent: realizedPnlPercent }, 'loss', 'dead_no_price');
          // AUTO-TAG: Deterministic loss tagging + blacklist/mesh cross-ref
          await autoTagLoss(supabase, position, 'dead_no_price', 'loss', 0.01);
          stats.targetsSold++;
        }
        console.log(`⚠️ No price for ${position.token_symbol}, skipping`);
        continue;
      }

      const currentPriceSol = currentPriceUsd / solPrice;
      const multiplier = currentPriceUsd / position.entry_price_usd;
      
      // Track peak
      const isNewPeak = currentPriceUsd > (position.peak_price_usd || 0);
      
      if (position.status === 'open') {
        // Calculate current unrealized P&L using USD multiplier (consistent, not affected by SOL price changes)
        const pnlPercent = (multiplier - 1) * 100;
        const unrealizedPnlSol = position.entry_amount_sol * (multiplier - 1);
        const unrealizedPnlPercent = pnlPercent;

        // STOP-LOSS CHECK: If price drops below stop-loss threshold from entry
        const stopLossMultiplier = 1 - (config.fantasy_stop_loss_pct / 100);
        if (multiplier <= stopLossMultiplier) {
          console.log(`🛑 STOP-LOSS HIT: ${position.token_symbol} @ ${multiplier.toFixed(2)}x (SL: ${stopLossMultiplier.toFixed(2)}x = -${config.fantasy_stop_loss_pct}%)`);

          const realizedPnlPercent = (multiplier - 1) * 100;
          const realizedPnlSol = position.entry_amount_sol * (multiplier - 1);
          const fullSellValueSol = position.entry_amount_sol * multiplier;

          const { data: slUpdated } = await supabase
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
              exit_reason: 'stop_loss',
              peak_price_usd: isNewPeak ? currentPriceUsd : position.peak_price_usd,
              peak_multiplier: isNewPeak ? multiplier : position.peak_multiplier,
              peak_at: isNewPeak ? now : position.peak_at,
              outcome: 'loss',
              outcome_classified_at: now,
              updated_at: now,
            })
            .eq('id', position.id).eq('status', 'open').select('id');

          if (!slUpdated || slUpdated.length === 0) { console.log(`⏭️ SKIP duplicate SL for ${position.token_symbol}`); continue; }

          // PHASE 1: Feed loss back into reputation system
          await feedbackLossToReputation(supabase, { ...position, total_pnl_percent: realizedPnlPercent }, 'loss', 'stop_loss');
          // AUTO-TAG: Deterministic loss tagging + blacklist/mesh cross-ref
          await autoTagLoss(supabase, position, 'stop_loss', 'loss', multiplier);
          stats.targetsSold++;
          console.log(`🛑 STOP-LOSS SOLD: ${position.token_symbol} | ${realizedPnlSol.toFixed(4)} SOL (${realizedPnlPercent.toFixed(1)}%)`);

          // Notify: admin_notifications + Telegram
          const slMsg = `🛑 Fantasy STOP-LOSS: $${position.token_symbol}\n` +
            `📉 Exit: $${currentPriceUsd.toFixed(8)} (${multiplier.toFixed(2)}x)\n` +
            `💸 P&L: ${realizedPnlSol.toFixed(4)} SOL (${realizedPnlPercent.toFixed(1)}%)\n` +
            `📊 Entry was: $${position.entry_price_usd.toFixed(8)}\n` +
            `❌ Reason: Stop-loss hit at -${config.fantasy_stop_loss_pct}%\n` +
            `🔗 https://pump.fun/coin/${position.token_mint}`;

          await supabase.from('admin_notifications').insert({
            notification_type: 'fantasy_sell',
            title: `🛑 Fantasy STOP-LOSS: $${position.token_symbol}`,
            message: slMsg,
            metadata: { mint: position.token_mint, symbol: position.token_symbol, exit_reason: 'stop_loss', pnl_sol: realizedPnlSol, pnl_pct: realizedPnlPercent, multiplier },
          }).then(() => {}).catch(() => {});

           // DISABLED: Only broadcast profitable sells to BlackBox
           // broadcastToBlackBox(supabase, slMsg).catch(e => console.error('TG broadcast error:', e));
        }
        // AUTO-CLOSE STALE: >12h old with >65% loss, or >24h old regardless
        else if ((() => {
          const positionAgeHours = (Date.now() - new Date(position.created_at).getTime()) / (1000 * 60 * 60);
          return (positionAgeHours > 12 && multiplier < 0.35) || positionAgeHours > 24;
        })()) {
          const positionAgeHours = (Date.now() - new Date(position.created_at).getTime()) / (1000 * 60 * 60);
          const isDeadDump = positionAgeHours > 12 && multiplier < 0.35;
          const reason = isDeadDump ? `dead_dump_${positionAgeHours.toFixed(0)}h` : `stale_${positionAgeHours.toFixed(0)}h`;
          console.log(`💀 AUTO-CLOSE (${reason}): ${position.token_symbol} @ ${multiplier.toFixed(3)}x`);

          const realizedPnlPercent = (multiplier - 1) * 100;
          const realizedPnlSol = position.entry_amount_sol * (multiplier - 1);
          const fullSellValueSol = position.entry_amount_sol * multiplier;

          const { data: staleUpdated } = await supabase.from('pumpfun_fantasy_positions').update({
            status: 'closed', current_price_usd: currentPriceUsd, current_price_sol: currentPriceSol,
            main_sold_at: now, main_sold_price_usd: currentPriceUsd, main_sold_amount_sol: fullSellValueSol,
            main_realized_pnl_sol: realizedPnlSol, sell_percentage: 100, moonbag_percentage: 0,
            moonbag_active: false, moonbag_token_amount: 0, moonbag_entry_value_sol: 0, moonbag_current_value_sol: 0,
            total_realized_pnl_sol: realizedPnlSol, total_pnl_percent: realizedPnlPercent,
            exit_at: now, exit_price_usd: currentPriceUsd, exit_reason: reason,
            peak_price_usd: isNewPeak ? currentPriceUsd : position.peak_price_usd,
            peak_multiplier: isNewPeak ? multiplier : position.peak_multiplier,
            outcome: multiplier >= 1 ? 'breakeven' : 'loss', outcome_classified_at: now, updated_at: now,
          }).eq('id', position.id).eq('status', 'open').select('id');

          if (!staleUpdated || staleUpdated.length === 0) { console.log(`⏭️ SKIP duplicate stale close for ${position.token_symbol}`); continue; }

          // PHASE 1: Feed loss/win back into reputation system
          const staleOutcome = multiplier >= 1 ? 'breakeven' : 'loss';
          await feedbackLossToReputation(supabase, { ...position, total_pnl_percent: realizedPnlPercent }, staleOutcome, reason);
          // AUTO-TAG: Deterministic loss tagging + blacklist/mesh cross-ref (only for losses)
          if (staleOutcome === 'loss') await autoTagLoss(supabase, position, reason, staleOutcome, multiplier);
          stats.targetsSold++;
          stats.learningsCreated++;

          // Notify: admin_notifications + Telegram for stale/dead
          const staleMsg = `💀 Fantasy AUTO-CLOSE: $${position.token_symbol}\n` +
            `📉 Exit: $${currentPriceUsd.toFixed(8)} (${multiplier.toFixed(3)}x)\n` +
            `💸 P&L: ${realizedPnlSol.toFixed(4)} SOL (${realizedPnlPercent.toFixed(1)}%)\n` +
            `❌ Reason: ${reason}\n` +
            `🔗 https://pump.fun/coin/${position.token_mint}`;

          await supabase.from('admin_notifications').insert({
            notification_type: 'fantasy_sell',
            title: `💀 Fantasy AUTO-CLOSE: $${position.token_symbol}`,
            message: staleMsg,
            metadata: { mint: position.token_mint, symbol: position.token_symbol, exit_reason: reason, pnl_sol: realizedPnlSol, pnl_pct: realizedPnlPercent, multiplier },
          }).then(() => {}).catch(() => {});

           // DISABLED: Only broadcast profitable sells to BlackBox
           // broadcastToBlackBox(supabase, staleMsg).catch(e => console.error('TG broadcast error:', e));
        }
        // Check if target hit
        else if (multiplier >= position.target_multiplier) {
          // TARGET HIT! Simulate 100% sell (no moonbag)
          console.log(`🎯 TARGET HIT: ${position.token_symbol} @ ${multiplier.toFixed(2)}x (target: ${position.target_multiplier}x)`);

          // Calculate full sell using USD multiplier (not SOL conversion which drifts)
          const realizedPnlPercent = (multiplier - 1) * 100;
          const realizedPnlSol = position.entry_amount_sol * (multiplier - 1);
          const fullSellValueSol = position.entry_amount_sol * multiplier;

          // Classify outcome
          const outcome = multiplier > 1 ? 'success' : 'loss';

          // Update position to closed (100% sell, no moonbag)
          const { data: targetUpdated } = await supabase
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
            .eq('id', position.id).eq('status', 'open').select('id');

          if (!targetUpdated || targetUpdated.length === 0) { console.log(`⏭️ SKIP duplicate target sell for ${position.token_symbol}`); continue; }

          stats.targetsSold++;

          // PHASE 1: Feed win back into reputation system for post-exit tracking
          await feedbackLossToReputation(supabase, position, 'success', 'target_hit');

          // Save creator_wallet to position if available
          if (position.watchlist_id) {
            const { data: wlEntry } = await supabase
              .from('pumpfun_watchlist')
              .select('creator_wallet')
              .eq('id', position.watchlist_id)
              .maybeSingle();
            if (wlEntry?.creator_wallet) {
              await supabase.from('pumpfun_fantasy_positions')
                .update({ creator_wallet: wlEntry.creator_wallet })
                .eq('id', position.id);
            }
          }

          console.log(`💰 SOLD 100%: ${position.token_symbol} | +${realizedPnlSol.toFixed(4)} SOL (${realizedPnlPercent.toFixed(1)}%)`);

          // Notify: admin_notifications + Telegram
          const targetMsg = `🎯 Fantasy TARGET HIT: $${position.token_symbol}\n` +
            `🚀 Exit: $${currentPriceUsd.toFixed(8)} (${multiplier.toFixed(2)}x)\n` +
            `💰 P&L: +${realizedPnlSol.toFixed(4)} SOL (+${realizedPnlPercent.toFixed(1)}%)\n` +
            `📊 Entry was: $${position.entry_price_usd.toFixed(8)}\n` +
            `✅ Reason: Target ${position.target_multiplier}x reached!\n` +
            `🔗 https://pump.fun/coin/${position.token_mint}`;

          await supabase.from('admin_notifications').insert({
            notification_type: 'fantasy_sell',
            title: `🎯 Fantasy TARGET HIT: $${position.token_symbol}`,
            message: targetMsg,
            metadata: { mint: position.token_mint, symbol: position.token_symbol, exit_reason: 'target_hit', pnl_sol: realizedPnlSol, pnl_pct: realizedPnlPercent, multiplier },
          }).then(() => {}).catch(() => {});

          broadcastToBlackBox(supabase, targetMsg).catch(e => console.error('TG broadcast error:', e));

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

          // PHASE 1: Feed outcome back into reputation system
          await feedbackLossToReputation(supabase, { ...position, total_pnl_percent: totalPnlPercent }, classification.outcome, exitReason);
          // AUTO-TAG: For loss/rug moonbag exits
          if (['loss', 'rug', 'slow_bleed'].includes(classification.outcome)) {
            const moonbagMultiplier = currentPriceUsd / position.entry_price_usd;
            await autoTagLoss(supabase, position, exitReason, classification.outcome, moonbagMultiplier);
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
        // Loop every 5 seconds for ~55 seconds within this single cron invocation
        const MAX_RUNTIME_MS = 55_000;
        const POLL_INTERVAL_MS = 5_000;
        const loopStart = Date.now();
        let cycles = 0;
        let lastStats: any = null;

        while (Date.now() - loopStart < MAX_RUNTIME_MS) {
          cycles++;
          const stats = await monitorPositions(supabase);
          lastStats = stats;

          // If a target was hit or position closed, log it prominently
          if (stats.targetsSold > 0 || stats.moonbagsClosed > 0 || stats.drawdownExits > 0) {
            console.log(`🔥 CYCLE ${cycles}: Action taken! Targets: ${stats.targetsSold}, Moonbags closed: ${stats.moonbagsClosed}`);
          }

          // If no open positions left, stop looping
          if (stats.positionsChecked === 0) {
            console.log(`📋 No positions to monitor, stopping loop after ${cycles} cycles`);
            break;
          }

          // Wait 5 seconds before next check (unless we'd exceed runtime)
          const elapsed = Date.now() - loopStart;
          if (elapsed + POLL_INTERVAL_MS >= MAX_RUNTIME_MS) break;
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        }

        console.log(`🔄 MONITOR LOOP COMPLETE: ${cycles} cycles in ${((Date.now() - loopStart) / 1000).toFixed(1)}s`);
        return jsonResponse({ success: true, cycles, stats: lastStats });
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
