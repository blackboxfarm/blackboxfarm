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

/** Short humanised mint-ago, e.g. "42m", "3h 12m", "2d 4h". */
function fmtMintAgo(mintTs: number | null | undefined): string {
  if (!mintTs) return DASH;
  const ms = Date.now() - mintTs;
  if (ms <= 0) return DASH;
  const sec = Math.floor(ms / 1000);
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** Computer-style timestamp, e.g. "2026-05-28 18:42 UTC". */
function fmtMintStamp(mintTs: number | null | undefined): string {
  if (!mintTs) return DASH;
  const d = new Date(mintTs);
  if (isNaN(d.getTime())) return DASH;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** 10-segment block progress bar for bonding curve. */
function fmtBondingBar(pct: number | null | undefined): string {
  if (pct == null || !isFinite(pct)) return DASH;
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
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

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', ar: 'Arabic', ja: 'Japanese',
  zh: 'Mandarin Chinese', tr: 'Turkish', 'pt-BR': 'Brazilian Portuguese',
  ko: 'Korean', id: 'Indonesian', es: 'Spanish', ru: 'Russian', vi: 'Vietnamese',
};

/** Full re-render translation via Lovable AI Gateway. Preserves numbers/URLs/Markdown. */
async function translateText(text: string, langCode: string): Promise<string | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return null;
  const langName = LANGUAGE_NAMES[langCode] || langCode;
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content:
          `Translate the user message into ${langName}. Rules:\n` +
          `- Translate EVERY natural-language word, including section labels and headers.\n` +
          `- Do NOT translate numbers, percentages, money amounts, URLs, $TICKER symbols, contract addresses, or emoji.\n` +
          `- Preserve Telegram Markdown exactly (*bold*, _italic_, \`code\`, [text](url)) and all line breaks.\n` +
          `- Output ONLY the translated text, no preface or quotes.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
    }),
  });
  if (!r.ok) {
    console.error('[translate] gateway error', r.status, await r.text().catch(() => ''));
    return null;
  }
  const j = await r.json();
  return j?.choices?.[0]?.message?.content?.trim() || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { mint, channel: rawChannel, multiplier: rawMultiplier, dry_run, kind: rawKind } = await req.json();
    if (!mint || typeof mint !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'mint required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const channel: 'default' | 'public' | 'private' =
      rawChannel === 'public' || rawChannel === 'private' ? rawChannel : 'default';
    const kind: 'snapshot' | 'big_picture' = rawKind === 'snapshot' ? 'snapshot' : 'big_picture';
    const multiplierNum = typeof rawMultiplier === 'number' && isFinite(rawMultiplier) && rawMultiplier > 0
      ? rawMultiplier : null;
    const multiplierLabel = multiplierNum
      ? (Number.isInteger(multiplierNum) ? `${multiplierNum}x` : `${multiplierNum.toFixed(1)}x`)
      : '';
    const multiplierLine = multiplierNum ? `🚀 RE-SIGHTING: ${multiplierLabel}` : '';
    // Snapshot kind uses a dedicated minimal template (private only). Fallback to
    // the standard private template if the snapshot template isn't configured.
    const primaryTemplateName =
      kind === 'snapshot'
        ? 'no_lube_snapshot_private'
        : (channel === 'public' ? 'no_lube_public'
           : channel === 'private' ? 'no_lube_private'
           : 'no_lube');
    const fallbackTemplateName = kind === 'snapshot' ? 'no_lube_private' : null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const sources: Record<string, string> = {};

    // Pull the latest hourly health snapshot for wallet-distribution vars so the
    // post isn't full of "—" when /holders has already been refreshed.
    const { data: healthRow } = await supabase
      .from('token_health_snapshots')
      .select('dust_percentage, whale_count, total_holders, real_holders, top10_pct, health_score, health_grade, snapshot_hour')
      .eq('token_mint', mint)
      .order('snapshot_hour', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (healthRow) sources.health = 'token_health_snapshots';

    // Pull the 4-bucket Wallet Distribution from bagless-holders-report (same
    // source the /quick TG reply uses). Skipped on snapshot kind since snapshot
    // is supposed to fire fast with zero enrichment cost.
    let simpleTiers: any = null;
    if (kind === 'big_picture') {
      try {
        const baglessResp = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/bagless-holders-report`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ tokenMint: mint }),
          },
        );
        if (baglessResp.ok) {
          const baglessData = await baglessResp.json();
          simpleTiers = baglessData?.simpleTiers ?? null;
          if (simpleTiers) sources.distribution = 'bagless-holders-report';
        }
      } catch (e) {
        console.error('[no-lube-compose] bagless-holders-report fetch failed', e);
      }
    }

    // 1) Template — per-channel/kind, with snapshot fallback to private template
    const { data: tplRow } = await supabase
      .from('holders_intel_templates')
      .select('template_text')
      .eq('template_name', primaryTemplateName)
      .maybeSingle();
    let tplText = tplRow?.template_text || null;
    if (!tplText && fallbackTemplateName) {
      const { data: fb } = await supabase
        .from('holders_intel_templates')
        .select('template_text')
        .eq('template_name', fallbackTemplateName)
        .maybeSingle();
      tplText = fb?.template_text || null;
    }
    // Hard-coded snapshot fallback if no template at all exists yet.
    if (!tplText && kind === 'snapshot') {
      tplText =
        '⚡ *SNAPSHOT* — ${ticker}\n' +
        '`{ca}`\n\n' +
        '💰 MC: {mc}  ·  Entry: {mcEntry}\n' +
        '💧 LP: {lp}  ·  📊 24h Vol: {vol24h}\n' +
        '👥 Top10: {top10}\n' +
        '⏱ Mint: {mint_ago} ago\n\n' +
        '🔗 [Chart]({chartUrl}) · [Bubble]({bubbleMapUrl}) · [Buy]({buyUrl})\n\n' +
        '_Full intel incoming…_';
    }
    const tpl = tplText || '🐸 *${ticker}*\n{momentum} · {risk} · {verdict}';

    // 1b) Shared global profile (language + style) + per-tab profile (nickname + TG title)
    //     + ordered socials list (shared across all 3 tabs).
    let language = 'en';
    let style = 'degen';
    const profileVars: Record<string, string> = {
      profileXHandle: DASH,
      profileInstagramHandle: DASH,
      profileTiktokHandle: DASH,
      profileChannelTitle: DASH,
      profileTabNickname: DASH,
      profileTelegramLink: DASH,
      profileStyle: style,
    };
    const { data: gprof } = await supabase
      .from('no_lube_global_profile').select('language, style').eq('id', 'singleton').maybeSingle();
    if (gprof) {
      language = gprof.language || 'en';
      style = gprof.style || 'degen';
      profileVars.profileStyle = style;
    }
    const { data: tprof } = await supabase
      .from('no_lube_channel_profiles').select('*').eq('kind', channel).maybeSingle();
    if (tprof) {
      profileVars.profileTabNickname = tprof.tab_nickname || DASH;
      profileVars.profileTelegramLink = tprof.telegram_link || DASH;
      profileVars.profileChannelTitle = tprof.telegram_chat_title || DASH;
    }
    const { data: socials } = await supabase
      .from('no_lube_socials').select('platform, handle').order('display_order', { ascending: true });
    for (const s of (socials || [])) {
      const p = String(s.platform || '').toLowerCase();
      if (p === 'x' && profileVars.profileXHandle === DASH) profileVars.profileXHandle = s.handle || DASH;
      if (p === 'instagram' && profileVars.profileInstagramHandle === DASH) profileVars.profileInstagramHandle = s.handle || DASH;
      if (p === 'tiktok' && profileVars.profileTiktokHandle === DASH) profileVars.profileTiktokHandle = s.handle || DASH;
    }

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

    // Seen-token row (entry mcap + persisted mint timestamp + immutable entry floor)
    const { data: seenRow } = await supabase
      .from('holders_intel_seen_tokens')
      .select('market_cap_at_discovery, minted_at, entry_mcap_usd')
      .eq('token_mint', mint)
      .maybeSingle();
    if (seenRow) sources.seen = 'holders_intel_seen_tokens';

    // Lowest mcap we've ever observed for this token across the ranking history.
    const { data: minRow } = await supabase
      .from('token_rankings')
      .select('market_cap')
      .eq('token_mint', mint)
      .not('market_cap', 'is', null)
      .order('market_cap', { ascending: true })
      .limit(1)
      .maybeSingle();
    const historicalMin = minRow?.market_cap != null ? Number(minRow.market_cap) : null;

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

    // Resolve mint timestamp: prefer persisted DB value, fall back to Helius probe.
    const dbMintTs = seenRow?.minted_at ? new Date(seenRow.minted_at).getTime() : null;
    const effectiveMintTs = dbMintTs || mintTs || null;

    // ---- IMMUTABLE ENTRY MC (ratchet-down only) ----
    // entry_mcap_usd on holders_intel_seen_tokens is the locked floor. It is
    // computed as the minimum of every MC signal we've ever observed and is
    // only ever updated DOWNWARD — never up, never back to null. This is the
    // value the templates render as {mcEntry} and what milestone math compares
    // against, so 2x/3x labels remain stable even when sources fluctuate.
    const persistedEntry = seenRow?.entry_mcap_usd != null ? Number(seenRow.entry_mcap_usd) : null;
    const entryCandidates = [
      persistedEntry,
      seenRow?.market_cap_at_discovery != null ? Number(seenRow.market_cap_at_discovery) : null,
      historicalMin,
      mcUsd,
    ].filter((v): v is number => v != null && isFinite(v) && v > 0);
    const candidateEntry = entryCandidates.length ? Math.min(...entryCandidates) : null;
    let mcEntryVal: number | null = persistedEntry;
    if (candidateEntry != null) {
      if (persistedEntry == null || candidateEntry < persistedEntry) {
        // Ratchet the floor DOWN and persist. Never update if candidate >= persisted.
        try {
          await supabase
            .from('holders_intel_seen_tokens')
            .update({ entry_mcap_usd: candidateEntry })
            .eq('token_mint', mint);
          mcEntryVal = candidateEntry;
        } catch (e) {
          console.error('[no-lube-compose] entry_mcap_usd ratchet failed', e);
          mcEntryVal = persistedEntry ?? candidateEntry;
        }
      } else {
        mcEntryVal = persistedEntry;
      }
    }

    // Bonding/progress copy varies by bonded vs still-on-curve.
    const bondingBar = fmtBondingBar(bondPct);
    const bondingPctStr = bondPct != null ? bondPct.toFixed(0) : DASH;
    const ageHuman = fmtAge(ageMs);
    const progressLine = bondPct != null
      ? `${bondingBar} ${bondingPctStr}% Bonding`
      : `Bonded! ${ageHuman} ago`;

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
    // Fall back to the health snapshot's top10 when on-chain probe didn't yield it.
    if (top10Pct == null && healthRow?.top10_pct != null) {
      top10Pct = Number(healthRow.top10_pct);
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
      mcEntry: fmtMoney(mcEntryVal),
      mcChange: fmtPct(ch24, true),
      vol24h: fmtMoney(vol24),
      lp: fmtMoney(liq),
      age: fmtAge(ageMs),
      mintTime: fmtMintTime(mintTs),
      mint_ago: fmtMintAgo(effectiveMintTs),
      mint_stamp: fmtMintStamp(effectiveMintTs),
      bondingbar: bondingBar,
      bondingpct: bondingPctStr,
      progress: progressLine,
      bondingState,
      top10: top10Pct != null ? `${top10Pct.toFixed(1)}%` : DASH,
      freshWallets: healthRow?.dust_percentage != null
        ? `${Number(healthRow.dust_percentage).toFixed(1)}% dust`
        : DASH,
      walletSpread: healthRow?.real_holders != null && healthRow?.total_holders != null
        ? `${healthRow.real_holders}/${healthRow.total_holders} real`
        : DASH,
      bundledRisk: healthRow?.whale_count != null
        ? `${healthRow.whale_count} whales`
        : DASH,
      // ── Wallet Distribution buckets (from bagless-holders-report.simpleTiers) ──
      whalesPct: simpleTiers?.whales?.percentage != null ? `${Math.round(simpleTiers.whales.percentage)}%` : DASH,
      seriousPct: simpleTiers?.serious?.percentage != null ? `${Math.round(simpleTiers.serious.percentage)}%` : DASH,
      retailPct: simpleTiers?.retail?.percentage != null ? `${Math.round(simpleTiers.retail.percentage)}%` : DASH,
      dustPct: simpleTiers?.dust?.percentage != null ? `${Math.round(simpleTiers.dust.percentage)}%` : DASH,
      whalesBar: simpleTiers?.whales?.percentage != null ? fmtBondingBar(simpleTiers.whales.percentage) : '░░░░░░░░░░',
      seriousBar: simpleTiers?.serious?.percentage != null ? fmtBondingBar(simpleTiers.serious.percentage) : '░░░░░░░░░░',
      retailBar: simpleTiers?.retail?.percentage != null ? fmtBondingBar(simpleTiers.retail.percentage) : '░░░░░░░░░░',
      dustBar: simpleTiers?.dust?.percentage != null ? fmtBondingBar(simpleTiers.dust.percentage) : '░░░░░░░░░░',
      walletDistBlock: simpleTiers
        ? [
            `\`Whales  ${fmtBondingBar(simpleTiers.whales?.percentage ?? 0)} ${Math.round(simpleTiers.whales?.percentage ?? 0)}%\`  >$1K`,
            `\`Serious ${fmtBondingBar(simpleTiers.serious?.percentage ?? 0)} ${Math.round(simpleTiers.serious?.percentage ?? 0)}%\`  $200-$1K`,
            `\`Retail  ${fmtBondingBar(simpleTiers.retail?.percentage ?? 0)} ${Math.round(simpleTiers.retail?.percentage ?? 0)}%\`  $1-$199`,
            `\`Dust    ${fmtBondingBar(simpleTiers.dust?.percentage ?? 0)} ${Math.round(simpleTiers.dust?.percentage ?? 0)}%\`  <$1`,
          ].join('\n')
        : DASH,
      realHolders: healthRow?.real_holders != null ? String(healthRow.real_holders) : DASH,
      totalHolders: healthRow?.total_holders != null ? String(healthRow.total_holders) : DASH,
      healthScore: healthRow?.health_score != null ? String(healthRow.health_score) : DASH,
      healthGrade: healthRow?.health_grade || DASH,
      aiBullet1: DASH,
      aiBullet2: DASH,
      aiBullet3: DASH,
      aiBullet4: DASH,
      fundedBy: DASH,
      pastLaunches: DASH,
      rugs: DASH,
      devReputation: DASH,
      blackboxScore: healthRow?.health_grade
        ? `${healthRow.health_grade} (${healthRow.health_score ?? '—'})`
        : DASH,
      chartUrl: `https://dexscreener.com/solana/${mint}`,
      bubbleMapUrl: `https://blackbox.farm/bubble?token=${mint}`,
      intelUrl: `https://blackbox.farm/holders?token=${mint}`,
      buyUrl: `https://trade.padre.gg/rk/blackbox/trade/solana/${mint}`,
      scanHistoryUrl: `https://solscan.io/token/${mint}`,
      socialsUrl: `https://blackbox.farm/socials?token=${mint}`,
      twitterUrl: dex?.info?.socials?.find((s: any) => s.type === 'twitter')?.url || DASH,
      telegramUrl: dex?.info?.socials?.find((s: any) => s.type === 'telegram')?.url || DASH,
      websiteUrl: dex?.info?.websites?.[0]?.url || DASH,
      multiplier: multiplierLabel,
      multiplierLine,
      ...profileVars,
    };

    let text = renderTemplate(tpl, vars);

    // Optional full re-render translation when channel language is not English.
    // We translate the rendered text wholesale (labels + natural-language) but
    // preserve numbers, tickers, URLs, and Markdown via the model instructions.
    if (language && language !== 'en') {
      try {
        const translated = await translateText(text, language);
        if (translated && translated.trim().length > 0) text = translated;
      } catch (e) {
        console.error('[no-lube-compose] translation failed; using English', e);
      }
    }

    // Log the compose attempt (posted=false until push succeeds).
    // dry_run skips logging — used by orchestrate's mcap probe so we don't
    // pollute no_lube_post_log with rows that never get pushed.
    let logId: string | null = null;
    if (!dry_run) try {
      const { data: logRow } = await supabase
        .from('no_lube_post_log')
        .insert({
          token_mint: mint,
          ticker: String(ticker),
          channel,
          post_kind: kind,
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
      mcap: mcUsd,
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