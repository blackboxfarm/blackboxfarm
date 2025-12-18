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
