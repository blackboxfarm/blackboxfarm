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

    const { tokenMint, batchSize = 10 } = await req.json()

    console.log('🔍 Triggering discovery for watchdog entries...')

    let query = supabase
      .from('token_mint_watchdog')
      .select('*')
      .eq('discovery_triggered', false)
      .order('block_time', { ascending: false })
      .limit(batchSize)

    // If specific token mint is provided, only process that one
    if (tokenMint) {
      query = query.eq('token_mint', tokenMint)
    }

    const { data: pendingMints, error: fetchError } = await query

    if (fetchError) {
      throw fetchError
    }

    if (!pendingMints || pendingMints.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: tokenMint 
            ? `No pending discovery for token ${tokenMint}`
            : 'No pending watchdog entries found',
          triggered: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${pendingMints.length} pending watchdog entries`)

    const results = []

    for (const entry of pendingMints) {
      try {
        console.log(`Triggering discovery for ${entry.token_mint}`)

        const { data: jobData, error: jobError } = await supabase.functions.invoke(
          'developer-discovery-job',
          {
            body: {
              tokenMint: entry.token_mint,
              source: 'manual_watchdog_trigger',
            },
          }
        )

        if (!jobError && jobData) {
          // Mark as discovery triggered
          await supabase
            .from('token_mint_watchdog')
            .update({ 
              discovery_triggered: true,
              updated_at: new Date().toISOString(),
            })
            .eq('token_mint', entry.token_mint)

          results.push({
            tokenMint: entry.token_mint,
            status: 'success',
            jobId: jobData.jobId,
          })

          console.log(`✅ Discovery triggered for ${entry.token_mint}`)
        } else {
          results.push({
            tokenMint: entry.token_mint,
            status: 'failed',
            error: jobError?.message || 'Unknown error',
          })
          console.error(`Failed to trigger discovery for ${entry.token_mint}:`, jobError)
        }
      } catch (error) {
        results.push({
          tokenMint: entry.token_mint,
          status: 'error',
          error: error.message,
        })
        console.error(`Error processing ${entry.token_mint}:`, error)
      }

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const successCount = results.filter(r => r.status === 'success').length

    console.log(`Discovery trigger complete. Success: ${successCount}/${results.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        triggered: successCount,
        total: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in trigger-watchdog-discovery:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
