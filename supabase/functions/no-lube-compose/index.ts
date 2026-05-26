// no-lube-compose — pulls every variable we can for the No Lube template.
// Source order per variable:
//   1) DB cache rows < 2 min old (token_rankings, token_optimistic_summary_cache, etc.)
//   2) DexScreener live
//   3) Solscan v2 Pro (skipped if SOLSCAN_DISABLED=true)
//   4) Helius DAS
// Anything we cannot resolve falls back to "—" so the template still renders.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FRESH_MS = 2 * 60 * 1000;
const DASH = '—';

const ICON = {
  momentum: { strong: '🚀', moderate: '➡️', fading: '📉', dash: DASH },
  risk: { low: '🟢', med: '🟡', high: '🔴', dead: '☠️', crazy: '🤯', dash: DASH },
  verdict: { send: '✅', tiny: '🤏', watch: '👀', pass: '⛔', dead: '☠️', crazy: '🤯', dash: DASH },
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return DASH;
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(n: number | null | undefined, withSign = true): string {
  if (n == null || !isFinite(n)) return DASH;
  const s = `${n.toFixed(1)}%`;
  return withSign && n > 0 ? `+${s}` : s;
}
function fmtAge(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return DASH;
  const sec = Math.floor(ms / 1000);
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}
function classifyMomentum(ch24: number | null | undefined): string {
  if (ch24 == null || !isFinite(ch24)) return DASH;
  if (ch24 >= 25) return '🟢 Strong';
  if (ch24 >= 0) return '🟡 Moderate';
  return '🔴 Fading';
}
function momentumIcon(ch24: number | null | undefined): string {
  if (ch24 == null || !isFinite(ch24)) return ICON.momentum.dash;
  if (ch24 >= 25) return ICON.momentum.strong;
  if (ch24 >= 0) return ICON.momentum.moderate;
  return ICON.momentum.fading;
}
function classifyRisk(liq: number | null | undefined, age_min: number | null | undefined): string {
  if (liq == null) return DASH;
  if (liq < 5_000) return '🔴 HIGH';
  if (liq < 25_000 || (age_min != null && age_min < 60)) return '🟡 MED';
  return '🟢 LOW';
}
function riskIcon(risk: string): string {
  if (risk.includes('HIGH')) return ICON.risk.high;
  if (risk.includes('MED')) return ICON.risk.med;
  if (risk.includes('LOW')) return ICON.risk.low;
  return ICON.risk.dash;
}
function classifyVerdict(momentum: string, risk: string): string {
  if (momentum.includes('Strong') && risk.includes('LOW')) return '✅ Send it';
  if (momentum.includes('Fading') || risk.includes('HIGH')) return '⛔ Pass';
  return '🤏 Tiny size only';
}
function verdictIcon(verdict: string): string {
  if (verdict.includes('Send')) return ICON.verdict.send;
  if (verdict.includes('Pass')) return ICON.verdict.pass;
  if (verdict.includes('Tiny')) return ICON.verdict.tiny;
  return ICON.verdict.watch;
}

function fmtMintTime(mintTs: number | null | undefined): string {
  if (!mintTs) return DASH;
  const ms = Date.now() - mintTs;
  if (ms < 0) return DASH;
  const sec = Math.floor(ms / 1000);
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} mins ago`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h} hrs ${m} mins ago`;
  }
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return `${d} days ${h} hrs ago`;
}

/**
 * Decide if this token is "crazy" (anomaly rocket), "dead" (rugged/dust),
 * or "healthy" (worth posting). Healthy is the only postable class.
 */
function classifyPostability(args: {
  ageMin: number | null;
  mcUsd: number | null;
  vol24: number | null;
  liq: number | null;
  ch24: number | null;
  ch5m: number | null;
  top10Pct: number | null;
  devSold: boolean;
}): { verdict_class: 'healthy' | 'crazy' | 'dead'; block_reason: string | null } {
  const { ageMin, mcUsd, vol24, liq, ch24, ch5m, top10Pct, devSold } = args;

  // DEAD checks
  if (ch24 != null && ch24 <= -80) {
    return { verdict_class: 'dead', block_reason: `Dead — 24h price ${ch24.toFixed(0)}%` };
  }
  if (devSold && liq != null && liq < 5000) {
    return { verdict_class: 'dead', block_reason: `Dead — dev sold + LP $${Math.round(liq)}` };
  }
  if (ageMin != null && ageMin > 60 && vol24 != null && vol24 < 1000) {
    return { verdict_class: 'dead', block_reason: `Dead — 24h vol $${Math.round(vol24)} on ${ageMin}m old token` };
  }

  // CRAZY checks
  if (ageMin != null && ageMin < 10) {
    if (mcUsd != null && mcUsd >= 500_000) {
      return { verdict_class: 'crazy', block_reason: `Anomaly — $${(mcUsd / 1e6).toFixed(2)}M MC in ${ageMin}m` };
    }
    if (vol24 != null && vol24 >= 500_000) {
      return { verdict_class: 'crazy', block_reason: `Anomaly — $${(vol24 / 1e6).toFixed(2)}M vol in ${ageMin}m` };
    }
    if (ch5m != null && ch5m >= 100) {
      return { verdict_class: 'crazy', block_reason: `Anomaly — ${ch5m.toFixed(0)}% in 5m` };
    }
  }
  if (top10Pct != null && top10Pct >= 80 && ageMin != null && ageMin < 30) {
    return { verdict_class: 'crazy', block_reason: `Anomaly — Top10 ${top10Pct.toFixed(0)}% on ${ageMin}m token` };
  }

  return { verdict_class: 'healthy', block_reason: null };
}

async function fetchDexScreener(mint: string) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!r.ok) return null;
    const j = await r.json();
    const pairs: any[] = j?.pairs || [];
    if (!pairs.length) return null;
    // Prefer SOL-quoted pair with highest liquidity
    pairs.sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
    return pairs[0];
  } catch (e) {
    console.error('[no-lube-compose] dexscreener fail', e);
    return null;
  }
}

async function fetchSolscan(mint: string) {
  if (Deno.env.get('SOLSCAN_DISABLED') === 'true') return null;
  const key = Deno.env.get('SOLSCAN_API_KEY');
  if (!key) return null;
  try {
    const headers = { token: key };
    const [metaR, holdersR] = await Promise.all([
      fetch(`https://pro-api.solscan.io/v2.0/token/meta?address=${mint}`, { headers }),
      fetch(`https://pro-api.solscan.io/v2.0/token/holders?address=${mint}&page=1&page_size=10`, { headers }),
    ]);
    const meta = metaR.ok ? await metaR.json() : null;
    const holders = holdersR.ok ? await holdersR.json() : null;
    return { meta: meta?.data, holders: holders?.data };
  } catch (e) {
    console.error('[no-lube-compose] solscan fail', e);
    return null;
  }
}

async function fetchHelius(mint: string) {
  const key = Deno.env.get('HELIUS_API_KEY');
  if (!key) return null;
  try {
    const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'no-lube', method: 'getAsset',
        params: { id: mint, displayOptions: { showFungible: true } },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.result || null;
  } catch (e) {
    console.error('[no-lube-compose] helius fail', e);
    return null;
  }
}

/** Earliest signature for the mint = mint creation time (Helius RPC). */
async function fetchMintTime(mint: string): Promise<number | null> {
  const key = Deno.env.get('HELIUS_API_KEY');
  if (!key) return null;
  try {
    // Walk back to the oldest signature; limit=1000 per call, max 3 hops.
    let before: string | null = null;
    let oldest: { signature: string; blockTime: number | null } | null = null;
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'mint-time', method: 'getSignaturesForAddress',
          params: [mint, { limit: 1000, before }],
        }),
      });
      if (!r.ok) break;
      const j = await r.json();
      const arr: any[] = j?.result || [];
      if (!arr.length) break;
      const last = arr[arr.length - 1];
      oldest = last;
      if (arr.length < 1000) break;
      before = last.signature;
    }
    return oldest?.blockTime ? oldest.blockTime * 1000 : null;
  } catch (e) {
    console.error('[no-lube-compose] mint-time fail', e);
    return null;
  }
}

/** Pump.fun bonding-curve progress; returns null if already bonded or not on pump. */
async function fetchBondingProgress(mint: string): Promise<number | null> {
  try {
    const r = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.complete === true) return null; // bonded
    const vSol = Number(j?.virtual_sol_reserves || 0) / 1e9;
    // Pump.fun graduates at ~85 SOL virtual reserve over a ~30 SOL initial
    const INIT = 30, GRAD = 115;
    const pct = Math.max(0, Math.min(99, ((vSol - INIT) / (GRAD - INIT)) * 100));
    return Number.isFinite(pct) ? pct : null;
  } catch {
    return null;
  }
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  // Support {ticker} and $\{ticker} variants
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\$?\\\\?\\{${k}\\}`, 'g');
    out = out.replace(re, v ?? DASH);
  }
  // Any leftover {something} → dash so we never leak raw vars to a channel.
  out = out.replace(/\$?\\?\{[a-zA-Z0-9_]+\}/g, DASH);
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { mint } = await req.json();
    if (!mint || typeof mint !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'mint required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const sources: Record<string, string> = {};

    // 1) Template
    const { data: tplRow } = await supabase
      .from('holders_intel_templates')
      .select('template_text')
      .eq('template_name', 'no_lube')
      .maybeSingle();
    const tpl = tplRow?.template_text || '🐸 *${ticker}*\n{momentum} · {risk} · {verdict}';

    // 2) DB cache (token_rankings most recent within 2 min)
    let cached: any = null;
    const { data: rankingRows } = await supabase
      .from('token_rankings')
      .select('*')
      .eq('token_mint', mint)
      .order('captured_at', { ascending: false })
      .limit(1);
    if (rankingRows?.length) {
      const r = rankingRows[0];
      const age = Date.now() - new Date(r.captured_at).getTime();
      if (age <= FRESH_MS) { cached = r; sources.cache = 'token_rankings'; }
    }

    // 3) DexScreener (live unless cache fresh)
    const dex = cached ? null : await fetchDexScreener(mint);
    if (dex) sources.dex = 'dexscreener.live';

    // 4) Solscan + Helius + mint-time + bonding in parallel
    const [sol, hel, mintTs, bondPct] = await Promise.all([
      fetchSolscan(mint),
      fetchHelius(mint),
      fetchMintTime(mint),
      fetchBondingProgress(mint),
    ]);
    if (sol) sources.solscan = 'solscan.v2';
    if (hel) sources.helius = 'helius.das';
    if (mintTs) sources.mintTime = 'helius.signatures';
    if (bondPct != null) sources.bonding = 'pumpfun';

    // ---- normalize ----
    const base = dex?.baseToken || {};
    const helContent = hel?.content?.metadata || {};
    const ticker =
      base.symbol ||
      sol?.meta?.symbol ||
      helContent.symbol ||
      (cached?.metadata as any)?.symbol ||
      mint.slice(0, 4);
    const name =
      base.name || sol?.meta?.name || helContent.name || ticker;

    const mcUsd =
      (cached?.market_cap as number | null) ??
      dex?.marketCap ??
      dex?.fdv ??
      null;
    const ch24 =
      (cached?.price_change_24h as number | null) ??
      dex?.priceChange?.h24 ??
      null;
    const ch5m = dex?.priceChange?.m5 ?? null;
    const vol24 =
      (cached?.volume_24h as number | null) ??
      dex?.volume?.h24 ??
      null;
    const liq =
      (cached?.liquidity_usd as number | null) ??
      dex?.liquidity?.usd ??
      null;
    const createdAt = dex?.pairCreatedAt ? Number(dex.pairCreatedAt) : null;
    const ageMs = createdAt ? Date.now() - createdAt : null;
    const ageMin = ageMs ? Math.floor(ageMs / 60000) : null;

    // Holder distribution (best effort)
    let top10Pct: number | null = null;
    const holderList: any[] = sol?.holders?.items || sol?.holders || [];
    if (Array.isArray(holderList) && holderList.length) {
      const supply = Number(sol?.meta?.supply ?? hel?.token_info?.supply ?? 0);
      if (supply > 0) {
        const sum = holderList.slice(0, 10).reduce((s, h) => s + Number(h.amount ?? h.value ?? 0), 0);
        top10Pct = (sum / supply) * 100;
      }
    }

    const momentum = classifyMomentum(ch24);
    const risk = classifyRisk(liq, ageMin);
    const verdict = classifyVerdict(momentum, risk);

    // Postability classifier (gates the Push button)
    const devSold = false; // signal not wired yet; keep neutral
    const { verdict_class, block_reason } = classifyPostability({
      ageMin, mcUsd, vol24, liq, ch24, ch5m, top10Pct, devSold,
    });

    // Bonding state copy
    const bondingState = bondPct != null
      ? `Not Yet Bonded! ${bondPct.toFixed(0)}% Bonding Curve!`
      : '';

    const mIcon = verdict_class === 'crazy' ? ICON.risk.crazy : verdict_class === 'dead' ? ICON.risk.dead : momentumIcon(ch24);
    const rIcon = verdict_class === 'crazy' ? ICON.risk.crazy : verdict_class === 'dead' ? ICON.risk.dead : riskIcon(risk);
    const vIcon = verdict_class === 'crazy' ? ICON.verdict.crazy : verdict_class === 'dead' ? ICON.verdict.dead : verdictIcon(verdict);

    const vars: Record<string, string> = {
      ticker: String(ticker),
      name: String(name),
      ca: mint,
      momentum,
      risk,
      verdict,
      momentumIcon: mIcon,
      riskIcon: rIcon,
      verdictIcon: vIcon,
      mc: fmtMoney(mcUsd),
      mcChange: fmtPct(ch24, true),
      vol24h: fmtMoney(vol24),
      lp: fmtMoney(liq),
      age: fmtAge(ageMs),
      mintTime: fmtMintTime(mintTs),
      bondingState,
      top10: top10Pct != null ? `${top10Pct.toFixed(1)}%` : DASH,
      freshWallets: DASH,
      walletSpread: DASH,
      bundledRisk: DASH,
      aiBullet1: DASH,
      aiBullet2: DASH,
      aiBullet3: DASH,
      aiBullet4: DASH,
      fundedBy: DASH,
      pastLaunches: DASH,
      rugs: DASH,
      devReputation: DASH,
      blackboxScore: DASH,
      chartUrl: `https://dexscreener.com/solana/${mint}`,
      bubbleMapUrl: `https://blackbox.farm/bubble?token=${mint}`,
      intelUrl: `https://blackbox.farm/holders?token=${mint}`,
      buyUrl: `https://trade.padre.gg/rk/blackbox/trade/solana/${mint}`,
      scanHistoryUrl: `https://solscan.io/token/${mint}`,
      socialsUrl: `https://blackbox.farm/socials?token=${mint}`,
      twitterUrl: dex?.info?.socials?.find((s: any) => s.type === 'twitter')?.url || DASH,
      telegramUrl: dex?.info?.socials?.find((s: any) => s.type === 'telegram')?.url || DASH,
      websiteUrl: dex?.info?.websites?.[0]?.url || DASH,
    };

    const text = renderTemplate(tpl, vars);

    // Log the compose attempt (posted=false until push succeeds)
    let logId: string | null = null;
    try {
      const { data: logRow } = await supabase
        .from('no_lube_post_log')
        .insert({
          token_mint: mint,
          ticker: String(ticker),
          verdict_class,
          posted: false,
          block_reason,
          mcap: mcUsd,
          vol_24h: vol24,
          liq_usd: liq,
          price_change_24h: ch24,
          top10_pct: top10Pct,
          age_minutes: ageMin,
          mint_time: mintTs ? new Date(mintTs).toISOString() : null,
        })
        .select('id')
        .single();
      logId = logRow?.id ?? null;
    } catch (e) {
      console.error('[no-lube-compose] log insert failed', e);
    }

    return new Response(JSON.stringify({
      ok: true,
      text,
      vars,
      sources,
      verdict_class,
      post_eligible: verdict_class === 'healthy',
      block_reason,
      log_id: logId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[no-lube-compose] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});