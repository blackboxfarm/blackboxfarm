import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type UpsertBody = {
  monitored_wallet_id: string
  is_enabled?: boolean
  is_fantasy_mode?: boolean
  new_buy_amount_usd?: number
  rebuy_amount_usd?: number
  copy_sell_percentage?: boolean
  max_daily_trades?: number
  max_position_size_usd?: number
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

    const body = await req.json() as UpsertBody
    if (!body?.monitored_wallet_id) {
      return new Response(JSON.stringify({ error: 'monitored_wallet_id is required' }), { status: 400, headers: corsHeaders })
    }

    const defaults = {
      is_enabled: true,
      is_fantasy_mode: true,
      new_buy_amount_usd: 100,
      rebuy_amount_usd: 10,
      copy_sell_percentage: true,
      max_daily_trades: 50,
      max_position_size_usd: 1000,
    }

    // Check existing config
    const { data: existing, error: selErr } = await supabase
      .from('wallet_copy_configs')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('monitored_wallet_id', body.monitored_wallet_id)
      .maybeSingle()

    if (selErr) {
      console.error('upsert-copy-config select error:', selErr)
      return new Response(JSON.stringify({ error: selErr.message }), { status: 400, headers: corsHeaders })
    }

    if (existing) {
      const { data: updated, error: updErr } = await supabase
        .from('wallet_copy_configs')
        .update({ ...defaults, ...body })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (updErr) {
        console.error('upsert-copy-config update error:', updErr)
        return new Response(JSON.stringify({ error: updErr.message }), { status: 400, headers: corsHeaders })
      }
      return new Response(JSON.stringify({ config: updated, created: false }), { status: 200, headers: corsHeaders })
    }

    const { data: inserted, error: insErr } = await supabase
      .from('wallet_copy_configs')
      .insert({ user_id: targetUserId, ...defaults, ...body })
      .select('*')
      .single()

    if (insErr) {
      console.error('upsert-copy-config insert error:', insErr)
      return new Response(JSON.stringify({ error: insErr.message }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ config: inserted, created: true }), { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('upsert-copy-config unexpected error:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: corsHeaders })
  }
})