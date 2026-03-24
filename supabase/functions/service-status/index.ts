import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * SERVICE STATUS — Public endpoint returning current service health
 * Reads from the service_status table populated by system-health-audit
 */
Deno.serve(withRunLog('service-status', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('service_status')
      .select('service_name, status, last_checked_at, message')
      .order('service_name');

    if (error) throw error;

    // Compute overall status
    const statuses = (data || []).map(s => s.status);
    const overall = statuses.includes('down') ? 'major_outage'
      : statuses.includes('degraded') ? 'partial_outage'
      : 'operational';

    return new Response(
      JSON.stringify({
        overall,
        updated_at: new Date().toISOString(),
        services: data || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));

