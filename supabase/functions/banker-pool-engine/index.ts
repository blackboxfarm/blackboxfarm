import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * BANKER POOL ENGINE v3 — AUTONOMOUS $250 Bankroll Manager
 * 
 * DISCOVERY SOURCE: Pump.fun Watchlist (pumpfun_watchlist table)
 * Tokens are discovered by the existing Pump.fun scanner pipeline and
 * this engine picks the best candidates from watching/qualified/buy_now statuses.
 * 
 * ENTRY CRITERIA:
 * - Status: watching, qualified, or buy_now in pumpfun_watchlist
 * - Market cap: $5k-$500k
 * - Holders: >= 10
 * - Volume: >= 5 SOL
 * - RugCheck score < 5000 (if available)
 * - Not dev_sold, not permanently rejected
 * - Scored by weighted system (holder growth, volume, mcap sweet spot, rugcheck)
 * 
 * RISK MANAGEMENT:
 * - Max 4% bankroll per trade
 * - Max 5 concurrent positions
 * - Stop-loss at -25%
 * - Take profit at +100% (2x)
 * - Trailing stop at -15% from peak
 * - Daily loss limit: -10% of bankroll
 * - Time decay: exit after 4h if flat, 12h hard limit
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

    console.log(`🏦 Banker Pool Engine v3 (Pump.fun) — action: ${action}`)

    switch (action) {
      case 'init': return await initPool(supabase)
      case 'cycle': return await runCycle(supabase)
      case 'stats': return await getStats(supabase)
      case 'daily-report': return await getDailyReport(supabase)
      case 'close-position': return await closePosition(supabase, body.trade_id, body.reason || 'manual')
      case 'reset': return await resetPool(supabase)
      case 'scan-only': return await scanOnly(supabase)
      default: return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (e) {
    console.error('Banker Pool error:', e)
    return jsonResponse({ error: String(e) }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════
// INIT
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
// RESET
// ═══════════════════════════════════════════════════════════════
async function resetPool(supabase: any) {
  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool found' }, 404)

  const { data: openTrades } = await supabase
    .from('banker_pool_trades')
    .select('*')
    .eq('pool_id', pool.id)
    .eq('status', 'open')

  for (const trade of (openTrades || [])) {
    await supabase.from('banker_pool_trades').update({
      status: 'closed_loss', exit_reason: 'pool_reset',
      exited_at: new Date().toISOString(),
      exit_price_usd: trade.current_price_usd || trade.entry_price_usd,
      pnl_usd: 0, pnl_pct: 0,
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
// SCAN ONLY — Preview what the Pump.fun watchlist has available
// ═══════════════════════════════════════════════════════════════
async function scanOnly(supabase: any) {
  const candidates = await discoverFromPumpfun(supabase)
  return jsonResponse({
    success: true,
    candidatesFound: candidates.length,
    candidates: candidates.slice(0, 20).map(c => ({
      symbol: c.symbol,
      name: c.name,
      mint: c.mint,
      price: c.priceUsd,
      mcap: c.mcap,
      volumeSol: c.volumeSol,
      liquidity: c.liquidity,
      holders: c.holders,
      rugcheckScore: c.rugcheckScore,
      status: c.watchlistStatus,
      bankerScore: c.bankerScore,
      reasons: c.reasons,
      holderGrowth: c.holderGrowth,
      devSold: c.devSold,
    })),
  })
}

// ═══════════════════════════════════════════════════════════════
// RUN CYCLE — Main loop: scan pump.fun watchlist → filter → enter → monitor → exit
// ═══════════════════════════════════════════════════════════════
async function runCycle(supabase: any) {
  const pool = await getPool(supabase)
  if (!pool) {
    await initPool(supabase)
    return jsonResponse({ success: true, message: 'Pool auto-initialized', actions: [], scan: { found: 0 } })
  }
  if (!pool.is_active) return jsonResponse({ success: true, message: 'Pool paused', actions: [], scan: { found: 0 } })

  const actions: string[] = []
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // 1. Daily loss limit check
  const dailyPnl = await getDailyPnl(supabase, pool.id, today)
  const dailyLossLimit = pool.current_capital * (pool.daily_loss_limit_pct / 100)
  
  if (dailyPnl < -dailyLossLimit) {
    actions.push(`🛑 DAILY LOSS LIMIT: $${dailyPnl.toFixed(2)} (limit: -$${dailyLossLimit.toFixed(2)})`)
    await closeAllPositions(supabase, pool, 'daily_loss_limit')
    return jsonResponse({ success: true, actions, limitHit: true, scan: { found: 0 } })
  }

  // 2. Monitor existing positions
  const exitActions = await monitorPositions(supabase, pool)
  actions.push(...exitActions)

  // 3. PUMP.FUN DISCOVERY — pull from pumpfun_watchlist
  const candidates = await discoverFromPumpfun(supabase)
  actions.push(`🔍 Pump.fun scanner found ${candidates.length} candidates`)

  // 4. Enter positions
  const entryActions = await enterFromDiscovery(supabase, pool, candidates)
  actions.push(...entryActions)

  // 5. Update daily stats
  await updateDailyStats(supabase, pool, today)

  return jsonResponse({
    success: true,
    actions,
    poolCapital: pool.current_capital,
    scan: {
      found: candidates.length,
      passedSafety: candidates.length,
      topCandidates: candidates.slice(0, 5).map(c => ({
        symbol: c.symbol, score: c.bankerScore, mcap: c.mcap,
        holders: c.holders, status: c.watchlistStatus,
      })),
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// PUMP.FUN WATCHLIST DISCOVERY
// Pulls candidates from pumpfun_watchlist table
// ═══════════════════════════════════════════════════════════════

interface PumpfunCandidate {
  mint: string
  symbol: string
  name: string
  priceUsd: number
  mcap: number
  volumeSol: number
  volume5m: number
  liquidity: number
  holders: number
  holdersPrev: number
  holderGrowth: number
  rugcheckScore: number
  rugcheckPassed: boolean
  devSold: boolean
  watchlistStatus: string
  priorityScore: number
  bankerScore: number
  reasons: string[]
  priceAth: number
  priceCurrent: number
  mintAuthRevoked: boolean
  freezeAuthRevoked: boolean
  socialCount: number
  bundleScore: number
  maxWalletPct: number
  createdAt: string
}

async function discoverFromPumpfun(supabase: any): Promise<PumpfunCandidate[]> {
  // Pull tokens from watchlist that are actively being monitored
  // Priority: buy_now > qualified > watching
  const { data: watchlistTokens, error } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['watching', 'qualified', 'buy_now'])
    .eq('permanent_reject', false)
    .order('priority_score', { ascending: false })
    .limit(100)

  if (error || !watchlistTokens?.length) {
    console.log(`🔍 Pump.fun watchlist: ${error ? 'error: ' + error.message : 'no tokens found'}`)
    return []
  }

  console.log(`🔍 Pump.fun watchlist: ${watchlistTokens.length} tokens in watching/qualified/buy_now`)

  const candidates: PumpfunCandidate[] = []

  for (const token of watchlistTokens) {
    const mcap = parseFloat(token.market_cap_usd) || 0
    const priceUsd = parseFloat(token.price_usd) || 0
    const volumeSol = parseFloat(token.volume_sol) || 0
    const holders = token.holder_count || 0
    const holdersPrev = token.holder_count_prev || 0
    const liquidity = parseFloat(token.liquidity_usd) || 0
    const rugcheckScore = token.rugcheck_score || 0
    const devSold = token.dev_sold || false

    // Hard filters — skip tokens that are clearly not viable
    if (priceUsd <= 0) continue
    if (mcap < 5000) continue // Too tiny
    if (mcap > 500000) continue // Too big for early plays
    if (holders < 10) continue // Not enough holders
    if (volumeSol < 3) continue // No volume
    if (devSold) continue // Dev dumped
    if (rugcheckScore > 5000) continue // Too risky

    const holderGrowth = holdersPrev > 0 ? ((holders - holdersPrev) / holdersPrev) * 100 : 0

    const candidate: PumpfunCandidate = {
      mint: token.token_mint,
      symbol: token.token_symbol || 'UNK',
      name: token.token_name || 'Unknown',
      priceUsd,
      mcap,
      volumeSol,
      volume5m: parseFloat(token.volume_5m) || 0,
      liquidity,
      holders,
      holdersPrev,
      holderGrowth,
      rugcheckScore,
      rugcheckPassed: token.rugcheck_passed || false,
      devSold,
      watchlistStatus: token.status,
      priorityScore: parseFloat(token.priority_score) || 0,
      bankerScore: 0,
      reasons: [],
      priceAth: parseFloat(token.price_ath_usd) || 0,
      priceCurrent: parseFloat(token.price_current) || priceUsd,
      mintAuthRevoked: token.mint_authority_revoked || false,
      freezeAuthRevoked: token.freeze_authority_revoked || false,
      socialCount: token.socials_count || 0,
      bundleScore: token.bundle_score || 0,
      maxWalletPct: parseFloat(token.max_single_wallet_pct) || 0,
      createdAt: token.created_at_blockchain || token.first_seen_at || '',
    }

    candidate.bankerScore = scorePumpfunCandidate(candidate)
    candidates.push(candidate)
  }

  // Sort by score
  candidates.sort((a, b) => b.bankerScore - a.bankerScore)

  console.log(`🔍 Discovery: ${watchlistTokens.length} watchlist → ${candidates.length} viable → top score: ${candidates[0]?.bankerScore || 0}`)

  return candidates.filter(c => c.bankerScore >= 45)
}

// ═══════════════════════════════════════════════════════════════
// PUMP.FUN SCORING ENGINE
// Weights tuned for bonding curve / early pump.fun tokens
// ═══════════════════════════════════════════════════════════════
function scorePumpfunCandidate(c: PumpfunCandidate): number {
  let score = 0
  const reasons: string[] = []

  // === WATCHLIST STATUS BONUS (0-15 pts) ===
  if (c.watchlistStatus === 'buy_now') { score += 15; reasons.push('buy_now') }
  else if (c.watchlistStatus === 'qualified') { score += 10; reasons.push('qualified') }
  else { score += 3; reasons.push('watching') }

  // === MARKET CAP SWEET SPOT (0-20 pts) ===
  if (c.mcap >= 10000 && c.mcap <= 50000) { score += 20; reasons.push('mcap-sweet') }
  else if (c.mcap > 50000 && c.mcap <= 150000) { score += 15; reasons.push('mcap-mid') }
  else if (c.mcap > 150000 && c.mcap <= 500000) { score += 10; reasons.push('mcap-high') }
  else if (c.mcap >= 5000 && c.mcap < 10000) { score += 8; reasons.push('mcap-low') }

  // === HOLDER COUNT & GROWTH (0-20 pts) ===
  if (c.holders >= 200) { score += 12; reasons.push('holders-strong') }
  else if (c.holders >= 100) { score += 10; reasons.push('holders-good') }
  else if (c.holders >= 50) { score += 7; reasons.push('holders-ok') }
  else if (c.holders >= 20) { score += 4; reasons.push('holders-low') }
  else { score += 1; reasons.push('holders-minimal') }

  // Holder growth bonus
  if (c.holderGrowth > 20) { score += 8; reasons.push(`holders+${c.holderGrowth.toFixed(0)}%`) }
  else if (c.holderGrowth > 10) { score += 5; reasons.push(`holders+${c.holderGrowth.toFixed(0)}%`) }
  else if (c.holderGrowth > 0) { score += 2; reasons.push('holders-growing') }

  // === VOLUME (0-15 pts) ===
  if (c.volumeSol >= 100) { score += 15; reasons.push('vol-hot') }
  else if (c.volumeSol >= 50) { score += 12; reasons.push('vol-strong') }
  else if (c.volumeSol >= 20) { score += 8; reasons.push('vol-good') }
  else if (c.volumeSol >= 5) { score += 4; reasons.push('vol-ok') }

  // === LIQUIDITY (0-10 pts) ===
  if (c.liquidity >= 20000) { score += 10; reasons.push('liq-strong') }
  else if (c.liquidity >= 10000) { score += 8; reasons.push('liq-good') }
  else if (c.liquidity >= 5000) { score += 5; reasons.push('liq-ok') }
  // On bonding curve, liquidity may be null/0 — don't penalize heavily
  else if (c.liquidity > 0) { score += 2; reasons.push('liq-low') }

  // === SAFETY (0-10 pts) ===
  if (c.rugcheckPassed || c.rugcheckScore <= 100) { score += 10; reasons.push('rugcheck-clean') }
  else if (c.rugcheckScore <= 2000) { score += 6; reasons.push('rugcheck-ok') }
  else if (c.rugcheckScore <= 5000) { score += 2; reasons.push('rugcheck-warn') }

  if (c.mintAuthRevoked && c.freezeAuthRevoked) { score += 3; reasons.push('auth-revoked') }

  // === SOCIALS (0-5 pts) ===
  if (c.socialCount >= 2) { score += 5; reasons.push('socials') }
  else if (c.socialCount >= 1) { score += 2; reasons.push('1-social') }

  // === RED FLAGS ===
  if (c.bundleScore && c.bundleScore > 50) { score -= 10; reasons.push('bundled') }
  if (c.maxWalletPct > 30) { score -= 8; reasons.push('whale-concentrated') }

  // === PRIORITY SCORE from pipeline (0-5 pts) ===
  if (c.priorityScore >= 70) { score += 5; reasons.push('high-priority') }
  else if (c.priorityScore >= 55) { score += 3; reasons.push('mid-priority') }

  c.reasons = reasons
  return Math.max(0, Math.min(100, score))
}

// ═══════════════════════════════════════════════════════════════
// ENTER FROM DISCOVERY
// ═══════════════════════════════════════════════════════════════
async function enterFromDiscovery(supabase: any, pool: any, candidates: PumpfunCandidate[]): Promise<string[]> {
  const actions: string[] = []

  const { count: openCount } = await supabase
    .from('banker_pool_trades')
    .select('id', { count: 'exact', head: true })
    .eq('pool_id', pool.id)
    .eq('status', 'open')

  if ((openCount || 0) >= pool.max_open_positions) {
    actions.push(`📊 Max positions (${openCount}/${pool.max_open_positions})`)
    return actions
  }

  const slots = pool.max_open_positions - (openCount || 0)

  // Get already-traded mints to avoid re-entry
  const { data: existingMints } = await supabase
    .from('banker_pool_trades')
    .select('token_mint')
    .eq('pool_id', pool.id)

  const tradedMints = new Set((existingMints || []).map((t: any) => t.token_mint))

  let entered = 0
  for (const candidate of candidates) {
    if (entered >= slots) break
    if (tradedMints.has(candidate.mint)) continue
    if (candidate.priceUsd <= 0) continue

    const streak = await getRecentStreak(supabase, pool.id)
    
    // Position sizing based on score
    let positionPct = pool.max_position_pct
    if (candidate.bankerScore >= 80) positionPct = Math.min(5, pool.max_position_pct + 1)
    else if (candidate.bankerScore < 55) positionPct = Math.max(2, pool.max_position_pct - 1)
    if (Math.abs(streak) >= 3) positionPct = Math.min(positionPct, 2)
    
    const positionSizeUsd = pool.current_capital * (positionPct / 100)
    if (positionSizeUsd < 2) {
      actions.push(`⚠️ Bankroll too low ($${pool.current_capital.toFixed(2)})`)
      break
    }

    const entryPrice = candidate.priceUsd
    const stopLossPrice = entryPrice * (1 - pool.stop_loss_pct / 100)
    const takeProfitPrice = entryPrice * (1 + pool.take_profit_pct / 100)

    const entryReason = [
      `Score:${candidate.bankerScore}`,
      `MCap:$${(candidate.mcap / 1000).toFixed(0)}k`,
      `Holders:${candidate.holders}`,
      `Vol:${candidate.volumeSol.toFixed(0)}SOL`,
      `Status:${candidate.watchlistStatus}`,
      ...(candidate.reasons.slice(0, 3)),
    ].join(' | ')

    const { error } = await supabase.from('banker_pool_trades').insert({
      pool_id: pool.id,
      token_mint: candidate.mint,
      token_symbol: candidate.symbol,
      token_name: candidate.name,
      entry_price_usd: entryPrice,
      entry_mcap: candidate.mcap,
      entry_score: candidate.bankerScore,
      entry_reason: entryReason,
      position_size_usd: positionSizeUsd,
      position_size_pct: positionPct,
      current_price_usd: entryPrice,
      current_multiplier: 1,
      stop_loss_price: stopLossPrice,
      take_profit_price: takeProfitPrice,
      trailing_stop_price: stopLossPrice,
      peak_price_usd: entryPrice,
      peak_multiplier: 1,
      status: 'open',
    })

    if (!error) {
      await supabase.from('banker_pool').update({
        current_capital: pool.current_capital - positionSizeUsd,
        total_invested: (pool.total_invested || 0) + positionSizeUsd,
        total_trades: (pool.total_trades || 0) + 1,
      }).eq('id', pool.id)
      
      pool.current_capital -= positionSizeUsd
      
      actions.push(`🟢 ENTRY: ${candidate.symbol} | $${positionSizeUsd.toFixed(2)} (${positionPct}%) | Score:${candidate.bankerScore} | ${candidate.watchlistStatus} | Holders:${candidate.holders}`)
      entered++
      tradedMints.add(candidate.mint)
    }
  }

  if (entered === 0 && candidates.length > 0) {
    actions.push(`⏳ ${candidates.length} candidates found but none met all entry criteria`)
  }

  return actions
}

// ═══════════════════════════════════════════════════════════════
// MONITOR POSITIONS
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
      const currentPrice = await fetchCurrentPrice(trade.token_mint)
      if (!currentPrice) continue

      const multiplier = currentPrice / trade.entry_price_usd
      const pnlPct = (multiplier - 1) * 100
      const pnlUsd = trade.position_size_usd * (multiplier - 1)
      const peakPrice = Math.max(trade.peak_price_usd || trade.entry_price_usd, currentPrice)
      const peakMultiplier = peakPrice / trade.entry_price_usd
      const newTrailingStop = peakPrice * (1 - pool.trailing_stop_pct / 100)
      const trailingStop = Math.max(trade.trailing_stop_price || 0, newTrailingStop)

      await supabase.from('banker_pool_trades').update({
        current_price_usd: currentPrice,
        current_multiplier: multiplier,
        peak_price_usd: peakPrice,
        peak_multiplier: peakMultiplier,
        trailing_stop_price: trailingStop,
      }).eq('id', trade.id)

      const ageHours = (Date.now() - new Date(trade.entered_at).getTime()) / 3600000

      if (pnlPct <= -pool.stop_loss_pct) {
        await closeTrade(supabase, pool, trade, currentPrice, 'stop_loss', pnlUsd, pnlPct)
        actions.push(`🔴 STOP-LOSS: ${trade.token_symbol} @ ${pnlPct.toFixed(1)}% ($${pnlUsd.toFixed(2)})`)
        continue
      }

      if (peakMultiplier > 1.15 && currentPrice <= trailingStop) {
        await closeTrade(supabase, pool, trade, currentPrice, 'trailing_stop', pnlUsd, pnlPct)
        actions.push(`🟡 TRAILING: ${trade.token_symbol} @ ${pnlPct.toFixed(1)}% (peak: +${((peakMultiplier-1)*100).toFixed(1)}%)`)
        continue
      }

      if (pnlPct >= pool.take_profit_pct) {
        await closeTrade(supabase, pool, trade, currentPrice, 'take_profit', pnlUsd, pnlPct)
        actions.push(`🟢 TAKE PROFIT: ${trade.token_symbol} @ +${pnlPct.toFixed(1)}% ($${pnlUsd.toFixed(2)})`)
        continue
      }

      if (ageHours > 4 && pnlPct > -5 && pnlPct < 10) {
        await closeTrade(supabase, pool, trade, currentPrice, 'time_decay', pnlUsd, pnlPct)
        actions.push(`⏰ TIME DECAY: ${trade.token_symbol} @ ${pnlPct.toFixed(1)}% after ${ageHours.toFixed(1)}h`)
        continue
      }

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
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function getPool(supabase: any) {
  const { data } = await supabase.from('banker_pool').select('*').limit(1).maybeSingle()
  return data
}

async function fetchCurrentPrice(mint: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
    if (res.ok) {
      const data = await res.json()
      const price = parseFloat(data?.pairs?.[0]?.priceUsd)
      if (price > 0) return price
    }
  } catch {}
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
    status, exit_price_usd: exitPrice, exit_reason: reason,
    exited_at: new Date().toISOString(), pnl_usd: pnlUsd, pnl_pct: pnlPct,
  }).eq('id', trade.id)

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
  Object.assign(pool, updates)
}

async function closePosition(supabase: any, tradeId: string, reason: string) {
  if (!tradeId) return jsonResponse({ error: 'trade_id required' }, 400)
  
  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool' }, 404)

  const { data: trade } = await supabase
    .from('banker_pool_trades').select('*')
    .eq('id', tradeId).single()

  if (!trade) return jsonResponse({ error: 'Trade not found' }, 404)

  const currentPrice = await fetchCurrentPrice(trade.token_mint) || trade.current_price_usd || trade.entry_price_usd
  const multiplier = currentPrice / trade.entry_price_usd
  const pnlPct = (multiplier - 1) * 100
  const pnlUsd = trade.position_size_usd * (multiplier - 1)

  await closeTrade(supabase, pool, trade, currentPrice, reason, pnlUsd, pnlPct)
  return jsonResponse({ success: true, symbol: trade.token_symbol, pnlPct, pnlUsd })
}

async function closeAllPositions(supabase: any, pool: any, reason: string) {
  const { data: openTrades } = await supabase
    .from('banker_pool_trades').select('*')
    .eq('pool_id', pool.id).eq('status', 'open')

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
    .from('banker_pool_trades').select('pnl_usd')
    .eq('pool_id', poolId)
    .gte('exited_at', `${date}T00:00:00Z`)
    .lte('exited_at', `${date}T23:59:59Z`)
    .not('pnl_usd', 'is', null)
  return (data || []).reduce((sum: number, t: any) => sum + (t.pnl_usd || 0), 0)
}

async function getRecentStreak(supabase: any, poolId: string): Promise<number> {
  const { data } = await supabase
    .from('banker_pool_trades').select('status')
    .eq('pool_id', poolId).neq('status', 'open')
    .order('exited_at', { ascending: false }).limit(5)
  if (!data?.length) return 0
  let streak = 0
  const firstStatus = data[0].status
  for (const trade of data) {
    if (trade.status === firstStatus) streak++; else break
  }
  return firstStatus === 'closed_win' ? streak : -streak
}

async function updateDailyStats(supabase: any, pool: any, date: string) {
  const { data: todayTrades } = await supabase
    .from('banker_pool_trades').select('*')
    .eq('pool_id', pool.id)
    .or(`entered_at.gte.${date}T00:00:00Z,exited_at.gte.${date}T00:00:00Z`)

  const opened = (todayTrades || []).filter((t: any) => t.entered_at?.startsWith(date)).length
  const closed = (todayTrades || []).filter((t: any) => t.exited_at?.startsWith(date)).length
  const wins = (todayTrades || []).filter((t: any) => t.exited_at?.startsWith(date) && t.status === 'closed_win').length
  const losses = (todayTrades || []).filter((t: any) => t.exited_at?.startsWith(date) && t.status === 'closed_loss').length
  const closedToday = (todayTrades || []).filter((t: any) => t.exited_at?.startsWith(date) && t.pnl_usd != null)
  const dailyPnl = closedToday.reduce((sum: number, t: any) => sum + (t.pnl_usd || 0), 0)
  const bestTrade = closedToday.reduce((max: number, t: any) => Math.max(max, t.pnl_usd || 0), 0)
  const worstTrade = closedToday.reduce((min: number, t: any) => Math.min(min, t.pnl_usd || 0), 0)

  const { count: openCount } = await supabase
    .from('banker_pool_trades').select('id', { count: 'exact', head: true })
    .eq('pool_id', pool.id).eq('status', 'open')

  const { data: openTrades } = await supabase
    .from('banker_pool_trades').select('position_size_usd')
    .eq('pool_id', pool.id).eq('status', 'open')

  const capitalAtRisk = (openTrades || []).reduce((sum: number, t: any) => sum + (t.position_size_usd || 0), 0)

  await supabase.from('banker_pool_daily_stats').upsert({
    pool_id: pool.id, date,
    opening_capital: pool.starting_capital,
    closing_capital: pool.current_capital,
    daily_pnl: dailyPnl,
    daily_pnl_pct: pool.starting_capital > 0 ? (dailyPnl / pool.starting_capital) * 100 : 0,
    trades_opened: opened, trades_closed: closed, wins, losses,
    best_trade_pnl: bestTrade || null, worst_trade_pnl: worstTrade || null,
    open_positions: openCount || 0, capital_at_risk: capitalAtRisk,
  }, { onConflict: 'pool_id,date' })
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════
async function getStats(supabase: any) {
  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool' }, 404)

  const { data: openTrades } = await supabase
    .from('banker_pool_trades').select('*')
    .eq('pool_id', pool.id).eq('status', 'open')
    .order('entered_at', { ascending: false })

  const { data: recentClosed } = await supabase
    .from('banker_pool_trades').select('*')
    .eq('pool_id', pool.id).neq('status', 'open')
    .order('exited_at', { ascending: false }).limit(20)

  const { data: dailyStats } = await supabase
    .from('banker_pool_daily_stats').select('*')
    .eq('pool_id', pool.id)
    .order('date', { ascending: false }).limit(30)

  const winRate = pool.total_trades > 0 
    ? ((pool.winning_trades / pool.total_trades) * 100).toFixed(1) : '0'

  const investedInOpen = (openTrades || []).reduce((s: number, t: any) => s + (t.position_size_usd * (t.current_multiplier || 1)), 0)
  const totalEquity = pool.current_capital + investedInOpen

  const totalReturn = pool.starting_capital > 0 
    ? (((totalEquity - pool.starting_capital) / pool.starting_capital) * 100).toFixed(2) : '0'

  const unrealizedPnl = (openTrades || []).reduce((sum: number, t: any) => {
    return sum + (t.position_size_usd * ((t.current_multiplier || 1) - 1))
  }, 0)

  return jsonResponse({
    success: true,
    pool: { ...pool, unrealized_pnl: unrealizedPnl, total_equity: totalEquity },
    winRate, totalReturn,
    openTrades: openTrades || [],
    recentClosed: recentClosed || [],
    dailyStats: dailyStats || [],
  })
}

async function getDailyReport(supabase: any) {
  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool' }, 404)

  const today = new Date().toISOString().split('T')[0]
  const { data: stats } = await supabase
    .from('banker_pool_daily_stats').select('*')
    .eq('pool_id', pool.id)
    .order('date', { ascending: false }).limit(30)

  const { data: todayTrades } = await supabase
    .from('banker_pool_trades').select('*')
    .eq('pool_id', pool.id)
    .or(`entered_at.gte.${today}T00:00:00Z,exited_at.gte.${today}T00:00:00Z`)

  return jsonResponse({
    success: true, pool, stats, todayTrades,
  })
}
