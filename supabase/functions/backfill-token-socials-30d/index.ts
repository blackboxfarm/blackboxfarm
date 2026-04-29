import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { assertUpsert } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESERVED_X = new Set([
  'i','intent','search','home','explore','hashtag','settings','notifications',
  'messages','compose','lists','bookmarks','communities','spaces','tos','privacy',
  'help','about','login','signup','share','status'
]);

const MAX_RUNTIME_MS = 110_000; // 110s, leave headroom under the 120s edge timeout

async function safeJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function processMint(supabase: any, tokenMint: string): Promise<{ websites: number; telegrams: number; xHandles: number; xCommunity: boolean; handleFallback: boolean }> {
  const counts = { websites: 0, telegrams: 0, xHandles: 0, xCommunity: false, handleFallback: false };
  let allSocialUrls: string[] = [];
  let tokenSymbol: string | undefined;
  let tokenName: string | undefined;
  let discoverySource = 'backfill_dexscreener_30d';

  // 1. DexScreener
  const dexData = await safeJson(`https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`);
  const pair = Array.isArray(dexData) ? dexData[0] : dexData?.pairs?.[0];
  if (pair) {
    tokenSymbol = pair?.baseToken?.symbol;
    tokenName = pair?.baseToken?.name;
    const socials = pair?.info?.socials || [];
    const websites = pair?.info?.websites || [];
    allSocialUrls = [
      ...socials.map((s: any) => s.url),
      ...websites.map((w: any) => w.url),
    ].filter(Boolean);
  }

  // 2. Pump.fun
  const pumpData = await safeJson(`https://frontend-api-v3.pump.fun/coins/${tokenMint}`);
  if (pumpData) {
    if (!tokenSymbol && pumpData?.symbol) tokenSymbol = pumpData.symbol;
    if (!tokenName && pumpData?.name) tokenName = pumpData.name;
    for (const field of [pumpData?.twitter, pumpData?.telegram, pumpData?.website]) {
      if (field && typeof field === 'string' && field.trim().length > 0) {
        const u = field.trim();
        if (!allSocialUrls.includes(u)) allSocialUrls.push(u);
      }
    }
    if (!discoverySource.includes('pumpfun') && allSocialUrls.some(u => u.includes('/communities/'))) {
      discoverySource = 'backfill_pumpfun_30d';
    }
  }

  if (allSocialUrls.length === 0) return counts;

  const xUrls = allSocialUrls.filter(u =>
    (u.includes('x.com/') || u.includes('twitter.com/')) && !u.includes('/communities/')
  );
  const telegramUrls = allSocialUrls.filter(u =>
    u.includes('t.me/') || u.includes('telegram.me/')
  );
  const websiteUrls = allSocialUrls.filter(u =>
    !u.includes('x.com/') && !u.includes('twitter.com/') &&
    !u.includes('t.me/') && !u.includes('telegram.me/')
  );
  const communityUrl = allSocialUrls.find(u => u.includes('/communities/') && /communities\/\d+/.test(u)) || null;

  // X handles
  const discoveredHandles: string[] = [];
  for (const xUrl of xUrls) {
    const m = xUrl.match(/(?:x\.com|twitter\.com)\/(@?([a-zA-Z0-9_]+))/i);
    if (!m) continue;
    const handle = (m[2] || m[1]).replace(/^@/, '').toLowerCase();
    if (!handle || RESERVED_X.has(handle) || handle.length > 15) continue;
    discoveredHandles.push(handle);
    await assertUpsert(
      supabase.from('reputation_mesh').upsert({
        source_type: 'token', source_id: tokenMint,
        linked_type: 'x_account', linked_id: handle,
        relationship: 'social_account',
        confidence: 85, discovered_via: discoverySource,
      }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' }),
      'reputation_mesh'
    );
    counts.xHandles++;
  }

  // X Community (numeric)
  if (communityUrl) {
    const cMatch = communityUrl.match(/communities\/(\d+)/);
    if (cMatch) {
      await assertUpsert(
        supabase.from('reputation_mesh').upsert({
          source_type: 'token', source_id: tokenMint,
          linked_type: 'x_community', linked_id: cMatch[1],
          relationship: 'community_for',
          confidence: 90, discovered_via: discoverySource,
          evidence: { url: communityUrl },
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' }),
        'reputation_mesh'
      );
      counts.xCommunity = true;
    }
  }

  // Telegram
  for (const tgUrl of telegramUrls) {
    const m = tgUrl.match(/t\.me\/(?:s\/)?([a-zA-Z0-9_+]+)/i);
    const handle = m?.[1]?.toLowerCase();
    if (!handle || handle === 'joinchat' || handle === 'addstickers') continue;
    await assertUpsert(
      supabase.from('reputation_mesh').upsert({
        source_type: 'token', source_id: tokenMint,
        linked_type: 'telegram', linked_id: handle,
        relationship: 'social_account',
        confidence: 80, discovered_via: discoverySource,
        evidence: { url: tgUrl },
      }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' }),
      'reputation_mesh'
    );
    counts.telegrams++;
  }

  // Website
  for (const wUrl of websiteUrls) {
    let host: string | null = null;
    try { host = new URL(wUrl.startsWith('http') ? wUrl : `https://${wUrl}`).hostname.replace(/^www\./, ''); }
    catch { host = null; }
    if (!host) continue;
    await assertUpsert(
      supabase.from('reputation_mesh').upsert({
        source_type: 'token', source_id: tokenMint,
        linked_type: 'website', linked_id: host,
        relationship: 'social_account',
        confidence: 75, discovered_via: discoverySource,
        evidence: { url: wUrl },
      }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' }),
      'reputation_mesh'
    );
    counts.websites++;
  }

  // Handle-as-community fallback (no community URL but X handle present)
  if (!communityUrl && discoveredHandles.length > 0) {
    const handle = discoveredHandles[0];
    const h = handle.toLowerCase();
    const candidates = [tokenSymbol, tokenName, tokenMint?.slice(0, 6)]
      .filter(Boolean).map(s => (s as string).toLowerCase());
    const resembles = candidates.some(c => h.includes(c) || c.includes(h));
    const confidence = resembles ? 70 : 50;
    const syntheticId = `handle:${handle}`;
    await assertUpsert(
      supabase.from('reputation_mesh').upsert({
        source_type: 'token', source_id: tokenMint,
        linked_type: 'x_community', linked_id: syntheticId,
        relationship: 'community_for',
        confidence,
        discovered_via: 'backfill_handle_as_community',
        evidence: { fallback: 'handle_as_community', handle, resembles_token: resembles },
      }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' }),
      'reputation_mesh'
    );
    await assertUpsert(
      supabase.from('reputation_mesh').upsert({
        source_type: 'x_community', source_id: syntheticId,
        linked_type: 'x_account', linked_id: handle,
        relationship: 'community_admin',
        confidence,
        discovered_via: 'backfill_handle_as_community',
        evidence: { fallback: 'handle_as_community', handle },
      }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' }),
      'reputation_mesh'
    );
    counts.handleFallback = true;
  }

  return counts;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* GET or empty */ }
  const cursor: string | undefined = body.cursor;
  const batchSize: number = Math.min(Math.max(body.batchSize ?? 200, 10), 500);

  // Pull distinct mints from token_search_log (last 30d), ordered by mint for stable cursor
  const q = supabase
    .from('token_search_log')
    .select('token_mint')
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
    .not('token_mint', 'is', null)
    .order('token_mint', { ascending: true })
    .limit(5000);
  if (cursor) q.gt('token_mint', cursor);

  const { data: rows, error: rErr } = await q;
  if (rErr) {
    return new Response(JSON.stringify({ error: rErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Dedup
  const seen = new Set<string>();
  const mints: string[] = [];
  for (const r of rows || []) {
    const m = r.token_mint;
    if (!m || m.length < 32 || seen.has(m)) continue;
    seen.add(m);
    mints.push(m);
    if (mints.length >= batchSize) break;
  }

  const start = Date.now();
  let processed = 0;
  let errors = 0;
  let lastMint: string | null = null;
  const totals = { websites: 0, telegrams: 0, xHandles: 0, xCommunity: 0, handleFallback: 0 };

  for (const mint of mints) {
    if (Date.now() - start > MAX_RUNTIME_MS) break;
    try {
      const c = await processMint(supabase, mint);
      totals.websites += c.websites;
      totals.telegrams += c.telegrams;
      totals.xHandles += c.xHandles;
      totals.xCommunity += c.xCommunity ? 1 : 0;
      totals.handleFallback += c.handleFallback ? 1 : 0;
      processed++;
      lastMint = mint;
      // Light pacing to be polite to public APIs
      await new Promise(res => setTimeout(res, 120));
    } catch (e) {
      errors++;
      console.error(`[backfill] mint ${mint} failed:`, (e as Error).message);
      lastMint = mint; // advance cursor so we don't re-loop on the same poison mint
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    processed,
    errors,
    totals,
    nextCursor: lastMint,
    done: processed < mints.length === false && (rows?.length || 0) < 5000 && processed === mints.length,
    elapsedMs: Date.now() - start,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});