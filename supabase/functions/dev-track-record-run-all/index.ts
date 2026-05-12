// dev-track-record-run-all
// Convenience orchestrator: scrape → classify → rollup for one dev wallet.
// Used by the SuperAdmin "Build Dev Track Record" button.

import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('dev-track-record-run-all', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const dev_wallet: string | undefined = body.dev_wallet?.trim();
  if (!dev_wallet || dev_wallet.length < 32) {
    return new Response(JSON.stringify({ error: 'dev_wallet required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: scrape, error: e1 } = await supabase.functions.invoke('dev-profile-full-scrape', { body: { dev_wallet } });
  if (e1) throw e1;
  const { data: classify, error: e2 } = await supabase.functions.invoke('dev-token-outcome-classifier', { body: { dev_wallet, useAI: true } });
  if (e2) throw e2;
  const { data: rollup, error: e3 } = await supabase.functions.invoke('dev-track-record-rollup', { body: { dev_wallet } });
  if (e3) throw e3;

  // Chain family rollup (mesh-aggregated). Non-fatal if it fails.
  let family: any = null;
  try {
    const { data: famData, error: famErr } = await supabase.functions.invoke('dev-family-track-record-rollup', { body: { dev_wallet } });
    if (famErr) console.warn('[run-all] family rollup error:', famErr);
    family = famData ?? null;
  } catch (e) {
    console.warn('[run-all] family rollup threw:', e);
  }

  return new Response(
    JSON.stringify({ ok: true, scrape, classify, rollup, family }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
