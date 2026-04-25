// Insiders Cross-Links Aggregator
// Pure read-only: powers the "Wallet Cross-Links" panel under the Insiders
// Lifecycle table. Returns three cluster lists:
//   1) sharedCreator   — tokens minted by the same creator wallet
//   2) sharedFunder    — tokens whose creators were funded by the same intermediary wallet
//   3) sharedKycRoot   — tokens whose lineages converge on the same exchange deposit
//
// Every cluster carries per-token stats (peak_multiplier, mesh_promotion_status,
// is_rugged) so the UI can color-code RedFlag/GreenFlag/Mixed-Outcome.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Token {
  token_mint: string;
  token_symbol: string | null;
  peak_multiplier: number;
  is_rugged: boolean;
  mesh_promotion_status: string;
  first_called_at: string;
}

function classify(tokens: Token[]): 'green' | 'red' | 'mixed' | 'neutral' {
  const winners = tokens.filter((t) => t.peak_multiplier >= 3 && !t.is_rugged).length;
  const rugs = tokens.filter((t) => t.is_rugged).length;
  if (winners > 0 && rugs > 0) return 'mixed';
  if (winners >= Math.max(2, tokens.length - 1)) return 'green';
  if (rugs >= Math.max(2, tokens.length - 1)) return 'red';
  if (winners === 0 && tokens.every((t) => t.peak_multiplier < 2)) return 'red';
  return 'neutral';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Pull all rows we need once (lightweight projection)
    const { data: rows, error } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('token_mint, token_symbol, peak_multiplier, is_rugged, mesh_promotion_status, first_called_at, creator_wallet, genealogy_kyc_root, genealogy_chain')
      .limit(5000);
    if (error) throw error;

    const all = rows || [];

    // ── 1. Shared creator wallet ──
    const byCreator = new Map<string, any[]>();
    for (const r of all) {
      if (!r.creator_wallet) continue;
      if (!byCreator.has(r.creator_wallet)) byCreator.set(r.creator_wallet, []);
      byCreator.get(r.creator_wallet)!.push(r);
    }
    const sharedCreator = [...byCreator.entries()]
      .filter(([_, ts]) => ts.length > 1)
      .map(([wallet, tokens]) => ({
        key: wallet,
        tokens,
        count: tokens.length,
        verdict: classify(tokens as Token[]),
      }))
      .sort((a, b) => b.count - a.count);

    // ── 2. Shared KYC root ──
    const byKyc = new Map<string, any[]>();
    for (const r of all) {
      if (!r.genealogy_kyc_root) continue;
      if (!byKyc.has(r.genealogy_kyc_root)) byKyc.set(r.genealogy_kyc_root, []);
      byKyc.get(r.genealogy_kyc_root)!.push(r);
    }
    const sharedKycRoot = [...byKyc.entries()]
      .filter(([_, ts]) => ts.length > 1)
      .map(([wallet, tokens]) => ({
        key: wallet,
        // pull the cex label off any chain entry
        cexName: (tokens[0]?.genealogy_chain || []).find((h: any) => h?.cexName)?.cexName ?? null,
        tokens,
        count: tokens.length,
        verdict: classify(tokens as Token[]),
      }))
      .sort((a, b) => b.count - a.count);

    // ── 3. Shared intermediary funder (any non-creator, non-KYC hop in the chain) ──
    const byFunder = new Map<string, any[]>();
    for (const r of all) {
      const chain = (r.genealogy_chain || []) as any[];
      const intermediaries = chain.filter((h) => h?.role === 'funder' && h?.wallet);
      const seenInRow = new Set<string>();
      for (const h of intermediaries) {
        if (seenInRow.has(h.wallet)) continue;
        seenInRow.add(h.wallet);
        if (!byFunder.has(h.wallet)) byFunder.set(h.wallet, []);
        byFunder.get(h.wallet)!.push(r);
      }
    }
    const sharedFunder = [...byFunder.entries()]
      .filter(([w, ts]) => {
        if (ts.length < 2) return false;
        // Exclude funders that are also a creator wallet (already covered by sharedCreator)
        return !byCreator.has(w);
      })
      .map(([wallet, tokens]) => ({
        key: wallet,
        tokens,
        count: tokens.length,
        verdict: classify(tokens as Token[]),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50); // cap to top 50

    return new Response(
      JSON.stringify({
        ok: true,
        sharedCreator,
        sharedFunder,
        sharedKycRoot,
        stats: {
          totalRows: all.length,
          rowsWithCreator: all.filter((r) => r.creator_wallet).length,
          rowsWithKyc: all.filter((r) => r.genealogy_kyc_root).length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[insiders-cross-links] Fatal:', e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});