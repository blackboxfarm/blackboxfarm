import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    
    const supabase = createClient(supabaseUrl, supabaseKey)

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

    const { developerId } = await req.json()

    if (!developerId) {
      return new Response(JSON.stringify({ error: 'developerId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Calculating reputation for developer: ${developerId}`)

    // Get all tokens for this developer
    const { data: tokens, error: tokensError } = await supabase
      .from('developer_tokens')
      .select('*')
      .eq('developer_id', developerId)

    if (tokensError) {
      throw tokensError
    }

    if (!tokens || tokens.length === 0) {
      console.log('No tokens found for developer, setting neutral reputation')
      
      await supabase
        .from('developer_profiles')
        .update({
          reputation_score: 50.00,
          trust_level: 'neutral',
          updated_at: new Date().toISOString(),
        })
        .eq('id', developerId)

      return new Response(
        JSON.stringify({
          success: true,
          reputationScore: 50,
          trustLevel: 'neutral',
          message: 'No tokens found, neutral reputation assigned',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate statistics
    const totalTokens = tokens.length
    const successfulTokens = tokens.filter(t => t.outcome === 'success').length
    const failedTokens = tokens.filter(t => t.outcome === 'failed').length
    const rugPulls = tokens.filter(t => t.outcome === 'rug_pull').length
    const slowDrains = tokens.filter(t => t.outcome === 'slow_drain').length
    
    const totalVolume = tokens.reduce((sum, t) => sum + (parseFloat(t.total_volume_usd) || 0), 0)
    const avgLifespan = tokens.reduce((sum, t) => sum + (t.lifespan_days || 0), 0) / totalTokens
    
    const tokensWithLockedLiquidity = tokens.filter(t => t.liquidity_locked).length
    const tokensWithRevokedAuthority = tokens.filter(t => t.mint_authority_revoked).length

    // Reputation calculation (0-100)
    let reputationScore = 50 // Start neutral

    // POSITIVE FACTORS (up to +50 points)
    
    // Success rate (max +20 points)
    const successRate = totalTokens > 0 ? (successfulTokens / totalTokens) * 100 : 0
    reputationScore += (successRate / 100) * 20

    // Volume generated (max +15 points)
    if (totalVolume >= 10000000) reputationScore += 15
    else if (totalVolume >= 5000000) reputationScore += 12
    else if (totalVolume >= 1000000) reputationScore += 10
    else if (totalVolume >= 500000) reputationScore += 7
    else if (totalVolume >= 100000) reputationScore += 5
    else if (totalVolume >= 10000) reputationScore += 2

    // Average lifespan (max +10 points)
    if (avgLifespan >= 180) reputationScore += 10
    else if (avgLifespan >= 90) reputationScore += 7
    else if (avgLifespan >= 30) reputationScore += 5
    else if (avgLifespan >= 14) reputationScore += 3

    // Good security practices (max +5 points)
    const liquidityLockRate = totalTokens > 0 ? (tokensWithLockedLiquidity / totalTokens) : 0
    const authorityRevokeRate = totalTokens > 0 ? (tokensWithRevokedAuthority / totalTokens) : 0
    reputationScore += (liquidityLockRate * 2.5)
    reputationScore += (authorityRevokeRate * 2.5)

    // NEGATIVE FACTORS (down to -50 points)
    
    // Rug pulls (severe penalty: -15 per rug, max -40)
    reputationScore -= Math.min(40, rugPulls * 15)

    // Slow drains (moderate penalty: -10 per drain, max -30)
    reputationScore -= Math.min(30, slowDrains * 10)

    // Failed tokens (light penalty: -2 per failure, max -20)
    reputationScore -= Math.min(20, failedTokens * 2)

    // Pattern of short-lived tokens (penalty: -10 if avg < 7 days)
    if (avgLifespan < 7 && totalTokens >= 3) {
      reputationScore -= 10
    }

    // Clamp score between 0-100
    reputationScore = Math.max(0, Math.min(100, reputationScore))

    // Determine trust level
    let trustLevel: string
    if (reputationScore >= 80) {
      trustLevel = 'trusted'
    } else if (reputationScore >= 40) {
      trustLevel = 'neutral'
    } else if (reputationScore >= 20) {
      trustLevel = 'suspicious'
    } else {
      trustLevel = 'scammer'
    }

    // Update developer profile
    const { error: updateError } = await supabase
      .from('developer_profiles')
      .update({
        reputation_score: reputationScore.toFixed(2),
        trust_level: trustLevel,
        total_tokens_created: totalTokens,
        successful_tokens: successfulTokens,
        failed_tokens: failedTokens,
        total_volume_generated: totalVolume.toFixed(2),
        average_token_lifespan_days: avgLifespan.toFixed(2),
        rug_pull_count: rugPulls,
        slow_drain_count: slowDrains,
        updated_at: new Date().toISOString(),
        last_analysis_at: new Date().toISOString(),
      })
      .eq('id', developerId)

    if (updateError) {
      throw updateError
    }

    const summary = {
      reputationScore: parseFloat(reputationScore.toFixed(2)),
      trustLevel,
      statistics: {
        totalTokens,
        successfulTokens,
        failedTokens,
        rugPulls,
        slowDrains,
        successRate: parseFloat(successRate.toFixed(2)),
        totalVolumeUsd: parseFloat(totalVolume.toFixed(2)),
        avgLifespanDays: parseFloat(avgLifespan.toFixed(2)),
        liquidityLockRate: parseFloat((liquidityLockRate * 100).toFixed(2)),
        authorityRevokeRate: parseFloat((authorityRevokeRate * 100).toFixed(2)),
      },
    }

    console.log(`Reputation calculated: ${reputationScore.toFixed(2)} (${trustLevel})`)

    return new Response(
      JSON.stringify({
        success: true,
        ...summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in developer-reputation-calculator:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
