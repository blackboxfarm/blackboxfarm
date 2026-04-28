// Insiders Creator Backfill
// Closes the dev-wallet gap on telegram_insider_token_lifecycle:
// for every row where creator_wallet IS NULL, runs the unified creator resolver
// (Pump.fun → Helius DAS → on-chain initializeMint signer) and persists the
// result, marking the row as resolved or unresolvable so the orchestrator
// can move on.
//
// Returns { processed, resolved, unresolvable, remaining, total } so the UI
// can loop until remaining === 0.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveTokenCreator } from "../_shared/creator-resolver.ts";
import { assertUpdate } from "../_shared/db-assert.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_BATCH = 25;
const MAX_BATCH = 50;
const PER_TOKEN_DELAY_MS = 250; // throttle Helius/Pump.fun
const HELIUS_MONTHLY_QUOTA = 10_000_000;
const HELIUS_BUDGET_GUARD_PCT = 0.80;
const RETRY_COOLDOWN_HOURS = 24;          // failed → retry after 24h
const UNRESOLVABLE_COOLDOWN_DAYS = 7;     // unresolvable → retry after 7d
const MAX_ATTEMPTS_BEFORE_UNRESOLVABLE = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const batchSize = Math.min(Math.max(Number(body.batchSize) || DEFAULT_BATCH, 1), MAX_BATCH);
  const autoLoop = !!body.auto_loop;

  try {
    // Helius budget guard (only when auto-looping)
    if (autoLoop) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { data: usage } = await supabase
        .from('helius_api_usage')
        .select('credits_used')
        .gte('timestamp', monthStart.toISOString())
        .limit(50000);
      const totalCredits = (usage || []).reduce((s, r: any) => s + (r.credits_used || 0), 0);
      if (totalCredits > HELIUS_MONTHLY_QUOTA * HELIUS_BUDGET_GUARD_PCT) {
        return new Response(JSON.stringify({
          ok: false, aborted: 'helius_budget_guard',
          credits_used: totalCredits, monthly_quota: HELIUS_MONTHLY_QUOTA,
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Pick rows that need creator resolution and are out of cooldown.
    const cooldownIso = new Date(Date.now() - RETRY_COOLDOWN_HOURS * 3600_000).toISOString();
    const unresolvableCooldownIso = new Date(Date.now() - UNRESOLVABLE_COOLDOWN_DAYS * 86400_000).toISOString();

    const { data: rows, error, count } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('id, token_mint, token_symbol, creator_status, creator_attempts, creator_last_attempt_at', { count: 'exact' })
      .is('creator_wallet', null)
      .or(`creator_last_attempt_at.is.null,and(creator_status.eq.unknown,creator_last_attempt_at.lt.${cooldownIso}),and(creator_status.eq.unresolvable,creator_last_attempt_at.lt.${unresolvableCooldownIso})`)
      .order('first_called_at', { ascending: false, nullsFirst: false }) // newest first
      .limit(batchSize);

    if (error) throw error;

    const total = count ?? rows?.length ?? 0;
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, resolved: 0, unresolvable: 0, remaining: 0, total }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let resolved = 0;
    let unresolvable = 0;
    let failed = 0;

    for (const row of rows) {
      const apiErrors: string[] = [];
      const attempts = (row.creator_attempts ?? 0) + 1;
      try {
        const res = await resolveTokenCreator(row.token_mint, supabase, apiErrors);
        const creator = res?.creatorWallet || null;

        if (creator) {
          await assertUpdate(
            supabase
              .from('telegram_insider_token_lifecycle')
              .update({
                creator_wallet: creator,
                creator_status: 'resolved',
                creator_attempts: attempts,
                creator_last_attempt_at: new Date().toISOString(),
                kyc_status: 'pending', // unlock for genealogy backfill
              })
              .eq('id', row.id),
            'telegram_insider_token_lifecycle',
          );
          resolved++;
          console.log(`[creator-backfill] ✅ ${row.token_symbol || row.token_mint.slice(0, 8)} → ${creator.slice(0, 8)} (${res.source})`);
        } else {
          // No creator found → mark unresolvable if we've exhausted attempts, else leave as 'unknown' for retry
          const newStatus = attempts >= MAX_ATTEMPTS_BEFORE_UNRESOLVABLE ? 'unresolvable' : 'unknown';
          await assertUpdate(
            supabase
              .from('telegram_insider_token_lifecycle')
              .update({
                creator_status: newStatus,
                creator_attempts: attempts,
                creator_last_attempt_at: new Date().toISOString(),
              })
              .eq('id', row.id),
            'telegram_insider_token_lifecycle',
          );
          if (newStatus === 'unresolvable') unresolvable++;
          console.log(`[creator-backfill] ⛔ ${row.token_symbol || row.token_mint.slice(0, 8)} → ${newStatus} (attempt ${attempts}, errors: ${apiErrors.join(',') || 'none'})`);
        }
      } catch (e) {
        failed++;
        console.warn(`[creator-backfill] ❌ ${row.token_symbol || row.token_mint.slice(0, 8)}: ${(e as Error).message}`);
        // Bump attempt counter even on failure so we eventually mark unresolvable
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({
            creator_attempts: attempts,
            creator_last_attempt_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      }

      await new Promise((r) => setTimeout(r, PER_TOKEN_DELAY_MS));
    }

    const remaining = Math.max(0, total - rows.length);

    if (autoLoop && remaining > 0) {
      supabase.functions.invoke('insiders-creator-backfill', {
        body: { auto_loop: true, batchSize },
      }).catch((e) => console.warn('[creator-backfill] next-batch invoke failed:', e?.message));
    }

    return new Response(
      JSON.stringify({ ok: true, auto_loop: autoLoop, processed: rows.length, resolved, unresolvable, failed, remaining, total }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[insiders-creator-backfill] Fatal:', e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});