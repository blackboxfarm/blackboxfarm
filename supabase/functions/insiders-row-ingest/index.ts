// insiders-row-ingest
// Event-driven per-row ingest. Called by a Postgres trigger the instant a
// new row lands in telegram_channel_calls for the 'insiders' channel.
//
// Hard requirement (per spec): we MUST resolve dev_wallet via Solscan
// `fund_by` before posting. If Solscan fails (only Solscan — not Pump.fun,
// not Helius), the row is marked dev_wallet_source='in_process' and
// background enrichment continues; the No-Lube poster will then omit the
// dev-wallet section and show "In Process" instead.
//
// Order:
//   0. DB-first cache lookup → if we already have creator + dev wallet,
//      copy them straight onto the new lifecycle row and skip external APIs.
//   1. Resolve creator_wallet (Pump.fun → Birdeye → Helius DAS → Helius RPC).
//   2. Solscan fund_by(creator_wallet) → dev_wallet. THIS IS THE GATE.
//   3. Upsert into telegram_insider_token_lifecycle with everything we got.
//   4. Fire no-lube-ingest (post pipeline) + background enrichment chain.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';
import { fetchSolscanFundBy } from '../_shared/solscan-creator.ts';
import { lookupKnownToken } from '../_shared/token-cache-lookup.ts';
import { assertUpsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function invokeFn(supabaseUrl: string, key: string, fn: string, body: unknown) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'apikey': key,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn(`[insiders-row-ingest] fire-and-forget ${fn} failed:`, (e as Error).message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const startedAt = Date.now();

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const mint: string | undefined = body?.mint;
  const symbol: string | null = body?.symbol ?? null;
  const messageId: number | null = body?.message_id ?? null;
  const rawMessage: string | null = body?.raw_message ?? null;
  const messageTimestamp: string | null = body?.message_timestamp ?? null;
  const channelName: string = body?.channel_name || 'insiders';

  if (!mint || mint.length < 32) {
    return new Response(JSON.stringify({ ok: false, error: 'mint required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiErrors: string[] = [];

  // ---- ADOPT-FROM-INSIDERS ----
  // When the incoming Insiders message is a MILESTONE post for a token we
  // don't have yet (or already have but never posted), we parse their
  // multiplier + entry/current MC and forward it to no-lube-orchestrate so
  // the first post lands on the matching tier (2x → Private; ≥3x → Private +
  // Public). Enrichment continues normally in the background.
  const parseShortNum = (raw: string | null | undefined): number | null => {
    if (!raw) return null;
    const s = String(raw).replace(/[\s,$]/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)([kKmMbB]?)$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return null;
    const suf = m[2].toLowerCase();
    const mult = suf === 'k' ? 1_000 : suf === 'm' ? 1_000_000 : suf === 'b' ? 1_000_000_000 : 1;
    return n * mult;
  };
  let insidersMilestone: { multiplier: number; entry_mcap: number | null; current_mcap: number | null } | null = null;
  if (rawMessage && /MILESTONE/i.test(rawMessage)) {
    const mX = rawMessage.match(/MILESTONE:?\s*([\d.]+)\s*X/i);
    const multiplier = mX ? parseFloat(mX[1]) : NaN;
    if (Number.isFinite(multiplier) && multiplier >= 2) {
      const mEntry = rawMessage.match(/Entry\s*MC\s*[:=]\s*\$?([\d.,]+\s*[kKmMbB]?)/i);
      const mCurr = rawMessage.match(/(?:Current\s*MC|Market\s*Cap)\s*[:=]\s*\$?([\d.,]+\s*[kKmMbB]?)/i);
      insidersMilestone = {
        multiplier,
        entry_mcap: parseShortNum(mEntry?.[1] ?? null),
        current_mcap: parseShortNum(mCurr?.[1] ?? null),
      };
    }
  }

  // 0. DB-first cache.
  const cache = await lookupKnownToken(supabase, mint);
  console.log(`[insiders-row-ingest] ${symbol || mint.slice(0,8)} cache hit=${cache.hit} sources=${cache.hitSources.join(',')}`);

  let creatorWallet: string | null = cache.creator_wallet;
  let creatorSource: string = cache.creator_source ?? 'db_cache';
  let devWallet: string | null = cache.dev_wallet;
  let devWalletSource: string | null = cache.dev_wallet_source ?? (cache.dev_wallet ? 'db_cache' : null);

  // 1. Resolve creator if not cached.
  if (!creatorWallet) {
    const res = await resolveTokenCreator(mint, supabase, apiErrors);
    creatorWallet = res.creatorWallet;
    creatorSource = res.source;
  }

  // 2. Solscan fund_by — the dev_wallet gate. Only call if we don't already
  //    have a cached dev_wallet and we DO have a creator to ask about.
  if (!devWallet && creatorWallet) {
    const solscan = await fetchSolscanFundBy(creatorWallet, apiErrors);
    if (solscan?.funder) {
      devWallet = solscan.funder;
      devWalletSource = 'solscan_fund_by';
      console.log(`[insiders-row-ingest] ${symbol || mint.slice(0,8)} dev_wallet=${devWallet.slice(0,8)} (solscan_fund_by, label=${solscan.funderLabel || 'none'})`);
    } else {
      // Solscan miss → mark in_process, do NOT block the ingest.
      devWalletSource = 'in_process';
      console.warn(`[insiders-row-ingest] ${symbol || mint.slice(0,8)} solscan miss — dev_wallet in_process`);
    }
  }

  // 3. Upsert lifecycle row. We carry whatever data we have — entry_market_cap
  //    parsing remains the responsibility of insiders-lifecycle-builder's
  //    safety-sweep pass; this row gives the poster everything it needs to
  //    show "In Process" placeholders for the missing pieces.
  const now = new Date().toISOString();
  const ingestLatencyMs = Date.now() - startedAt;

  const upsertRow: any = {
    token_mint: mint,
    token_symbol: symbol,
    channel_name: channelName,
    first_call_message_id: messageId,
    first_called_at: messageTimestamp || now,
    raw_alert_message: rawMessage,
    creator_wallet: creatorWallet,
    creator_status: creatorWallet ? 'resolved' : 'unknown',
    creator_resolved_at: creatorWallet ? now : null,
    creator_last_attempt_at: now,
    dev_wallet: devWallet,
    dev_wallet_source: devWalletSource,
    dev_wallet_resolved_at: devWallet ? now : null,
    kyc_status: cache.kyc_status ?? (cache.kyc_root ? 'kyc_resolved' : 'pending'),
    kyc_label: cache.kyc_label,
    genealogy_kyc_root: cache.kyc_root,
    launchpad: cache.launchpad,
    ingest_status: 'enriching',
    ingest_started_at: now,
    ingest_latency_ms: ingestLatencyMs,
    updated_at: now,
  };

  try {
    await assertUpsert(
      supabase
        .from('telegram_insider_token_lifecycle')
        .upsert(upsertRow, { onConflict: 'token_mint' }),
      'telegram_insider_token_lifecycle',
    );
  } catch (e) {
    console.error('[insiders-row-ingest] upsert failed:', (e as Error).message);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // MESH-FIRST: parse Entry MC from the raw Insiders alert and feed the
  // main Mesh table. Window-guarded by the RPC.
  try {
    const txt = rawMessage || '';
    const parseShort = (raw: string | null | undefined): number | null => {
      if (!raw) return null;
      const s = raw.replace(/[\s,$]/g, '');
      const m = s.match(/^(\d+(?:\.\d+)?)([kKmMbB]?)$/);
      if (!m) return null;
      const n = parseFloat(m[1]);
      if (!Number.isFinite(n)) return null;
      const suf = m[2].toLowerCase();
      const mult = suf === 'k' ? 1_000 : suf === 'm' ? 1_000_000 : suf === 'b' ? 1_000_000_000 : 1;
      return n * mult;
    };
    const vals: number[] = [];
    const mE = txt.match(/Entry\s*MC\s*[:=]\s*\$?([\d.,]+\s*[kKmMbB]?)/i);
    const vE = parseShort(mE?.[1] ?? null); if (vE) vals.push(vE);
    const mM = txt.match(/Market\s*Cap\s*[:=]\s*\$?([\d.,]+\s*[kKmMbB]?)/i);
    const vM = parseShort(mM?.[1] ?? null); if (vM) vals.push(vM);
    const observedMc = vals.length ? Math.min(...vals) : null;
    if (observedMc && observedMc > 0) {
      await supabase.rpc('upsert_mesh_entry_mcap', {
        p_mint: mint,
        p_symbol: symbol,
        p_name: null,
        p_observed_mcap: observedMc,
        p_source: 'insiders',
        p_observed_at: messageTimestamp || now,
      });
    }
  } catch (e) {
    console.warn('[insiders-row-ingest] mesh upsert failed (non-fatal):', (e as Error).message);
  }

  // 4. Fire downstream pipelines. All fire-and-forget — we return fast.
  //    no-lube-ingest will read the row and decide whether to post.
  //    Adopt-from-Insiders payload is forwarded so orchestrate can route
  //    the first post straight to the matching tier.
  invokeFn(supabaseUrl, serviceKey, 'no-lube-ingest', {
    mint,
    insiders_milestone: insidersMilestone,
  });

  // If dev_wallet is still in_process, fire background KYC genealogy walk
  // so the next compose (2x/3x repost) can include the missing pieces.
  if (devWalletSource === 'in_process' || !cache.kyc_root) {
    invokeFn(supabaseUrl, serviceKey, 'insiders-genealogy-backfill', { auto_loop: false, batchSize: 5 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      mint,
      symbol,
      creator_wallet: creatorWallet,
      creator_source: creatorSource,
      dev_wallet: devWallet,
      dev_wallet_source: devWalletSource,
      cache_hit: cache.hit,
      cache_sources: cache.hitSources,
      ingest_latency_ms: ingestLatencyMs,
      api_errors: apiErrors,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});