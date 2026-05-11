// Live sealer — captures the first-24h ATH at ~23h45m of token age.
// Once first_24h_ath_captured_at is set, the value is IMMUTABLE.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';
import { fetchFirst24hAth } from '../_shared/first-24h-ath-core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Sealing window: tokens aged 23h45m to 25h with no first_24h_ath captured.
  const { data: tokens, error } = await supa
    .from('token_lifecycle')
    .select('token_mint, first_seen_at')
    .is('first_24h_ath_usd', null)
    .lte('first_seen_at', new Date(Date.now() - (23 * 60 + 45) * 60 * 1000).toISOString())
    .gte('first_seen_at', new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
    .order('first_seen_at', { ascending: true })
    .limit(25);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let sealed = 0, no_pool = 0;
  for (const t of tokens) {
    const res = await fetchFirst24hAth(t.token_mint, t.first_seen_at, 'live');
    const patch: Record<string, unknown> = {
      first_24h_ath_usd: res.ath_usd ?? 0,
      first_24h_ath_captured_at: new Date().toISOString(),
      first_24h_ath_source: res.source,
    };
    await assertDbWrite(
      supa.from('token_lifecycle').update(patch).eq('token_mint', t.token_mint),
      'token_lifecycle',
      'first-24h-ath-sealer',
    );
    if (res.source === 'no_pool') no_pool++; else sealed++;
  }

  return new Response(JSON.stringify({ ok: true, processed: tokens.length, sealed, no_pool }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});