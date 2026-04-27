// Insiders Genealogy KYC Rescan
//
// ZERO-RPC-COST companion to insiders-genealogy-backfill. Walks every lifecycle
// row that already has a `genealogy_chain` but no `genealogy_kyc_root`, and
// re-checks each wallet in the chain against the CURRENT cex-wallets dictionary.
// If any wallet matches a known CEX, we patch the chain entry's cexName/role and
// set the row's genealogy_kyc_root — no new Helius calls, just dictionary lookup.
//
// Use this after expanding cex-wallets.ts to instantly reclassify existing data.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCexName } from "../_shared/cex-wallets.ts";
import { assertUpdate } from "../_shared/db-assert.ts";

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

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const batchSize = Math.min(Math.max(Number(body.batchSize) || 500, 50), 2000);

  try {
    // Pull every lifecycle row that has a chain but no KYC root resolved yet.
    const { data: rows, error, count } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('id, token_mint, token_symbol, genealogy_chain, genealogy_kyc_root', { count: 'exact' })
      .is('genealogy_kyc_root', null)
      .not('genealogy_chain', 'is', null)
      .limit(batchSize);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, scanned: 0, kycResolved: 0, remaining: 0, message: 'Nothing to rescan' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let scanned = 0;
    let kycResolved = 0;
    let chainsPatched = 0;

    for (const row of rows) {
      scanned++;
      const chain = (row.genealogy_chain ?? []) as any[];
      if (!Array.isArray(chain) || chain.length === 0) continue;

      let kycRoot: string | null = null;
      let kycCexName: string | null = null;
      let needsPatch = false;
      const patchedChain = chain.map((hop: any) => {
        if (!hop?.wallet) return hop;
        const cex = getCexName(hop.wallet);
        if (cex) {
          // First CEX wins (shallowest depth)
          if (!kycRoot) {
            kycRoot = hop.wallet;
            kycCexName = cex;
          }
          if (hop.cexName !== cex || hop.role !== 'kyc_root') {
            needsPatch = true;
            return { ...hop, cexName: cex, role: 'kyc_root' };
          }
        }
        return hop;
      });

      if (kycRoot) {
        kycResolved++;
        await assertUpdate(
          supabase
            .from('telegram_insider_token_lifecycle')
            .update({
              genealogy_kyc_root: kycRoot,
              genealogy_chain: patchedChain,
              enrichment_last_run_at: new Date().toISOString(),
            })
            .eq('id', row.id),
          'telegram_insider_token_lifecycle',
        );
        if (needsPatch) chainsPatched++;
        console.log(`[kyc-rescan] ✅ ${row.token_symbol || row.token_mint.slice(0, 8)} → ${kycCexName} (${kycRoot.slice(0, 8)}…)`);
      }
    }

    const total = count ?? rows.length;
    const remaining = Math.max(0, total - rows.length);

    return new Response(
      JSON.stringify({
        ok: true,
        scanned,
        kycResolved,
        chainsPatched,
        remaining,
        total,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[insiders-genealogy-rescan-kyc] Fatal:', e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});