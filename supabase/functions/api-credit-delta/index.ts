import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { withRunLog } from '../_shared/run-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Phase D.10 — Daily Helius vs Solscan credit delta.
 * Returns last-24h totals and prior-24h totals so the admin panel can show the
 * Helius credit drop from the Solscan Pro migration (target: 30-50%).
 */
serve(withRunLog('api-credit-delta', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const since48 = new Date(now - 2 * day).toISOString();
    const cutoff24 = now - day;

    const { data, error } = await supabase
      .from('api_usage_log')
      .select('service_name, credits_used, timestamp')
      .gte('timestamp', since48)
      .in('service_name', ['helius', 'solscan'])
      .limit(50000);

    if (error) throw error;

    const buckets: Record<string, { last24: number; prior24: number; calls24: number; calls48: number }> = {
      helius: { last24: 0, prior24: 0, calls24: 0, calls48: 0 },
      solscan: { last24: 0, prior24: 0, calls24: 0, calls48: 0 },
    };

    for (const row of data || []) {
      const svc = row.service_name as 'helius' | 'solscan';
      if (!buckets[svc]) continue;
      const ts = new Date(row.timestamp as string).getTime();
      const credits = row.credits_used || 1;
      if (ts >= cutoff24) {
        buckets[svc].last24 += credits;
        buckets[svc].calls24 += 1;
      } else {
        buckets[svc].prior24 += credits;
        buckets[svc].calls48 += 1;
      }
    }

    const heliusDelta = buckets.helius.prior24 > 0
      ? ((buckets.helius.last24 - buckets.helius.prior24) / buckets.helius.prior24) * 100
      : 0;

    return new Response(JSON.stringify({
      success: true,
      windowHours: 24,
      helius: { ...buckets.helius, deltaPct: Number(heliusDelta.toFixed(1)) },
      solscan: buckets.solscan,
      generatedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
