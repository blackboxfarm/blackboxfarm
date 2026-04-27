// HTTP wrapper around the shared fuseCreator() function.
// POST { signals: FusionSignals } → { ok, creatorId, isNew, mergedAbsorbedIds, aliasesWritten }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fuseCreator, type FusionSignals } from '../_shared/creator-fusion.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const signals: FusionSignals = body.signals || body;
    if (!signals || typeof signals !== 'object') {
      throw new Error('Body must include `signals` (or be the signals object itself)');
    }

    const result = await fuseCreator(
      { source: 'creator-profile-fuser', ...signals },
      supabase,
    );

    return new Response(
      JSON.stringify({ ok: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[creator-profile-fuser] Fatal:', e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
