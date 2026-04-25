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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_BATCH = 25;
const MAX_BATCH = 50;
const PER_WALLET_DELAY_MS = 250; // throttle Helius

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

  try {
    // 1. Find rows that need tracing
    const filter = supabase
      .from('telegram_insider_token_lifecycle')
      .select('id, token_mint, token_symbol, creator_wallet, genealogy_kyc_root, genealogy_chain', { count: 'exact' })
      .not('creator_wallet', 'is', null);

    const query = force
      ? filter
      : filter.or('genealogy_kyc_root.is.null,genealogy_chain.is.null');

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
        if (kycRoot) kycResolved++;

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
              enrichment_last_run_at: new Date().toISOString(),
            })
            .eq('id', row.id),
          'telegram_insider_token_lifecycle',
        );

        traced++;
        console.log(`[backfill] ✅ ${row.token_symbol || row.token_mint.slice(0, 8)} → depth=${sortedParents.length}, kyc=${kycRoot ? 'YES' : 'no'}`);
      } catch (e) {
        failed++;
        console.warn(`[backfill] ❌ ${row.token_symbol || row.token_mint.slice(0, 8)}: ${(e as Error).message}`);
      }

      // Throttle Helius
      await new Promise((r) => setTimeout(r, PER_WALLET_DELAY_MS));
    }

    const remaining = Math.max(0, total - rows.length);

    return new Response(
      JSON.stringify({
        ok: true,
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