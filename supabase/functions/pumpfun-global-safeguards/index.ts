import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SafeguardStatus {
  killSwitchActive: boolean;
  killSwitchReason: string | null;
  dailyBuysToday: number;
  dailyBuyCap: number;
  buyingHalted: boolean;
  activeWatchdogCount: number;
  maxWatchdogCount: number;
  prunedCount: number;
  rollingWinRate: number;
  minWinRate: number;
  actions: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { action } = await req.json().catch(() => ({ action: 'check' }));
    
    console.log(`[SAFEGUARDS] Running action: ${action}`);

    // Get current config
    const { data: config, error: configError } = await supabase
      .from('pumpfun_monitor_config')
      .select('*')
      .limit(1)
      .single();

    if (configError || !config) {
      throw new Error(`Failed to fetch config: ${configError?.message}`);
    }

    const actions: string[] = [];
    let prunedCount = 0;

    // ============================================
    // SAFEGUARD 1: Daily Reset Check
    // ============================================
    const lastReset = new Date(config.last_daily_reset || 0);
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (lastReset < dayStart) {
      console.log(`[SAFEGUARDS] Resetting daily counters (last reset: ${lastReset.toISOString()})`);
      
      // Create/update daily stats for previous day
      const yesterday = new Date(dayStart);
      yesterday.setDate(yesterday.getDate() - 1);
      
      await supabase
        .from('pumpfun_daily_stats')
        .upsert({
          stat_date: yesterday.toISOString().split('T')[0],
          total_buys: config.daily_buys_today || 0,
          updated_at: now.toISOString()
        }, { onConflict: 'stat_date' });

      // Reset daily counter
      await supabase
        .from('pumpfun_monitor_config')
        .update({
          daily_buys_today: 0,
          last_daily_reset: now.toISOString()
        })
        .eq('id', config.id);

      config.daily_buys_today = 0;
      actions.push('Daily counters reset');
    }

    // ============================================
    // SAFEGUARD 2: Daily Buy Cap Check
    // ============================================
    const buyingHalted = config.daily_buys_today >= config.daily_buy_cap;
    if (buyingHalted) {
      console.log(`[SAFEGUARDS] ⚠️ BUYING HALTED - Daily cap reached: ${config.daily_buys_today}/${config.daily_buy_cap}`);
      actions.push(`Buying halted: ${config.daily_buys_today}/${config.daily_buy_cap} daily cap`);
    }

    // ============================================
    // SAFEGUARD 3: Watchdog Count & Pruning
    // ============================================
    const { count: activeWatchdogCount } = await supabase
      .from('pumpfun_watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'watching');

    const currentWatchdogCount = activeWatchdogCount || 0;

    // Update active count in config
    if (currentWatchdogCount !== config.active_watchdog_count) {
      await supabase
        .from('pumpfun_monitor_config')
        .update({ active_watchdog_count: currentWatchdogCount })
        .eq('id', config.id);
    }

    // Prune low-score tokens if over capacity
    if (currentWatchdogCount > config.max_watchdog_count) {
      const excessCount = currentWatchdogCount - config.max_watchdog_count;
      console.log(`[SAFEGUARDS] 🔪 PRUNING ${excessCount} low-priority tokens (${currentWatchdogCount}/${config.max_watchdog_count})`);

      // Get lowest priority tokens to prune
      const { data: toPrune } = await supabase
        .from('pumpfun_watchlist')
        .select('id, token_symbol, priority_score, bundle_score')
        .eq('status', 'watching')
        .order('priority_score', { ascending: true })
        .order('bundle_score', { ascending: false }) // Higher bundle score = worse
        .limit(excessCount);

      if (toPrune && toPrune.length > 0) {
        const pruneIds = toPrune.map(t => t.id);
        
        await supabase
          .from('pumpfun_watchlist')
          .update({
            status: 'dead',
            rejection_type: 'soft',
            rejection_reasons: ['Pruned: watchdog capacity exceeded'],
            pruned_at: now.toISOString(),
            prune_reason: 'capacity_exceeded'
          })
          .in('id', pruneIds);

        prunedCount = toPrune.length;
        actions.push(`Pruned ${prunedCount} low-priority tokens`);

        // Log pruned tokens
        for (const token of toPrune) {
          console.log(`[SAFEGUARDS] Pruned: ${token.token_symbol} (priority: ${token.priority_score}, bundle: ${token.bundle_score})`);
        }

        // Update daily stats
        await supabase
          .from('pumpfun_daily_stats')
          .upsert({
            stat_date: now.toISOString().split('T')[0],
            prune_events: 1,
            updated_at: now.toISOString()
          }, { onConflict: 'stat_date' });

        await supabase
          .from('pumpfun_monitor_config')
          .update({ last_prune_at: now.toISOString() })
          .eq('id', config.id);
      }
    }

    // ============================================
    // SAFEGUARD 4: Rolling Win Rate & Kill Switch
    // ============================================
    const lookbackHours = config.win_rate_lookback_hours || 24;
    const lookbackDate = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

    // Get recent sell outcomes from flipit_positions (if exists)
    let rollingWinRate = 0.5; // Default to 50% if no data
    let totalTrades = 0;
    let winningTrades = 0;

    try {
      // Try to get win rate from flipit positions linked to pumpfun
      const { data: recentTrades } = await supabase
        .from('flipit_positions')
        .select('realized_pnl_sol, status, sold_at')
        .gte('sold_at', lookbackDate.toISOString())
        .eq('status', 'sold')
        .not('realized_pnl_sol', 'is', null);

      if (recentTrades && recentTrades.length > 0) {
        totalTrades = recentTrades.length;
        winningTrades = recentTrades.filter(t => (t.realized_pnl_sol || 0) > 0).length;
        rollingWinRate = totalTrades > 0 ? winningTrades / totalTrades : 0.5;
        console.log(`[SAFEGUARDS] Win rate: ${winningTrades}/${totalTrades} = ${(rollingWinRate * 100).toFixed(1)}%`);
      }
    } catch (e) {
      console.log(`[SAFEGUARDS] Could not fetch win rate from flipit_positions: ${e}`);
    }

    // Check kill switch conditions
    const minWinRate = config.min_rolling_win_rate || 0.3;
    const shouldActivateKillSwitch = totalTrades >= 5 && rollingWinRate < minWinRate;

    if (shouldActivateKillSwitch && !config.kill_switch_active) {
      console.log(`[SAFEGUARDS] 🚨 ACTIVATING KILL SWITCH - Win rate ${(rollingWinRate * 100).toFixed(1)}% < ${(minWinRate * 100).toFixed(1)}%`);
      
      await supabase
        .from('pumpfun_monitor_config')
        .update({
          kill_switch_active: true,
          kill_switch_activated_at: now.toISOString(),
          kill_switch_reason: `Win rate ${(rollingWinRate * 100).toFixed(1)}% below minimum ${(minWinRate * 100).toFixed(1)}%`
        })
        .eq('id', config.id);

      // Update daily stats
      await supabase
        .from('pumpfun_daily_stats')
        .upsert({
          stat_date: now.toISOString().split('T')[0],
          kill_switch_triggers: 1,
          win_rate: rollingWinRate,
          updated_at: now.toISOString()
        }, { onConflict: 'stat_date' });

      actions.push(`KILL SWITCH ACTIVATED: Win rate ${(rollingWinRate * 100).toFixed(1)}%`);
    }

    // Auto-deactivate kill switch if win rate recovers (optional manual override)
    if (action === 'reset_kill_switch') {
      console.log(`[SAFEGUARDS] Manual kill switch reset requested`);
      await supabase
        .from('pumpfun_monitor_config')
        .update({
          kill_switch_active: false,
          kill_switch_activated_at: null,
          kill_switch_reason: null
        })
        .eq('id', config.id);
      
      actions.push('Kill switch manually reset');
    }

    // ============================================
    // SAFEGUARD 5: Update Priority Scores
    // ============================================
    if (action === 'update_priorities') {
      console.log(`[SAFEGUARDS] Updating priority scores for all watching tokens`);
      
      const { data: watchingTokens } = await supabase
        .from('pumpfun_watchlist')
        .select('id, bundle_score, holder_count, bonding_curve_pct, market_cap_sol, socials_count, has_image, gini_coefficient, insider_activity_detected')
        .eq('status', 'watching');

      if (watchingTokens) {
        for (const token of watchingTokens) {
          // Calculate priority score (higher = better, less likely to be pruned)
          let priority = 50; // Base score

          // Lower bundle score is better (+20 points for low bundle)
          if (token.bundle_score !== null) {
            priority += Math.max(0, 40 - token.bundle_score) / 2;
          }

          // More holders is better
          if (token.holder_count !== null) {
            priority += Math.min(20, token.holder_count / 5);
          }

          // Higher bonding curve % is better
          if (token.bonding_curve_pct !== null) {
            priority += token.bonding_curve_pct / 5;
          }

          // Socials boost
          if (token.socials_count) {
            priority += token.socials_count * 5;
          }

          // Image boost
          if (token.has_image) {
            priority += 5;
          }

          // Low gini (equality) is better
          if (token.gini_coefficient !== null) {
            priority += (1 - token.gini_coefficient) * 10;
          }

          // Insider activity penalty
          if (token.insider_activity_detected) {
            priority -= 20;
          }

          await supabase
            .from('pumpfun_watchlist')
            .update({ priority_score: Math.max(0, Math.min(100, priority)) })
            .eq('id', token.id);
        }

        actions.push(`Updated priority scores for ${watchingTokens.length} tokens`);
      }
    }

    // ============================================
    // Build Status Response
    // ============================================
    const status: SafeguardStatus = {
      killSwitchActive: config.kill_switch_active || false,
      killSwitchReason: config.kill_switch_reason || null,
      dailyBuysToday: config.daily_buys_today || 0,
      dailyBuyCap: config.daily_buy_cap || 20,
      buyingHalted,
      activeWatchdogCount: currentWatchdogCount,
      maxWatchdogCount: config.max_watchdog_count || 500,
      prunedCount,
      rollingWinRate,
      minWinRate,
      actions
    };

    console.log(`[SAFEGUARDS] Status:`, JSON.stringify(status, null, 2));

    // Log to discovery logs
    await supabase
      .from('pumpfun_discovery_logs')
      .insert({
        log_type: 'safeguard_check',
        message: `Safeguards checked: ${actions.length > 0 ? actions.join(', ') : 'All clear'}`,
        metadata: status
      });

    return new Response(JSON.stringify({
      success: true,
      status,
      timestamp: now.toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SAFEGUARDS] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
