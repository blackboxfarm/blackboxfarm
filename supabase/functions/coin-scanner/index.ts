import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(withRunLog('coin-scanner', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { excludeMints = [], minScore = 70, limit = 10 } = await req.json()
    
    console.log('Starting optimized coin scan with params:', { excludeMints, minScore, limit })

    const allTokens = await fetchTrendingTokens()
    console.log(`📊 Retrieved ${allTokens.length} tokens from API`)

    // Early price filter: only consider tokens under $0.005 for better movement potential
    const lowPriceTokens = allTokens.filter(token => {
      const price = parseFloat(token.priceUsd) || 0
      return price < 0.005 && price > 0
    })
    
    console.log(`💰 Price filter: ${lowPriceTokens.length} tokens under $0.005 from ${allTokens.length} total`)

    const mapToken = (token: any) => ({
      mint: token.baseToken?.address || 'N/A',
      symbol: token.baseToken?.symbol || 'N/A', 
      name: token.baseToken?.name || 'N/A',
      marketCap: parseFloat(token.marketCap) || 0,
      volume24h: parseFloat(token.volume?.h24) || 0,
      liquidityUsd: parseFloat(token.liquidity?.usd) || 0,
      priceUsd: parseFloat(token.priceUsd) || 0,
      priceChange24h: parseFloat(token.priceChange?.h24) || 0,
      chainId: token.chainId || 'solana',
      dexId: token.dexId || 'raydium',
      rank: token.rank || 0,
      age: token.age || 'unknown'
    })

    if (lowPriceTokens.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        tokens: [],
        scannedCount: allTokens.length,
        qualifiedCount: 0,
        allTokens: allTokens.map(mapToken)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Convert filtered low-price tokens to qualified tokens — REAL DATA ONLY
    const qualifiedTokens = lowPriceTokens.slice(0, limit)
      .map((token) => {
        const marketCap = parseFloat(token.marketCap) || null;
        const volume24h = parseFloat(token.volume?.h24) || null;
        const liquidityUsd = parseFloat(token.liquidity?.usd) || null;
        const priceUsd = parseFloat(token.priceUsd) || null;
        const priceChange24h = parseFloat(token.priceChange?.h24) || null;

        // Skip tokens with no real price data
        if (!priceUsd || priceUsd <= 0) return null;

        return {
          mint: token.pairAddress || token.baseToken?.address || null,
          symbol: token.baseToken?.symbol || 'UNK',
          name: token.baseToken?.name || 'Unknown Token',
          marketCap,
          volume24h,
          liquidityUsd,
          priceUsd,
          holderCount: null, // DexScreener doesn't provide this
          volatility24h: priceChange24h !== null ? Math.abs(priceChange24h) : null,
          ageHours: token.age === 'unknown' ? null : (token.age?.includes('d') ? parseInt(token.age) * 24 : parseInt(token.age) || null),
          spread: null, // Not available from API
          liquidityLocked: null, // Not available from API
          swingCount: null, // Not available from API
          volumeProfile: null, // Not available from API
          correlationScore: null, // Not available from API
          newsScore: null, // Not available from API
          totalScore: null, // Cannot score without real data
        }
      })
      .filter(Boolean);

    console.log(`✅ Returning ${qualifiedTokens.length} qualified tokens from scraped DexScreener data`)

    return new Response(JSON.stringify({ 
      success: true, 
      tokens: qualifiedTokens,
      scannedCount: allTokens.length,
      qualifiedCount: qualifiedTokens.length,
      allTokens: allTokens.map(mapToken)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    
  } catch (error) {
    console.error('Coin scanner error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}))

// Fetch live trending tokens from DexScreener API
async function fetchTrendingTokens(): Promise<any[]> {
  try {
    console.log('🔍 Fetching live trending tokens from DexScreener API...')
    
    const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/trending/solana?page=1&limit=50', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.log('❌ API response not ok, trying pairs endpoint instead...')
      const pairsResponse = await fetch('https://api.dexscreener.com/latest/dex/search?q=SOL', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      })
      
      if (!pairsResponse.ok) {
        throw new Error(`API request failed: ${pairsResponse.status}`)
      }
      
      const pairsData = await pairsResponse.json()
      console.log(`📊 Retrieved ${pairsData.pairs?.length || 0} pairs from search endpoint`)
      
      if (!pairsData.pairs || pairsData.pairs.length === 0) {
        console.log('❌ No pairs found in search results')
        return []
      }
      
      const solanaPairs = pairsData.pairs
        .filter((pair: any) => pair.chainId === 'solana')
        .slice(0, 50)
        .map((pair: any, index: number) => ({
          rank: index + 1,
          baseToken: pair.baseToken,
          quoteToken: pair.quoteToken,
          pairAddress: pair.pairAddress,
          chainId: pair.chainId,
          dexId: pair.dexId,
          url: pair.url,
          priceUsd: pair.priceUsd,
          volume: pair.volume,
          marketCap: pair.marketCap || 0,
          liquidity: pair.liquidity,
          priceChange: pair.priceChange,
          age: calculateAge(pair.pairCreatedAt)
        }))
      
      return solanaPairs
    }
    
    const data = await response.json()
    console.log(`📊 Retrieved ${data.length || 0} trending tokens from API`)
    
    if (!data || data.length === 0) {
      console.log('❌ No trending tokens found')
      return []
    }
    
    const tokens = data.slice(0, 50).map((token: any, index: number) => ({
      rank: index + 1,
      baseToken: token.baseToken,
      quoteToken: token.quoteToken,
      pairAddress: token.pairAddress,
      chainId: token.chainId,
      dexId: token.dexId,
      url: token.url,
      priceUsd: token.priceUsd,
      volume: token.volume,
      marketCap: token.marketCap || 0,
      liquidity: token.liquidity,
      priceChange: token.priceChange,
      age: calculateAge(token.pairCreatedAt)
    }))
    
    if (tokens.length > 0) {
      console.log('🔍 Sample token:', JSON.stringify(tokens[0], null, 2))
    }
    
    return tokens
    
  } catch (error) {
    console.error('❌ Error fetching live tokens:', error)
    console.log('🚫 Returning empty array - no live data available')
    return []
  }
}

// Helper function to calculate age from timestamp
function calculateAge(timestamp: number): string {
  if (!timestamp) return 'unknown'
  
  const now = Date.now()
  const diff = now - timestamp
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  return '1h'
}
