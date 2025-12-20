import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FirstBuyer {
  wallet: string
  first_buy_time: number
  first_buy: {
    signature: string
    amount: number
    volume_usd: number
    time: number
  }
  held: number
  sold: number
  sold_usd: number
  holding: number
  realized: number
  unrealized: number
  total: number
  total_invested: number
  buy_transactions: number
  sell_transactions: number
  current_value: number
}

interface SolanaTrackerResponse {
  token: {
    name: string
    symbol: string
    mint: string
    description: string
    image: string
    creation: {
      creator: string
      created_tx: string
      created_time: number
    }
  }
  pools: Array<{
    poolId: string
    deployer: string
    market: string
    marketCap: { usd: number }
    liquidity: { usd: number }
    price: { usd: number }
    tokenSupply: number
    curvePercentage: number
    bundleId?: string
    txns: {
      buys: number
      sells: number
      total: number
      volume: number
    }
  }>
  risk: {
    snipers?: {
      count: number
      totalBalance: number
      totalPercentage: number
      wallets: Array<{ wallet: string; balance: number; percentage: number }>
    }
    insiders?: {
      count: number
      totalBalance: number
      totalPercentage: number
    }
    top10HoldersPercentage?: number
    ownerPercentage?: number
  }
  holders?: number
}

interface BundleAnalysis {
  isBundled: boolean
  bundleScore: number
  suspiciousPatterns: string[]
  bundleId: string | null
  snipersCount: number
  snipersPercentage: number
  insidersPercentage: number
  top10Percentage: number
  devPercentage: number
}

// Analyze token data for bundled scam patterns
function analyzeTokenRisk(data: SolanaTrackerResponse): BundleAnalysis {
  const patterns: string[] = []
  let bundleScore = 0
  
  const pool = data.pools?.[0]
  const risk = data.risk || {}
  
  // Pattern 1: Has bundle ID (definitive bundled token indicator)
  const hasBundleId = !!pool?.bundleId
  if (hasBundleId) {
    patterns.push(`Token was launched with bundled transactions (ID: ${pool.bundleId?.slice(0, 8)}...)`)
    bundleScore += 40
  }

  // Pattern 2: Snipers
  const snipersCount = risk.snipers?.count || 0
  const snipersPercentage = risk.snipers?.totalPercentage || 0
  if (snipersCount >= 5) {
    patterns.push(`${snipersCount} sniper wallets detected`)
    bundleScore += 15
  }
  if (snipersPercentage > 5) {
    patterns.push(`Snipers hold ${snipersPercentage.toFixed(1)}% of supply`)
    bundleScore += 10
  }

  // Pattern 3: Insiders
  const insidersPercentage = risk.insiders?.totalPercentage || 0
  if (insidersPercentage > 5) {
    patterns.push(`Insiders hold ${insidersPercentage.toFixed(1)}%`)
    bundleScore += 15
  }

  // Pattern 4: Top 10 concentration
  const top10Percentage = risk.top10HoldersPercentage || 0
  if (top10Percentage > 50) {
    patterns.push(`Top 10 holders control ${top10Percentage.toFixed(1)}%`)
    bundleScore += 20
  } else if (top10Percentage > 30) {
    patterns.push(`Top 10 holders control ${top10Percentage.toFixed(1)}%`)
    bundleScore += 10
  }

  // Pattern 5: Dev holding
  const devPercentage = risk.ownerPercentage || 0
  if (devPercentage > 10) {
    patterns.push(`Dev holds ${devPercentage.toFixed(1)}% of supply`)
    bundleScore += 15
  } else if (devPercentage > 5) {
    patterns.push(`Dev holds ${devPercentage.toFixed(1)}%`)
    bundleScore += 5
  }

  // Pattern 6: Low curve percentage on pump.fun (means early dump)
  if (pool?.market === 'pumpfun' && pool?.curvePercentage) {
    if (pool.curvePercentage < 20) {
      patterns.push(`Only ${pool.curvePercentage.toFixed(1)}% bonding curve filled`)
    }
  }

  // Pattern 7: High sell to buy ratio
  if (pool?.txns) {
    const sellRatio = pool.txns.sells / (pool.txns.buys || 1)
    if (sellRatio > 0.9 && pool.txns.total > 100) {
      patterns.push(`High sell pressure (${pool.txns.sells} sells vs ${pool.txns.buys} buys)`)
      bundleScore += 10
    }
  }

  return {
    isBundled: hasBundleId || bundleScore >= 50,
    bundleScore: Math.min(bundleScore, 100),
    suspiciousPatterns: patterns.length > 0 ? patterns : ['No suspicious patterns detected'],
    bundleId: pool?.bundleId || null,
    snipersCount,
    snipersPercentage,
    insidersPercentage,
    top10Percentage,
    devPercentage
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const solanaTrackerApiKey = Deno.env.get('SOLANA_TRACKER_API_KEY')
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await req.json().catch(() => ({}))
    
    const { tokenMint, action = 'analyze' } = body

    console.log('🔍 Token Mint Watchdog: Starting...', { action, tokenMint })

    if (!solanaTrackerApiKey) {
      console.error('SOLANA_TRACKER_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Solana Tracker API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If analyzing a specific token
    if (tokenMint && action === 'analyze') {
      console.log(`Analyzing token: ${tokenMint}`)

      // Fetch token data from Solana Tracker
      const tokenResponse = await fetch(
        `https://data.solanatracker.io/tokens/${tokenMint}`,
        {
          headers: { 'x-api-key': solanaTrackerApiKey }
        }
      )

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error('Token API error:', tokenResponse.status, errorText)
        return new Response(
          JSON.stringify({ error: `Failed to fetch token data: ${tokenResponse.status}` }),
          { status: tokenResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const tokenData: SolanaTrackerResponse = await tokenResponse.json()
      console.log('Token data received:', tokenData.token?.name)

      // Analyze for bundle patterns using risk data
      const bundleAnalysis = analyzeTokenRisk(tokenData)

      // Extract key info
      const pool = tokenData.pools?.[0]
      const creator = tokenData.token?.creation?.creator || pool?.deployer || 'unknown'

      // Try to fetch first buyers (may be rate limited)
      let firstBuyers: FirstBuyer[] = []
      try {
        const firstBuyersResponse = await fetch(
          `https://data.solanatracker.io/first-buyers/${tokenMint}`,
          { headers: { 'x-api-key': solanaTrackerApiKey } }
        )
        if (firstBuyersResponse.ok) {
          firstBuyers = await firstBuyersResponse.json()
          console.log(`Found ${firstBuyers.length} first buyers`)
        } else {
          console.log('First buyers API returned:', firstBuyersResponse.status)
        }
      } catch (e) {
        console.log('First buyers fetch failed:', e)
      }

      // Store in database
      const { error: upsertError } = await supabase
        .from('token_mint_watchdog')
        .upsert({
          token_mint: tokenMint,
          creator_wallet: creator,
          metadata: {
            name: tokenData.token?.name,
            symbol: tokenData.token?.symbol,
            market: pool?.market,
            marketCapUsd: pool?.marketCap?.usd,
            liquidityUsd: pool?.liquidity?.usd,
            priceUsd: pool?.price?.usd,
            curvePercentage: pool?.curvePercentage,
            bundleId: pool?.bundleId,
            txns: pool?.txns,
            description: tokenData.token?.description
          },
          bundle_analysis: bundleAnalysis,
          first_buyers: firstBuyers.slice(0, 20),
          is_bundled: bundleAnalysis.isBundled,
          bundle_score: bundleAnalysis.bundleScore,
          analyzed_at: new Date().toISOString(),
          discovery_triggered: true
        }, { onConflict: 'token_mint' })

      if (upsertError) {
        console.error('Error storing analysis:', upsertError)
      } else {
        console.log('Analysis stored successfully')
      }

      return new Response(
        JSON.stringify({
          success: true,
          tokenMint,
          token: {
            name: tokenData.token?.name,
            symbol: tokenData.token?.symbol,
            creator,
            market: pool?.market,
            marketCapUsd: pool?.marketCap?.usd,
            liquidityUsd: pool?.liquidity?.usd,
            curvePercentage: pool?.curvePercentage,
            txns: pool?.txns
          },
          bundleAnalysis,
          snipers: tokenData.risk?.snipers?.wallets?.slice(0, 5) || [],
          firstBuyersCount: firstBuyers.length,
          firstBuyers: firstBuyers.slice(0, 10).map(b => ({
            wallet: b.wallet,
            buyAmount: b.first_buy?.volume_usd,
            holding: b.holding,
            sold: b.sold,
            realized: b.realized,
            stillHolding: b.holding > 0
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // GET BONDING CURVE STATE - Check current bonding curve % for pump.fun token
    if (action === 'get_bonding_curve' && tokenMint) {
      console.log(`Fetching bonding curve state for: ${tokenMint}`)
      
      try {
        // Fetch token data from Solana Tracker API
        const tokenResponse = await fetch(
          `https://data.solanatracker.io/tokens/${tokenMint}`,
          { headers: { 'x-api-key': solanaTrackerApiKey } }
        )

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text()
          console.error('Token API error:', tokenResponse.status, errorText)
          return new Response(
            JSON.stringify({ error: `Failed to fetch token: ${tokenResponse.status}` }),
            { status: tokenResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const tokenData = await tokenResponse.json()
        const pool = tokenData.pools?.[0]
        
        // Pump.fun bonding curve constants
        const TOTAL_SOL_FOR_GRADUATION = 85 // ~85 SOL to graduate
        
        // Determine if graduated (moved to Raydium)
        const graduated = pool?.market === 'raydium' || !pool?.curvePercentage
        
        // Calculate SOL deposited based on curve percentage
        const curvePercent = pool?.curvePercentage || 0
        const solDeposited = (curvePercent / 100) * TOTAL_SOL_FOR_GRADUATION
        const solRemaining = TOTAL_SOL_FOR_GRADUATION - solDeposited
        
        return new Response(
          JSON.stringify({
            success: true,
            tokenMint,
            name: tokenData.token?.name,
            symbol: tokenData.token?.symbol,
            curvePercent,
            solDeposited: Math.round(solDeposited * 100) / 100,
            solRemaining: Math.round(solRemaining * 100) / 100,
            graduated,
            market: pool?.market,
            marketCapUsd: pool?.marketCap?.usd,
            liquidityUsd: pool?.liquidity?.usd,
            priceUsd: pool?.price?.usd,
            holders: tokenData.holders,
            txns: pool?.txns,
            // Additional bonding curve math
            bondingCurveInfo: {
              totalSolRequired: TOTAL_SOL_FOR_GRADUATION,
              percentComplete: curvePercent,
              estimatedTokensAvailable: 800_000_000 * (1 - curvePercent / 100),
              avgPricePerToken: solDeposited / (800_000_000 * (curvePercent / 100)) || 0
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (error) {
        console.error('Error fetching bonding curve:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch bonding curve data', details: String(error) }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Get token trades/transactions
    if (action === 'get_trades' && tokenMint) {
      const limit = body.limit || 100
      console.log(`Fetching first ${limit} trades for token: ${tokenMint}`)

      const tradesResponse = await fetch(
        `https://data.solanatracker.io/trades/${tokenMint}?limit=${limit}`,
        { headers: { 'x-api-key': solanaTrackerApiKey } }
      )

      if (!tradesResponse.ok) {
        const errorText = await tradesResponse.text()
        console.error('Trades API error:', tradesResponse.status, errorText)
        return new Response(
          JSON.stringify({ error: `Failed to fetch trades: ${tradesResponse.status}`, details: errorText }),
          { status: tradesResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const tradesData = await tradesResponse.json()
      console.log(`Trades response type:`, typeof tradesData, Array.isArray(tradesData) ? 'array' : 'object')
      
      // Handle different response formats
      const trades = Array.isArray(tradesData) ? tradesData : (tradesData?.trades || tradesData?.items || [])
      console.log(`Retrieved ${trades.length} trades`)

      // Sort by time ascending to get earliest first
      const sortedTrades = trades.sort((a: any, b: any) => (a.time || 0) - (b.time || 0))

      return new Response(
        JSON.stringify({
          success: true,
          tokenMint,
          totalTrades: sortedTrades.length,
          trades: sortedTrades.map((t: any, idx: number) => ({
            index: idx + 1,
            type: t.type,
            signature: t.signature,
            wallet: t.wallet,
            amount: t.amount,
            priceUsd: t.priceUsd,
            volumeUsd: t.volumeUsd,
            time: t.time,
            timeFormatted: new Date(t.time * 1000).toISOString()
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // FULL TOKEN ANALYSIS - Fetches ALL trades and calculates wallet P&L
    if (action === 'full_analysis' && tokenMint) {
      console.log(`Starting full analysis for token: ${tokenMint}`)
      
      // Fetch ALL trades - try to get as many as possible
      const allTrades: any[] = []
      let offset = 0
      const batchSize = 1000
      let pageCount = 0
      const maxPages = 10
      
      while (pageCount < maxPages) {
        const url = `https://data.solanatracker.io/trades/${tokenMint}?limit=${batchSize}&offset=${offset}`
        console.log(`Fetching page ${pageCount + 1}: offset=${offset}`)
        
        const response = await fetch(url, {
          headers: { 'x-api-key': solanaTrackerApiKey }
        })
        
        if (!response.ok) {
          console.error(`API error on page ${pageCount + 1}:`, response.status)
          break
        }
        
        const data = await response.json()
        const trades = Array.isArray(data) ? data : (data?.trades || data?.items || [])
        
        if (trades.length === 0) break
        
        allTrades.push(...trades)
        console.log(`Page ${pageCount + 1}: Got ${trades.length} trades, total: ${allTrades.length}`)
        
        if (trades.length < batchSize) break
        
        offset += batchSize
        pageCount++
        
        // Rate limit protection
        await new Promise(r => setTimeout(r, 250))
      }
      
      console.log(`Total trades fetched: ${allTrades.length}`)
      
      // Sort by time ascending (oldest first)
      allTrades.sort((a, b) => (a.time || 0) - (b.time || 0))
      
      // Aggregate by wallet
      interface WalletStats {
        wallet: string
        buyCount: number
        sellCount: number
        totalBuyVolumeSol: number
        totalSellVolumeSol: number
        totalBuyVolumeUsd: number
        totalSellVolumeUsd: number
        tokensBought: number
        tokensSold: number
        netTokens: number
        realizedPnlSol: number
        realizedPnlUsd: number
        firstTradeTime: number
        lastTradeTime: number
        firstTradeType: string
        isEarlyTrader: boolean
        tradeSequence: number
      }
      
      const walletMap = new Map<string, WalletStats>()
      
      allTrades.forEach((trade, idx) => {
        const wallet = trade.wallet
        if (!wallet) return
        
        const existing = walletMap.get(wallet) || {
          wallet,
          buyCount: 0,
          sellCount: 0,
          totalBuyVolumeSol: 0,
          totalSellVolumeSol: 0,
          totalBuyVolumeUsd: 0,
          totalSellVolumeUsd: 0,
          tokensBought: 0,
          tokensSold: 0,
          netTokens: 0,
          realizedPnlSol: 0,
          realizedPnlUsd: 0,
          firstTradeTime: trade.time || 0,
          lastTradeTime: trade.time || 0,
          firstTradeType: trade.type || 'unknown',
          isEarlyTrader: idx < 50,
          tradeSequence: idx + 1
        }
        
        const volumeSol = trade.volumeSol || (trade.volumeUsd ? trade.volumeUsd / 220 : 0)
        const volumeUsd = trade.volumeUsd || 0
        const amount = trade.amount || 0
        
        if (trade.type === 'buy') {
          existing.buyCount++
          existing.totalBuyVolumeSol += volumeSol
          existing.totalBuyVolumeUsd += volumeUsd
          existing.tokensBought += amount
        } else if (trade.type === 'sell') {
          existing.sellCount++
          existing.totalSellVolumeSol += volumeSol
          existing.totalSellVolumeUsd += volumeUsd
          existing.tokensSold += amount
        }
        
        existing.netTokens = existing.tokensBought - existing.tokensSold
        existing.realizedPnlSol = existing.totalSellVolumeSol - existing.totalBuyVolumeSol
        existing.realizedPnlUsd = existing.totalSellVolumeUsd - existing.totalBuyVolumeUsd
        existing.lastTradeTime = Math.max(existing.lastTradeTime, trade.time || 0)
        
        // Keep track of earliest trade position
        if (!walletMap.has(wallet)) {
          existing.tradeSequence = idx + 1
        }
        
        walletMap.set(wallet, existing)
      })
      
      const walletStats = Array.from(walletMap.values())
      
      // Identify early sellers (bundled wallet pattern)
      const earlySellers = walletStats.filter(w => 
        w.tradeSequence <= 50 && 
        w.firstTradeType === 'sell' && 
        w.sellCount > 0
      )
      
      // Wallets that are now empty
      const emptyWallets = walletStats.filter(w => w.netTokens <= 0 && w.tokensSold > 0)
      const profitableWallets = walletStats.filter(w => w.realizedPnlSol > 0)
      const biggestWinners = [...walletStats].sort((a, b) => b.realizedPnlSol - a.realizedPnlSol).slice(0, 30)
      const biggestLosers = [...walletStats].sort((a, b) => a.realizedPnlSol - b.realizedPnlSol).slice(0, 30)
      
      // Totals
      const totalBuyVolumeSol = walletStats.reduce((sum, w) => sum + w.totalBuyVolumeSol, 0)
      const totalSellVolumeSol = walletStats.reduce((sum, w) => sum + w.totalSellVolumeSol, 0)
      const earlySellerExtractedSol = earlySellers.reduce((sum, w) => sum + Math.max(0, w.realizedPnlSol), 0)
      
      // First 100 transactions
      const first100 = allTrades.slice(0, 100).map((t, idx) => ({
        index: idx + 1,
        type: t.type,
        wallet: t.wallet,
        amount: t.amount,
        volumeSol: t.volumeSol,
        volumeUsd: t.volumeUsd,
        priceUsd: t.priceUsd,
        time: new Date(t.time).toISOString()
      }))
      
      const analysis = {
        success: true,
        tokenMint,
        summary: {
          totalTrades: allTrades.length,
          uniqueWallets: walletStats.length,
          totalBuyVolumeSol: parseFloat(totalBuyVolumeSol.toFixed(4)),
          totalSellVolumeSol: parseFloat(totalSellVolumeSol.toFixed(4)),
          netFlowSol: parseFloat((totalBuyVolumeSol - totalSellVolumeSol).toFixed(4)),
          emptyWalletsCount: emptyWallets.length,
          profitableWalletsCount: profitableWallets.length,
          earlySellersCount: earlySellers.length,
          earlySellerExtractedSol: parseFloat(earlySellerExtractedSol.toFixed(4))
        },
        bundledWalletsAnalysis: {
          description: 'Wallets that sold in the first 50 transactions (likely bundled/dev wallets)',
          count: earlySellers.length,
          totalExtractedSol: parseFloat(earlySellerExtractedSol.toFixed(4)),
          wallets: earlySellers.map(w => ({
            wallet: w.wallet,
            tradeSequence: w.tradeSequence,
            sellCount: w.sellCount,
            buyCount: w.buyCount,
            totalSellSol: parseFloat(w.totalSellVolumeSol.toFixed(4)),
            totalBuySol: parseFloat(w.totalBuyVolumeSol.toFixed(4)),
            profitSol: parseFloat(w.realizedPnlSol.toFixed(4)),
            profitUsd: parseFloat(w.realizedPnlUsd.toFixed(2)),
            netTokens: parseFloat(w.netTokens.toFixed(2)),
            isEmpty: w.netTokens <= 0,
            firstTrade: new Date(w.firstTradeTime).toISOString(),
            lastTrade: new Date(w.lastTradeTime).toISOString()
          }))
        },
        biggestWinners: biggestWinners.map(w => ({
          wallet: w.wallet,
          profitSol: parseFloat(w.realizedPnlSol.toFixed(4)),
          profitUsd: parseFloat(w.realizedPnlUsd.toFixed(2)),
          buyCount: w.buyCount,
          sellCount: w.sellCount,
          buySol: parseFloat(w.totalBuyVolumeSol.toFixed(4)),
          sellSol: parseFloat(w.totalSellVolumeSol.toFixed(4)),
          netTokens: parseFloat(w.netTokens.toFixed(2)),
          isEmpty: w.netTokens <= 0,
          isEarlyTrader: w.tradeSequence <= 50
        })),
        biggestLosers: biggestLosers.filter(w => w.realizedPnlSol < 0).map(w => ({
          wallet: w.wallet,
          lossSol: parseFloat(w.realizedPnlSol.toFixed(4)),
          lossUsd: parseFloat(w.realizedPnlUsd.toFixed(2)),
          buyCount: w.buyCount,
          sellCount: w.sellCount,
          netTokens: parseFloat(w.netTokens.toFixed(2))
        })),
        emptyWalletsSummary: {
          count: emptyWallets.length,
          totalProfitSol: parseFloat(emptyWallets.reduce((s, w) => s + w.realizedPnlSol, 0).toFixed(4)),
          wallets: emptyWallets.slice(0, 50).map(w => ({
            wallet: w.wallet,
            profitSol: parseFloat(w.realizedPnlSol.toFixed(4)),
            profitUsd: parseFloat(w.realizedPnlUsd.toFixed(2)),
            tokensSold: parseFloat(w.tokensSold.toFixed(2)),
            wasEarlyTrader: w.tradeSequence <= 50
          }))
        },
        first100Trades: first100,
        allWalletStats: walletStats.map(w => ({
          wallet: w.wallet,
          buyCount: w.buyCount,
          sellCount: w.sellCount,
          buySol: parseFloat(w.totalBuyVolumeSol.toFixed(4)),
          sellSol: parseFloat(w.totalSellVolumeSol.toFixed(4)),
          pnlSol: parseFloat(w.realizedPnlSol.toFixed(4)),
          pnlUsd: parseFloat(w.realizedPnlUsd.toFixed(2)),
          netTokens: parseFloat(w.netTokens.toFixed(2)),
          isEmpty: w.netTokens <= 0 && w.tokensSold > 0,
          tradeSequence: w.tradeSequence
        }))
      }
      
      console.log(`Analysis complete: ${walletStats.length} wallets, ${earlySellers.length} early sellers, ${emptyWallets.length} empty`)
      
      return new Response(
        JSON.stringify(analysis),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // TRACE WALLET - Get all transactions from a specific wallet
    if (action === 'trace_wallet') {
      const walletAddress = body.walletAddress
      const knownWallets = body.knownWallets || [] // Wallets we've seen before to flag overlaps
      
      if (!walletAddress) {
        return new Response(
          JSON.stringify({ error: 'walletAddress is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const heliusApiKey = Deno.env.get('HELIUS_API_KEY')
      if (!heliusApiKey) {
        return new Response(
          JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Tracing wallet: ${walletAddress}`)
      console.log(`Known wallets to check for overlap: ${knownWallets.length}`)
      
      const allTransactions: any[] = []
      let beforeSignature: string | undefined = undefined
      let pageCount = 0
      const maxPages = 50
      
      while (pageCount < maxPages) {
        const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=100${beforeSignature ? `&before=${beforeSignature}` : ''}`
        
        console.log(`Wallet trace page ${pageCount + 1}`)
        
        const response = await fetch(url, { method: 'GET' })
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Helius error:`, response.status, errorText)
          break
        }
        
        const transactions = await response.json()
        
        if (!transactions || transactions.length === 0) break
        
        allTransactions.push(...transactions)
        beforeSignature = transactions[transactions.length - 1]?.signature
        
        if (transactions.length < 100) break
        pageCount++
        await new Promise(r => setTimeout(r, 100))
      }
      
      console.log(`Total wallet transactions fetched: ${allTransactions.length}`)
      
      // Process transactions to extract outgoing/incoming flows
      interface WalletFlow {
        wallet: string
        solReceived: number
        solSent: number
        tokensReceived: number
        tokensSent: number
        txCount: number
        firstInteraction: number
        lastInteraction: number
        isKnownWallet: boolean
      }
      
      const walletFlows = new Map<string, WalletFlow>()
      const knownSet = new Set(knownWallets.map((w: string) => w.toLowerCase()))
      
      const processedTxs = allTransactions.map((tx: any) => {
        const tokenTransfers = tx.tokenTransfers || []
        const nativeTransfers = tx.nativeTransfers || []
        
        // Track interactions
        nativeTransfers.forEach((t: any) => {
          const amount = (t.amount || 0) / 1e9
          
          // SOL sent TO another wallet (outgoing from our traced wallet)
          if (t.fromUserAccount?.toLowerCase() === walletAddress.toLowerCase() && t.toUserAccount) {
            const target = t.toUserAccount
            const flow = walletFlows.get(target) || {
              wallet: target,
              solReceived: 0,
              solSent: 0,
              tokensReceived: 0,
              tokensSent: 0,
              txCount: 0,
              firstInteraction: tx.timestamp,
              lastInteraction: tx.timestamp,
              isKnownWallet: knownSet.has(target.toLowerCase())
            }
            flow.solReceived += amount // They received from us
            flow.txCount++
            flow.lastInteraction = Math.max(flow.lastInteraction, tx.timestamp)
            flow.firstInteraction = Math.min(flow.firstInteraction, tx.timestamp)
            walletFlows.set(target, flow)
          }
          
          // SOL received FROM another wallet (incoming to our traced wallet)
          if (t.toUserAccount?.toLowerCase() === walletAddress.toLowerCase() && t.fromUserAccount) {
            const source = t.fromUserAccount
            const flow = walletFlows.get(source) || {
              wallet: source,
              solReceived: 0,
              solSent: 0,
              tokensReceived: 0,
              tokensSent: 0,
              txCount: 0,
              firstInteraction: tx.timestamp,
              lastInteraction: tx.timestamp,
              isKnownWallet: knownSet.has(source.toLowerCase())
            }
            flow.solSent += amount // They sent to us
            flow.txCount++
            flow.lastInteraction = Math.max(flow.lastInteraction, tx.timestamp)
            flow.firstInteraction = Math.min(flow.firstInteraction, tx.timestamp)
            walletFlows.set(source, flow)
          }
        })
        
        // Track token transfers
        tokenTransfers.forEach((t: any) => {
          const amount = t.tokenAmount || 0
          
          if (t.fromUserAccount?.toLowerCase() === walletAddress.toLowerCase() && t.toUserAccount) {
            const target = t.toUserAccount
            const flow = walletFlows.get(target) || {
              wallet: target,
              solReceived: 0,
              solSent: 0,
              tokensReceived: 0,
              tokensSent: 0,
              txCount: 0,
              firstInteraction: tx.timestamp,
              lastInteraction: tx.timestamp,
              isKnownWallet: knownSet.has(target.toLowerCase())
            }
            flow.tokensReceived += amount
            flow.txCount++
            walletFlows.set(target, flow)
          }
          
          if (t.toUserAccount?.toLowerCase() === walletAddress.toLowerCase() && t.fromUserAccount) {
            const source = t.fromUserAccount
            const flow = walletFlows.get(source) || {
              wallet: source,
              solReceived: 0,
              solSent: 0,
              tokensReceived: 0,
              tokensSent: 0,
              txCount: 0,
              firstInteraction: tx.timestamp,
              lastInteraction: tx.timestamp,
              isKnownWallet: knownSet.has(source.toLowerCase())
            }
            flow.tokensSent += amount
            flow.txCount++
            walletFlows.set(source, flow)
          }
        })
        
        return {
          signature: tx.signature,
          timestamp: tx.timestamp,
          timestampFormatted: new Date(tx.timestamp * 1000).toISOString(),
          type: tx.type || 'UNKNOWN',
          description: tx.description || '',
          fee: tx.fee || 0,
          feePayer: tx.feePayer || '',
          source: tx.source || '',
          tokenTransfers: tokenTransfers.length,
          nativeTransfers: nativeTransfers.length
        }
      })
      
      processedTxs.sort((a, b) => a.timestamp - b.timestamp)
      
      const flows = Array.from(walletFlows.values())
        .map(f => ({
          ...f,
          solReceived: parseFloat(f.solReceived.toFixed(6)),
          solSent: parseFloat(f.solSent.toFixed(6)),
          netSolFlow: parseFloat((f.solReceived - f.solSent).toFixed(6)),
          firstInteractionFormatted: new Date(f.firstInteraction * 1000).toISOString(),
          lastInteractionFormatted: new Date(f.lastInteraction * 1000).toISOString()
        }))
        .sort((a, b) => b.solReceived - a.solReceived)
      
      const overlappingWallets = flows.filter(f => f.isKnownWallet)
      
      // Calculate summary stats
      const totalSolOut = flows.reduce((sum, f) => sum + f.solReceived, 0)
      const totalSolIn = flows.reduce((sum, f) => sum + f.solSent, 0)
      
      return new Response(
        JSON.stringify({
          success: true,
          tracedWallet: walletAddress,
          summary: {
            totalTransactions: processedTxs.length,
            uniqueWalletsInteracted: flows.length,
            totalSolSentOut: parseFloat(totalSolOut.toFixed(4)),
            totalSolReceivedIn: parseFloat(totalSolIn.toFixed(4)),
            netSolFlow: parseFloat((totalSolIn - totalSolOut).toFixed(4)),
            overlappingWalletsCount: overlappingWallets.length,
            timeRange: {
              first: processedTxs[0]?.timestampFormatted,
              last: processedTxs[processedTxs.length - 1]?.timestampFormatted
            }
          },
          overlappingWallets: overlappingWallets,
          topRecipients: flows.filter(f => f.solReceived > 0).slice(0, 50),
          topSenders: flows.filter(f => f.solSent > 0).sort((a, b) => b.solSent - a.solSent).slice(0, 50),
          allWalletFlows: flows,
          allTransactions: processedTxs
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // HELIUS FULL TRANSACTION HISTORY - ALL tx types including transfers
    if (action === 'helius_full_history' && tokenMint) {
      const heliusApiKey = Deno.env.get('HELIUS_API_KEY')
      if (!heliusApiKey) {
        return new Response(
          JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Fetching FULL Helius transaction history for token: ${tokenMint}`)
      
      const allTransactions: any[] = []
      let beforeSignature: string | undefined = undefined
      let pageCount = 0
      const maxPages = 50 // Up to 5000 transactions
      
      while (pageCount < maxPages) {
        const requestBody: any = {
          query: {
            tokenMint: tokenMint
          },
          options: {
            limit: 100
          }
        }
        
        if (beforeSignature) {
          requestBody.options.before = beforeSignature
        }
        
        console.log(`Helius page ${pageCount + 1}, before: ${beforeSignature || 'start'}`)
        
        const response = await fetch(
          `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusApiKey}&limit=100${beforeSignature ? `&before=${beforeSignature}` : ''}`,
          { method: 'GET' }
        )
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Helius error page ${pageCount + 1}:`, response.status, errorText)
          break
        }
        
        const transactions = await response.json()
        
        if (!transactions || transactions.length === 0) {
          console.log(`No more transactions at page ${pageCount + 1}`)
          break
        }
        
        allTransactions.push(...transactions)
        console.log(`Page ${pageCount + 1}: Got ${transactions.length} txs, total: ${allTransactions.length}`)
        
        // Get last signature for pagination
        beforeSignature = transactions[transactions.length - 1]?.signature
        
        if (transactions.length < 100) break
        
        pageCount++
        await new Promise(r => setTimeout(r, 100)) // Rate limit
      }
      
      console.log(`Total Helius transactions fetched: ${allTransactions.length}`)
      
      // Process transactions to extract meaningful data
      interface ProcessedTx {
        signature: string
        timestamp: number
        timestampFormatted: string
        type: string
        description: string
        fee: number
        feePayer: string
        source: string
        tokenTransfers: any[]
        nativeTransfers: any[]
        accountData: any[]
        instructions: string[]
      }
      
      const processedTxs: ProcessedTx[] = allTransactions.map((tx: any) => {
        const tokenTransfers = tx.tokenTransfers || []
        const nativeTransfers = tx.nativeTransfers || []
        
        return {
          signature: tx.signature,
          timestamp: tx.timestamp,
          timestampFormatted: new Date(tx.timestamp * 1000).toISOString(),
          type: tx.type || 'UNKNOWN',
          description: tx.description || '',
          fee: tx.fee || 0,
          feePayer: tx.feePayer || '',
          source: tx.source || '',
          tokenTransfers: tokenTransfers.map((t: any) => ({
            fromUserAccount: t.fromUserAccount,
            toUserAccount: t.toUserAccount,
            tokenAmount: t.tokenAmount,
            mint: t.mint,
            tokenStandard: t.tokenStandard
          })),
          nativeTransfers: nativeTransfers.map((t: any) => ({
            fromUserAccount: t.fromUserAccount,
            toUserAccount: t.toUserAccount,
            amount: t.amount
          })),
          accountData: tx.accountData || [],
          instructions: tx.instructions?.map((i: any) => i.programId) || []
        }
      })
      
      // Sort by timestamp ascending (oldest first)
      processedTxs.sort((a, b) => a.timestamp - b.timestamp)
      
      // Aggregate wallet activity from ALL transactions
      interface WalletActivity {
        wallet: string
        txCount: number
        tokensReceived: number
        tokensSent: number
        netTokens: number
        solReceived: number
        solSent: number
        netSol: number
        firstTxTime: number
        lastTxTime: number
        txTypes: Record<string, number>
        interactedWith: Set<string>
      }
      
      const walletActivity = new Map<string, WalletActivity>()
      
      processedTxs.forEach(tx => {
        // Process token transfers
        tx.tokenTransfers.forEach((t: any) => {
          if (t.mint !== tokenMint) return
          
          const amount = t.tokenAmount || 0
          
          // Sender
          if (t.fromUserAccount) {
            const w = walletActivity.get(t.fromUserAccount) || {
              wallet: t.fromUserAccount,
              txCount: 0,
              tokensReceived: 0,
              tokensSent: 0,
              netTokens: 0,
              solReceived: 0,
              solSent: 0,
              netSol: 0,
              firstTxTime: tx.timestamp,
              lastTxTime: tx.timestamp,
              txTypes: {},
              interactedWith: new Set<string>()
            }
            w.txCount++
            w.tokensSent += amount
            w.netTokens = w.tokensReceived - w.tokensSent
            w.lastTxTime = Math.max(w.lastTxTime, tx.timestamp)
            w.txTypes[tx.type] = (w.txTypes[tx.type] || 0) + 1
            if (t.toUserAccount) w.interactedWith.add(t.toUserAccount)
            walletActivity.set(t.fromUserAccount, w)
          }
          
          // Receiver
          if (t.toUserAccount) {
            const w = walletActivity.get(t.toUserAccount) || {
              wallet: t.toUserAccount,
              txCount: 0,
              tokensReceived: 0,
              tokensSent: 0,
              netTokens: 0,
              solReceived: 0,
              solSent: 0,
              netSol: 0,
              firstTxTime: tx.timestamp,
              lastTxTime: tx.timestamp,
              txTypes: {},
              interactedWith: new Set<string>()
            }
            w.txCount++
            w.tokensReceived += amount
            w.netTokens = w.tokensReceived - w.tokensSent
            w.lastTxTime = Math.max(w.lastTxTime, tx.timestamp)
            w.txTypes[tx.type] = (w.txTypes[tx.type] || 0) + 1
            if (t.fromUserAccount) w.interactedWith.add(t.fromUserAccount)
            walletActivity.set(t.toUserAccount, w)
          }
        })
        
        // Process SOL transfers
        tx.nativeTransfers.forEach((t: any) => {
          const amount = (t.amount || 0) / 1e9 // Convert lamports to SOL
          
          if (t.fromUserAccount) {
            const w = walletActivity.get(t.fromUserAccount) || {
              wallet: t.fromUserAccount,
              txCount: 0,
              tokensReceived: 0,
              tokensSent: 0,
              netTokens: 0,
              solReceived: 0,
              solSent: 0,
              netSol: 0,
              firstTxTime: tx.timestamp,
              lastTxTime: tx.timestamp,
              txTypes: {},
              interactedWith: new Set<string>()
            }
            w.solSent += amount
            w.netSol = w.solReceived - w.solSent
            walletActivity.set(t.fromUserAccount, w)
          }
          
          if (t.toUserAccount) {
            const w = walletActivity.get(t.toUserAccount) || {
              wallet: t.toUserAccount,
              txCount: 0,
              tokensReceived: 0,
              tokensSent: 0,
              netTokens: 0,
              solReceived: 0,
              solSent: 0,
              netSol: 0,
              firstTxTime: tx.timestamp,
              lastTxTime: tx.timestamp,
              txTypes: {},
              interactedWith: new Set<string>()
            }
            w.solReceived += amount
            w.netSol = w.solReceived - w.solSent
            walletActivity.set(t.toUserAccount, w)
          }
        })
      })
      
      // Convert to array and serialize
      const walletStats = Array.from(walletActivity.values()).map(w => ({
        ...w,
        netTokens: parseFloat(w.netTokens.toFixed(4)),
        netSol: parseFloat(w.netSol.toFixed(6)),
        solReceived: parseFloat(w.solReceived.toFixed(6)),
        solSent: parseFloat(w.solSent.toFixed(6)),
        interactedWith: Array.from(w.interactedWith)
      }))
      
      // Transaction type breakdown
      const txTypeBreakdown: Record<string, number> = {}
      processedTxs.forEach(tx => {
        txTypeBreakdown[tx.type] = (txTypeBreakdown[tx.type] || 0) + 1
      })
      
      // Source breakdown (DEX, program, etc)
      const sourceBreakdown: Record<string, number> = {}
      processedTxs.forEach(tx => {
        sourceBreakdown[tx.source || 'UNKNOWN'] = (sourceBreakdown[tx.source || 'UNKNOWN'] || 0) + 1
      })
      
      return new Response(
        JSON.stringify({
          success: true,
          tokenMint,
          dataSource: 'helius',
          summary: {
            totalTransactions: processedTxs.length,
            uniqueWallets: walletStats.length,
            transactionTypes: txTypeBreakdown,
            sources: sourceBreakdown,
            timeRange: {
              first: processedTxs[0]?.timestampFormatted,
              last: processedTxs[processedTxs.length - 1]?.timestampFormatted
            }
          },
          walletActivity: walletStats.sort((a, b) => b.txCount - a.txCount),
          allTransactions: processedTxs
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // TRACE OFFSPRING WALLETS - Track where funds went OUT from mint wallet
    if (action === 'trace_offspring_wallets') {
      const mintWallet = body.mintWallet
      if (!mintWallet) {
        return new Response(
          JSON.stringify({ error: 'mintWallet is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const heliusApiKey = Deno.env.get('HELIUS_API_KEY')
      if (!heliusApiKey) {
        return new Response(
          JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`🌿 Tracing offspring wallets from mint wallet: ${mintWallet}`)
      
      // Fetch mint wallet transaction history
      const walletTxUrl = `https://api.helius.xyz/v0/addresses/${mintWallet}/transactions?api-key=${heliusApiKey}&limit=100`
      const walletTxResponse = await fetch(walletTxUrl)
      
      if (!walletTxResponse.ok) {
        const error = await walletTxResponse.text()
        console.error('Wallet tx fetch error:', error)
        return new Response(
          JSON.stringify({ error: `Failed to fetch wallet transactions: ${walletTxResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const walletTxs = await walletTxResponse.json()
      console.log(`Got ${walletTxs.length} transactions for mint wallet`)
      
      // Sort by timestamp ascending
      walletTxs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
      
      // Find all wallets that RECEIVED SOL from the mint wallet (offspring)
      interface OffspringWallet {
        wallet: string
        totalSolReceived: number
        txCount: number
        firstTx: string
        firstTxTime: number
        firstTxTimeFormatted: string
        transactions: Array<{
          signature: string
          amount: number
          timestamp: number
          timestampFormatted: string
        }>
      }
      
      const offspringWallets = new Map<string, OffspringWallet>()
      let totalSolSent = 0
      
      for (const tx of walletTxs) {
        const nativeTransfers = tx.nativeTransfers || []
        
        for (const transfer of nativeTransfers) {
          // Find SOL transfers FROM our mint wallet TO other wallets
          if (transfer.fromUserAccount?.toLowerCase() === mintWallet.toLowerCase() && 
              transfer.toUserAccount &&
              transfer.toUserAccount.toLowerCase() !== mintWallet.toLowerCase()) {
            
            const recipient = transfer.toUserAccount
            const amount = (transfer.amount || 0) / 1e9
            
            if (amount > 0.0001) { // Ignore dust
              totalSolSent += amount
              
              const existing = offspringWallets.get(recipient) || {
                wallet: recipient,
                totalSolReceived: 0,
                txCount: 0,
                firstTx: tx.signature,
                firstTxTime: tx.timestamp,
                firstTxTimeFormatted: new Date(tx.timestamp * 1000).toISOString(),
                transactions: []
              }
              
              existing.totalSolReceived += amount
              existing.txCount++
              existing.transactions.push({
                signature: tx.signature,
                amount,
                timestamp: tx.timestamp,
                timestampFormatted: new Date(tx.timestamp * 1000).toISOString()
              })
              
              if (tx.timestamp < existing.firstTxTime) {
                existing.firstTx = tx.signature
                existing.firstTxTime = tx.timestamp
                existing.firstTxTimeFormatted = new Date(tx.timestamp * 1000).toISOString()
              }
              
              offspringWallets.set(recipient, existing)
            }
          }
        }
      }
      
      const offspringList = Array.from(offspringWallets.values())
        .sort((a, b) => b.totalSolReceived - a.totalSolReceived)
      
      console.log(`Found ${offspringList.length} offspring wallets receiving ${totalSolSent.toFixed(4)} SOL total`)
      
      // Trace level 2: For top offspring wallets, find where THEY sent funds
      const level2Offspring: Array<{
        parentWallet: string
        parentReceivedSol: number
        children: Array<{
          wallet: string
          solReceived: number
          txCount: number
        }>
      }> = []
      
      // Trace top 5 largest recipients
      const topOffspring = offspringList.slice(0, 5)
      
      for (const offspring of topOffspring) {
        console.log(`Tracing level 2 from offspring: ${offspring.wallet.slice(0, 8)}...`)
        
        const level2TxUrl = `https://api.helius.xyz/v0/addresses/${offspring.wallet}/transactions?api-key=${heliusApiKey}&limit=50`
        const level2Response = await fetch(level2TxUrl)
        
        if (!level2Response.ok) continue
        
        const level2Txs = await level2Response.json()
        const children = new Map<string, { wallet: string, solReceived: number, txCount: number }>()
        
        for (const tx of level2Txs) {
          const nativeTransfers = tx.nativeTransfers || []
          
          for (const transfer of nativeTransfers) {
            if (transfer.fromUserAccount?.toLowerCase() === offspring.wallet.toLowerCase() &&
                transfer.toUserAccount &&
                transfer.toUserAccount.toLowerCase() !== offspring.wallet.toLowerCase() &&
                transfer.toUserAccount.toLowerCase() !== mintWallet.toLowerCase()) {
              
              const recipient = transfer.toUserAccount
              const amount = (transfer.amount || 0) / 1e9
              
              if (amount > 0.01) { // Only significant transfers
                const existing = children.get(recipient) || {
                  wallet: recipient,
                  solReceived: 0,
                  txCount: 0
                }
                
                existing.solReceived += amount
                existing.txCount++
                children.set(recipient, existing)
              }
            }
          }
        }
        
        if (children.size > 0) {
          level2Offspring.push({
            parentWallet: offspring.wallet,
            parentReceivedSol: offspring.totalSolReceived,
            children: Array.from(children.values())
              .sort((a, b) => b.solReceived - a.solReceived)
              .slice(0, 10)
          })
        }
        
        // Rate limit protection
        await new Promise(r => setTimeout(r, 100))
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          mintWallet,
          summary: {
            totalOffspringWallets: offspringList.length,
            totalSolDistributed: parseFloat(totalSolSent.toFixed(4)),
            largestRecipient: offspringList[0] ? {
              wallet: offspringList[0].wallet,
              amount: parseFloat(offspringList[0].totalSolReceived.toFixed(4))
            } : null
          },
          offspring: offspringList.map(o => ({
            wallet: o.wallet,
            totalSolReceived: parseFloat(o.totalSolReceived.toFixed(4)),
            txCount: o.txCount,
            firstTransaction: o.firstTx,
            firstTransactionTime: o.firstTxTimeFormatted,
            transactions: o.transactions.slice(0, 5).map(t => ({
              signature: t.signature,
              amount: parseFloat(t.amount.toFixed(4)),
              timestamp: t.timestampFormatted
            }))
          })),
          level2Distribution: level2Offspring
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // TRACE TOKEN GENEALOGY - Find creator wallet and trace to funding source
    if (action === 'trace_token_genealogy' && tokenMint) {
      const heliusApiKey = Deno.env.get('HELIUS_API_KEY')
      if (!heliusApiKey) {
        return new Response(
          JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`🧬 Tracing genealogy for token: ${tokenMint}`)
      
      // Step 1: Get the earliest transactions for this token to find the minter
      const tokenTxUrl = `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusApiKey}&limit=100`
      console.log(`Fetching token transactions to find creator...`)
      
      const tokenTxResponse = await fetch(tokenTxUrl)
      if (!tokenTxResponse.ok) {
        const error = await tokenTxResponse.text()
        console.error('Token tx fetch error:', error)
        return new Response(
          JSON.stringify({ error: `Failed to fetch token transactions: ${tokenTxResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const tokenTxs = await tokenTxResponse.json()
      console.log(`Got ${tokenTxs.length} token transactions`)
      
      // Sort by timestamp ascending to get oldest first
      tokenTxs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
      
      // Find the creation/mint transaction
      let mintWallet: string | null = null
      let mintTxSignature: string | null = null
      let mintTimestamp: number | null = null
      
      // Look for the first transaction - usually the mint/creation tx
      for (const tx of tokenTxs.slice(0, 10)) {
        // The fee payer of the first transaction is usually the creator
        if (tx.feePayer && !mintWallet) {
          mintWallet = tx.feePayer
          mintTxSignature = tx.signature
          mintTimestamp = tx.timestamp
          console.log(`Found potential mint wallet from feePayer: ${mintWallet}`)
        }
        
        // Also check for token transfers - the first "from" address in the earliest tx
        if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
          for (const transfer of tx.tokenTransfers) {
            if (transfer.mint === tokenMint && transfer.fromUserAccount && !mintWallet) {
              mintWallet = transfer.fromUserAccount
              mintTxSignature = tx.signature
              mintTimestamp = tx.timestamp
              console.log(`Found mint wallet from token transfer: ${mintWallet}`)
              break
            }
          }
        }
        
        // Check for SWAP type which indicates the first buyer
        if (tx.type === 'SWAP' && tx.feePayer && !mintWallet) {
          // For pump.fun tokens, the first swap is usually from the dev
          // Actually we want the token creator, not the first swapper
          continue
        }
        
        // Look for TRANSFER or CREATE type
        if ((tx.type === 'TRANSFER' || tx.type === 'CREATE' || tx.type === 'TOKEN_MINT') && tx.feePayer) {
          mintWallet = tx.feePayer
          mintTxSignature = tx.signature
          mintTimestamp = tx.timestamp
          console.log(`Found mint wallet from ${tx.type}: ${mintWallet}`)
          break
        }
      }
      
      // Fallback: use the feePayer of the absolute first transaction
      if (!mintWallet && tokenTxs.length > 0) {
        mintWallet = tokenTxs[0].feePayer
        mintTxSignature = tokenTxs[0].signature
        mintTimestamp = tokenTxs[0].timestamp
        console.log(`Using first tx feePayer as mint wallet: ${mintWallet}`)
      }
      
      if (!mintWallet) {
        return new Response(
          JSON.stringify({ 
            error: 'Could not find mint wallet for this token',
            tokenMint,
            transactionCount: tokenTxs.length
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log(`✅ Identified mint wallet: ${mintWallet}`)
      
      // Step 2: Trace the mint wallet's transaction history to find funding sources
      console.log(`Tracing mint wallet history to find funding sources...`)
      
      const walletTxUrl = `https://api.helius.xyz/v0/addresses/${mintWallet}/transactions?api-key=${heliusApiKey}&limit=100`
      const walletTxResponse = await fetch(walletTxUrl)
      
      if (!walletTxResponse.ok) {
        console.error('Wallet tx fetch error:', walletTxResponse.status)
        return new Response(
          JSON.stringify({
            success: true,
            tokenMint,
            mintWallet,
            mintTransaction: mintTxSignature,
            mintTimestamp: mintTimestamp ? new Date(mintTimestamp * 1000).toISOString() : null,
            parentWallet: null,
            fundingSources: [],
            error: 'Could not fetch mint wallet history'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const walletTxs = await walletTxResponse.json()
      console.log(`Got ${walletTxs.length} transactions for mint wallet`)
      
      // Sort by timestamp ascending
      walletTxs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
      
      // Find all wallets that sent SOL to the mint wallet
      interface FundingSource {
        wallet: string
        totalSolSent: number
        txCount: number
        firstTx: string
        firstTxTime: number
        firstTxTimeFormatted: string
        transactions: Array<{
          signature: string
          amount: number
          timestamp: number
          timestampFormatted: string
        }>
      }
      
      const fundingSources = new Map<string, FundingSource>()
      
      for (const tx of walletTxs) {
        const nativeTransfers = tx.nativeTransfers || []
        
        for (const transfer of nativeTransfers) {
          // Find SOL transfers TO our mint wallet
          if (transfer.toUserAccount?.toLowerCase() === mintWallet.toLowerCase() && 
              transfer.fromUserAccount &&
              transfer.fromUserAccount.toLowerCase() !== mintWallet.toLowerCase()) {
            
            const sender = transfer.fromUserAccount
            const amount = (transfer.amount || 0) / 1e9
            
            if (amount > 0.0001) { // Ignore dust
              const existing = fundingSources.get(sender) || {
                wallet: sender,
                totalSolSent: 0,
                txCount: 0,
                firstTx: tx.signature,
                firstTxTime: tx.timestamp,
                firstTxTimeFormatted: new Date(tx.timestamp * 1000).toISOString(),
                transactions: []
              }
              
              existing.totalSolSent += amount
              existing.txCount++
              existing.transactions.push({
                signature: tx.signature,
                amount,
                timestamp: tx.timestamp,
                timestampFormatted: new Date(tx.timestamp * 1000).toISOString()
              })
              
              if (tx.timestamp < existing.firstTxTime) {
                existing.firstTx = tx.signature
                existing.firstTxTime = tx.timestamp
                existing.firstTxTimeFormatted = new Date(tx.timestamp * 1000).toISOString()
              }
              
              fundingSources.set(sender, existing)
            }
          }
        }
      }
      
      const fundingList = Array.from(fundingSources.values())
        .sort((a, b) => a.firstTxTime - b.firstTxTime)
      
      // The earliest significant funder is likely the parent wallet
      const parentWallet = fundingList.length > 0 ? fundingList[0].wallet : null
      const largestFunder = fundingList.length > 0 
        ? fundingList.reduce((max, f) => f.totalSolSent > max.totalSolSent ? f : max)
        : null
      
      console.log(`Found ${fundingList.length} funding sources`)
      console.log(`Parent wallet (earliest funder): ${parentWallet}`)
      console.log(`Largest funder: ${largestFunder?.wallet} (${largestFunder?.totalSolSent.toFixed(4)} SOL)`)
      
      // Step 3: If we have a parent wallet, trace it back one more level
      let grandparentWallet: string | null = null
      let grandparentFundingSources: any[] = []
      
      if (parentWallet) {
        console.log(`Tracing parent wallet to find grandparent...`)
        
        const parentTxUrl = `https://api.helius.xyz/v0/addresses/${parentWallet}/transactions?api-key=${heliusApiKey}&limit=100`
        const parentTxResponse = await fetch(parentTxUrl)
        
        if (parentTxResponse.ok) {
          const parentTxs = await parentTxResponse.json()
          parentTxs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
          
          const gpFunders = new Map<string, { wallet: string, totalSol: number, firstTx: string, firstTime: number }>()
          
          for (const tx of parentTxs) {
            const nativeTransfers = tx.nativeTransfers || []
            
            for (const transfer of nativeTransfers) {
              if (transfer.toUserAccount?.toLowerCase() === parentWallet.toLowerCase() &&
                  transfer.fromUserAccount &&
                  transfer.fromUserAccount.toLowerCase() !== parentWallet.toLowerCase()) {
                
                const sender = transfer.fromUserAccount
                const amount = (transfer.amount || 0) / 1e9
                
                if (amount > 0.01) { // Only significant transfers
                  const existing = gpFunders.get(sender) || {
                    wallet: sender,
                    totalSol: 0,
                    firstTx: tx.signature,
                    firstTime: tx.timestamp
                  }
                  
                  existing.totalSol += amount
                  if (tx.timestamp < existing.firstTime) {
                    existing.firstTx = tx.signature
                    existing.firstTime = tx.timestamp
                  }
                  
                  gpFunders.set(sender, existing)
                }
              }
            }
          }
          
          grandparentFundingSources = Array.from(gpFunders.values())
            .sort((a, b) => a.firstTime - b.firstTime)
            .map(f => ({
              wallet: f.wallet,
              totalSolSent: parseFloat(f.totalSol.toFixed(4)),
              firstTransaction: f.firstTx,
              firstTransactionTime: new Date(f.firstTime * 1000).toISOString()
            }))
          
          grandparentWallet = grandparentFundingSources.length > 0 ? grandparentFundingSources[0].wallet : null
          console.log(`Found ${grandparentFundingSources.length} grandparent funding sources`)
        }
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          tokenMint,
          genealogy: {
            mintWallet,
            mintTransaction: mintTxSignature,
            mintTimestamp: mintTimestamp ? new Date(mintTimestamp * 1000).toISOString() : null,
            parentWallet,
            parentWalletDetails: parentWallet ? fundingList.find(f => f.wallet === parentWallet) : null,
            largestFunder: largestFunder ? {
              wallet: largestFunder.wallet,
              totalSolSent: parseFloat(largestFunder.totalSolSent.toFixed(4)),
              txCount: largestFunder.txCount
            } : null,
            grandparentWallet,
            grandparentFundingSources: grandparentFundingSources.slice(0, 10)
          },
          fundingSources: fundingList.map(f => ({
            wallet: f.wallet,
            totalSolSent: parseFloat(f.totalSolSent.toFixed(4)),
            txCount: f.txCount,
            firstTransaction: f.firstTx,
            firstTransactionTime: f.firstTxTimeFormatted,
            isParent: f.wallet === parentWallet,
            isLargestFunder: largestFunder && f.wallet === largestFunder.wallet
          })),
          chain: [
            grandparentWallet ? { level: 'grandparent', wallet: grandparentWallet } : null,
            parentWallet ? { level: 'parent', wallet: parentWallet } : null,
            { level: 'mint', wallet: mintWallet },
            { level: 'token', address: tokenMint }
          ].filter(Boolean)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // TRACE FULL GENEALOGY - Recursively trace back to KYC/CEX wallet
    if (action === 'trace_full_genealogy' && tokenMint) {
      const heliusApiKey = Deno.env.get('HELIUS_API_KEY')
      if (!heliusApiKey) {
        return new Response(
          JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const maxDepth = body.maxDepth || 10
      const minSolThreshold = body.minSolThreshold || 0.5 // Only trace significant funding

      // Known CEX/KYC hot wallets - FULL addresses for exact matching
      const KNOWN_CEX_WALLETS: Record<string, string[]> = {
        'Binance': [
          '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
          '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6'
        ],
        'Coinbase': [
          'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS',
          'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE'
        ],
        'KuCoin': [
          'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6',
          'AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATSyrS'
        ],
        'KuCoin 2': [
          'xxxxinDKhd9vD82hSozuNmGVKVwYYZm1dV2Efbu6ZoA' // User-provided KYC wallet
        ],
        'OKX': [
          '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD'
        ],
        'Bybit': [
          'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2'
        ],
        'Kraken': [
          '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
        ],
        'FTX (Legacy)': [
          'Ex9CqcVFjmxSH7nw18k3SHN95NGhjkphpkfBQWCS9tvb'
        ]
      }
      
      // Known "Treasury" wallets that are funded by CEX and then fund mint wallets
      const KNOWN_TREASURY_WALLETS: Record<string, { address: string, fundedBy: string }> = {
        'HydraXoSz7oE3774DoWQQaofKb31Kbn2cbcqG4ShKy85': {
          address: 'HydraXoSz7oE3774DoWQQaofKb31Kbn2cbcqG4ShKy85',
          fundedBy: 'xxxxinDKhd9vD82hSozuNmGVKVwYYZm1dV2Efbu6ZoA' // KuCoin 2
        }
      }
      
      // Helper to check if wallet is a known treasury
      const getTreasuryInfo = (wallet: string): { isTreasury: boolean, fundedBy: string | null } => {
        const info = KNOWN_TREASURY_WALLETS[wallet]
        if (info) {
          return { isTreasury: true, fundedBy: info.fundedBy }
        }
        return { isTreasury: false, fundedBy: null }
      }

      // Helper to check if wallet is a known CEX - use exact matching
      const getCexName = (wallet: string): string | null => {
        for (const [cex, wallets] of Object.entries(KNOWN_CEX_WALLETS)) {
          if (wallets.includes(wallet)) {
            return cex
          }
        }
        return null
      }
      
      // Check if this is a known treasury wallet (one step below CEX)
      const isTreasuryWallet = (wallet: string): boolean => {
        return wallet in KNOWN_TREASURY_WALLETS
      }

      console.log(`🔬 Full genealogy trace for token: ${tokenMint} (max depth: ${maxDepth})`)

      interface WalletNode {
        wallet: string
        depth: number
        solReceived: number
        solSent: number
        fundedBy: string | null
        fundedAmount: number
        fundingTx: string | null
        fundingTime: string | null
        cexSource: string | null
        isLeaf: boolean
        children: string[]
      }

      const walletTree = new Map<string, WalletNode>()
      const visited = new Set<string>()
      const queue: Array<{ wallet: string, depth: number, fundedBy: string | null, fundedAmount: number, fundingTx: string | null, fundingTime: string | null }> = []
      
      // Step 1: Get the mint wallet from the token
      console.log(`Finding mint wallet for token...`)
      const tokenTxUrl = `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusApiKey}&limit=50`
      const tokenTxResponse = await fetch(tokenTxUrl)
      
      if (!tokenTxResponse.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch token transactions: ${tokenTxResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const tokenTxs = await tokenTxResponse.json()
      tokenTxs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
      
      let mintWallet: string | null = null
      let mintTxSignature: string | null = null
      let mintTimestamp: string | null = null
      
      for (const tx of tokenTxs.slice(0, 10)) {
        if (tx.feePayer && !mintWallet) {
          mintWallet = tx.feePayer
          mintTxSignature = tx.signature
          mintTimestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null
          break
        }
      }
      
      if (!mintWallet) {
        return new Response(
          JSON.stringify({ error: 'Could not find mint wallet for this token' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log(`✅ Mint wallet: ${mintWallet}`)
      
      // Initialize the mint wallet as root
      walletTree.set(mintWallet, {
        wallet: mintWallet,
        depth: 0,
        solReceived: 0,
        solSent: 0,
        fundedBy: null,
        fundedAmount: 0,
        fundingTx: null,
        fundingTime: null,
        cexSource: getCexName(mintWallet),
        isLeaf: false,
        children: []
      })
      queue.push({ wallet: mintWallet, depth: 0, fundedBy: null, fundedAmount: 0, fundingTx: null, fundingTime: null })
      
      // BFS trace backwards through the wallet chain
      let rootCexWallet: string | null = null
      let rootCexName: string | null = null
      
      while (queue.length > 0) {
        const { wallet, depth, fundedBy, fundedAmount, fundingTx, fundingTime } = queue.shift()!
        
        if (visited.has(wallet) || depth > maxDepth) continue
        visited.add(wallet)
        
        console.log(`📍 Tracing wallet at depth ${depth}: ${wallet}`)
        
        // Check if this is a known treasury wallet (one level below CEX)
        const treasuryInfo = getTreasuryInfo(wallet)
        if (treasuryInfo.isTreasury) {
          console.log(`💎 Found TREASURY wallet at depth ${depth}: ${wallet}`)
          console.log(`   ↳ Known to be funded by: ${treasuryInfo.fundedBy}`)
          
          // Mark this wallet
          const node = walletTree.get(wallet) || {
            wallet,
            depth,
            solReceived: fundedAmount,
            solSent: 0,
            fundedBy,
            fundedAmount,
            fundingTx,
            fundingTime,
            cexSource: null,
            isLeaf: false,
            children: [],
            isTreasury: true
          }
          walletTree.set(wallet, node)
          
          // Add the known CEX funder to the queue
          if (treasuryInfo.fundedBy && !visited.has(treasuryInfo.fundedBy)) {
            queue.push({
              wallet: treasuryInfo.fundedBy,
              depth: depth + 1,
              fundedBy: wallet,
              fundedAmount: 0, // Will be filled in when traced
              fundingTx: null,
              fundingTime: null
            })
            
            // Record child relationship
            node.children = node.children || []
            if (!node.children.includes(treasuryInfo.fundedBy)) {
              node.children.push(treasuryInfo.fundedBy)
            }
            walletTree.set(wallet, node)
          }
        }
        
        // Check if this is a CEX wallet
        const cexName = getCexName(wallet)
        if (cexName) {
          console.log(`🏦 Found CEX/KYC wallet: ${cexName} at depth ${depth}: ${wallet}`)
          rootCexWallet = wallet
          rootCexName = cexName
          
          const node = walletTree.get(wallet) || {
            wallet,
            depth,
            solReceived: fundedAmount,
            solSent: 0,
            fundedBy,
            fundedAmount,
            fundingTx,
            fundingTime,
            cexSource: cexName,
            isLeaf: true,
            children: []
          }
          node.cexSource = cexName
          node.isLeaf = true
          walletTree.set(wallet, node)
          
          // Don't continue tracing past CEX
          continue
        }
        
        // Fetch wallet transactions to find funding sources
        const walletTxUrl = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&limit=100`
        
        try {
          const walletTxResponse = await fetch(walletTxUrl)
          if (!walletTxResponse.ok) {
            console.error(`❌ Failed to fetch transactions for ${wallet}: ${walletTxResponse.status}`)
            continue
          }
          
          const walletTxs = await walletTxResponse.json()
          console.log(`📦 Got ${walletTxs.length} transactions for wallet ${wallet.slice(0, 8)}...`)
          
          walletTxs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
          
          // Find all wallets that funded this wallet
          const funders = new Map<string, { totalSol: number, firstTx: string, firstTime: number }>()
          let totalReceived = 0
          let totalSent = 0
          
          for (const tx of walletTxs) {
            const nativeTransfers = tx.nativeTransfers || []
            
            for (const transfer of nativeTransfers) {
              const amount = (transfer.amount || 0) / 1e9
              
              // Incoming transfer
              if (transfer.toUserAccount?.toLowerCase() === wallet.toLowerCase() && 
                  transfer.fromUserAccount &&
                  transfer.fromUserAccount.toLowerCase() !== wallet.toLowerCase()) {
                
                totalReceived += amount
                
                // Use much lower threshold (0.01 SOL) to catch all significant funding
                if (amount >= 0.01) {
                  const sender = transfer.fromUserAccount
                  const existing = funders.get(sender) || { totalSol: 0, firstTx: tx.signature, firstTime: tx.timestamp || 0 }
                  existing.totalSol += amount
                  if (!existing.firstTime || (tx.timestamp && tx.timestamp < existing.firstTime)) {
                    existing.firstTx = tx.signature
                    existing.firstTime = tx.timestamp || 0
                  }
                  funders.set(sender, existing)
                }
              }
              
              // Outgoing transfer
              if (transfer.fromUserAccount?.toLowerCase() === wallet.toLowerCase()) {
                totalSent += amount
              }
            }
          }
          
          console.log(`💰 Wallet ${wallet.slice(0, 8)}... received ${totalReceived.toFixed(2)} SOL from ${funders.size} unique funders`)
          
          // Log the top funders for debugging
          const topFunders = Array.from(funders.entries())
            .sort((a, b) => b[1].totalSol - a[1].totalSol)
            .slice(0, 5)
          
          for (const [funderWallet, data] of topFunders) {
            console.log(`  ↳ ${funderWallet.slice(0, 8)}... sent ${data.totalSol.toFixed(4)} SOL`)
          }
          
          // Update wallet node
          const existingNode = walletTree.get(wallet) || {
            wallet,
            depth,
            solReceived: 0,
            solSent: 0,
            fundedBy,
            fundedAmount,
            fundingTx,
            fundingTime,
            cexSource: null,
            isLeaf: funders.size === 0,
            children: []
          }
          existingNode.solReceived = totalReceived
          existingNode.solSent = totalSent
          existingNode.isLeaf = funders.size === 0
          walletTree.set(wallet, existingNode)
          
          // Add funders to queue for tracing - trace those with > minSolThreshold
          const funderList = Array.from(funders.entries())
            .filter(([_, data]) => data.totalSol >= minSolThreshold) // Only trace significant funders
            .sort((a, b) => b[1].totalSol - a[1].totalSol)
            .slice(0, 5) // Top 5 funders to trace deeper
          
          console.log(`🔗 Adding ${funderList.length} funders to trace queue (threshold: ${minSolThreshold} SOL)`)
          
          for (const [funderWallet, funderData] of funderList) {
            if (!visited.has(funderWallet)) {
              queue.push({
                wallet: funderWallet,
                depth: depth + 1,
                fundedBy: wallet,
                fundedAmount: funderData.totalSol,
                fundingTx: funderData.firstTx,
                fundingTime: funderData.firstTime ? new Date(funderData.firstTime * 1000).toISOString() : null
              })
              
              // Record child relationship
              existingNode.children.push(funderWallet)
              
              // Pre-create node for funder
              if (!walletTree.has(funderWallet)) {
                walletTree.set(funderWallet, {
                  wallet: funderWallet,
                  depth: depth + 1,
                  solReceived: 0,
                  solSent: funderData.totalSol,
                  fundedBy: wallet,
                  fundedAmount: funderData.totalSol,
                  fundingTx: funderData.firstTx,
                  fundingTime: funderData.firstTime ? new Date(funderData.firstTime * 1000).toISOString() : null,
                  cexSource: getCexName(funderWallet),
                  isLeaf: false,
                  children: []
                })
              }
            }
          }
          
          // Rate limit protection
          await new Promise(r => setTimeout(r, 200))
          
        } catch (error) {
          console.error(`❌ Error tracing wallet ${wallet}:`, error)
        }
      }
      
      // Build the hierarchical chain from mint wallet to root
      const chain: Array<{ level: string, wallet: string, depth: number, solFlow: number, cexSource: string | null, fundingTx: string | null }> = []
      const nodes = Array.from(walletTree.values()).sort((a, b) => a.depth - b.depth)
      
      for (const node of nodes) {
        let levelName = 'wallet'
        if (node.depth === 0) levelName = 'mint'
        else if (node.cexSource) levelName = `KYC (${node.cexSource})`
        else if (node.depth === 1) levelName = 'parent'
        else if (node.depth === 2) levelName = 'grandparent'
        else levelName = `ancestor-${node.depth}`
        
        chain.push({
          level: levelName,
          wallet: node.wallet,
          depth: node.depth,
          solFlow: node.fundedAmount || node.solReceived,
          cexSource: node.cexSource,
          fundingTx: node.fundingTx
        })
      }
      
      // Find the root (deepest) wallet
      const rootWallet = nodes.length > 0 ? nodes[nodes.length - 1] : null
      
      return new Response(
        JSON.stringify({
          success: true,
          tokenMint,
          summary: {
            mintWallet,
            mintTransaction: mintTxSignature,
            mintTimestamp,
            totalWalletsTraced: walletTree.size,
            maxDepthReached: Math.max(...nodes.map(n => n.depth)),
            rootCexWallet,
            rootCexName,
            foundKycWallet: !!rootCexName
          },
          chain: chain.reverse(), // Root to mint
          walletTree: nodes.map(n => ({
            wallet: n.wallet,
            depth: n.depth,
            solReceived: parseFloat(n.solReceived.toFixed(4)),
            solSent: parseFloat(n.solSent.toFixed(4)),
            fundedBy: n.fundedBy,
            fundedAmount: parseFloat(n.fundedAmount.toFixed(4)),
            fundingTx: n.fundingTx,
            fundingTime: n.fundingTime,
            cexSource: n.cexSource,
            isLeaf: n.isLeaf,
            childCount: n.children.length
          })),
          recommendedWatchlist: nodes
            .filter(n => n.depth === 1 || n.depth === 2) // Parent and grandparent level
            .map(n => ({
              wallet: n.wallet,
              reason: n.depth === 1 ? 'Direct parent of mint wallet' : 'Grandparent level - likely master wallet',
              solFlow: parseFloat(n.fundedAmount.toFixed(4))
            }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // TRACE MONEY FLOW - Follow money FORWARD (where it goes, not where it came from)
    // This traces outbound transfers from the creator to find splitter wallets and profit extraction
    if (action === 'trace_money_flow' && tokenMint) {
      const heliusApiKey = Deno.env.get('HELIUS_API_KEY')
      if (!heliusApiKey) {
        return new Response(
          JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const maxDepth = body.maxDepth || 5
      const minSolThreshold = body.minSolThreshold || 1.0 // Only follow significant transfers

      console.log(`💸 FORWARD TRACE: Following money flow from token ${tokenMint}`)

      // Known CEX deposit wallets (where funds ultimately go for cash-out)
      const KNOWN_CEX_DEPOSITS: Record<string, string[]> = {
        'Binance': ['5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'],
        'Coinbase': ['H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS'],
        'KuCoin': ['BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6'],
        'MEXC': ['ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ'],
        'OKX': ['5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD'],
        'Bybit': ['AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2'],
        'Gate.io': ['u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w']
      }

      const getCexName = (wallet: string): string | null => {
        for (const [cex, wallets] of Object.entries(KNOWN_CEX_DEPOSITS)) {
          if (wallets.includes(wallet)) return cex
        }
        return null
      }

      interface MoneyNode {
        wallet: string
        depth: number
        receivedFrom: string | null
        amountReceived: number
        totalSent: number
        sentTo: Array<{ wallet: string, amount: number, tx: string, time: string | null }>
        isSplitter: boolean
        isCex: string | null
        isLeaf: boolean
      }

      // Step 1: Find the creator/mint wallet
      console.log(`Finding creator wallet for token...`)
      const tokenTxUrl = `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusApiKey}&limit=50`
      const tokenTxResponse = await fetch(tokenTxUrl)
      
      if (!tokenTxResponse.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch token transactions: ${tokenTxResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const tokenTxs = await tokenTxResponse.json()
      tokenTxs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
      
      let creatorWallet: string | null = null
      for (const tx of tokenTxs.slice(0, 10)) {
        if (tx.feePayer && !creatorWallet) {
          creatorWallet = tx.feePayer
          break
        }
      }
      
      if (!creatorWallet) {
        return new Response(
          JSON.stringify({ error: 'Could not find creator wallet' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`✅ Creator wallet: ${creatorWallet}`)

      const moneyTree = new Map<string, MoneyNode>()
      const visited = new Set<string>()
      const queue: Array<{ wallet: string, depth: number, receivedFrom: string | null, amountReceived: number }> = []

      queue.push({ wallet: creatorWallet, depth: 0, receivedFrom: null, amountReceived: 0 })

      // BFS - follow money FORWARD
      while (queue.length > 0) {
        const { wallet, depth, receivedFrom, amountReceived } = queue.shift()!
        
        if (visited.has(wallet) || depth > maxDepth) continue
        visited.add(wallet)

        console.log(`💰 Depth ${depth}: Analyzing wallet ${wallet}`)

        // Check if this is a CEX deposit
        const cexName = getCexName(wallet)
        if (cexName) {
          console.log(`🏦 Found CEX deposit: ${cexName} at depth ${depth}`)
          moneyTree.set(wallet, {
            wallet,
            depth,
            receivedFrom,
            amountReceived,
            totalSent: 0,
            sentTo: [],
            isSplitter: false,
            isCex: cexName,
            isLeaf: true
          })
          continue // Don't trace further into CEX
        }

        // Fetch transactions
        const walletTxUrl = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&limit=200`
        
        try {
          const walletTxResponse = await fetch(walletTxUrl)
          if (!walletTxResponse.ok) {
            console.error(`❌ Failed to fetch: ${walletTxResponse.status}`)
            continue
          }

          const walletTxs = await walletTxResponse.json()
          console.log(`📦 Got ${walletTxs.length} transactions for ${wallet.slice(0, 8)}...`)

          // Find OUTGOING transfers (where this wallet SENDS money)
          const outbound = new Map<string, { totalSol: number, txs: Array<{ sig: string, amount: number, time: number | null }> }>()
          let totalSent = 0

          for (const tx of walletTxs) {
            const nativeTransfers = tx.nativeTransfers || []
            
            for (const transfer of nativeTransfers) {
              // OUTGOING transfer - from this wallet to someone else
              if (transfer.fromUserAccount?.toLowerCase() === wallet.toLowerCase() &&
                  transfer.toUserAccount &&
                  transfer.toUserAccount.toLowerCase() !== wallet.toLowerCase()) {
                
                const amount = (transfer.amount || 0) / 1e9
                
                if (amount >= 0.01) { // Any transfer over 0.01 SOL
                  const recipient = transfer.toUserAccount
                  totalSent += amount
                  
                  const existing = outbound.get(recipient) || { totalSol: 0, txs: [] }
                  existing.totalSol += amount
                  existing.txs.push({
                    sig: tx.signature,
                    amount,
                    time: tx.timestamp
                  })
                  outbound.set(recipient, existing)
                }
              }
            }
          }

          // Determine if this is a "splitter" wallet (receives large, sends to multiple in smaller amounts)
          const outboundCount = outbound.size
          const isSplitter = amountReceived > 10 && outboundCount >= 3 // Received large and split to 3+ wallets

          if (isSplitter) {
            console.log(`🔀 SPLITTER DETECTED: ${wallet.slice(0, 8)}... splits funds to ${outboundCount} wallets`)
          }

          // Build sent-to list
          const sentToList: Array<{ wallet: string, amount: number, tx: string, time: string | null }> = []
          
          const sortedOutbound = Array.from(outbound.entries())
            .filter(([_, data]) => data.totalSol >= minSolThreshold)
            .sort((a, b) => b[1].totalSol - a[1].totalSol)

          for (const [recipient, data] of sortedOutbound) {
            const firstTx = data.txs.sort((a, b) => (a.time || 0) - (b.time || 0))[0]
            sentToList.push({
              wallet: recipient,
              amount: parseFloat(data.totalSol.toFixed(4)),
              tx: firstTx.sig,
              time: firstTx.time ? new Date(firstTx.time * 1000).toISOString() : null
            })

            console.log(`  → Sent ${data.totalSol.toFixed(2)} SOL to ${recipient.slice(0, 8)}...`)

            // Add to queue to trace further
            if (!visited.has(recipient) && data.totalSol >= minSolThreshold) {
              queue.push({
                wallet: recipient,
                depth: depth + 1,
                receivedFrom: wallet,
                amountReceived: data.totalSol
              })
            }
          }

          moneyTree.set(wallet, {
            wallet,
            depth,
            receivedFrom,
            amountReceived,
            totalSent,
            sentTo: sentToList,
            isSplitter,
            isCex: null,
            isLeaf: sentToList.length === 0
          })

          // Rate limit
          await new Promise(r => setTimeout(r, 150))

        } catch (error) {
          console.error(`❌ Error tracing ${wallet}:`, error)
        }
      }

      // Build flow summary
      const nodes = Array.from(moneyTree.values()).sort((a, b) => a.depth - b.depth)
      const splitterWallets = nodes.filter(n => n.isSplitter)
      const cexDeposits = nodes.filter(n => n.isCex)
      const totalExtracted = nodes.reduce((sum, n) => sum + n.totalSent, 0)

      console.log(`✅ Trace complete: ${nodes.length} wallets, ${splitterWallets.length} splitters, ${cexDeposits.length} CEX deposits`)

      return new Response(
        JSON.stringify({
          success: true,
          tokenMint,
          direction: 'forward',
          summary: {
            creatorWallet,
            totalWalletsTraced: nodes.length,
            maxDepthReached: Math.max(...nodes.map(n => n.depth)),
            splitterWalletsFound: splitterWallets.length,
            cexDepositsFound: cexDeposits.length,
            totalSolMoved: parseFloat(totalExtracted.toFixed(2))
          },
          splitters: splitterWallets.map(s => ({
            wallet: s.wallet,
            depth: s.depth,
            received: parseFloat(s.amountReceived.toFixed(4)),
            splitToWallets: s.sentTo.length,
            recipients: s.sentTo
          })),
          cexDeposits: cexDeposits.map(c => ({
            wallet: c.wallet,
            cex: c.isCex,
            depth: c.depth,
            amountReceived: parseFloat(c.amountReceived.toFixed(4)),
            fromWallet: c.receivedFrom
          })),
          moneyFlow: nodes.map(n => ({
            wallet: n.wallet,
            depth: n.depth,
            receivedFrom: n.receivedFrom,
            amountReceived: parseFloat(n.amountReceived.toFixed(4)),
            totalSent: parseFloat(n.totalSent.toFixed(4)),
            sentToCount: n.sentTo.length,
            isSplitter: n.isSplitter,
            isCex: n.isCex,
            isLeaf: n.isLeaf,
            topRecipients: n.sentTo.slice(0, 5)
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Scan for new pump.fun tokens
    if (action === 'scan') {
      console.log('Scanning for new pump.fun tokens...')

      const latestResponse = await fetch(
        'https://data.solanatracker.io/tokens/latest?market=pumpfun&limit=10',
        { headers: { 'x-api-key': solanaTrackerApiKey } }
      )

      if (!latestResponse.ok) {
        throw new Error(`Failed to fetch latest tokens: ${latestResponse.status}`)
      }

      const latestTokens = await latestResponse.json()
      console.log(`Found ${latestTokens?.length || 0} latest pump.fun tokens`)

      const analyzed: any[] = []
      
      for (const tokenEntry of (latestTokens || []).slice(0, 5)) {
        const mint = tokenEntry.token?.mint || tokenEntry.mint
        if (!mint) continue

        // Check if already analyzed recently
        const { data: existing } = await supabase
          .from('token_mint_watchdog')
          .select('analyzed_at')
          .eq('token_mint', mint)
          .single()

        if (existing?.analyzed_at) {
          const analyzedAge = Date.now() - new Date(existing.analyzed_at).getTime()
          if (analyzedAge < 5 * 60 * 1000) continue
        }

        // Fetch full token data
        try {
          const tokenResponse = await fetch(
            `https://data.solanatracker.io/tokens/${mint}`,
            { headers: { 'x-api-key': solanaTrackerApiKey } }
          )

          if (!tokenResponse.ok) continue

          const tokenData: SolanaTrackerResponse = await tokenResponse.json()
          const bundleAnalysis = analyzeTokenRisk(tokenData)
          const pool = tokenData.pools?.[0]
          const creator = tokenData.token?.creation?.creator || pool?.deployer || 'unknown'

          await supabase
            .from('token_mint_watchdog')
            .upsert({
              token_mint: mint,
              creator_wallet: creator,
              metadata: {
                name: tokenData.token?.name,
                symbol: tokenData.token?.symbol,
                market: pool?.market,
                marketCapUsd: pool?.marketCap?.usd,
                bundleId: pool?.bundleId
              },
              bundle_analysis: bundleAnalysis,
              is_bundled: bundleAnalysis.isBundled,
              bundle_score: bundleAnalysis.bundleScore,
              analyzed_at: new Date().toISOString(),
              discovery_triggered: true
            }, { onConflict: 'token_mint' })

          analyzed.push({
            mint,
            name: tokenData.token?.name,
            symbol: tokenData.token?.symbol,
            isBundled: bundleAnalysis.isBundled,
            bundleScore: bundleAnalysis.bundleScore,
            bundleId: pool?.bundleId,
            patterns: bundleAnalysis.suspiciousPatterns
          })

          console.log(`Analyzed ${tokenData.token?.symbol}: Bundle score ${bundleAnalysis.bundleScore}`)
        } catch (error) {
          console.error(`Error analyzing ${mint}:`, error)
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'scan',
          tokensAnalyzed: analyzed.length,
          tokens: analyzed
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // CHECK WALLET MINTS - Scan wallets for any token mints they've created
    if (action === 'check_wallet_mints') {
      const wallets = body.wallets || []
      
      if (!Array.isArray(wallets) || wallets.length === 0) {
        return new Response(
          JSON.stringify({ error: 'wallets array is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const heliusApiKey = Deno.env.get('HELIUS_API_KEY')
      if (!heliusApiKey) {
        return new Response(
          JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Checking ${wallets.length} wallets for token mints...`)
      
      const mintedTokens: any[] = []
      
      for (const walletAddress of wallets.slice(0, 10)) { // Limit to 10 wallets
        console.log(`Scanning wallet for mints: ${walletAddress}`)
        
        try {
          // Fetch wallet transactions from Helius
          const response = await fetch(
            `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=100`,
            { method: 'GET' }
          )
          
          if (!response.ok) {
            console.error(`Helius error for ${walletAddress}:`, response.status)
            continue
          }
          
          const transactions = await response.json()
          
          // Look for token creation transactions
          for (const tx of transactions) {
            const instructions = tx.instructions || []
            const events = tx.events || {}
            
            // Check for token program instructions that indicate minting
            const isTokenCreation = instructions.some((inst: any) => {
              // Check for InitializeMint instruction
              if (inst.programId === 'TokenkgQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
                if (inst.parsed?.type === 'initializeMint' || inst.parsed?.type === 'initializeMint2') {
                  return true
                }
              }
              // Check for Token-2022 program
              if (inst.programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
                if (inst.parsed?.type === 'initializeMint' || inst.parsed?.type === 'initializeMint2') {
                  return true
                }
              }
              return false
            })
            
            // Also check for pump.fun create instruction
            const isPumpCreate = instructions.some((inst: any) => 
              inst.programId === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' && 
              (inst.parsed?.type === 'create' || tx.type === 'CREATE')
            )
            
            if (isTokenCreation || isPumpCreate || tx.type === 'CREATE') {
              // Extract token mint from the transaction
              let tokenMint = null
              
              // Check token transfers for the new mint
              const tokenTransfers = tx.tokenTransfers || []
              if (tokenTransfers.length > 0) {
                tokenMint = tokenTransfers[0]?.mint
              }
              
              // Check events for nft/token info
              if (events.nft) {
                tokenMint = tokenMint || events.nft.mint
              }
              
              // Check instructions for mint account
              for (const inst of instructions) {
                if (inst.parsed?.info?.mint) {
                  tokenMint = inst.parsed.info.mint
                  break
                }
                if (inst.accounts && inst.accounts.length > 0) {
                  // First account is often the mint
                  const possibleMint = inst.accounts[0]
                  if (possibleMint && possibleMint.length > 30) {
                    tokenMint = tokenMint || possibleMint
                  }
                }
              }
              
              if (tokenMint) {
                // Fetch token metadata
                let tokenName = 'Unknown'
                let tokenSymbol = 'Unknown'
                let market = 'unknown'
                let marketCap = 0
                let curvePercentage = 0
                
                try {
                  const tokenResponse = await fetch(
                    `https://data.solanatracker.io/tokens/${tokenMint}`,
                    { headers: { 'x-api-key': solanaTrackerApiKey } }
                  )
                  
                  if (tokenResponse.ok) {
                    const tokenData = await tokenResponse.json()
                    tokenName = tokenData.token?.name || 'Unknown'
                    tokenSymbol = tokenData.token?.symbol || 'Unknown'
                    market = tokenData.pools?.[0]?.market || 'unknown'
                    marketCap = tokenData.pools?.[0]?.marketCap?.usd || 0
                    curvePercentage = tokenData.pools?.[0]?.curvePercentage || 0
                  }
                } catch (e) {
                  console.log(`Could not fetch metadata for ${tokenMint}`)
                }
                
                mintedTokens.push({
                  tokenMint,
                  tokenName,
                  tokenSymbol,
                  creatorWallet: walletAddress,
                  txSignature: tx.signature,
                  timestamp: tx.timestamp,
                  timestampFormatted: new Date(tx.timestamp * 1000).toISOString(),
                  type: isPumpCreate ? 'pump.fun' : 'standard',
                  market,
                  marketCap,
                  curvePercentage,
                  solscanUrl: `https://solscan.io/tx/${tx.signature}`
                })
                
                console.log(`Found minted token: ${tokenSymbol} (${tokenMint}) by ${walletAddress}`)
              }
            }
          }
          
          // Rate limit protection
          await new Promise(r => setTimeout(r, 200))
          
        } catch (error) {
          console.error(`Error scanning wallet ${walletAddress}:`, error)
        }
      }
      
      // Deduplicate tokens by mint address
      const uniqueTokens = Array.from(
        new Map(mintedTokens.map(t => [t.tokenMint, t])).values()
      )
      
      console.log(`Found ${uniqueTokens.length} unique minted tokens across ${wallets.length} wallets`)
      
      return new Response(
        JSON.stringify({
          success: true,
          action: 'check_wallet_mints',
          walletsScanned: Math.min(wallets.length, 10),
          totalMintedTokens: uniqueTokens.length,
          mintedTokens: uniqueTokens.sort((a, b) => b.timestamp - a.timestamp)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "analyze" with tokenMint or "scan"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in token-mint-watchdog-monitor:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
