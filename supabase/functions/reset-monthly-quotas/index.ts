import { createClient } from "npm:@supabase/supabase-js@2";
import { withRunLog } from '../_shared/run-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * RESET MONTHLY QUOTAS
 * 
 * Runs on 1st of each month at 00:05 UTC via cron.
 * 1. Snapshots current usage to monthly_usage_archive
 * 2. Resets monthly_quota_used to 0 for all services
 */
Deno.serve(withRunLog('reset-monthly-quotas', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Get all services with usage data
    const { data: services, error: fetchErr } = await supabase
      .from('api_service_config')
      .select('service_name, display_name, monthly_quota, monthly_quota_used, cost_per_credit_usd, tier');

    if (fetchErr) throw fetchErr;
    if (!services || services.length === 0) {
      return new Response(JSON.stringify({ message: 'No services found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Calculate the archive month (previous month)
    const now = new Date();
    const archiveMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr = `${archiveMonth.getFullYear()}-${String(archiveMonth.getMonth() + 1).padStart(2, '0')}`;

    // 3. Archive each service's usage
    let archived = 0;
    for (const svc of services) {
      if (!svc.monthly_quota_used || svc.monthly_quota_used === 0) continue;

      const estimatedCostUsd = svc.cost_per_credit_usd
        ? svc.monthly_quota_used * svc.cost_per_credit_usd
        : null;

      const { error: archiveErr } = await supabase
        .from('monthly_usage_archive')
        .upsert({
          service_name: svc.service_name,
          month_year: monthStr,
          total_credits_used: svc.monthly_quota_used,
          total_calls: svc.monthly_quota_used,
          quota_limit: svc.monthly_quota,
          estimated_cost_usd: estimatedCostUsd,
          usage_percentage: svc.monthly_quota ? (svc.monthly_quota_used / svc.monthly_quota) * 100 : null,
        }, { onConflict: 'service_name,month_year' });

      if (archiveErr) {
        console.error(`[reset-monthly-quotas] Archive error for ${svc.service_name}:`, archiveErr.message);
      } else {
        archived++;
      }
    }

    // 4. Reset all quotas to 0
    const { error: resetErr } = await supabase
      .from('api_service_config')
      .update({
        monthly_quota_used: 0,
        error_count_today: 0,
        success_count_today: 0,
      })
      .gt('monthly_quota_used', 0);

    if (resetErr) throw resetErr;

    console.log(`[reset-monthly-quotas] Archived ${archived} services for ${monthStr}, quotas reset`);

    return new Response(JSON.stringify({
      success: true,
      month_archived: monthStr,
      services_archived: archived,
      total_services: services.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[reset-monthly-quotas] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
