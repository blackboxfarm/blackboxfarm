// ath-alltime-backfill
// Newest-first batch driver that fills ath_alltime_usd for token_lifecycle
// rows where it is NULL. Runs every 15 minutes via cron.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { resolveAthAlltime } from '../_shared/ath-alltime-resolver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const batchSize: number = Math.min(Math.max(Number(body?.batchSize ?? 40), 1), 200);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: targets, error } = await supabase
    .from('token_lifecycle')
    .select('token_mint, first_seen_at, market_cap')
    .is('ath_alltime_usd', null)
    .order('first_seen_at', { ascending: false, nullsFirst: false })
    .limit(batchSize);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!targets || targets.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, attempted: 0, resolved: 0, message: 'No tokens missing all-time ATH.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let resolved = 0;
  const bySource: Record<string, number> = {};
  for (const t of targets) {
    try {
      const res = await resolveAthAlltime(supabase, t.token_mint as string, {
        firstSeenAt: (t as any).first_seen_at ?? null,
        currentMcap: (t as any).market_cap ?? null,
      });
      if (res.athUsd) {
        resolved++;
        bySource[res.source] = (bySource[res.source] ?? 0) + 1;
      }
    } catch (e) {
      console.error('[ath-alltime-backfill] mint failed', (t as any).token_mint, e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return new Response(
    JSON.stringify({ ok: true, attempted: targets.length, resolved, bySource }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});