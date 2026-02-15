import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * BANKER POOL ENGINE — $250 Virtual Bankroll Manager
 * 
 * STRATEGY: Conservative momentum-based entries with strict risk management
 * 
 * CORE RULES:
 * 1. Max 4% bankroll per trade ($10 on $250)
 * 2. Max 5 concurrent positions
 * 3. Stop-loss at -25% (cut losers fast)
 * 4. Take profit at +100% (2x)  
 * 5. Trailing stop at -15% from peak (lock in gains)
 * 6. Daily loss limit: -10% of bankroll (stop trading for the day)
 * 7. Only enter tokens with momentum score >= 70
 * 8. Must be graduated from bonding curve
 * 9. Time-based decay: exit after 4 hours if flat (-5% to +10%)
 * 
 * POSITION SIZING (Modified Kelly):
 * - Base: 4% of current bankroll
 * - Score 80+: 5% (high conviction)
 * - Score 70-79: 3% (moderate conviction)
 * - Winning streak (3+): reduce to 2% (avoid overconfidence)
 * - Losing streak (3+): reduce to 2% (preserve capital)
 * 
 * EXIT PRIORITIES:
 * 1. Stop-loss hit → immediate exit
 * 2. Trailing stop hit → exit (profit locked)
 * 3. Take profit hit → exit (2x achieved)
 * 4. Time decay → exit if flat after 4 hours
 * 5. Daily loss limit → close all, stop trading
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'cycle'
    
    let body: any = {}
    try { body = await req.json() } catch {}

    console.log(`🏦 Banker Pool Engine — action: ${action}`)

    switch (action) {
      case 'init': return await initPool(supabase)
      case 'cycle': return await runCycle(supabase)
      case 'stats': return await getStats(supabase)
      case 'daily-report': return await getDailyReport(supabase)
      case 'close-position': return await closePosition(supabase, body.trade_id, body.reason || 'manual')
      case 'reset': return await resetPool(supabase)
      default: return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (e) {
    console.error('Banker Pool error:', e)
    return jsonResponse({ error: String(e) }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════
// INIT — Create the $250 pool if it doesn't exist
// ═══════════════════════════════════════════════════════════════
async function initPool(supabase: any) {
  const { data: existing } = await supabase
    .from('banker_pool')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (existing) return jsonResponse({ success: true, pool: existing, message: 'Pool already exists' })

  const { data, error } = await supabase
    .from('banker_pool')
    .insert({ starting_capital: 250, current_capital: 250, peak_capital: 250 })
    .select()
    .single()

  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ success: true, pool: data, message: 'Pool initialized with $250' })
}

// ═══════════════════════════════════════════════════════════════
// RESET — Reset pool to $250
// ═══════════════════════════════════════════════════════════════
async function resetPool(supabase: any) {
  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool found' }, 404)

  // Close all open trades at current price (as losses)
  const { data: openTrades } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('pool_id', pool.id)
    .eq('status', 'open')

  for (const trade of (openTrades || [])) {
    await supabase.from('banker_pool_trades').update({
      status: 'closed_loss',
      exit_reason: 'pool_reset',
      exited_at: new Date().toISOString(),
      exit_price_usd: trade.current_price_usd || trade.entry_price_usd,
      pnl_usd: 0,
      pnl_pct: 0,
    }).eq('id', trade.id)
  }

  await supabase.from('banker_pool').update({
    starting_capital: 250, current_capital: 250, total_invested: 0, total_returned: 0,
    total_pnl: 0, total_trades: 0, winning_trades: 0, losing_trades: 0,
    largest_win: 0, largest_loss: 0, max_drawdown_pct: 0, peak_capital: 250,
  }).eq('id', pool.id)

  return jsonResponse({ success: true, message: 'Pool reset to $250' })
}

// ═══════════════════════════════════════════════════════════════
// RUN CYCLE — Main trading loop
// ═══════════════════════════════════════════════════════════════
async function runCycle(supabase: any) {
  const pool = await getPool(supabase)
  if (!pool) {
    // Auto-init
    await initPool(supabase)
    return jsonResponse({ success: true, message: 'Pool auto-initialized', actions: [] })
  }
  if (!pool.is_active) return jsonResponse({ success: true, message: 'Pool paused', actions: [] })

  const actions: string[] = []
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // 1. Check daily loss limit
  const dailyPnl = await getDailyPnl(supabase, pool.id, today)
  const dailyLossLimit = pool.current_capital * (pool.daily_loss_limit_pct / 100)
  
  if (dailyPnl < -dailyLossLimit) {
    actions.push(`🛑 DAILY LOSS LIMIT HIT: $${dailyPnl.toFixed(2)} (limit: -$${dailyLossLimit.toFixed(2)})`)
    // Close all positions
    await closeAllPositions(supabase, pool, 'daily_loss_limit')
    actions.push('Closed all positions due to daily loss limit')
    return jsonResponse({ success: true, actions, dailyPnl, limitHit: true })
  }

  // 2. Monitor existing positions — check stops and targets
  const exitActions = await monitorPositions(supabase, pool)
  actions.push(...exitActions)

  // 3. Look for new entries
  const entryActions = await seekEntries(supabase, pool)
  actions.push(...entryActions)

  // 4. Update daily stats
  await updateDailyStats(supabase, pool, today)

  return jsonResponse({ success: true, actions, poolCapital: pool.current_capital })
}

// ═══════════════════════════════════════════════════════════════
// MONITOR POSITIONS — Stop-loss, take-profit, trailing stops
// ═══════════════════════════════════════════════════════════════
async function monitorPositions(supabase: any, pool: any): Promise<string[]> {
  const actions: string[] = []
  
  const { data: openTrades } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('pool_id', pool.id)
    .eq('status', 'open')

  if (!openTrades?.length) return actions

  for (const trade of openTrades) {
    try {
      // Fetch current price
      const currentPrice = await fetchCurrentPrice(trade.token_mint)
      if (!currentPrice) continue

      const multiplier = currentPrice / trade.entry_price_usd
      const pnlPct = (multiplier - 1) * 100
      const pnlUsd = trade.position_size_usd * (multiplier - 1)
      const peakPrice = Math.max(trade.peak_price_usd || trade.entry_price_usd, currentPrice)
      const peakMultiplier = peakPrice / trade.entry_price_usd
      
      // Update trailing stop as price increases
      const newTrailingStop = peakPrice * (1 - pool.trailing_stop_pct / 100)
      const trailingStop = Math.max(trade.trailing_stop_price || 0, newTrailingStop)

      // Update trade with current data
      await supabase.from('banker_pool_trades').update({
        current_price_usd: currentPrice,
        current_multiplier: multiplier,
        peak_price_usd: peakPrice,
        peak_multiplier: peakMultiplier,
        trailing_stop_price: trailingStop,
      }).eq('id', trade.id)

      // === EXIT CHECKS ===
      const ageHours = (Date.now() - new Date(trade.entered_at).getTime()) / 3600000

      // 1. STOP-LOSS
      if (pnlPct <= -pool.stop_loss_pct) {
        await closeTrade(supabase, pool, trade, currentPrice, 'stop_loss', pnlUsd, pnlPct)
        actions.push(`🔴 STOP-LOSS: ${trade.token_symbol} @ ${pnlPct.toFixed(1)}% ($${pnlUsd.toFixed(2)})`)
        continue
      }

      // 2. TRAILING STOP (only if we've been in profit)
      if (peakMultiplier > 1.15 && currentPrice <= trailingStop) {
        await closeTrade(supabase, pool, trade, currentPrice, 'trailing_stop', pnlUsd, pnlPct)
        actions.push(`🟡 TRAILING STOP: ${trade.token_symbol} @ ${pnlPct.toFixed(1)}% (peak: ${((peakMultiplier - 1) * 100).toFixed(1)}%)`)
        continue
      }

      // 3. TAKE PROFIT
      if (pnlPct >= pool.take_profit_pct) {
        await closeTrade(supabase, pool, trade, currentPrice, 'take_profit', pnlUsd, pnlPct)
        actions.push(`🟢 TAKE PROFIT: ${trade.token_symbol} @ ${pnlPct.toFixed(1)}% ($${pnlUsd.toFixed(2)})`)
        continue
      }

      // 4. TIME DECAY — flat after 4 hours
      if (ageHours > 4 && pnlPct > -5 && pnlPct < 10) {
        await closeTrade(supabase, pool, trade, currentPrice, 'time_decay', pnlUsd, pnlPct)
        actions.push(`⏰ TIME DECAY: ${trade.token_symbol} @ ${pnlPct.toFixed(1)}% after ${ageHours.toFixed(1)}h`)
        continue
      }

      // 5. EXTENDED TIME — after 12 hours, exit regardless
      if (ageHours > 12) {
        await closeTrade(supabase, pool, trade, currentPrice, 'time_limit', pnlUsd, pnlPct)
        actions.push(`⏰ TIME LIMIT: ${trade.token_symbol} @ ${pnlPct.toFixed(1)}% after ${ageHours.toFixed(1)}h`)
        continue
      }

    } catch (e) {
      console.error(`Error monitoring ${trade.token_symbol}:`, e)
    }
  }

  return actions
}

// ═══════════════════════════════════════════════════════════════
// SEEK ENTRIES — Find new positions from qualified tokens
// ═══════════════════════════════════════════════════════════════
async function seekEntries(supabase: any, pool: any): Promise<string[]> {
  const actions: string[] = []

  // Count open positions
  const { count: openCount } = await supabase
    .from('banker_pool_trades')
    .select('id', { count: 'exact', head: true })
    .eq('pool_id', pool.id)
    .eq('status', 'open')

  if ((openCount || 0) >= pool.max_open_positions) {
    actions.push(`📊 Max positions reached (${openCount}/${pool.max_open_positions})`)
    return actions
  }

  const slots = pool.max_open_positions - (openCount || 0)

  // Get recent fantasy positions that we haven't already traded
  const { data: existingMints } = await supabase
    .from('banker_pool_trades')
    .select('token_mint')
    .eq('pool_id', pool.id)

  const tradedMints = new Set((existingMints || []).map((t: any) => t.token_mint))

  // Look at qualified tokens from the watchlist (recently qualified, high score)
  const { data: candidates } = await supabase
    .from('pumpfun_watchlist')
    .select('token_mint, token_symbol, token_name, price_usd, market_cap_usd, priority_score, creator_wallet, qualified_at, is_graduated')
    .eq('status', 'qualified')
    .eq('is_graduated', true)  // Must be graduated from bonding curve
    .gte('priority_score', pool.min_score_to_enter)
    .order('priority_score', { ascending: false })
    .limit(20)

  if (!candidates?.length) return actions

  let entered = 0
  for (const candidate of candidates) {
    if (entered >= slots) break
    if (tradedMints.has(candidate.token_mint)) continue
    if (!candidate.price_usd || candidate.price_usd <= 0) continue

    // Check streak — recent 5 trades
    const streak = await getRecentStreak(supabase, pool.id)
    
    // Position sizing (Modified Kelly)
    let positionPct = pool.max_position_pct // Base 4%
    const score = candidate.priority_score || 0
    
    if (score >= 80) positionPct = Math.min(5, pool.max_position_pct + 1)  // High conviction
    else if (score < 75) positionPct = Math.max(2, pool.max_position_pct - 1)  // Low conviction
    
    // Streak adjustment
    if (Math.abs(streak) >= 3) positionPct = Math.min(positionPct, 2) // De-risk on streaks
    
    const positionSizeUsd = pool.current_capital * (positionPct / 100)
    
    // Don't enter if position would be too small
    if (positionSizeUsd < 2) {
      actions.push(`⚠️ Bankroll too low for entries ($${pool.current_capital.toFixed(2)})`)
      break
    }

    const entryPrice = candidate.price_usd
    const stopLossPrice = entryPrice * (1 - pool.stop_loss_pct / 100)
    const takeProfitPrice = entryPrice * (1 + pool.take_profit_pct / 100)

    // Enter the trade
    const { error } = await supabase.from('banker_pool_trades').insert({
      pool_id: pool.id,
      token_mint: candidate.token_mint,
      token_symbol: candidate.token_symbol,
      token_name: candidate.token_name,
      entry_price_usd: entryPrice,
      entry_mcap: candidate.market_cap_usd,
      entry_score: score,
      entry_reason: `Score:${score} | Graduated | MCap:$${(candidate.market_cap_usd || 0).toFixed(0)}`,
      position_size_usd: positionSizeUsd,
      position_size_pct: positionPct,
      current_price_usd: entryPrice,
      current_multiplier: 1,
      stop_loss_price: stopLossPrice,
      take_profit_price: takeProfitPrice,
      trailing_stop_price: stopLossPrice, // Starts at stop-loss level
      peak_price_usd: entryPrice,
      peak_multiplier: 1,
      status: 'open',
    })

    if (!error) {
      // Update pool
      await supabase.from('banker_pool').update({
        current_capital: pool.current_capital - positionSizeUsd,
        total_invested: (pool.total_invested || 0) + positionSizeUsd,
        total_trades: (pool.total_trades || 0) + 1,
      }).eq('id', pool.id)
      
      pool.current_capital -= positionSizeUsd // Update local state
      
      actions.push(`🟢 ENTRY: ${candidate.token_symbol} | $${positionSizeUsd.toFixed(2)} (${positionPct}%) | Score:${score} | SL:$${stopLossPrice.toFixed(8)} | TP:$${takeProfitPrice.toFixed(8)}`)
      entered++
      tradedMints.add(candidate.token_mint)
    }
  }

  return actions
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function getPool(supabase: any) {
  const { data } = await supabase.from('banker_pool').select('*').limit(1).maybeSingle()
  return data
}

async function fetchCurrentPrice(mint: string): Promise<number | null> {
  // Try DexScreener first
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
    if (res.ok) {
      const data = await res.json()
      const price = parseFloat(data?.pairs?.[0]?.priceUsd)
      if (price > 0) return price
    }
  } catch {}
  
  // Jupiter fallback
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`)
    if (res.ok) {
      const data = await res.json()
      const price = data?.data?.[mint]?.price
      if (price > 0) return parseFloat(price)
    }
  } catch {}

  return null
}

async function closeTrade(supabase: any, pool: any, trade: any, exitPrice: number, reason: string, pnlUsd: number, pnlPct: number) {
  const status = pnlUsd >= 0 ? 'closed_win' : 'closed_loss'
  
  await supabase.from('banker_pool_trades').update({
    status,
    exit_price_usd: exitPrice,
    exit_reason: reason,
    exited_at: new Date().toISOString(),
    pnl_usd: pnlUsd,
    pnl_pct: pnlPct,
  }).eq('id', trade.id)

  // Return capital + P&L to pool
  const returned = trade.position_size_usd + pnlUsd
  const newCapital = pool.current_capital + returned
  const newPeak = Math.max(pool.peak_capital, newCapital)
  const drawdown = newPeak > 0 ? ((newPeak - newCapital) / newPeak) * 100 : 0

  const updates: any = {
    current_capital: newCapital,
    total_returned: (pool.total_returned || 0) + returned,
    total_pnl: (pool.total_pnl || 0) + pnlUsd,
    peak_capital: newPeak,
    max_drawdown_pct: Math.max(pool.max_drawdown_pct || 0, drawdown),
  }

  if (pnlUsd >= 0) {
    updates.winning_trades = (pool.winning_trades || 0) + 1
    updates.largest_win = Math.max(pool.largest_win || 0, pnlUsd)
  } else {
    updates.losing_trades = (pool.losing_trades || 0) + 1
    updates.largest_loss = Math.min(pool.largest_loss || 0, pnlUsd)
  }

  await supabase.from('banker_pool').update(updates).eq('id', pool.id)
  
  // Update local pool state
  Object.assign(pool, updates)
}

async function closeAllPositions(supabase: any, pool: any, reason: string) {
  const { data: openTrades } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('pool_id', pool.id)
    .eq('status', 'open')

  for (const trade of (openTrades || [])) {
    const currentPrice = await fetchCurrentPrice(trade.token_mint) || trade.current_price_usd || trade.entry_price_usd
    const multiplier = currentPrice / trade.entry_price_usd
    const pnlPct = (multiplier - 1) * 100
    const pnlUsd = trade.position_size_usd * (multiplier - 1)
    await closeTrade(supabase, pool, trade, currentPrice, reason, pnlUsd, pnlPct)
  }
}

async function getDailyPnl(supabase: any, poolId: string, date: string): Promise<number> {
  const { data } = await supabase
    .from('banker_pool_trades')
    .select('pnl_usd')
    .eq('pool_id', poolId)
    .gte('exited_at', `${date}T00:00:00Z`)
    .lte('exited_at', `${date}T23:59:59Z`)
    .not('pnl_usd', 'is', null)

  return (data || []).reduce((sum: number, t: any) => sum + (t.pnl_usd || 0), 0)
}

async function getRecentStreak(supabase: any, poolId: string): Promise<number> {
  const { data } = await supabase
    .from('banker_pool_trades')
    .select('status')
    .eq('pool_id', poolId)
    .neq('status', 'open')
    .order('exited_at', { ascending: false })
    .limit(5)

  if (!data?.length) return 0

  let streak = 0
  const firstStatus = data[0].status
  for (const trade of data) {
    if (trade.status === firstStatus) streak++
    else break
  }
  return firstStatus === 'closed_win' ? streak : -streak
}

async function updateDailyStats(supabase: any, pool: any, date: string) {
  const { data: todayTrades } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('pool_id', pool.id)
    .or(`entered_at.gte.${date}T00:00:00Z,exited_at.gte.${date}T00:00:00Z`)

  const opened = (todayTrades || []).filter((t: any) => t.entered_at?.startsWith(date)).length
  const closed = (todayTrades || []).filter((t: any) => t.exited_at?.startsWith(date)).length
  const wins = (todayTrades || []).filter((t: any) => t.exited_at?.startsWith(date) && t.status === 'closed_win').length
  const losses = (todayTrades || []).filter((t: any) => t.exited_at?.startsWith(date) && t.status === 'closed_loss').length
  const closedToday = (todayTrades || []).filter((t: any) => t.exited_at?.startsWith(date) && t.pnl_usd != null)
  const bestTrade = closedToday.reduce((max: number, t: any) => Math.max(max, t.pnl_usd || 0), 0)
  const worstTrade = closedToday.reduce((min: number, t: any) => Math.min(min, t.pnl_usd || 0), 0)
  const dailyPnl = closedToday.reduce((sum: number, t: any) => sum + (t.pnl_usd || 0), 0)
  
  const { count: openCount } = await supabase
    .from('banker_pool_trades')
    .select('id', { count: 'exact', head: true })
    .eq('pool_id', pool.id)
    .eq('status', 'open')

  const { data: openTrades } = await supabase
    .from('banker_pool_trades')
    .select('position_size_usd')
    .eq('pool_id', pool.id)
    .eq('status', 'open')

  const capitalAtRisk = (openTrades || []).reduce((sum: number, t: any) => sum + (t.position_size_usd || 0), 0)

  await supabase.from('banker_pool_daily_stats').upsert({
    pool_id: pool.id,
    date,
    opening_capital: pool.starting_capital, // We'll improve this later
    closing_capital: pool.current_capital,
    daily_pnl: dailyPnl,
    daily_pnl_pct: pool.starting_capital > 0 ? (dailyPnl / pool.starting_capital) * 100 : 0,
    trades_opened: opened,
    trades_closed: closed,
    wins,
    losses,
    best_trade_pnl: bestTrade || null,
    worst_trade_pnl: worstTrade || null,
    open_positions: openCount || 0,
    capital_at_risk: capitalAtRisk,
  }, { onConflict: 'pool_id,date' })
}

// ═══════════════════════════════════════════════════════════════
// STATS — Pool overview
// ═══════════════════════════════════════════════════════════════
async function getStats(supabase: any) {
  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool' }, 404)

  const { data: openTrades } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('pool_id', pool.id)
    .eq('status', 'open')
    .order('entered_at', { ascending: false })

  const { data: recentClosed } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('pool_id', pool.id)
    .neq('status', 'open')
    .order('exited_at', { ascending: false })
    .limit(20)

  const { data: dailyStats } = await supabase
    .from('banker_pool_daily_stats')
    .select('*')
    .eq('pool_id', pool.id)
    .order('date', { ascending: false })
    .limit(30)

  const winRate = pool.total_trades > 0 
    ? ((pool.winning_trades / pool.total_trades) * 100).toFixed(1) 
    : '0'

  const totalReturn = pool.starting_capital > 0 
    ? (((pool.current_capital - pool.starting_capital + (openTrades || []).reduce((s: number, t: any) => s + (t.position_size_usd || 0), 0)) / pool.starting_capital) * 100).toFixed(2)
    : '0'

  // Unrealized P&L
  const unrealizedPnl = (openTrades || []).reduce((sum: number, t: any) => {
    const mult = t.current_multiplier || 1
    return sum + (t.position_size_usd * (mult - 1))
  }, 0)

  return jsonResponse({
    success: true,
    pool: {
      ...pool,
      unrealized_pnl: unrealizedPnl,
      total_equity: pool.current_capital + (openTrades || []).reduce((s: number, t: any) => s + (t.position_size_usd * (t.current_multiplier || 1)), 0),
    },
    winRate,
    totalReturn,
    openTrades: openTrades || [],
    recentClosed: recentClosed || [],
    dailyStats: dailyStats || [],
  })
}

// ═══════════════════════════════════════════════════════════════
// DAILY REPORT
// ═══════════════════════════════════════════════════════════════
async function getDailyReport(supabase: any) {
  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool' }, 404)

  const today = new Date().toISOString().split('T')[0]

  const { data: stats } = await supabase
    .from('banker_pool_daily_stats')
    .select('*')
    .eq('pool_id', pool.id)
    .order('date', { ascending: false })
    .limit(30)

  const { data: todayTrades } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('pool_id', pool.id)
    .or(`entered_at.gte.${today}T00:00:00Z,exited_at.gte.${today}T00:00:00Z`)

  return jsonResponse({
    success: true,
    pool,
    dailyStats: stats || [],
    todayTrades: todayTrades || [],
  })
}

// ═══════════════════════════════════════════════════════════════
// CLOSE POSITION — Manual close
// ═══════════════════════════════════════════════════════════════
async function closePosition(supabase: any, tradeId: string, reason: string) {
  if (!tradeId) return jsonResponse({ error: 'trade_id required' }, 400)

  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool' }, 404)

  const { data: trade } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('id', tradeId)
    .eq('status', 'open')
    .single()

  if (!trade) return jsonResponse({ error: 'Trade not found or already closed' }, 404)

  const currentPrice = await fetchCurrentPrice(trade.token_mint) || trade.current_price_usd || trade.entry_price_usd
  const multiplier = currentPrice / trade.entry_price_usd
  const pnlPct = (multiplier - 1) * 100
  const pnlUsd = trade.position_size_usd * (multiplier - 1)

  await closeTrade(supabase, pool, trade, currentPrice, reason, pnlUsd, pnlPct)

  return jsonResponse({ success: true, pnlUsd, pnlPct, exitPrice: currentPrice })
}
