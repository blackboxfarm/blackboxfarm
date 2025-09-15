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

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { data: ud, error: ue } = await supabase.auth.getUser(token)
    if (ue || !ud?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const realUserId = ud.user.id
    const previewUserId = Deno.env.get('PREVIEW_SUPER_ADMIN_USER_ID') || '00000000-0000-0000-0000-000000000001'

    const results: Record<string, number> = {}

    // Helper to run update and capture count
    const runUpdate = async (table: string, column: string = 'user_id') => {
      const { data, error } = await supabase
        .from(table)
        .update({ [column]: realUserId } as any)
        .eq(column, previewUserId)
        .select('id')
      if (error) throw new Error(`${table}: ${error.message}`)
      results[table] = data?.length || 0
    }

    // Move monitored_wallets and wallet_copy_configs, copy_trades
    await runUpdate('monitored_wallets')
    await runUpdate('wallet_copy_configs')
    await runUpdate('copy_trades')

    // Fantasy wallets - avoid unique conflict by checking existing
    const { data: existingReal, error: exErr } = await supabase
      .from('fantasy_wallets')
      .select('id')
      .eq('user_id', realUserId)
      .maybeSingle()
    if (exErr) throw new Error(`fantasy_wallets check: ${exErr.message}`)

    if (!existingReal) {
      const { data, error } = await supabase
        .from('fantasy_wallets')
        .update({ user_id: realUserId })
        .eq('user_id', previewUserId)
        .select('id')
      if (error) throw new Error(`fantasy_wallets: ${error.message}`)
      results['fantasy_wallets'] = data?.length || 0
    } else {
      results['fantasy_wallets'] = 0
    }

    return new Response(JSON.stringify({ success: true, reassigned: results }), { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('claim-preview-data error:', e)
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(e) }), { status: 500, headers: corsHeaders })
  }
})