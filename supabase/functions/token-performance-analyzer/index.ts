import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Connection, PublicKey } from 'https://esm.sh/@solana/web3.js@1.95.3?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`)

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: user.id })
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Super admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { tokenMint } = await req.json()

    if (!tokenMint) {
      return new Response(JSON.stringify({ error: 'tokenMint is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Analyzing performance for token: ${tokenMint}`)

    const metrics: any = {
      tokenMint,
      holderCount: 0,
      transactionCount: 0,
      currentMarketCapUsd: 0,
      peakMarketCapUsd: 0,
      totalVolumeUsd: 0,
      lifespanDays: 0,
      liquidityLocked: false,
      mintAuthorityRevoked: false,
      freezeAuthorityRevoked: false,
      performanceScore: 0,
      outcome: 'unknown',
    }

    // 1. Get holder count from Solana
    try {
      const mintPubkey = new PublicKey(tokenMint)
      const tokenAccounts = await connection.getProgramAccounts(
        new PublicKey('TokenkgQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        {
          filters: [
            { dataSize: 165 },
            { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
          ],
        }
      )
      metrics.holderCount = tokenAccounts.length
    } catch (error) {
      console.error('Error getting holder count:', error)
    }

    // 2. Check mint authority status
    try {
      const mintPubkey = new PublicKey(tokenMint)
      const mintInfo = await connection.getAccountInfo(mintPubkey)
      if (mintInfo) {
        // Parse mint data (simplified - in production use proper SPL Token library)
        metrics.mintAuthorityRevoked = mintInfo.data[0] === 0
        metrics.freezeAuthorityRevoked = mintInfo.data[4] === 0
      }
    } catch (error) {
      console.error('Error checking mint authority:', error)
    }

    // 3. Get price data from DexScreener
    try {
      const dexResponse = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
      )
      
      if (dexResponse.ok) {
        const dexData = await dexResponse.json()
        const pair = dexData.pairs?.[0]
        
        if (pair) {
          metrics.currentMarketCapUsd = parseFloat(pair.marketCap || 0)
          metrics.totalVolumeUsd = parseFloat(pair.volume?.h24 || 0)
          metrics.launchpad = pair.dexId
          
          // Get price history for peak market cap (simplified)
          metrics.peakMarketCapUsd = metrics.currentMarketCapUsd // In production, fetch historical data
        }
      }
    } catch (error) {
      console.error('Error fetching DexScreener data:', error)
    }

    // 4. Calculate lifespan
    const { data: tokenRecord } = await supabase
      .from('developer_tokens')
      .select('launch_date')
      .eq('token_mint', tokenMint)
      .single()

    if (tokenRecord?.launch_date) {
      const launchDate = new Date(tokenRecord.launch_date)
      const now = new Date()
      metrics.lifespanDays = Math.floor((now.getTime() - launchDate.getTime()) / (1000 * 60 * 60 * 24))
    }

    // 5. Check liquidity lock (use existing function)
    try {
      const lockResponse = await fetch(
        `${supabaseUrl}/functions/v1/liquidity-lock-checker`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tokenMint }),
        }
      )
      
      if (lockResponse.ok) {
        const lockData = await lockResponse.json()
        metrics.liquidityLocked = lockData.isLocked || false
        metrics.liquidityLockDurationDays = lockData.lockDurationDays || 0
      }
    } catch (error) {
      console.error('Error checking liquidity lock:', error)
    }

    // 6. Calculate performance score (0-100)
    let score = 0
    
    // Longevity (25 points)
    if (metrics.lifespanDays >= 180) score += 25
    else if (metrics.lifespanDays >= 90) score += 20
    else if (metrics.lifespanDays >= 30) score += 15
    else if (metrics.lifespanDays >= 7) score += 10
    else score += 5

    // Volume (25 points)
    if (metrics.totalVolumeUsd >= 1000000) score += 25
    else if (metrics.totalVolumeUsd >= 500000) score += 20
    else if (metrics.totalVolumeUsd >= 100000) score += 15
    else if (metrics.totalVolumeUsd >= 10000) score += 10
    else if (metrics.totalVolumeUsd >= 1000) score += 5

    // Holder growth (20 points)
    if (metrics.holderCount >= 10000) score += 20
    else if (metrics.holderCount >= 5000) score += 15
    else if (metrics.holderCount >= 1000) score += 10
    else if (metrics.holderCount >= 100) score += 5

    // Authority management (15 points)
    if (metrics.mintAuthorityRevoked) score += 8
    if (metrics.freezeAuthorityRevoked) score += 7

    // Liquidity practices (15 points)
    if (metrics.liquidityLocked) {
      if (metrics.liquidityLockDurationDays >= 365) score += 15
      else if (metrics.liquidityLockDurationDays >= 180) score += 10
      else score += 5
    }

    metrics.performanceScore = Math.min(100, score)

    // 7. Determine outcome
    if (metrics.lifespanDays < 7 && metrics.currentMarketCapUsd < 10000) {
      metrics.outcome = 'failed'
    } else if (metrics.performanceScore >= 70 && metrics.lifespanDays >= 30) {
      metrics.outcome = 'success'
    } else if (metrics.lifespanDays >= 7) {
      metrics.outcome = 'active'
    } else {
      metrics.outcome = 'unknown'
    }

    // 8. Update database
    const { error: updateError } = await supabase
      .from('developer_tokens')
      .update({
        holder_count: metrics.holderCount,
        current_market_cap_usd: metrics.currentMarketCapUsd,
        peak_market_cap_usd: metrics.peakMarketCapUsd,
        total_volume_usd: metrics.totalVolumeUsd,
        lifespan_days: metrics.lifespanDays,
        liquidity_locked: metrics.liquidityLocked,
        liquidity_lock_duration_days: metrics.liquidityLockDurationDays,
        mint_authority_revoked: metrics.mintAuthorityRevoked,
        freeze_authority_revoked: metrics.freezeAuthorityRevoked,
        performance_score: metrics.performanceScore,
        outcome: metrics.outcome,
        updated_at: new Date().toISOString(),
      })
      .eq('token_mint', tokenMint)

    if (updateError) {
      console.error('Error updating token metrics:', updateError)
    }

    console.log(`Performance analysis complete. Score: ${metrics.performanceScore}, Outcome: ${metrics.outcome}`)

    return new Response(
      JSON.stringify({
        success: true,
        metrics,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in token-performance-analyzer:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
