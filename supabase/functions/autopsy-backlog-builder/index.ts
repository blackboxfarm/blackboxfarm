/**
 * autopsy-backlog-builder
 *
 * One-shot builder for the historical "Cool Deaths" backlog.
 *
 * Idempotent guard: if autopsy_backlog already has rows AND is_frozen=true,
 * the function exits unless `force: true` is passed.
 *
 * Selection: pulls from public.v_live_death_watch (which sources real ATH
 * + latest market caps from token_price_history) and keeps rows whose
 * latest observation is older than 24h — i.e. already historical, not
 * currently being traded.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  // Pull historical death candidates from the live death watch view.
  // The view already enforces ATH >= $50k AND collapse criteria.
  // We additionally restrict to tokens whose latest price snapshot is
  // > 24h old, so this list is "already dead", not actively trading.
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('v_live_death_watch')
    .select('token_mint, symbol, name, launchpad, creator_wallet, ath_usd, ath_at, current_mcap_usd, current_price_usd, liquidity_usd, holder_count, death_cause, death_confidence, death_at, collapse_pct, latest_at')
    .lt('latest_at', oneDayAgo)
    .order('ath_usd', { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let inserted = 0;
  for (const c of candidates ?? []) {
    const ath = Number(c.ath_usd ?? 0);
    const mcap = Number(c.current_mcap_usd ?? 0);
    const collapse = c.collapse_pct != null
      ? Number(c.collapse_pct)
      : (ath > 0 ? Math.max(0, Math.min(1, 1 - mcap / ath)) : null);

    await assertDbWrite(
      supabase.from('autopsy_backlog').upsert({
        token_mint: c.token_mint,
        symbol: c.symbol,
        name: c.name,
        launchpad: c.launchpad,
        ath_usd: ath,
        ath_at: c.ath_at ?? null,
        current_mcap_usd: mcap,
        current_price_usd: c.current_price_usd,
        liquidity_usd: c.liquidity_usd,
        holder_count: c.holder_count ?? null,
        creator_wallet: c.creator_wallet,
        death_cause: c.death_cause,
        death_confidence: c.death_confidence,
        death_at: c.death_at ?? c.latest_at ?? null,
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