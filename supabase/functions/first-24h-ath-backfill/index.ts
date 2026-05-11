// Historical backfill — newest tokens first, then loops back. Captures first-24h ATH
// for tokens older than 25h that don't yet have it sealed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';
import { fetchFirst24hAth } from '../_shared/first-24h-ath-core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(body.batchSize ?? 15, 1), 30);

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Tokens older than 25h with no first_24h_ath sealed yet — newest-missing first
  const { data: tokens, error } = await supa
    .from('token_lifecycle')
    .select('token_mint, first_seen_at')
    .is('first_24h_ath_usd', null)
    .lt('first_seen_at', new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
    .order('first_seen_at', { ascending: false })
    .limit(batchSize);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, message: 'queue empty' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let filled = 0, no_pool = 0;
  for (const t of tokens) {
    const res = await fetchFirst24hAth(t.token_mint, t.first_seen_at, 'backfill');
    const patch: Record<string, unknown> = {
      first_24h_ath_usd: res.ath_usd ?? 0,
      first_24h_ath_captured_at: new Date().toISOString(),
      first_24h_ath_source: res.source,
    };
    await assertDbWrite(
      supa.from('token_lifecycle').update(patch).eq('token_mint', t.token_mint),
      'token_lifecycle',
      'first-24h-ath-backfill',
    );
    if (res.source === 'no_pool') no_pool++; else filled++;
  }

  return new Response(JSON.stringify({ ok: true, processed: tokens.length, filled, no_pool }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});