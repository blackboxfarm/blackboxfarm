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

    const body = await req.json().catch(() => ({}))
    const initialBalance = typeof body.initial_balance_usd === 'number' ? body.initial_balance_usd : 10000

    // Check if wallet exists
    const { data: existing, error: exErr } = await supabase
      .from('fantasy_wallets')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (exErr) {
      console.error('ensure-fantasy-wallet select error:', exErr)
      return new Response(JSON.stringify({ error: exErr.message }), { status: 400, headers: corsHeaders })
    }

    if (existing) {
      return new Response(JSON.stringify({ fantasy_wallet: existing, created: false }), { status: 200, headers: corsHeaders })
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fantasy_wallets')
      .insert({ user_id: targetUserId, balance_usd: initialBalance })
      .select('*')
      .single()

    if (insErr) {
      console.error('ensure-fantasy-wallet insert error:', insErr)
      return new Response(JSON.stringify({ error: insErr.message }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ fantasy_wallet: inserted, created: true }), { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('ensure-fantasy-wallet unexpected error:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: corsHeaders })
  }
})