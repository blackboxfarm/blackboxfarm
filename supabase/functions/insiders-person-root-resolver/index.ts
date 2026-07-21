// insiders-person-root-resolver
// Walks the funding chain for a dev wallet and captures the wallet
// immediately funded by a CEX — the individual's personal withdrawal
// wallet. That's the "person root" we group Insiders Recaps by.
//
// Persists person_root_wallet / via_cex / depth / source onto every
// insiders_recap_entries row that shares the dev wallet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getCexName, isInfraWallet } from '../_shared/cex-wallets.ts';
import { requireHeliusApiKey, getHeliusRestUrl } from '../_shared/helius-client.ts';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';

enableHeliusTracking('insiders-person-root-resolver');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_DEPTH = 20;
const MIN_SOL = 0.05;
const PER_HOP_DELAY_MS = 180;
// Privacy hops / aggregators that terminate the chain but aren't a person
const PRIVACY_HOPS = new Set<string>([
  // Axiom / MoonPay / deBridge / Mayan / Jupiter aggregator sinks are
  // already covered by isInfraWallet(); add extra known privacy hops here.
]);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTxs(wallet: string, key: string): Promise<any[]> {
  const url = getHeliusRestUrl(`/v0/addresses/${wallet}/transactions`, { limit: '50' });
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      if (r.status === 429) { await delay(2000 * (i + 1)); continue; }
      if (!r.ok) return [];
      return await r.json();
    } catch (_e) { await delay(800 * (i + 1)); }
  }
  return [];
}

function largestIncomingFunder(txs: any[], target: string): string | null {
  let bestFrom: string | null = null;
  let bestAmt = 0;
  for (const tx of txs) {
    const nt = tx?.nativeTransfers;
    if (!Array.isArray(nt)) continue;
    for (const t of nt) {
      if (t.toUserAccount === target && t.fromUserAccount && t.fromUserAccount !== target) {
        const sol = (t.amount || 0) / 1e9;
        if (sol >= MIN_SOL && sol > bestAmt) {
          bestAmt = sol;
          bestFrom = t.fromUserAccount;
        }
      }
    }
  }
  return bestFrom;
}

interface PersonRoot {
  person_root_wallet: string | null;
  person_root_via_cex: string | null;
  person_root_depth: number | null;
  person_root_source: 'cex_withdrawal' | 'privacy_hop' | 'unresolved';
}

async function resolvePersonRoot(devWallet: string, key: string): Promise<PersonRoot> {
  // Walk the chain hop-by-hop, largest incoming funder each hop.
  let current = devWallet;
  let prev = devWallet;
  const seen = new Set<string>([devWallet]);

  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    await delay(PER_HOP_DELAY_MS);
    const txs = await fetchTxs(current, key);
    const funder = largestIncomingFunder(txs, current);
    if (!funder) {
      return { person_root_wallet: null, person_root_via_cex: null, person_root_depth: null, person_root_source: 'unresolved' };
    }

    // If the next hop is a CEX, `current` is the withdrawal recipient — the person.
    const cex = getCexName(funder);
    if (cex) {
      return {
        person_root_wallet: current === devWallet ? current : current,
        person_root_via_cex: cex,
        person_root_depth: depth - 1,
        person_root_source: 'cex_withdrawal',
      };
    }

    // If the next hop is infra / privacy hop, current wallet is the deepest personal wallet we can reach.
    if (isInfraWallet(funder) || PRIVACY_HOPS.has(funder)) {
      return {
        person_root_wallet: current,
        person_root_via_cex: null,
        person_root_depth: depth - 1,
        person_root_source: 'privacy_hop',
      };
    }

    if (seen.has(funder)) {
      return { person_root_wallet: current, person_root_via_cex: null, person_root_depth: depth - 1, person_root_source: 'privacy_hop' };
    }
    seen.add(funder);
    prev = current;
    current = funder;
  }
  return { person_root_wallet: current, person_root_via_cex: null, person_root_depth: MAX_DEPTH, person_root_source: 'privacy_hop' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const key = requireHeliusApiKey();
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const mode: 'single' | 'batch' | 'backfill' = body.mode || (body.dev_wallet ? 'single' : 'backfill');
    const forceRefresh: boolean = !!body.force;
    const staleAfterDays = 7;
    const staleCutoff = new Date(Date.now() - staleAfterDays * 86400_000).toISOString();

    // Collect dev wallets to process
    let devWallets: string[] = [];
    if (mode === 'single' && body.dev_wallet) {
      devWallets = [String(body.dev_wallet)];
    } else {
      const limit = Math.min(Number(body.limit ?? 40), 200);
      const { data, error } = await supa
        .from('insiders_recap_entries')
        .select('dev_wallet, person_root_resolved_at')
        .not('dev_wallet', 'is', null)
        .limit(5000);
      if (error) throw error;
      const unique = new Map<string, string | null>();
      for (const r of data || []) {
        const dw = (r as any).dev_wallet as string;
        const resolved = (r as any).person_root_resolved_at as string | null;
        if (!unique.has(dw)) unique.set(dw, resolved);
        else {
          const cur = unique.get(dw);
          if (cur && resolved && resolved > cur) unique.set(dw, resolved);
        }
      }
      const candidates: string[] = [];
      for (const [dw, resolved] of unique.entries()) {
        if (forceRefresh || !resolved || resolved < staleCutoff) candidates.push(dw);
      }
      devWallets = candidates.slice(0, limit);
    }

    const results: any[] = [];
    for (const dw of devWallets) {
      const person = await resolvePersonRoot(dw, key);
      const { error: upErr } = await supa
        .from('insiders_recap_entries')
        .update({
          person_root_wallet: person.person_root_wallet,
          person_root_via_cex: person.person_root_via_cex,
          person_root_depth: person.person_root_depth,
          person_root_source: person.person_root_source,
          person_root_resolved_at: new Date().toISOString(),
        })
        .eq('dev_wallet', dw);
      results.push({ dev_wallet: dw, ...person, error: upErr?.message || null });
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});