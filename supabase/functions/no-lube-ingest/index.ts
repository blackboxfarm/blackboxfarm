// no-lube-ingest — single entry the Insiders lifecycle builder calls per
// newly discovered mint. Orchestrates the enrichment chain BEFORE we ever
// post and treats `telegram_insider_token_lifecycle.entry_market_cap` as
// the immutable baseline for the X-factor math downstream.
//
// Steps (best-effort, never blocks the post if any single step fails):
//   1. Mesh probe (token-mesh-hydrate)
//   2. Dev wallet resolve (creator-wallet-resolver, single-target)
//   3. Blackbox CA post + bot-reply harvest (blackbox-tick)
//   4. /holders refresh (bagless-holders-report)
//   5. no-lube-orchestrate(mint) — handles private vs public + milestone gate
//
// Idempotent: ingest_status guards re-entry. Force with { force: true }.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function invoke(url: string, key: string, body: unknown, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'apikey': key,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json: j };
  } catch (e) {
    return { ok: false, status: 0, json: { error: (e as Error).message } };
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { mint, force } = await req.json();
    if (!mint || typeof mint !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'mint required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Idempotency guard
    const { data: lc } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('token_mint, token_symbol, entry_market_cap, ingest_status, ingest_started_at')
      .eq('token_mint', mint)
      .maybeSingle();

    if (!lc) {
      return new Response(JSON.stringify({ ok: false, error: 'no lifecycle row for mint' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!force) {
      if (lc.ingest_status === 'enriched') {
        return new Response(JSON.stringify({ ok: true, skipped: 'already_enriched' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (lc.ingest_status === 'enriching' && lc.ingest_started_at) {
        const ageMs = Date.now() - new Date(lc.ingest_started_at).getTime();
        if (ageMs < 5 * 60 * 1000) {
          return new Response(JSON.stringify({ ok: true, skipped: 'in_progress' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    await supabase
      .from('telegram_insider_token_lifecycle')
      .update({ ingest_status: 'enriching', ingest_started_at: new Date().toISOString(), ingest_last_error: null })
      .eq('token_mint', mint);

    const steps: Record<string, any> = {};
    const now = () => new Date().toISOString();

    // 1. Mesh probe — already-known wallets, prior tokens, sister mints
    try {
      const r = await invoke(`${supabaseUrl}/functions/v1/token-mesh-hydrate`, serviceKey, { token_mint: mint }, 25000);
      steps.mesh = { ok: r.ok, status: r.status };
      if (r.ok) {
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({ mesh_hydrated_at: now() })
          .eq('token_mint', mint);
      }
    } catch (e) { steps.mesh = { ok: false, error: (e as Error).message }; }

    // 2. Dev wallet resolve (fast canonical chain). The resolver itself
    //    fuses the dev into developer_profiles / creator_profiles so any
    //    prior tickers, X handles, ATH history are surfaced via the mesh.
    try {
      const r = await invoke(`${supabaseUrl}/functions/v1/creator-wallet-resolver`, serviceKey, { tokenMint: mint }, 30000);
      steps.creator = { ok: r.ok, status: r.status, resolved: r.json?.resolved };
      if (r.ok) {
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({ dev_wallet_resolved_at: now() })
          .eq('token_mint', mint);
      }
    } catch (e) { steps.creator = { ok: false, error: (e as Error).message }; }

    // 3. Blackbox CA post + bot-reply harvest. We trigger the existing
    //    blackbox-tick flow with the mint so it queues the CA, waits the
    //    standard window, and merges the harvested socials/security
    //    flags into the mesh.
    try {
      const r = await invoke(`${supabaseUrl}/functions/v1/blackbox-tick`, serviceKey, { mint, source: 'no-lube-ingest' }, 30000);
      steps.blackbox = { ok: r.ok, status: r.status };
      if (r.ok) {
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({ blackbox_harvested_at: now() })
          .eq('token_mint', mint);
      }
    } catch (e) { steps.blackbox = { ok: false, error: (e as Error).message }; }

    // 4. /holders refresh — true wallet count, dust vs whale %, top10 dynamic
    try {
      const r = await invoke(`${supabaseUrl}/functions/v1/bagless-holders-report`, serviceKey, { tokenMint: mint }, 45000);
      steps.holders = { ok: r.ok, status: r.status };
      if (r.ok) {
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({ holders_refreshed_at: now() })
          .eq('token_mint', mint);
      }
    } catch (e) { steps.holders = { ok: false, error: (e as Error).message }; }

    // 5. Hand off to orchestrate — it owns private/public posting + milestone gate.
    let orchestrate: any = null;
    try {
      const r = await invoke(`${supabaseUrl}/functions/v1/no-lube-orchestrate`, serviceKey, { mint, source: 'insiders-ingest' }, 60000);
      orchestrate = { ok: r.ok, status: r.status, body: r.json };
    } catch (e) {
      orchestrate = { ok: false, error: (e as Error).message };
    }

    await supabase
      .from('telegram_insider_token_lifecycle')
      .update({
        ingest_status: 'enriched',
        ingest_completed_at: now(),
      })
      .eq('token_mint', mint);

    return new Response(
      JSON.stringify({
        ok: true,
        mint,
        ticker: lc.token_symbol,
        entry_market_cap: lc.entry_market_cap,
        steps,
        orchestrate,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[no-lube-ingest] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});