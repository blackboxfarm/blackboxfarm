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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined

    if (!token) {
      return new Response(JSON.stringify({ error: 'No authorization token provided' }), 
        { status: 401, headers: corsHeaders })
    }

    // Verify user
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid authorization token' }), 
        { status: 401, headers: corsHeaders })
    }

    const { campaign_id, campaign_type = 'blackbox' } = await req.json()

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'Campaign ID is required' }), 
        { status: 400, headers: corsHeaders })
    }

    console.log(`Deleting ${campaign_type} campaign ${campaign_id} for user ${userData.user.id}`)

    // Create a client that forwards the user's JWT so RLS/auth.uid() works inside RPC
    const supabaseUser = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    // Call the delete function with proper authentication
    const { data, error } = await supabaseUser.rpc('delete_campaign_cascade', {
      campaign_id_param: campaign_id,
      campaign_type_param: campaign_type
    })

    if (error) {
      console.error('Delete campaign error:', error)
      return new Response(JSON.stringify({ 
        error: error.message,
        details: error 
      }), { status: 400, headers: corsHeaders })
    }

    console.log(`Successfully deleted campaign ${campaign_id}:`, data)

    return new Response(JSON.stringify({ 
      success: true,
      deleted_counts: data,
      message: `Campaign and all associated data deleted successfully`
    }), { status: 200, headers: corsHeaders })

  } catch (e) {
    console.error('delete-campaign unexpected error:', e)
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: e instanceof Error ? e.message : String(e)
    }), { status: 500, headers: corsHeaders })
  }
})