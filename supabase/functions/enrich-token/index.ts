// enrich-token — Stage 2/3/4 of the Master Variable Bag pipeline.
//
// Called by blackbox-tick after Stage 1 (bot scrape) is persisted. Loads the
// existing bag from blackbox_aggregator_runs.var_bag_jsonb, fans out to
// on-chain + market + holders + AI enrichment providers in parallel, and
// upserts the enlarged bag back onto the run row.
//
// Deliberately additive: never mutates parsed bot data or run.status.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { VarBag } from "../_shared/var-bag.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HELIUS_KEY = Deno.env.get('HELIUS_API_KEY') || '';
const LOVABLE_AI_KEY = Deno.env.get('LOVABLE_API_KEY') || '';

// ---------------------------------------------------------------------------
// Provider fetchers — every one returns {source, data|null, error|null}.
// ---------------------------------------------------------------------------

async function fetchDexScreener(mint: string) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!r.ok) return { source: 'dexscreener', data: null, error: `HTTP ${r.status}` };
    const j = await r.json();
    const pairs = j?.pairs || [];
    if (!pairs.length) return { source: 'dexscreener', data: null, error: 'no pairs' };
    // Pick highest-liquidity Solana pair
    const sol = pairs.filter((p: any) => p.chainId === 'solana');
    sol.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const p = sol[0] || pairs[0];
    return { source: 'dexscreener', data: p, error: null };
  } catch (e: any) { return { source: 'dexscreener', data: null, error: e?.message }; }
}

async function fetchHeliusAsset(mint: string) {
  if (!HELIUS_KEY) return { source: 'helius', data: null, error: 'no key' };
  try {
    const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'ent', method: 'getAsset', params: { id: mint } }),
    });
    if (!r.ok) return { source: 'helius', data: null, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { source: 'helius', data: j?.result || null, error: null };
  } catch (e: any) { return { source: 'helius', data: null, error: e?.message }; }
}

async function fetchHeliusSupply(mint: string) {
  if (!HELIUS_KEY) return { source: 'helius', data: null, error: 'no key' };
  try {
    const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'sup', method: 'getTokenSupply', params: [mint] }),
    });
    if (!r.ok) return { source: 'helius', data: null, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { source: 'helius', data: j?.result?.value || null, error: null };
  } catch (e: any) { return { source: 'helius', data: null, error: e?.message }; }
}

async function fetchPumpFun(mint: string) {
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: { 'accept': 'application/json' },
    });
    if (!r.ok) return { source: 'pumpfun', data: null, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { source: 'pumpfun', data: j, error: null };
  } catch (e: any) { return { source: 'pumpfun', data: null, error: e?.message }; }
}

// ---------------------------------------------------------------------------
// Stage 2 loaders — flatten each provider's payload into the bag.
// ---------------------------------------------------------------------------

function loadDex(bag: VarBag, r: Awaited<ReturnType<typeof fetchDexScreener>>) {
  const src = 'dexscreener';
  bag.set('dex', 'ok', r.data != null, { source: src, mutability: 'transient' });
  if (r.error) bag.set('dex', 'error', r.error, { source: src, mutability: 'transient' });
  const p = r.data;
  if (!p) return;
  const trans = { source: src, mutability: 'transient' as const };
  const immut = { source: src, mutability: 'immutable' as const };

  bag.set('dex', 'pair_address', p.pairAddress, immut);
  bag.set('dex', 'dex_id', p.dexId, immut);
  bag.set('dex', 'chain_id', p.chainId, immut);
  bag.set('dex', 'url', p.url, immut);
  bag.set('dex', 'pair_created_at', p.pairCreatedAt, immut);
  bag.set('dex', 'quote_symbol', p.quoteToken?.symbol, immut);
  bag.set('dex', 'base_symbol', p.baseToken?.symbol, immut);
  bag.set('dex', 'base_name', p.baseToken?.name, immut);

  bag.set('dex', 'price_usd', p.priceUsd ? Number(p.priceUsd) : null, trans);
  bag.set('dex', 'price_native', p.priceNative ? Number(p.priceNative) : null, trans);
  bag.set('dex', 'liquidity_usd', p.liquidity?.usd ?? null, trans);
  bag.set('dex', 'liquidity_base', p.liquidity?.base ?? null, trans);
  bag.set('dex', 'liquidity_quote', p.liquidity?.quote ?? null, trans);
  bag.set('dex', 'fdv', p.fdv ?? null, trans);
  bag.set('dex', 'market_cap', p.marketCap ?? null, trans);

  for (const w of ['m5', 'h1', 'h6', 'h24']) {
    bag.set('dex.volume', w, p.volume?.[w] ?? null, trans);
    bag.set('dex.price_change', w, p.priceChange?.[w] ?? null, trans);
    bag.set('dex.txns', w, p.txns?.[w] ?? null, trans);
  }

  if (p.info?.socials?.length) bag.set('dex.info', 'socials', p.info.socials, immut);
  if (p.info?.websites?.length) bag.set('dex.info', 'websites', p.info.websites, immut);
  if (p.info?.imageUrl) bag.set('dex.info', 'image_url', p.info.imageUrl, immut);
  if (p.info?.header) bag.set('dex.info', 'header_url', p.info.header, immut);

  if (p.boosts?.active != null) bag.set('dex', 'boosts_active', p.boosts.active, trans);
}

function loadHelius(bag: VarBag, asset: any, supply: any) {
  const src = 'helius';
  const immut = { source: src, mutability: 'immutable' as const };
  const trans = { source: src, mutability: 'transient' as const };

  if (asset) {
    const auth = asset.authorities || [];
    const mintAuth = auth.find((a: any) => (a.scopes || []).includes('full'))?.address ?? null;
    bag.set('helius', 'mint_authority', mintAuth, immut);
    bag.set('helius', 'interface', asset.interface, immut);
    bag.set('helius.content', 'name', asset.content?.metadata?.name, immut);
    bag.set('helius.content', 'symbol', asset.content?.metadata?.symbol, immut);
    bag.set('helius.content', 'description', asset.content?.metadata?.description, immut);
    bag.set('helius.content', 'image', asset.content?.links?.image || asset.content?.files?.[0]?.uri, immut);
    bag.set('helius.content', 'metadata_uri', asset.content?.json_uri, immut);
    if (asset.creators?.length) bag.set('helius', 'creators', asset.creators, immut);
    if (asset.royalty) bag.set('helius', 'royalty', asset.royalty, immut);
    if (asset.token_info) {
      bag.set('helius.token_info', 'supply', asset.token_info.supply, trans);
      bag.set('helius.token_info', 'decimals', asset.token_info.decimals, immut);
      bag.set('helius.token_info', 'token_program', asset.token_info.token_program, immut);
      bag.set('helius.token_info', 'freeze_authority', asset.token_info.freeze_authority ?? null, immut);
      bag.set('helius.token_info', 'mint_authority', asset.token_info.mint_authority ?? null, immut);
      bag.set('helius.token_info', 'price_info', asset.token_info.price_info, trans);
    }
  }
  if (supply) {
    bag.set('helius.supply', 'amount', supply.amount, trans);
    bag.set('helius.supply', 'decimals', supply.decimals, immut);
    bag.set('helius.supply', 'ui_amount', supply.uiAmount, trans);
    bag.set('helius.supply', 'ui_amount_string', supply.uiAmountString, trans);
  }
}

function loadPumpFun(bag: VarBag, r: Awaited<ReturnType<typeof fetchPumpFun>>) {
  const src = 'pumpfun';
  bag.set('pumpfun', 'ok', r.data != null, { source: src, mutability: 'transient' });
  const d = r.data;
  if (!d) return;
  const immut = { source: src, mutability: 'immutable' as const };
  const trans = { source: src, mutability: 'transient' as const };
  bag.set('pumpfun', 'name', d.name, immut);
  bag.set('pumpfun', 'symbol', d.symbol, immut);
  bag.set('pumpfun', 'description', d.description, immut);
  bag.set('pumpfun', 'image_uri', d.image_uri, immut);
  bag.set('pumpfun', 'metadata_uri', d.metadata_uri, immut);
  bag.set('pumpfun', 'twitter', d.twitter, immut);
  bag.set('pumpfun', 'telegram', d.telegram, immut);
  bag.set('pumpfun', 'website', d.website, immut);
  bag.set('pumpfun', 'creator', d.creator, immut);
  bag.set('pumpfun', 'created_timestamp', d.created_timestamp, immut);
  bag.set('pumpfun', 'bonding_curve', d.bonding_curve, immut);
  bag.set('pumpfun', 'associated_bonding_curve', d.associated_bonding_curve, immut);
  bag.set('pumpfun', 'raydium_pool', d.raydium_pool, trans);
  bag.set('pumpfun', 'complete', d.complete, trans);
  bag.set('pumpfun', 'king_of_the_hill_timestamp', d.king_of_the_hill_timestamp, trans);
  bag.set('pumpfun', 'market_cap', d.market_cap, trans);
  bag.set('pumpfun', 'usd_market_cap', d.usd_market_cap, trans);
  bag.set('pumpfun', 'reply_count', d.reply_count, trans);
  bag.set('pumpfun', 'nsfw', d.nsfw, immut);
  bag.set('pumpfun', 'creator_username', d.creator_username, immut);
  bag.set('pumpfun', 'profile_image', d.profile_image, trans);
}

// ---------------------------------------------------------------------------
// Stage 3 — reuse existing holders tables (no expensive re-fetch)
// ---------------------------------------------------------------------------

async function loadHoldersFromDb(bag: VarBag, supabase: any, mint: string) {
  const src = 'holders_db';
  const trans = { source: src, mutability: 'transient' as const };

  const { data: daily } = await supabase
    .from('holder_daily_summary')
    .select('*')
    .eq('token_mint', mint)
    .order('summary_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (daily) {
    bag.set('holders', 'count', daily.total_holders, trans);
    bag.set('holders', 'top10_pct', daily.top10_holder_pct, trans);
    bag.set('holders', 'top25_pct', daily.top25_holder_pct, trans);
    bag.set('holders', 'total_usd_value', daily.total_usd_value, trans);
    bag.set('holders', 'avg_balance', daily.avg_balance, trans);
    bag.set('holders', 'median_balance', daily.median_balance, trans);
    bag.set('holders', 'net_flow_usd', daily.net_flow_usd, trans);
    bag.set('holders', 'whale_movements', daily.whale_movements, trans);
    bag.set('holders.tier_counts', 'whale', daily.whale_count, trans);
    bag.set('holders.tier_counts', 'shark', daily.shark_count, trans);
    bag.set('holders.tier_counts', 'dolphin', daily.dolphin_count, trans);
    bag.set('holders.tier_counts', 'fish', daily.fish_count, trans);
    bag.set('holders.tier_counts', 'shrimp', daily.shrimp_count, trans);
    bag.set('holders.flow', 'buys', daily.buys, trans);
    bag.set('holders.flow', 'sells', daily.sells, trans);
    bag.set('holders.flow', 'accumulations', daily.accumulations, trans);
    bag.set('holders.flow', 'distributions', daily.distributions, trans);
    bag.set('holders', 'summary_date', daily.summary_date, trans);
  }

  const { data: seen } = await supabase
    .from('holders_intel_seen_tokens')
    .select('*')
    .eq('token_mint', mint)
    .maybeSingle();
  if (seen) {
    const immut = { source: 'holders_intel_seen', mutability: 'immutable' as const };
    bag.set('token', 'symbol', seen.symbol, immut);
    bag.set('token', 'name', seen.name, immut);
    bag.set('token', 'first_seen_at', seen.first_seen_at, immut);
    bag.set('token', 'launchpad', seen.launchpad, immut);
    bag.set('token', 'creator_wallet', seen.creator_wallet, immut);
    bag.set('token', 'twitter_url', seen.twitter_url, immut);
    bag.set('token', 'telegram_url', seen.telegram_url, immut);
    bag.set('token', 'website_url', seen.website_url, immut);
    bag.set('token', 'description', seen.description, immut);
    bag.set('token', 'image_uri', seen.image_uri, immut);
    bag.set('token', 'entry_mcap_usd', seen.entry_mcap_usd, immut);
    bag.set('token', 'last_seen_at', seen.last_seen_at, { source: 'holders_intel_seen', mutability: 'transient' });
    bag.set('token', 'times_seen', seen.times_seen, { source: 'holders_intel_seen', mutability: 'transient' });
    bag.set('token', 'health_grade', seen.health_grade, { source: 'holders_intel_seen', mutability: 'transient' });
  }

  const { data: life } = await supabase
    .from('telegram_insider_token_lifecycle')
    .select('token_symbol, entry_market_cap, peak_multiplier, peak_market_cap, peak_reached_at, is_rugged, creator_wallet, creator_risk_tier, milestone_count, lifespan_minutes, mesh_promotion_status')
    .eq('token_mint', mint)
    .maybeSingle();
  if (life) {
    const immut = { source: 'insider_lifecycle', mutability: 'immutable' as const };
    bag.set('lifecycle', 'entry_market_cap', life.entry_market_cap, immut);
    bag.set('lifecycle', 'creator_wallet', life.creator_wallet, immut);
    bag.set('lifecycle', 'creator_risk_tier', life.creator_risk_tier, { source: 'insider_lifecycle', mutability: 'transient' });
    bag.set('lifecycle', 'peak_multiplier', life.peak_multiplier, { source: 'insider_lifecycle', mutability: 'transient' });
    bag.set('lifecycle', 'peak_market_cap', life.peak_market_cap, { source: 'insider_lifecycle', mutability: 'transient' });
    bag.set('lifecycle', 'peak_reached_at', life.peak_reached_at, { source: 'insider_lifecycle', mutability: 'transient' });
    bag.set('lifecycle', 'is_rugged', life.is_rugged, { source: 'insider_lifecycle', mutability: 'transient' });
    bag.set('lifecycle', 'milestone_count', life.milestone_count, { source: 'insider_lifecycle', mutability: 'transient' });
    bag.set('lifecycle', 'lifespan_minutes', life.lifespan_minutes, { source: 'insider_lifecycle', mutability: 'transient' });
    bag.set('lifecycle', 'mesh_promotion_status', life.mesh_promotion_status, { source: 'insider_lifecycle', mutability: 'transient' });
  }

  // Bad actor + CTO status
  const { data: cto } = await supabase
    .from('token_cto_status')
    .select('is_cto, confidence_score, detected_at')
    .eq('token_mint', mint)
    .maybeSingle();
  if (cto) {
    bag.set('cto', 'is_cto', cto.is_cto, { source: 'cto', mutability: 'transient' });
    bag.set('cto', 'confidence_score', cto.confidence_score, { source: 'cto', mutability: 'transient' });
    bag.set('cto', 'detected_at', cto.detected_at, { source: 'cto', mutability: 'immutable' });
  }
}

// ---------------------------------------------------------------------------
// Stage 4 — derived calcs + optional Gemini narrative
// ---------------------------------------------------------------------------

function computeDerived(bag: VarBag) {
  const src = 'calc';
  const trans = { source: src, mutability: 'transient' as const };
  const get = (k: string) => bag.get(k)?.value as any;
  const num = (k: string) => { const v = get(k); return typeof v === 'number' && Number.isFinite(v) ? v : null; };

  const liq = num('dex.liquidity_usd');
  const mcap = num('dex.market_cap') ?? num('pumpfun.usd_market_cap');
  if (liq != null && mcap && mcap > 0) bag.set('calc', 'liquidity_to_mcap', liq / mcap, trans);
  const vol24 = num('dex.volume.h24');
  if (vol24 != null && liq && liq > 0) bag.set('calc', 'volume_to_liquidity', vol24 / liq, trans);

  const created = num('dex.pair_created_at') ?? num('pumpfun.created_timestamp');
  if (created) {
    const ageMin = Math.floor((Date.now() - created) / 60000);
    bag.set('calc', 'age_minutes', ageMin, trans);
    const bucket = ageMin < 60 ? 'new'
      : ageMin < 60 * 24 ? 'today'
      : ageMin < 60 * 24 * 7 ? 'week' : 'older';
    bag.set('calc', 'age_bucket', bucket, trans);
  }

  // Divergence agreement across bots
  const divKeys = bag.keys().filter((k) => k.startsWith('bb.union.divergence.'));
  bag.set('calc', 'bot_agreement', divKeys.length === 0, trans);
  bag.set('calc', 'bot_divergence_count', divKeys.length, trans);

  // Risk flags
  const flags: string[] = [];
  const mintAuth = get('helius.token_info.mint_authority') ?? get('helius.mint_authority');
  if (mintAuth) flags.push('mint_authority_live');
  const freezeAuth = get('helius.token_info.freeze_authority');
  if (freezeAuth) flags.push('freeze_authority_live');
  if (liq != null && liq < 5000) flags.push('low_liquidity');
  const top10 = num('holders.top10_pct') ?? num('bb.union.parsed.top10_holders_pct');
  if (top10 != null && top10 > 30) flags.push('top10_high');
  if (divKeys.length > 2) flags.push('divergent_bot_data');
  bag.set('risk', 'flags', flags, trans);
  bag.set('risk', 'score_0_100', Math.max(0, 100 - flags.length * 15), trans);
}

async function computeAiNarrative(bag: VarBag) {
  if (!LOVABLE_AI_KEY) return;
  try {
    // Feed a compressed view of the bag (values only) to keep prompt small.
    const compressed: Record<string, any> = {};
    for (const [k, leaf] of Object.entries(bag.toJson())) {
      if (k.startsWith('bb.') && k.includes('.raw_text')) continue;
      if (k.startsWith('bb.') && k.includes('.numbers')) continue;
      compressed[k] = leaf.value;
    }
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_AI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You inspect crypto token telemetry and reply ONLY with strict JSON matching: {"one_liner":"","thesis":"","red_flags":[],"green_flags":[],"suggested_action":""}. Keep each string under 240 chars. Base every claim on the input.' },
          { role: 'user', content: JSON.stringify(compressed).slice(0, 12000) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) { console.warn('[enrich-token] AI gateway HTTP', r.status); return; }
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content;
    if (!raw) return;
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return; }
    const src = 'ai.gemini';
    const trans = { source: src, mutability: 'transient' as const };
    bag.set('ai', 'one_liner', parsed.one_liner, trans);
    bag.set('ai', 'thesis', parsed.thesis, trans);
    if (Array.isArray(parsed.red_flags)) bag.set('ai', 'red_flags', parsed.red_flags, trans);
    if (Array.isArray(parsed.green_flags)) bag.set('ai', 'green_flags', parsed.green_flags, trans);
    bag.set('ai', 'suggested_action', parsed.suggested_action, trans);
  } catch (e: any) { console.warn('[enrich-token] AI narrative failed', e?.message); }
}

// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let payload: any = {};
  try { payload = await req.json(); } catch { /* allow empty for manual triggers */ }
  const runId: string | undefined = payload.runId || payload.run_id;
  const tokenMint: string | undefined = payload.tokenMint || payload.token_mint;
  const skipAi: boolean = !!payload.skipAi;

  if (!runId || !tokenMint) {
    return new Response(JSON.stringify({ ok: false, error: 'runId + tokenMint required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Load existing bag
  const { data: run } = await supabase
    .from('blackbox_aggregator_runs')
    .select('id, token_mint, var_bag_jsonb')
    .eq('id', runId)
    .maybeSingle();
  if (!run) {
    return new Response(JSON.stringify({ ok: false, error: 'run not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const bag = new VarBag((run.var_bag_jsonb as any) || {});
  bag.set('meta', 'token_mint', tokenMint, { source: 'system', mutability: 'immutable' });
  bag.set('meta', 'run_id', runId, { source: 'system', mutability: 'immutable' });

  // Stage 2 — parallel provider fanout
  const [dex, asset, supply, pf] = await Promise.all([
    fetchDexScreener(tokenMint),
    fetchHeliusAsset(tokenMint),
    fetchHeliusSupply(tokenMint),
    fetchPumpFun(tokenMint),
  ]);
  loadDex(bag, dex);
  loadHelius(bag, asset.data, supply.data);
  loadPumpFun(bag, pf);
  await bag.persist(supabase, runId, tokenMint, 'enrich');

  // Stage 3 — holders from DB
  try { await loadHoldersFromDb(bag, supabase, tokenMint); } catch (e) { console.warn('[enrich-token] holders db failed', (e as any)?.message); }
  await bag.persist(supabase, runId, tokenMint, 'holders');

  // Stage 4 — derived + AI
  computeDerived(bag);
  if (!skipAi) await computeAiNarrative(bag);
  bag.set('narrative', 'template_ready', bag.get('dex.price_usd') != null || bag.get('pumpfun.usd_market_cap') != null,
    { source: 'system', mutability: 'transient' });
  await bag.persist(supabase, runId, tokenMint, 'complete');

  return new Response(JSON.stringify({
    ok: true,
    counts: bag.counts(),
    total_keys: bag.keys().length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});