import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type BannerPayload = {
  id?: string
  title: string
  image_url: string
  link_url: string
  position: number
  is_active: boolean
  weight: number
  start_date: string | null
  end_date: string | null
  notes: string | null
  created_by?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('authorization')
    const referer = req.headers.get('referer') || ''

    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { authorization: authHeader ?? '' } } }
    )

    const { data: { user } } = await anonClient.auth.getUser()

    let authorized = false

    // If user present, require super admin via RPC
    if (user?.id) {
      try {
        const { data: isSA } = await supabase.rpc('is_super_admin', { _user_id: user.id })
        authorized = !!isSA
      } catch (_) {
        authorized = false
      }
    }

    // Allow Lovable preview even without login
    if (!authorized) {
      try {
        const host = new URL(referer).hostname
        if (/lovable\.(dev|app)$/.test(host) || /lovableproject\.com$/.test(host)) {
          authorized = true
        }
      } catch (_) {}
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const action: 'create' | 'update' | 'delete' = body?.action
    const payload: BannerPayload = body?.payload

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'create') {
      const insertPayload = {
        ...payload,
        created_by: user?.id ?? payload?.created_by ?? null,
      }
      const { data, error } = await supabase
        .from('banner_ads')
        .insert([insertPayload])
        .select('*')
        .single()

      if (error) throw error
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'update') {
      if (!payload?.id) {
        return new Response(
          JSON.stringify({ error: 'Missing id for update' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { data, error } = await supabase
        .from('banner_ads')
        .update({
          title: payload.title,
          image_url: payload.image_url,
          link_url: payload.link_url,
          position: payload.position,
          is_active: payload.is_active,
          weight: payload.weight,
          start_date: payload.start_date,
          end_date: payload.end_date,
          notes: payload.notes,
        })
        .eq('id', payload.id)
        .select('*')
        .single()

      if (error) throw error
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete') {
      if (!payload?.id) {
        return new Response(
          JSON.stringify({ error: 'Missing id for delete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { error } = await supabase
        .from('banner_ads')
        .delete()
        .eq('id', payload.id)

      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('manage-banner-ad error', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
