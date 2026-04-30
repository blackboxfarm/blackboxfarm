/**
 * autopsy-backlog-builder
 *
 * One-shot builder for the historical "Cool Deaths" backlog.
 *
 * Idempotent guard: if autopsy_backlog already has rows AND is_frozen=true,
 * the function exits unless `force: true` is passed.
 *
 * Selection criteria (matches plan):
 *   - first_seen_at < now() - 24 hours  (already historical, but keeps recent deaths)
 *   - market_cap < $1k OR liquidity_usd < $500  (already dead)
 *   - ath_24h_usd >= $50k  (bonded / had a real life)
 *   - death_cause IN ('rug_pull','slow_drain','liquidity_pulled','abandoned')
 *
 * Pre-step: invokes token-autopsy first to ensure death_cause is populated.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const QUALIFYING_CAUSES = ['rug_pull', 'slow_drain', 'liquidity_pulled', 'abandoned'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const force = !!body.force;
  const limit = Math.min(Number(body.limit ?? 500), 1000);

  // Idempotency check
  const { count: existing } = await supabase
    .from('autopsy_backlog')
    .select('token_mint', { count: 'exact', head: true });

  if ((existing ?? 0) > 0 && !force) {
    return new Response(JSON.stringify({
      skipped: true,
      reason: 'backlog already built; pass {force:true} to rebuild',
      existing,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Pull qualifying tokens
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('token_lifecycle')
    .select('token_mint, symbol, name, launchpad, creator_wallet, ath_24h_usd, market_cap, price_usd, liquidity_usd, death_cause, death_confidence, autopsy_at, first_seen_at')
    .lt('first_seen_at', oneDayAgo)
    .gte('ath_24h_usd', 50000)
    .in('death_cause', QUALIFYING_CAUSES as unknown as string[])
    .or('market_cap.lt.1000,liquidity_usd.lt.500')
    .order('ath_24h_usd', { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let inserted = 0;
  for (const c of candidates ?? []) {
    const ath = Number(c.ath_24h_usd ?? 0);
    const mcap = Number(c.market_cap ?? 0);
    const collapse = ath > 0 ? Math.max(0, Math.min(1, 1 - mcap / ath)) : null;

    // Best-effort holder count
    const { data: snap } = await supabase
      .from('token_health_snapshots')
      .select('total_holders')
      .eq('token_mint', c.token_mint)
      .order('snapshot_hour', { ascending: false })
      .limit(1)
      .maybeSingle();

    await assertDbWrite(
      supabase.from('autopsy_backlog').upsert({
        token_mint: c.token_mint,
        symbol: c.symbol,
        name: c.name,
        launchpad: c.launchpad,
        ath_usd: ath,
        ath_at: null,
        current_mcap_usd: mcap,
        current_price_usd: c.price_usd,
        liquidity_usd: c.liquidity_usd,
        holder_count: snap?.total_holders ?? null,
        creator_wallet: c.creator_wallet,
        death_cause: c.death_cause,
        death_confidence: c.death_confidence,
        death_at: c.autopsy_at,
        collapse_pct: collapse,
        is_frozen: true,
        captured_at: new Date().toISOString(),
      }, { onConflict: 'token_mint' }),
      'autopsy_backlog', 'UPSERT',
    );
    inserted++;
  }

  return new Response(JSON.stringify({
    success: true, inserted, examined: candidates?.length ?? 0,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});