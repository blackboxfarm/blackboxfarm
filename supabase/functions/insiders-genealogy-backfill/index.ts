// Insiders Genealogy Backfill
// One-shot batch backfill: walks every Insiders lifecycle row whose creator_wallet
// is known but whose KYC root has not been resolved yet, calls traceParentWallets
// (Helius) for each, and persists the full ladder into:
//   - genealogy_chain  (ordered: creator → hop1 → hop2 → ... → KYC root)
//   - genealogy_depth
//   - genealogy_kyc_root
// Also feeds every parent-wallet edge into reputation_mesh via meshGenealogyResults
// so the cross-link panel (insiders-cross-links) can group by shared funder later.
//
// Designed to be called repeatedly from the UI: returns { processed, remaining }
// so the frontend can loop until remaining === 0.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { traceParentWallets, meshGenealogyResults } from "../_shared/auto-genealogy.ts";
import { assertUpdate } from "../_shared/db-assert.ts";
import { getCexName, isInfraWallet, getInfraName } from "../_shared/cex-wallets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_BATCH = 25;
const MAX_BATCH = 50;
const PER_WALLET_DELAY_MS = 250; // throttle Helius
const HELIUS_MONTHLY_QUOTA = 10_000_000;
const HELIUS_BUDGET_GUARD_PCT = 0.80; // abort auto_loop above 80% of quota
const KYC_RETRY_COOLDOWN_HOURS = 24;
const MAX_KYC_ATTEMPTS_BEFORE_DEAD_END = 2;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  const batchSize = Math.min(Math.max(Number(body.batchSize) || DEFAULT_BATCH, 1), MAX_BATCH);
  const force = !!body.force; // if true, re-trace even rows that already have a kyc_root
  const autoLoop = !!body.auto_loop; // if true, self-invoke until remaining===0 (subject to budget guard)

  try {
    // Budget guard: aborts auto_loop if we're already over 80% of monthly Helius quota.
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
        console.warn(`[insiders-genealogy-backfill] BUDGET GUARD: ${totalCredits}/${HELIUS_MONTHLY_QUOTA} credits used — auto_loop aborted`);
        return new Response(JSON.stringify({
          ok: false,
          aborted: 'helius_budget_guard',
          credits_used: totalCredits,
          monthly_quota: HELIUS_MONTHLY_QUOTA,
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // 1. Find rows that need tracing
    // Skip rows where kyc_status is a final verdict (kyc_resolved, no_kyc_reachable),
    // and (when not forcing) respect the 24h retry cooldown so we don't hammer Helius.
    const cooldownIso = new Date(Date.now() - KYC_RETRY_COOLDOWN_HOURS * 3600_000).toISOString();

    const filter = supabase
      .from('telegram_insider_token_lifecycle')
      .select('id, token_mint, token_symbol, creator_wallet, genealogy_kyc_root, genealogy_chain, kyc_status, kyc_attempts, kyc_last_attempt_at', { count: 'exact' })
      .not('creator_wallet', 'is', null);

    const query = force
      ? filter
      : filter
          .not('kyc_status', 'in', '("kyc_resolved","no_kyc_reachable")')
          .or(`kyc_last_attempt_at.is.null,kyc_last_attempt_at.lt.${cooldownIso}`);

    const { data: rows, error, count } = await query
      .order('peak_multiplier', { ascending: false }) // best-performing first
      .limit(batchSize);

    if (error) throw error;

    const total = count ?? rows?.length ?? 0;
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, remaining: 0, total: 0, ok: true, message: 'Nothing to trace' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[insiders-genealogy-backfill] Tracing ${rows.length} of ${total} rows (force=${force})`);

    let traced = 0;
    let kycResolved = 0;
    let failed = 0;

    for (const row of rows) {
      const creator = row.creator_wallet as string;
      const attempts = (row.kyc_attempts ?? 0) + 1;
      try {
        const gen = await traceParentWallets(supabase, creator, 'insiders-genealogy-backfill');

        // Push edges into reputation_mesh (cross-link source of truth)
        if (gen.parentWallets.length > 0 || gen.xAccounts.length > 0) {
          await meshGenealogyResults(supabase, creator, gen, 'insiders-genealogy-backfill');
        }

        const sortedParents = gen.parentWallets
          .slice()
          .sort((a: any, b: any) => (a.depth ?? 0) - (b.depth ?? 0));

        const cexHit = sortedParents.find((p: any) => p?.cexName);
        const kycRoot = cexHit?.wallet ?? null;
        const kycLabel = cexHit?.cexName || (kycRoot ? getCexName(kycRoot) : null);

        // Did the chain dead-end at an infrastructure router (Axiom/Photon/etc.)?
        const lastHop = sortedParents[sortedParents.length - 1];
        const hitInfra = !cexHit && lastHop && isInfraWallet(lastHop.wallet);
        const infraName = hitInfra ? getInfraName(lastHop.wallet) : null;

        // Verdict logic:
        //   - Hit a CEX → kyc_resolved with label
        //   - Hit infra router → no_kyc_reachable (router dead-end is final)
        //   - Walked but no CEX, attempts >= threshold → no_kyc_reachable
        //   - Otherwise → tracing (will retry next cooldown)
        let newKycStatus: string;
        let newKycLabel: string | null = null;
        if (kycRoot) {
          newKycStatus = 'kyc_resolved';
          newKycLabel = kycLabel || 'Unknown CEX';
          kycResolved++;
        } else if (hitInfra) {
          newKycStatus = 'no_kyc_reachable';
          newKycLabel = infraName ? `Router: ${infraName}` : 'Router dead-end';
        } else if (attempts >= MAX_KYC_ATTEMPTS_BEFORE_DEAD_END && sortedParents.length > 0) {
          newKycStatus = 'no_kyc_reachable';
          newKycLabel = 'Exhausted';
        } else {
          newKycStatus = 'tracing';
        }

        const chain = [
          { wallet: creator, depth: 0, role: 'creator' },
          ...sortedParents.map((p: any) => ({
            wallet: p.wallet,
            depth: p.depth,
            amountSol: p.amountSol ?? null,
            cexName: p.cexName ?? null,
            role: p.cexName ? 'kyc_root' : 'funder',
          })),
        ];

        await assertUpdate(
          supabase
            .from('telegram_insider_token_lifecycle')
            .update({
              genealogy_depth: sortedParents.length,
              genealogy_kyc_root: kycRoot,
              genealogy_chain: chain,
              kyc_status: newKycStatus,
              kyc_label: newKycLabel,
              kyc_attempts: attempts,
              kyc_last_attempt_at: new Date().toISOString(),
              enrichment_last_run_at: new Date().toISOString(),
            })
            .eq('id', row.id),
          'telegram_insider_token_lifecycle',
        );

        traced++;
        console.log(`[backfill] ✅ ${row.token_symbol || row.token_mint.slice(0, 8)} → depth=${sortedParents.length}, status=${newKycStatus}${newKycLabel ? ` (${newKycLabel})` : ''}`);
      } catch (e) {
        failed++;
        console.warn(`[backfill] ❌ ${row.token_symbol || row.token_mint.slice(0, 8)}: ${(e as Error).message}`);
        // Bump attempt counter & timestamp so cooldown applies to failures too
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({
            kyc_status: attempts >= MAX_KYC_ATTEMPTS_BEFORE_DEAD_END ? 'failed' : 'tracing',
            kyc_attempts: attempts,
            kyc_last_attempt_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      }

      // Throttle Helius
      await new Promise((r) => setTimeout(r, PER_WALLET_DELAY_MS));
    }

    const remaining = Math.max(0, total - rows.length);

    // Auto-loop: schedule the next batch (fire-and-forget, no await on the body).
    if (autoLoop && remaining > 0) {
      console.log(`[insiders-genealogy-backfill] auto_loop: scheduling next batch (${remaining} remaining)`);
      // Fire-and-forget; do not await — we just want to chain.
      supabase.functions.invoke('insiders-genealogy-backfill', {
        body: { auto_loop: true, batchSize, force },
      }).catch((e) => console.warn('[insiders-genealogy-backfill] next-batch invoke failed:', e?.message));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        auto_loop: autoLoop,
        processed: rows.length,
        traced,
        failed,
        kycResolved,
        remaining,
        total,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[insiders-genealogy-backfill] Fatal:', e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});