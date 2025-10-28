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

    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Check super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { user_id: user.id })
    if (!isSuperAdmin) {
      throw new Error('Requires super admin privileges')
    }

    const { tokenMint } = await req.json()

    if (!tokenMint) {
      throw new Error('Token mint address required')
    }

    console.log(`🧪 Testing discovery job for token: ${tokenMint}`)

    // Trigger the discovery job
    const { data: discoveryData, error: discoveryError } = await supabase.functions.invoke(
      'developer-discovery-job',
      {
        body: {
          tokenMint,
          source: 'integration_test',
        },
      }
    )

    if (discoveryError) {
      throw new Error(`Discovery job failed: ${discoveryError.message}`)
    }

    console.log('Discovery job triggered:', discoveryData)

    // Poll for job completion (max 30 seconds)
    const jobId = discoveryData?.jobId
    let attempts = 0
    const maxAttempts = 30
    let finalJobStatus = null

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      
      const { data: jobData, error: jobError } = await supabase
        .from('developer_analysis_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (jobError) {
        console.error('Error fetching job:', jobError)
        break
      }

      if (jobData.status === 'completed' || jobData.status === 'failed') {
        finalJobStatus = jobData
        break
      }

      attempts++
    }

    if (!finalJobStatus) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Job did not complete within timeout',
          jobId,
          attempts,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch results
    const results = {
      success: finalJobStatus.status === 'completed',
      jobId,
      status: finalJobStatus.status,
      walletsDiscovered: finalJobStatus.wallets_discovered,
      tokensDiscovered: finalJobStatus.tokens_discovered,
      progressPercent: finalJobStatus.progress_percent,
      errorMessage: finalJobStatus.error_message,
      duration: null as number | null,
    }

    if (finalJobStatus.started_at && finalJobStatus.completed_at) {
      results.duration = Math.round(
        (new Date(finalJobStatus.completed_at).getTime() - new Date(finalJobStatus.started_at).getTime()) / 1000
      )
    }

    // Fetch developer profile if job succeeded
    if (finalJobStatus.developer_id) {
      const { data: profile } = await supabase
        .from('developer_profiles')
        .select('*')
        .eq('id', finalJobStatus.developer_id)
        .single()

      if (profile) {
        results['developerProfile'] = {
          displayName: profile.display_name,
          trustLevel: profile.trust_level,
          reputationScore: profile.reputation_score,
          totalTokens: profile.total_tokens_created,
          successfulTokens: profile.successful_tokens,
        }
      }
    }

    console.log('✅ Test completed successfully')

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Test discovery job error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
