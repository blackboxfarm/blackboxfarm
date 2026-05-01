/**
 * autopsy-vulture-sweep — thin alias.
 *
 * Vulture detection now runs inside autopsy-community-sweep alongside the
 * dissent lens (one Apify scrape, multiple AI lenses). This shim forwards
 * incoming calls so existing callers (autopsy-writer, AllDrafts.tsx) keep
 * working unchanged.
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('autopsy-vulture-sweep', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await supabase.functions.invoke('autopsy-community-sweep', {
    body: { ...body, lenses: ['vulture'] },
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Surface the vulture lens result at the top level so legacy callers see vulture_count etc.
  const vulture = (data as any)?.lenses?.vulture ?? {};
  return new Response(JSON.stringify({ ok: true, ...vulture }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
