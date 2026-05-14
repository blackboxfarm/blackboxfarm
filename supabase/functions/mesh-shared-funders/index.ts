// mesh-shared-funders
// Given a creator wallet, walks its funding chain (from reputation_mesh) and
// for every intermediate funder reports OTHER creator wallets that the same
// funder has bankrolled. This converts the genealogy graph into a
// "dev family / collaboration cluster" detector.
//
// Read-only function — no DB writes, safe to call from the frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isCexWallet, getCexName, isInfraWallet, getInfraName, isTerminusWallet } from '../_shared/cex-wallets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIN_SIBLINGS = 2;          // funder must have funded ≥2 OTHER creators
const NOISE_FANOUT_CAP = 40;     // funders with >40 distinct creators are public routers/CEX/bots, not real dev families
const MAX_FUNDERS_RETURNED = 12; // cap output for UI
const MAX_SIBLING_TOKENS = 8;    // per funder
const IN_CHUNK = 100;            // PostgREST URL length safety — chunk .in() filters

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clusterLabel(siblings: number): 'tight_cluster' | 'likely_dev_family' | 'wide_funder' | 'infra_router' {
  if (siblings <= 4) return 'tight_cluster';
  if (siblings <= 15) return 'likely_dev_family';
  return 'wide_funder';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { wallet } = await req.json();
    if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
      return new Response(JSON.stringify({ error: 'wallet (string) is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Walk upstream from this wallet to collect every ancestor funder.
    //    reputation_mesh stores edges as: source=funder, linked=child.
    const ancestors = new Map<string, { depth: number; cex?: string | null }>();
    let frontier = [wallet];
    const visited = new Set<string>([wallet]);
    let kycTerminus: { wallet: string; cex_name: string; depth: number } | null = null;

    for (let depth = 1; depth <= 20 && frontier.length > 0; depth++) {
      const edges: { source_id: string }[] = [];
      for (const slice of chunk(frontier, IN_CHUNK)) {
        const { data, error } = await supabase
          .from('reputation_mesh')
          .select('source_id')
          .eq('source_type', 'wallet')
          .eq('linked_type', 'wallet')
          .in('relationship', ['directly_funded', 'indirectly_funded'])
          .in('linked_id', slice);
        if (error) throw error;
        if (data) edges.push(...(data as { source_id: string }[]));
      }

      const next: string[] = [];
      for (const e of edges) {
        const f = e.source_id as string;
        if (visited.has(f)) continue;
        visited.add(f);
        const cex = getCexName(f);
        const infra = getInfraName(f);
        ancestors.set(f, { depth, cex: cex ?? infra });
        if (cex) {
          // Capture the SHALLOWEST (first) CEX hit as the KYC terminus.
          if (!kycTerminus || depth < kycTerminus.depth) {
            kycTerminus = { wallet: f, cex_name: cex, depth };
          }
        } else if (infra) {
          // Infra/router wallets terminate the chain (do not walk past) but
          // are NOT a KYC terminus. Just stop.
        } else {
          next.push(f); // don't keep walking past CEX
        }
      }
      frontier = next;
    }

    if (ancestors.size === 0) {
      return new Response(JSON.stringify({
        creator: wallet,
        shared_funders: [],
        message: 'No upstream funding chain found in mesh. Run wallet-genealogy-scanner first.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. For each ancestor, count how many OTHER creators it has funded.
    // Exclude both CEX and infra/router wallets — they're not real funders.
    const ancestorIds = [...ancestors.keys()].filter((a) => !isTerminusWallet(a));

    const siblingEdges: { source_id: string; linked_id: string; relationship: string; evidence: unknown }[] = [];
    for (const slice of chunk(ancestorIds, IN_CHUNK)) {
      const { data, error: sibErr } = await supabase
        .from('reputation_mesh')
        .select('source_id, linked_id, relationship, evidence')
        .eq('source_type', 'wallet')
        .eq('linked_type', 'wallet')
        .in('relationship', ['directly_funded', 'indirectly_funded'])
        .in('source_id', slice);
      if (sibErr) throw sibErr;
      if (data) siblingEdges.push(...(data as any));
    }

    // Group: funder -> Set<sibling creator wallet>
    const funderSiblings = new Map<string, Set<string>>();
    for (const edge of siblingEdges) {
      const f = edge.source_id as string;
      const child = edge.linked_id as string;
      if (child === wallet) continue; // exclude self
      if (!funderSiblings.has(f)) funderSiblings.set(f, new Set());
      funderSiblings.get(f)!.add(child);
    }

    // 3. Filter + rank funders. Drop noise (huge fanout = unlabelled CEX) and tiny (<MIN_SIBLINGS).
    const ranked = [...funderSiblings.entries()]
      .filter(([, sibs]) => sibs.size >= MIN_SIBLINGS && sibs.size <= NOISE_FANOUT_CAP)
      .sort((a, b) => {
        // Prefer mid-fanout (3-25) — most signal
        const score = (n: number) => (n >= 3 && n <= 25 ? 1000 - n : 100 - Math.min(n, 100));
        return score(b[1].size) - score(a[1].size);
      })
      .slice(0, MAX_FUNDERS_RETURNED);

    // 4. For each funder, fetch sibling token info (best-perf first).
    const allSiblingCreators = [...new Set(ranked.flatMap(([, sibs]) => [...sibs]))];
    type TokenRow = { token_mint: string; token_symbol: string | null; creator_wallet: string; peak_multiplier?: number | null };

    let lifecycleTokens: TokenRow[] = [];
    let pumpfunTokens: TokenRow[] = [];
    if (allSiblingCreators.length > 0) {
      for (const slice of chunk(allSiblingCreators, IN_CHUNK)) {
        const [{ data: lc }, { data: pf }] = await Promise.all([
          supabase
            .from('telegram_insider_token_lifecycle')
            .select('token_mint, token_symbol, creator_wallet, peak_multiplier')
            .in('creator_wallet', slice),
          supabase
            .from('pumpfun_watchlist')
            .select('token_mint, token_symbol, creator_wallet')
            .in('creator_wallet', slice),
        ]);
        if (lc) lifecycleTokens.push(...(lc as TokenRow[]));
        if (pf) pumpfunTokens.push(...(pf as TokenRow[]));
      }
    }

    const tokensByCreator = new Map<string, TokenRow[]>();
    for (const t of [...lifecycleTokens, ...pumpfunTokens]) {
      if (!t.creator_wallet) continue;
      if (!tokensByCreator.has(t.creator_wallet)) tokensByCreator.set(t.creator_wallet, []);
      tokensByCreator.get(t.creator_wallet)!.push(t);
    }

    const shared_funders = ranked.map(([funder, sibs]) => {
      const meta = ancestors.get(funder)!;
      const sibList = [...sibs];
      const sibling_tokens = sibList
        .flatMap((c) => (tokensByCreator.get(c) || []).map((t) => ({
          mint: t.token_mint,
          symbol: t.token_symbol,
          creator: c,
          peak_multiplier: t.peak_multiplier ?? null,
        })))
        .sort((a, b) => (b.peak_multiplier ?? 0) - (a.peak_multiplier ?? 0))
        .slice(0, MAX_SIBLING_TOKENS);

      return {
        funder,
        depth_in_chain: meta.depth,
        siblings_count: sibs.size,
        sibling_creators: sibList.slice(0, 20),
        sibling_tokens,
        cluster_label: clusterLabel(sibs.size),
      };
    });

    return new Response(JSON.stringify({
      creator: wallet,
      ancestors_walked: ancestors.size,
      kyc_terminus: kycTerminus, // { wallet, cex_name, depth } | null
      shared_funders,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('[mesh-shared-funders] error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});