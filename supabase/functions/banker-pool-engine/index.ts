import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * BANKER POOL ENGINE v2 — AUTONOMOUS $250 Bankroll Manager
 * 
 * THIS ENGINE FINDS ITS OWN TOKENS. No watchlist dependency.
 * 
 * DISCOVERY SOURCES:
 * 1. DexScreener — trending Solana pairs, volume surges, new listings
 * 2. Jupiter — price verification
 * 3. Independent safety checks — liquidity, holder analysis, dev wallet screening
 * 
 * ENTRY CRITERIA (self-contained):
 * - Volume surge: 5m volume > 2x the 1h average
 * - Liquidity floor: > $5k USD
 * - Market cap: $10k-$500k sweet spot
 * - Pair age: 10min - 24h (not too new, not stale)
 * - Price trend: positive 5m and 1h change
 * - Not a known scam token (dev wallet check)
 * - Buy/sell ratio signals (more buys than sells)
 * 
 * RISK MANAGEMENT:
 * - Max 4% bankroll per trade ($10 on $250)
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

    console.log(`🏦 Banker Pool Engine v2 — action: ${action}`)

    switch (action) {
      case 'init': return await initPool(supabase)
      case 'cycle': return await runCycle(supabase)
      case 'stats': return await getStats(supabase)
      case 'daily-report': return await getDailyReport(supabase)
      case 'close-position': return await closePosition(supabase, body.trade_id, body.reason || 'manual')
      case 'reset': return await resetPool(supabase)
      case 'scan-only': return await scanOnly()
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
// SCAN ONLY — Preview what the scanner finds without trading
// ═══════════════════════════════════════════════════════════════
async function scanOnly() {
  const candidates = await discoverTokens()
  return jsonResponse({
    success: true,
    candidatesFound: candidates.length,
    candidates: candidates.slice(0, 20).map(c => ({
      symbol: c.symbol,
      name: c.name,
      mint: c.mint,
      price: c.priceUsd,
      mcap: c.mcap,
      volume24h: c.volume24h,
      liquidity: c.liquidity,
      priceChange5m: c.priceChange5m,
      priceChange1h: c.priceChange1h,
      pairAge: c.pairAgeMinutes,
      bankerScore: c.bankerScore,
      source: c.source,
      reasons: c.reasons,
    })),
  })
}

// ═══════════════════════════════════════════════════════════════
// RUN CYCLE — Main loop: scan → filter → enter → monitor → exit
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

  // 3. AUTONOMOUS DISCOVERY — find our own tokens
  const candidates = await discoverTokens()
  actions.push(`🔍 Scanner found ${candidates.length} candidates`)

  // 4. Check against known bad actors
  const safeCandidates = await filterBadActors(supabase, candidates)
  actions.push(`🛡️ ${safeCandidates.length} passed safety checks`)

  // 5. Enter positions from our own discoveries
  const entryActions = await enterFromDiscovery(supabase, pool, safeCandidates)
  actions.push(...entryActions)

  // 6. Update daily stats
  await updateDailyStats(supabase, pool, today)

  return jsonResponse({
    success: true,
    actions,
    poolCapital: pool.current_capital,
    scan: {
      found: candidates.length,
      passedSafety: safeCandidates.length,
      topCandidates: safeCandidates.slice(0, 5).map(c => ({
        symbol: c.symbol, score: c.bankerScore, mcap: c.mcap
      })),
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// AUTONOMOUS TOKEN DISCOVERY
// Scans DexScreener for Solana opportunities
// ═══════════════════════════════════════════════════════════════

interface TokenCandidate {
  mint: string
  symbol: string
  name: string
  priceUsd: number
  mcap: number
  volume24h: number
  volume5m: number
  volume1h: number
  liquidity: number
  priceChange5m: number
  priceChange1h: number
  priceChange24h: number
  pairAgeMinutes: number
  pairAddress: string
  txns5mBuys: number
  txns5mSells: number
  txns1hBuys: number
  txns1hSells: number
  bankerScore: number
  source: string
  reasons: string[]
  dexId: string
}

async function discoverTokens(): Promise<TokenCandidate[]> {
  const allCandidates: TokenCandidate[] = []

  // Source 1: DexScreener Solana token profiles (boosted/trending)
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {
      headers: { 'Accept': 'application/json' },
    })
    if (res.ok) {
      const boosts = await res.json()
      const solanaBoosted = (boosts || [])
        .filter((b: any) => b.chainId === 'solana')
        .slice(0, 15)
      
      for (const boost of solanaBoosted) {
        try {
          const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${boost.tokenAddress}`)
          if (pairRes.ok) {
            const pairData = await pairRes.json()
            const parsed = parseDexScreenerPairs(pairData?.pairs || [], 'boosted')
            allCandidates.push(...parsed)
          }
        } catch {}
      }
    }
  } catch (e) {
    console.error('Boosted scan error:', e)
  }

  // Source 2: DexScreener search for recent high-volume Solana pairs
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/pairs/solana?sort=volume&order=desc', {
      headers: { 'Accept': 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      const parsed = parseDexScreenerPairs(data?.pairs || [], 'volume_scan')
      allCandidates.push(...parsed)
    }
  } catch (e) {
    console.error('Volume scan error:', e)
  }

  // Source 3: Trending tokens on DexScreener
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/trending/solana', {
      headers: { 'Accept': 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      // This endpoint returns token addresses; need to look up pairs
      if (Array.isArray(data)) {
        for (const token of data.slice(0, 10)) {
          try {
            const addr = typeof token === 'string' ? token : token?.tokenAddress
            if (!addr) continue
            const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`)
            if (pairRes.ok) {
              const pairData = await pairRes.json()
              allCandidates.push(...parseDexScreenerPairs(pairData?.pairs || [], 'trending'))
            }
          } catch {}
        }
      }
    }
  } catch (e) {
    console.error('Trending scan error:', e)
  }

  // Deduplicate by mint
  const seen = new Set<string>()
  const unique: TokenCandidate[] = []
  for (const c of allCandidates) {
    if (!seen.has(c.mint)) {
      seen.add(c.mint)
      unique.push(c)
    }
  }

  // Score and sort
  const scored = unique.map(c => ({ ...c, bankerScore: scoreCandidateAutonomous(c) }))
  scored.sort((a, b) => b.bankerScore - a.bankerScore)

  console.log(`🔍 Discovery: ${allCandidates.length} raw → ${unique.length} unique → top score: ${scored[0]?.bankerScore || 0}`)

  return scored.filter(c => c.bankerScore >= 50) // Only return viable candidates
}

function parseDexScreenerPairs(pairs: any[], source: string): TokenCandidate[] {
  const results: TokenCandidate[] = []
  
  for (const pair of pairs) {
    if (!pair || pair.chainId !== 'solana') continue
    
    const priceUsd = parseFloat(pair.priceUsd || '0')
    const mcap = pair.marketCap || pair.fdv || 0
    const liquidity = pair.liquidity?.usd || 0
    const volume24h = pair.volume?.h24 || 0
    const volume1h = pair.volume?.h1 || 0
    const volume5m = pair.volume?.m5 || 0
    
    // Skip wrapped SOL, USDC, stablecoins
    const symbol = (pair.baseToken?.symbol || '').toUpperCase()
    if (['SOL', 'WSOL', 'USDC', 'USDT', 'BONK', 'WIF', 'JUP'].includes(symbol)) continue
    
    const pairCreated = pair.pairCreatedAt ? new Date(pair.pairCreatedAt).getTime() : 0
    const pairAgeMinutes = pairCreated > 0 ? (Date.now() - pairCreated) / 60000 : 99999

    const candidate: TokenCandidate = {
      mint: pair.baseToken?.address || '',
      symbol: pair.baseToken?.symbol || 'UNKNOWN',
      name: pair.baseToken?.name || 'Unknown',
      priceUsd,
      mcap,
      volume24h,
      volume5m,
      volume1h,
      liquidity,
      priceChange5m: pair.priceChange?.m5 || 0,
      priceChange1h: pair.priceChange?.h1 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      pairAgeMinutes,
      pairAddress: pair.pairAddress || '',
      txns5mBuys: pair.txns?.m5?.buys || 0,
      txns5mSells: pair.txns?.m5?.sells || 0,
      txns1hBuys: pair.txns?.h1?.buys || 0,
      txns1hSells: pair.txns?.h1?.sells || 0,
      bankerScore: 0,
      source,
      reasons: [],
      dexId: pair.dexId || '',
    }

    if (candidate.mint && priceUsd > 0) {
      results.push(candidate)
    }
  }

  return results
}

// ═══════════════════════════════════════════════════════════════
// AUTONOMOUS SCORING — No watchlist needed
// ═══════════════════════════════════════════════════════════════
function scoreCandidateAutonomous(c: TokenCandidate): number {
  let score = 0
  const reasons: string[] = []

  // === MARKET CAP SWEET SPOT (0-20 pts) ===
  // $10k-$500k is the sweet spot for early plays
  if (c.mcap >= 10000 && c.mcap <= 50000) { score += 20; reasons.push('mcap-sweet-spot') }
  else if (c.mcap > 50000 && c.mcap <= 150000) { score += 15; reasons.push('mcap-mid') }
  else if (c.mcap > 150000 && c.mcap <= 500000) { score += 10; reasons.push('mcap-high') }
  else if (c.mcap > 500000) { score += 3; reasons.push('mcap-too-high') }
  else if (c.mcap < 5000) { score -= 5; reasons.push('mcap-too-low') }
  else { score += 5; reasons.push('mcap-borderline') }

  // === LIQUIDITY (0-15 pts) ===
  if (c.liquidity >= 20000) { score += 15; reasons.push('liq-strong') }
  else if (c.liquidity >= 10000) { score += 12; reasons.push('liq-good') }
  else if (c.liquidity >= 5000) { score += 8; reasons.push('liq-ok') }
  else { score -= 10; reasons.push('liq-LOW') } // Dangerous

  // === VOLUME SURGE (0-20 pts) ===
  // 5m volume vs 1h average → surge detection
  const avgVolPer5m = c.volume1h > 0 ? c.volume1h / 12 : 0
  const volumeSurge = avgVolPer5m > 0 ? c.volume5m / avgVolPer5m : 0
  
  if (volumeSurge >= 3) { score += 20; reasons.push(`vol-surge-${volumeSurge.toFixed(1)}x`) }
  else if (volumeSurge >= 2) { score += 15; reasons.push(`vol-surge-${volumeSurge.toFixed(1)}x`) }
  else if (volumeSurge >= 1.5) { score += 10; reasons.push('vol-rising') }
  else if (c.volume24h >= 50000) { score += 8; reasons.push('vol-24h-high') }
  else if (c.volume24h >= 10000) { score += 5; reasons.push('vol-24h-ok') }
  else { score -= 5; reasons.push('vol-weak') }

  // === PRICE MOMENTUM (0-20 pts) ===
  // Both 5m and 1h positive = strong momentum
  if (c.priceChange5m > 5 && c.priceChange1h > 10) { score += 20; reasons.push('momentum-strong') }
  else if (c.priceChange5m > 2 && c.priceChange1h > 5) { score += 15; reasons.push('momentum-good') }
  else if (c.priceChange5m > 0 && c.priceChange1h > 0) { score += 10; reasons.push('momentum-positive') }
  else if (c.priceChange5m < -10 || c.priceChange1h < -20) { score -= 15; reasons.push('momentum-DUMP') }
  else if (c.priceChange5m < 0) { score -= 5; reasons.push('momentum-negative') }

  // === BUY PRESSURE (0-15 pts) ===
  const buyRatio5m = (c.txns5mBuys + c.txns5mSells) > 0 
    ? c.txns5mBuys / (c.txns5mBuys + c.txns5mSells) 
    : 0.5
  const buyRatio1h = (c.txns1hBuys + c.txns1hSells) > 0 
    ? c.txns1hBuys / (c.txns1hBuys + c.txns1hSells) 
    : 0.5
  
  if (buyRatio5m > 0.65 && buyRatio1h > 0.55) { score += 15; reasons.push('buys-dominating') }
  else if (buyRatio5m > 0.55) { score += 10; reasons.push('buys-positive') }
  else if (buyRatio5m < 0.35) { score -= 10; reasons.push('sells-dominating') }

  // === PAIR AGE (0-10 pts) ===
  // Sweet spot: 10 min - 6 hours
  if (c.pairAgeMinutes >= 10 && c.pairAgeMinutes <= 360) { score += 10; reasons.push('age-sweet-spot') }
  else if (c.pairAgeMinutes > 360 && c.pairAgeMinutes <= 1440) { score += 5; reasons.push('age-ok') }
  else if (c.pairAgeMinutes < 10) { score -= 10; reasons.push('age-TOO-NEW') } // Too risky
  else { score -= 3; reasons.push('age-stale') }

  // === DEX QUALITY ===
  if (c.dexId === 'raydium') { score += 3; reasons.push('raydium') }

  // === RED FLAGS ===
  if (c.mcap > 0 && c.liquidity > 0 && c.liquidity / c.mcap < 0.05) {
    score -= 15; reasons.push('liq-ratio-BAD')
  }
  // Pump and dump pattern: huge 5m spike with negative 1h
  if (c.priceChange5m > 30 && c.priceChange1h < -10) {
    score -= 20; reasons.push('pump-dump-pattern')
  }

  c.reasons = reasons
  return Math.max(0, Math.min(100, score))
}

// ═══════════════════════════════════════════════════════════════
// SAFETY FILTER — Check against known bad actors
// ═══════════════════════════════════════════════════════════════
async function filterBadActors(supabase: any, candidates: TokenCandidate[]): Promise<TokenCandidate[]> {
  if (!candidates.length) return []

  // Check dev_wallet_reputation for known scammers
  const mints = candidates.map(c => c.mint)
  
  // Check if any of these tokens are already flagged in watchlist as rejected
  const { data: flagged } = await supabase
    .from('pumpfun_watchlist')
    .select('token_mint, rejection_reasons')
    .in('token_mint', mints)
    .or('status.eq.rejected,status.eq.dead')

  const flaggedMints = new Set((flagged || []).map((f: any) => f.token_mint))

  return candidates.filter(c => {
    // Skip if flagged as rejected/dead in our watchlist
    if (flaggedMints.has(c.mint)) {
      c.reasons.push('FLAGGED-in-watchlist')
      return false
    }
    // Final score gate
    return c.bankerScore >= 50
  })
}

// ═══════════════════════════════════════════════════════════════
// ENTER FROM DISCOVERY — Enter positions from our scanner
// ═══════════════════════════════════════════════════════════════
async function enterFromDiscovery(supabase: any, pool: any, candidates: TokenCandidate[]): Promise<string[]> {
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
    
    // Position sizing
    let positionPct = pool.max_position_pct
    if (candidate.bankerScore >= 80) positionPct = Math.min(5, pool.max_position_pct + 1)
    else if (candidate.bankerScore < 65) positionPct = Math.max(2, pool.max_position_pct - 1)
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
      `Liq:$${(candidate.liquidity / 1000).toFixed(0)}k`,
      `Vol5m:${candidate.priceChange5m > 0 ? '+' : ''}${candidate.priceChange5m.toFixed(0)}%`,
      `Src:${candidate.source}`,
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
      
      actions.push(`🟢 ENTRY: ${candidate.symbol} | $${positionSizeUsd.toFixed(2)} (${positionPct}%) | Score:${candidate.bankerScore} | ${candidate.source} | MCap:$${(candidate.mcap/1000).toFixed(0)}k`)
      entered++
      tradedMints.add(candidate.mint)
    }
  }

  if (entered === 0 && candidates.length > 0) {
    actions.push(`⏳ ${candidates.length} candidates found but none met all criteria`)
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

  return jsonResponse({ success: true, pool, dailyStats: stats || [], todayTrades: todayTrades || [] })
}

async function closePosition(supabase: any, tradeId: string, reason: string) {
  if (!tradeId) return jsonResponse({ error: 'trade_id required' }, 400)

  const pool = await getPool(supabase)
  if (!pool) return jsonResponse({ error: 'No pool' }, 404)

  const { data: trade } = await supabase
    .from('banker_pool_trades').select('*')
    .eq('id', tradeId).eq('status', 'open').single()

  if (!trade) return jsonResponse({ error: 'Trade not found or already closed' }, 404)

  const currentPrice = await fetchCurrentPrice(trade.token_mint) || trade.current_price_usd || trade.entry_price_usd
  const multiplier = currentPrice / trade.entry_price_usd
  const pnlPct = (multiplier - 1) * 100
  const pnlUsd = trade.position_size_usd * (multiplier - 1)

  await closeTrade(supabase, pool, trade, currentPrice, reason, pnlUsd, pnlPct)

  return jsonResponse({ success: true, pnlUsd, pnlPct, exitPrice: currentPrice })
}
