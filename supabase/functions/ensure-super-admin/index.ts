import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPER_ADMIN_EMAIL = 'admin@blackbox.farm'
const SUPER_ADMIN_PASSWORD = 'SuperAdmin2024!'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Try to find existing user by email
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })

    if (listError) {
      console.error('listUsers error:', listError)
    }

    let user = list?.users?.find((u: any) => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL)

    if (!user) {
      // Create the super admin user with confirmed email
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { role: 'super_admin' },
      })
      if (createError) {
        // If creation failed for some reason other than already exists, log but continue
        console.error('createUser error:', createError)
      } else {
        user = created.user
      }
    } else if (!user.email_confirmed_at) {
      // Confirm and set password if existing but unconfirmed
      const { error: updateError, data: updated } = await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true,
        password: SUPER_ADMIN_PASSWORD,
        user_metadata: { role: 'super_admin' },
      })
      if (updateError) {
        console.error('updateUserById error:', updateError)
      } else if (updated?.user) {
        user = updated.user
      }
    }

    return new Response(
      JSON.stringify({ success: true, user_id: user?.id || null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('ensure-super-admin error:', e)
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
