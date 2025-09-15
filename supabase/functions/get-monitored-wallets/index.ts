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
    const supabase = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined

    let userId: string | null = null
    if (token) {
      const { data: ud, error: ue } = await supabase.auth.getUser(token)
      if (!ue && ud?.user?.id) userId = ud.user.id
    }

    const fallbackPreviewUserId = Deno.env.get('PREVIEW_SUPER_ADMIN_USER_ID') || '00000000-0000-0000-0000-000000000001'
    const targetUserId = userId || fallbackPreviewUserId

    const { data, error } = await supabase
      .from('monitored_wallets')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('get-monitored-wallets error:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ wallets: data || [] }), { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('get-monitored-wallets unexpected error:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: corsHeaders })
  }
})