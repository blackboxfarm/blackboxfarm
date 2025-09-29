import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const superAdminAllowList = Deno.env.get('SUPER_ADMIN_ALLOW_LIST') || 'admin@blackbox.farm,testuser@blackbox.farm'
    const superAdminAllowDomains = Deno.env.get('SUPER_ADMIN_ALLOW_DOMAINS') || 'blackbox.farm'

    // Initialize Supabase client with service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authenticated user from the request
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Create a client with the user's JWT to get their info
    const userClient = createClient(
      supabaseUrl, 
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            authorization: authHeader
          }
        }
      }
    )

    // Get the authenticated user
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check if user's email is in the allowlist
    const allowedEmails = superAdminAllowList.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    const allowedDomains = superAdminAllowDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    const email = (user.email || '').toLowerCase()
    const isExplicitAllowed = allowedEmails.includes(email)
    const isDomainAllowed = allowedDomains.some(domain => email.endsWith(`@${domain}`))
    if (!(isExplicitAllowed || isDomainAllowed)) {
      return new Response(
        JSON.stringify({ 
          error: 'Email not authorized for super admin access',
          email: user.email,
          allowedEmailsCount: allowedEmails.length,
          allowedDomains
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Grant super admin role using service role client
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: user.id,
        role: 'super_admin',
        is_active: true
      }, {
        onConflict: 'user_id,role'
      })

    if (roleError) {
      console.error('Error granting super admin role:', roleError)
      return new Response(
        JSON.stringify({ error: 'Failed to grant super admin role', details: roleError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log(`Successfully granted super admin role to user: ${user.email} (${user.id})`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Super admin role granted successfully',
        user_id: user.id,
        email: user.email
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in grant-super-admin function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})