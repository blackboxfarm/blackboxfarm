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
