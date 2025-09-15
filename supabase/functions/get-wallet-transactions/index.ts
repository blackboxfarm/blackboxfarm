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

    // Get wallet IDs for this user
    const { data: wallets, error: wErr } = await supabase
      .from('monitored_wallets')
      .select('id')
      .eq('user_id', targetUserId)

    if (wErr) {
      console.error('get-wallet-transactions wallets error:', wErr)
      return new Response(JSON.stringify({ error: wErr.message }), { status: 400, headers: corsHeaders })
    }

    const walletIds = (wallets || []).map((w) => w.id)
    if (walletIds.length === 0) {
      return new Response(JSON.stringify({ transactions: [] }), { status: 200, headers: corsHeaders })
    }

    const { data: txs, error: tErr } = await supabase
      .from('wallet_transactions')
      .select('*')
      .in('monitored_wallet_id', walletIds)
      .order('timestamp', { ascending: false })
      .limit(100)

    if (tErr) {
      console.error('get-wallet-transactions error:', tErr)
      return new Response(JSON.stringify({ error: tErr.message }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ transactions: txs || [] }), { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('get-wallet-transactions unexpected error:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: corsHeaders })
  }
})