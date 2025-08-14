import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TokenMetrics {
  mint: string
  symbol: string
  name: string
  marketCap: number
  volume24h: number
  liquidityUsd: number
  priceUsd: number
  holderCount: number
  volatility24h: number
  ageHours: number
  spread: number
  liquidityLocked: boolean
  swingCount: number
  volumeProfile: number[]
  correlationScore: number
  newsScore: number
  totalScore: number
}

interface ScanRequest {
  excludeMints?: string[]
  minScore?: number
  limit?: number
}

// Fetch token data from DexScreener
async function fetchTokenData(mint: string): Promise<any> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
    const data = await response.json()
    return data.pairs?.[0] || null
  } catch (error) {
    console.error(`Error fetching token data for ${mint}:`, error)
    return null
  }
}

// Fetch trending tokens from DexScreener
async function fetchTrendingTokens(): Promise<any[]> {
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/search/?q=SOL')
    const data = await response.json()
    return data.pairs?.slice(0, 100) || []
  } catch (error) {
    console.error('Error fetching trending tokens:', error)
    return []
  }
}

// Check if liquidity is locked via RugCheck API
async function checkLiquidityLock(mint: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`)
    const data = await response.json()
    return data.risks?.some((risk: any) => 
      risk.name === 'Liquidity not locked' && risk.score === 0
    ) ?? false
  } catch (error) {
    console.warn(`Could not verify liquidity lock for ${mint}:`, error)
    return false // Err on side of caution
  }
}

// Calculate volatility from price history
function calculateVolatility(priceHistory: number[]): number {
  if (priceHistory.length < 2) return 0
  
  const returns = []
  for (let i = 1; i < priceHistory.length; i++) {
    returns.push((priceHistory[i] - priceHistory[i-1]) / priceHistory[i-1])
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length
  return Math.sqrt(variance) * 100 // Convert to percentage
}

// Count swing patterns in price data
function countSwings(priceHistory: number[]): number {
  if (priceHistory.length < 3) return 0
  
  let swings = 0
  let direction = 0 // 1 for up, -1 for down
  
  for (let i = 1; i < priceHistory.length; i++) {
    const currentDirection = priceHistory[i] > priceHistory[i-1] ? 1 : -1
    if (direction !== 0 && direction !== currentDirection) {
      swings++
    }
    direction = currentDirection
  }
  
  return swings
}

// Calculate volume profile (hourly distribution)
function calculateVolumeProfile(volumeData: any[]): number[] {
  const hourlyVolume = new Array(24).fill(0)
  
  volumeData.forEach(entry => {
    const hour = new Date(entry.timestamp).getHours()
    hourlyVolume[hour] += entry.volume || 0
  })
  
  const totalVolume = hourlyVolume.reduce((a, b) => a + b, 0)
  return hourlyVolume.map(v => totalVolume > 0 ? v / totalVolume : 0)
}

// Calculate correlation with current token
function calculateCorrelation(prices1: number[], prices2: number[]): number {
  if (prices1.length !== prices2.length || prices1.length < 2) return 0
  
  const mean1 = prices1.reduce((a, b) => a + b, 0) / prices1.length
  const mean2 = prices2.reduce((a, b) => a + b, 0) / prices2.length
  
  let numerator = 0
  let sum1 = 0
  let sum2 = 0
  
  for (let i = 0; i < prices1.length; i++) {
    const diff1 = prices1[i] - mean1
    const diff2 = prices2[i] - mean2
    numerator += diff1 * diff2
    sum1 += diff1 * diff1
    sum2 += diff2 * diff2
  }
  
  const denominator = Math.sqrt(sum1 * sum2)
  return denominator > 0 ? Math.abs(numerator / denominator) : 0
}

// Basic news sentiment analysis (placeholder - would integrate with news APIs)
async function analyzeNewsSentiment(symbol: string): Promise<number> {
  // This would integrate with news APIs like NewsAPI, CryptoNews, etc.
  // For now, return neutral score
  return 0.5
}

// Evaluate a single token against all criteria
async function evaluateToken(tokenData: any, currentTokenPrices?: number[]): Promise<TokenMetrics | null> {
  if (!tokenData || !tokenData.baseToken) return null
  
  const mint = tokenData.baseToken.address
  const symbol = tokenData.baseToken.symbol
  const name = tokenData.baseToken.name
  const priceUsd = parseFloat(tokenData.priceUsd) || 0
  const marketCap = parseFloat(tokenData.marketCap) || 0
  const volume24h = parseFloat(tokenData.volume?.h24) || 0
  const liquidityUsd = parseFloat(tokenData.liquidity?.usd) || 0
  
  // Check basic thresholds first
  if (marketCap < 5_000_000 || marketCap > 50_000_000) return null
  if (liquidityUsd < 200_000) return null
  if (volume24h < 500_000) return null
  
  // Check liquidity lock
  const liquidityLocked = await checkLiquidityLock(mint)
  if (!liquidityLocked) return null
  
  // Get additional metrics (mock data for now - would integrate with more APIs)
  const holderCount = Math.floor(Math.random() * 5000) + 1000 // Mock data
  const ageHours = Math.floor(Math.random() * 8760) + 168 // Mock: 1 week to 1 year old
  const spread = Math.random() * 0.02 // Mock: 0-2% spread
  
  if (holderCount < 1000) return null
  if (spread > 0.01) return null
  
  // Mock price history for volatility calculation
  const priceHistory = Array.from({length: 24}, (_, i) => 
    priceUsd * (1 + (Math.random() - 0.5) * 0.3)
  )
  
  const volatility24h = calculateVolatility(priceHistory)
  if (volatility24h < 10 || volatility24h > 20) return null
  
  const swingCount = countSwings(priceHistory)
  if (swingCount < 5) return null // Need multiple swings per day
  
  // Calculate advanced metrics
  const volumeProfile = calculateVolumeProfile([]) // Would use real volume data
  const correlationScore = currentTokenPrices ? 
    1 - calculateCorrelation(priceHistory, currentTokenPrices) : 0.5
  const newsScore = await analyzeNewsSentiment(symbol)
  
  // Calculate total score (weighted)
  const scores = {
    marketCap: Math.min(marketCap / 25_000_000, 1) * 15, // 0-15 points
    volume: Math.min(volume24h / 2_000_000, 1) * 15, // 0-15 points
    liquidity: Math.min(liquidityUsd / 1_000_000, 1) * 10, // 0-10 points
    volatility: (volatility24h - 10) / 10 * 15, // 0-15 points (10-20% range)
    holders: Math.min(holderCount / 5000, 1) * 10, // 0-10 points
    spread: (1 - spread / 0.01) * 10, // 0-10 points (lower is better)
    swings: Math.min(swingCount / 10, 1) * 10, // 0-10 points
    correlation: correlationScore * 10, // 0-10 points (lower correlation better)
    news: newsScore * 5 // 0-5 points
  }
  
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0)
  
  return {
    mint,
    symbol,
    name,
    marketCap,
    volume24h,
    liquidityUsd,
    priceUsd,
    holderCount,
    volatility24h,
    ageHours,
    spread,
    liquidityLocked,
    swingCount,
    volumeProfile,
    correlationScore,
    newsScore,
    totalScore
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  
  try {
    const { excludeMints = [], minScore = 70, limit = 10 }: ScanRequest = 
      await req.json().catch(() => ({}))
    
    console.log('Starting coin scan with params:', { excludeMints, minScore, limit })
    
    // Fetch trending tokens
    const trendingTokens = await fetchTrendingTokens()
    console.log(`Found ${trendingTokens.length} trending tokens`)
    
    // Evaluate each token
    const evaluations: TokenMetrics[] = []
    
    for (const tokenData of trendingTokens) {
      if (excludeMints.includes(tokenData.baseToken?.address)) continue
      
      const evaluation = await evaluateToken(tokenData)
      if (evaluation && evaluation.totalScore >= minScore) {
        evaluations.push(evaluation)
      }
    }
    
    // Sort by score and limit results
    const topTokens = evaluations
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit)
    
    console.log(`Returning ${topTokens.length} qualified tokens`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        tokens: topTokens,
        scannedCount: trendingTokens.length,
        qualifiedCount: evaluations.length
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
    
  } catch (error) {
    console.error('Coin scanner error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})