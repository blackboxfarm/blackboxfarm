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
import { assertUpdate } from '../_shared/db-assert.ts';

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

  let requestedMint: string | null = null;

  try {
    const { mint, force, fast_post } = await req.json();
    requestedMint = typeof mint === 'string' ? mint : null;
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
      if (!fast_post && lc.ingest_status === 'enriching' && lc.ingest_started_at) {
        const ageMs = Date.now() - new Date(lc.ingest_started_at).getTime();
        if (ageMs < 5 * 60 * 1000) {
          return new Response(JSON.stringify({ ok: true, skipped: 'in_progress' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    await assertUpdate(
      supabase
        .from('telegram_insider_token_lifecycle')
        .update({ ingest_status: 'enriching', ingest_started_at: new Date().toISOString(), ingest_last_error: null })
        .eq('token_mint', mint),
      'telegram_insider_token_lifecycle',
    );

    const steps: Record<string, any> = {};
    const now = () => new Date().toISOString();

    // POST FIRST. Enrichment must never block the snapshot/private post.
    let orchestrate: any = null;
    try {
      const r = await invoke(`${supabaseUrl}/functions/v1/no-lube-orchestrate`, serviceKey, {
        mint,
        source: fast_post ? 'insiders-fast-post' : 'insiders-ingest',
      }, 60000);
      orchestrate = { ok: r.ok, status: r.status, body: r.json };
    } catch (e) {
      orchestrate = { ok: false, error: (e as Error).message };
    }

    if (fast_post) {
      await assertUpdate(
        supabase
          .from('telegram_insider_token_lifecycle')
          .update({
            ingest_status: orchestrate?.ok ? 'enriched' : 'failed',
            ingest_completed_at: now(),
            ingest_last_error: orchestrate?.ok ? null : JSON.stringify(orchestrate).slice(0, 500),
          })
          .eq('token_mint', mint),
        'telegram_insider_token_lifecycle',
      );
      return new Response(JSON.stringify({ ok: true, mint, ticker: lc.token_symbol, fast_post: true, orchestrate }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Mesh probe — already-known wallets, prior tokens, sister mints
    try {
      const r = await invoke(`${supabaseUrl}/functions/v1/token-mesh-hydrate`, serviceKey, { mint, surface: 'no-lube-ingest' }, 25000);
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

    // 4. /holders refresh — fire-and-forget so the 45s call doesn't hold a DB
    //    connection while the rest of the ingest chain runs. The report writes
    //    its own results back to the DB when it completes.
    try {
      fetch(`${supabaseUrl}/functions/v1/bagless-holders-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
        body: JSON.stringify({ tokenMint: mint }),
      }).catch((e) => console.warn('[no-lube-ingest] holders dispatch failed:', (e as Error).message));
      steps.holders = { ok: true, dispatched: true };
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