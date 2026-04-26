// Manual override: clears the apify_pause_state immediately.
// Super-admin only — verified via the caller's JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: isSuperAdmin } = await supabase.rpc('has_role', {
    _user_id: user.id, _role: 'super_admin',
  });

  if (!isSuperAdmin) {
    return new Response(JSON.stringify({ error: 'Super admin only' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: rpcErr } = await supabase.rpc('resume_apify', {
    p_triggered_by: `manual:${user.email ?? user.id}`,
  });

  if (rpcErr) {
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`[admin-resume-apify] resumed by ${user.email ?? user.id}`);

  return new Response(JSON.stringify({ ok: true, resumed_at: new Date().toISOString() }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});