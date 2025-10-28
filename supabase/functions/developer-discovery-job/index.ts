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
    // Use service-role JWT to authenticate internal function calls
    const token = supabaseKey

    // Public function: no authentication required

    const { tokenMint, walletAddress, maxDepth = 10 } = await req.json()

    if (!tokenMint && !walletAddress) {
      return new Response(JSON.stringify({ error: 'Either tokenMint or walletAddress is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Starting developer discovery job for ${tokenMint || walletAddress}`)

    // Create analysis job record
    const { data: job, error: jobError } = await supabase
      .from('developer_analysis_jobs')
      .insert({
        job_type: 'wallet_trace',
        status: 'running',
        wallet_address: walletAddress || tokenMint,
        max_depth: maxDepth,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (jobError || !job) {
      throw new Error('Failed to create analysis job')
    }

    let startWallet = walletAddress
    let developerId: string | null = null

    // If token mint provided, get creator wallet
    if (tokenMint) {
      await supabase
        .from('developer_analysis_jobs')
        .update({ progress_percent: 10 })
        .eq('id', job.id)

      // Fetch token metadata to find creator
      const heliusApiKey = Deno.env.get('HELIUS_API_KEY')
      if (heliusApiKey) {
        const response = await fetch(
          `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mintAccounts: [tokenMint] }),
          }
        )

        if (response.ok) {
          const metadata = await response.json()
          const creator = metadata?.[0]?.account
          if (creator) {
            startWallet = creator
          }
        }
      }

      // Fallback if we couldn't resolve a creator wallet
      if (!startWallet) {
        startWallet = walletAddress || `unknown_${tokenMint.slice(0,8)}`
      }
    }

    if (!startWallet) {
      throw new Error('Could not determine wallet address')
    }

    // Step 1: Trace wallet lineage (20-40%)
    await supabase
      .from('developer_analysis_jobs')
      .update({ progress_percent: 20 })
      .eq('id', job.id)

    const traceResponse = await fetch(
      `${supabaseUrl}/functions/v1/developer-wallet-tracer`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: startWallet,
          maxDepth,
        }),
      }
    )

    if (!traceResponse.ok) {
      throw new Error('Wallet trace failed')
    }

    const traceData = await traceResponse.json()
    
    await supabase
      .from('developer_analysis_jobs')
      .update({
        progress_percent: 40,
        current_depth: traceData.maxDepthReached || 0,
        wallets_discovered: traceData.walletsTraced || 0,
      })
      .eq('id', job.id)

    // Step 2: Check if wallets belong to existing developer (40-50%)
    const { data: existingWallet } = await supabase
      .from('developer_wallets')
      .select('developer_id')
      .eq('wallet_address', startWallet)
      .single()

    if (existingWallet) {
      developerId = existingWallet.developer_id
      console.log(`Wallet belongs to existing developer: ${developerId}`)
    } else {
      // Create new developer profile
      const masterWallet = traceData.cexSources?.[0]?.wallet || startWallet
      const kycSource = traceData.cexSources?.[0]?.exchange || 'unknown'

      const { data: newDev, error: devError } = await supabase
        .from('developer_profiles')
        .insert({
          master_wallet_address: masterWallet,
          kyc_source: kycSource,
          kyc_verified: kycSource !== 'unknown',
        })
        .select()
        .single()

      if (devError || !newDev) {
        throw new Error('Failed to create developer profile')
      }

      developerId = newDev.id
      console.log(`Created new developer profile: ${developerId}`)

      // Add wallet to developer_wallets
      await supabase
        .from('developer_wallets')
        .insert({
          developer_id: developerId,
          wallet_address: startWallet,
          wallet_type: 'token_creator',
          depth_level: 0,
        })
    }

    await supabase
      .from('developer_analysis_jobs')
      .update({
        progress_percent: 50,
        developer_id: developerId,
      })
      .eq('id', job.id)

    // Step 3: Scan for all tokens (50-70%)
    let tokensFound = 0
    const scanResponse = await fetch(
      `${supabaseUrl}/functions/v1/developer-token-scanner`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          developerId,
          lookbackDays: 365,
        }),
      }
    )

    if (scanResponse.ok) {
      const scanData = await scanResponse.json()
      tokensFound = scanData.tokensFound || 0
      
      await supabase
        .from('developer_analysis_jobs')
        .update({
          progress_percent: 70,
          tokens_discovered: tokensFound,
        })
        .eq('id', job.id)
    }

    // Step 4: Calculate reputation (70-100%)
    await supabase
      .from('developer_analysis_jobs')
      .update({ progress_percent: 80 })
      .eq('id', job.id)

    const repResponse = await fetch(
      `${supabaseUrl}/functions/v1/developer-reputation-calculator`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ developerId }),
      }
    )

    let reputationData: any = null
    if (repResponse.ok) {
      reputationData = await repResponse.json()
    }

    // Complete job
    await supabase
      .from('developer_analysis_jobs')
      .update({
        status: 'completed',
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        results: {
          developerId,
          walletsTraced: traceData?.walletsTraced ?? 0,
          cexSources: traceData?.cexSources ?? [],
          tokensFound: tokensFound,
          reputation: reputationData,
        },
      })
      .eq('id', job.id)

    console.log(`Discovery job complete. Developer: ${developerId}`)

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        developerId,
        summary: {
          walletsTraced: traceData.walletsTraced,
          cexSources: traceData.cexSources?.length || 0,
          reputationScore: reputationData?.reputationScore,
          trustLevel: reputationData?.trustLevel,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in developer-discovery-job:', error)
    
    // Mark job as failed
    try {
      const { jobId } = await req.json()
      if (jobId) {
        await createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
          .from('developer_analysis_jobs')
          .update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString(),
          })
          .eq('id', jobId)
      }
    } catch {}

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
