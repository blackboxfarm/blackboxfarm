import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all user_ids from profiles created on April 4-5 2026
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, display_name, created_at')
      .gte('created_at', '2026-04-04T00:00:00Z')
      .lt('created_at', '2026-04-06T00:00:00Z');

    if (profilesError) throw profilesError;

    const results: any[] = [];

    for (const profile of profiles || []) {
      try {
        // Unban via auth admin API
        const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${profile.user_id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ban_duration: 'none' }),
        });

        const data = await res.json();
        results.push({
          user_id: profile.user_id,
          display_name: profile.display_name,
          status: res.ok ? 'unbanned' : 'failed',
          error: res.ok ? null : data,
        });
      } catch (e) {
        results.push({
          user_id: profile.user_id,
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const unbanned = results.filter(r => r.status === 'unbanned').length;
    const failed = results.filter(r => r.status !== 'unbanned').length;

    return new Response(JSON.stringify({
      success: true,
      total: results.length,
      unbanned,
      failed,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
