import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Scoring criteria for mint potential
interface ScoreFactors {
  fundingAmount: number      // 0-25 points: 1-3 SOL is optimal
  walletAge: number          // 0-20 points: fresh wallets score higher
  fundingPattern: number     // 0-25 points: burst funding patterns
  chainDepth: number         // 0-15 points: L1/L2 offspring more likely
  balancePattern: number     // 0-15 points: holding SOL without activity
}

function calculateLauncherScore(
  fundingAmountSol: number,
  walletAgeMinutes: number,
  recentFundingCount: number,
  chainDepth: number,
  hasActivity: boolean
): { score: number; factors: ScoreFactors } {
  const factors: ScoreFactors = {
    fundingAmount: 0,
    walletAge: 0,
    fundingPattern: 0,
    chainDepth: 0,
    balancePattern: 0,
  }

  // Funding amount scoring (1-3 SOL is optimal for pump.fun launches)
  if (fundingAmountSol >= 1 && fundingAmountSol <= 3) {
    factors.fundingAmount = 25
  } else if (fundingAmountSol >= 0.5 && fundingAmountSol < 1) {
    factors.fundingAmount = 15
  } else if (fundingAmountSol > 3 && fundingAmountSol <= 5) {
    factors.fundingAmount = 18
  } else if (fundingAmountSol > 5) {
    factors.fundingAmount = 10
  } else {
    factors.fundingAmount = 5
  }

  // Wallet age scoring (fresh wallets more likely to mint)
  if (walletAgeMinutes < 60) {
    factors.walletAge = 20  // < 1 hour old
  } else if (walletAgeMinutes < 1440) {
    factors.walletAge = 15  // < 24 hours
  } else if (walletAgeMinutes < 10080) {
    factors.walletAge = 10  // < 1 week
  } else {
    factors.walletAge = 5
  }

  // Funding pattern scoring (burst funding = coordinated launch)
  if (recentFundingCount >= 5) {
    factors.fundingPattern = 25  // 5+ wallets funded recently
  } else if (recentFundingCount >= 3) {
    factors.fundingPattern = 20
  } else if (recentFundingCount >= 2) {
    factors.fundingPattern = 15
  } else {
    factors.fundingPattern = 5
  }

  // Chain depth scoring (L1 and L2 are most likely launchers)
  if (chainDepth === 1) {
    factors.chainDepth = 15
  } else if (chainDepth === 2) {
    factors.chainDepth = 12
  } else if (chainDepth === 3) {
    factors.chainDepth = 8
  } else {
    factors.chainDepth = 3
  }

  // Balance pattern (holding SOL without swaps = waiting to mint)
  if (!hasActivity && fundingAmountSol >= 1) {
    factors.balancePattern = 15
  } else if (!hasActivity) {
    factors.balancePattern = 10
  } else {
    factors.balancePattern = 5
  }

  const score = Object.values(factors).reduce((a, b) => a + b, 0)
  return { score, factors }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { action, mega_whale_id, offspring_id, min_score_for_monitor = 60 } = await req.json()

    console.log(`Launcher scorer action: ${action}`)

    if (action === 'score_all') {
      // Score all unscored offspring for a whale
      const { data: offspring, error: offspringError } = await supabase
        .from('mega_whale_offspring')
        .select('*')
        .eq('mega_whale_id', mega_whale_id)
        .or('last_scored_at.is.null,last_scored_at.lt.' + new Date(Date.now() - 3600000).toISOString())

      if (offspringError) throw offspringError

      console.log(`Scoring ${offspring?.length || 0} offspring wallets`)

      // Get recent funding count (wallets funded in last hour from same whale)
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
      const { count: recentFundingCount } = await supabase
        .from('mega_whale_offspring')
        .select('*', { count: 'exact', head: true })
        .eq('mega_whale_id', mega_whale_id)
        .gte('first_seen', oneHourAgo)

      const results = []
      for (const wallet of offspring || []) {
        const walletAgeMinutes = (Date.now() - new Date(wallet.first_seen).getTime()) / 60000
        const hasActivity = wallet.token_buys > 0 || wallet.token_sells > 0

        const { score, factors } = calculateLauncherScore(
          wallet.total_sol_received || 0,
          walletAgeMinutes,
          recentFundingCount || 0,
          wallet.level || 1,
          hasActivity
        )

        // Update the offspring record
        const shouldMonitor = score >= min_score_for_monitor && !wallet.has_minted
        
        await supabase
          .from('mega_whale_offspring')
          .update({
            launcher_score: score,
            score_factors: factors,
            is_monitored: shouldMonitor,
            last_scored_at: new Date().toISOString(),
          })
          .eq('id', wallet.id)

        results.push({
          wallet: wallet.wallet_address,
          score,
          factors,
          isMonitored: shouldMonitor,
        })
      }

      // Count monitored wallets
      const monitoredCount = results.filter(r => r.isMonitored).length

      return new Response(
        JSON.stringify({
          success: true,
          scored: results.length,
          monitored: monitoredCount,
          results: results.slice(0, 20), // Return top 20 for preview
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'score_single') {
      // Score a single offspring wallet
      const { data: wallet, error: walletError } = await supabase
        .from('mega_whale_offspring')
        .select('*')
        .eq('id', offspring_id)
        .single()

      if (walletError) throw walletError

      // Get recent funding count
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
      const { count: recentFundingCount } = await supabase
        .from('mega_whale_offspring')
        .select('*', { count: 'exact', head: true })
        .eq('mega_whale_id', wallet.mega_whale_id)
        .gte('first_seen', oneHourAgo)

      const walletAgeMinutes = (Date.now() - new Date(wallet.first_seen).getTime()) / 60000
      const hasActivity = wallet.token_buys > 0 || wallet.token_sells > 0

      const { score, factors } = calculateLauncherScore(
        wallet.total_sol_received || 0,
        walletAgeMinutes,
        recentFundingCount || 0,
        wallet.level || 1,
        hasActivity
      )

      const shouldMonitor = score >= min_score_for_monitor && !wallet.has_minted

      await supabase
        .from('mega_whale_offspring')
        .update({
          launcher_score: score,
          score_factors: factors,
          is_monitored: shouldMonitor,
          last_scored_at: new Date().toISOString(),
        })
        .eq('id', offspring_id)

      return new Response(
        JSON.stringify({
          success: true,
          wallet: wallet.wallet_address,
          score,
          factors,
          isMonitored: shouldMonitor,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'get_monitored') {
      // Get all monitored wallets across all whales or for a specific whale
      let query = supabase
        .from('mega_whale_offspring')
        .select('*, mega_whales(wallet_address, label)')
        .eq('is_monitored', true)
        .eq('has_minted', false)
        .order('launcher_score', { ascending: false })

      if (mega_whale_id) {
        query = query.eq('mega_whale_id', mega_whale_id)
      }

      const { data, error } = await query.limit(100)

      if (error) throw error

      return new Response(
        JSON.stringify({
          success: true,
          count: data?.length || 0,
          wallets: data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: score_all, score_single, get_monitored' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Launcher scorer error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
