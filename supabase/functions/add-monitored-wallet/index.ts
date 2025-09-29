import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddWalletRequest {
  wallet_address: string
  label?: string
  is_active?: boolean
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
      const { data: userData, error: userErr } = await supabase.auth.getUser(token)
      if (!userErr && userData?.user?.id) {
        userId = userData.user.id
      }
    }

    // Fallback preview user id for non-authenticated calls
    const fallbackPreviewUserId = Deno.env.get('PREVIEW_SUPER_ADMIN_USER_ID') || '00000000-0000-0000-0000-000000000001'

    const body = (await req.json().catch(() => ({}))) as Partial<AddWalletRequest>
    const wallet_address = (body.wallet_address || '').trim()
    const label = (body.label || '').trim()
    const is_active = body.is_active !== false // default to true

    if (!wallet_address) {
      return new Response(JSON.stringify({ error: 'wallet_address is required' }), { status: 400, headers: corsHeaders })
    }

    // Basic validation of Solana address length (no heavy checks here)
    if (wallet_address.length < 32 || wallet_address.length > 64) {
      return new Response(JSON.stringify({ error: 'invalid wallet address' }), { status: 400, headers: corsHeaders })
    }

    const insertPayload = {
      user_id: userId || fallbackPreviewUserId,
      wallet_address,
      label: label || `${wallet_address.substring(0, 8)}...`,
      is_active,
    }

    const { data, error } = await supabase
      .from('monitored_wallets')
      .insert([insertPayload])
      .select('*')
      .single()

    if (error) {
      // Handle duplicates gracefully: return the existing row instead of 400
      const errAny: any = error as any
      if (errAny?.code === '23505' || errAny?.message?.toLowerCase().includes('duplicate key')) {
        const { data: existing, error: fetchErr } = await supabase
          .from('monitored_wallets')
          .select('*')
          .eq('user_id', insertPayload.user_id)
          .eq('wallet_address', wallet_address)
          .single()

        if (!fetchErr && existing) {
          return new Response(
            JSON.stringify({ wallet: existing, status: 'already_exists' }),
            { status: 200, headers: corsHeaders }
          )
        }
      }

      console.error('Failed to insert monitored wallet:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ wallet: data, status: 'created' }), { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('add-monitored-wallet unexpected error:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: corsHeaders })
  }
})