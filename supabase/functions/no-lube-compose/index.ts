// no-lube-compose — pulls every variable we can for the No Lube template.
// Source order per variable:
//   1) DB cache rows < 2 min old (token_rankings, token_optimistic_summary_cache, etc.)
//   2) DexScreener live
//   3) Solscan v2 Pro (skipped if SOLSCAN_DISABLED=true)
//   4) Helius DAS
// Anything we cannot resolve falls back to "—" so the template still renders.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchDexBanner } from '../_shared/dexscreener-banner.ts';
import { assertUpdate } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FRESH_MS = 2 * 60 * 1000;
// Spec: any {var} we cannot resolve renders as the literal word "pending" so
// operators can see at a glance which fields the mesh has filled in at this
// stage of enrichment. DASH is intentionally a word, not an em-dash.
const DASH = 'pending';

// Collapse the "🤖 BlackBox AI" bullet block:
//   - drop bullets whose content is just "pending"
//   - if zero real bullets remain, replace the bullets with a single
//     "(n/a - pending updates)" line so the section is one tidy entry.
function collapseBlackBoxAi(text: string): string {
  return text.replace(
    /(🤖\s*[*_]?BlackBox AI[*_]?\s*\n)((?:•[^\n]*\n?)+)/g,
    (_m, header, body) => {
      const lines = body.split('\n').filter((l: string) => l.trim().length > 0);
      const cleaned = lines
        .map((l: string) => l.replace(/^•\s*/, '').trim())
        .filter((c: string) => c && c.toLowerCase() !== 'pending');
      if (cleaned.length === 0) {
        return `${header}(n/a - pending updates)\n`;
      }
      return `${header}${cleaned.map((c: string) => `• ${c}`).join('\n')}\n`;
    }
  );
}

// Collapse the "🕵️ Developer Intel" block when Funded By / Past Launches /
// Rugs / Reputation are ALL "pending" — render a single tidy n/a line.
function collapseDeveloperIntel(text: string): string {
  return text.replace(
    /(🕵️\s*[*_]?Developer Intel[*_]?\s*\n)(Funded By:[^\n]*\nPast Launches:[^\n]*\nRugs:[^\n]*\nReputation:[^\n]*)\n?/g,
    (_m, header, body) => {
      const vals = body.split('\n').map((l: string) =>
        l.split(':').slice(1).join(':').trim().toLowerCase()
      );
      if (vals.every((v: string) => v === 'pending' || v === '')) {
        return `${header}(n/a - pending updates)\n`;
      }
      return `${header}${body}\n`;
    }
  );
}

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
    const kind: 'snapshot' | 'big_picture' | 'leaks' | 'intel_update' =
      rawKind === 'snapshot' ? 'snapshot'
      : rawKind === 'leaks' ? 'leaks'
      : rawKind === 'intel_update' ? 'intel_update'
      : 'big_picture';
    const multiplierNum = typeof rawMultiplier === 'number' && isFinite(rawMultiplier) && rawMultiplier > 0
      ? rawMultiplier : null;
    const multiplierLabel = multiplierNum
      ? (Number.isInteger(multiplierNum) ? `${multiplierNum}x` : `${multiplierNum.toFixed(1)}x`)
      : '';
    const multiplierLine = multiplierNum ? `🚀 RE-SIGHTING: ${multiplierLabel}` : '';
    // Snapshot/Leaks use dedicated minimal templates. Fallback chains exist so a
    // missing template never blocks a post.
    const primaryTemplateName =
      kind === 'snapshot' ? 'no_lube_snapshot_private'
      : kind === 'leaks' ? 'no_lube_leaks_public'
      : kind === 'intel_update' ? 'no_lube_intel_update_private'
      : (channel === 'public' ? 'no_lube_public'
         : channel === 'private' ? 'no_lube_private'
         : 'no_lube');
    const fallbackTemplateName =
      kind === 'snapshot' ? 'no_lube_private'
      : kind === 'leaks' ? 'no_lube_snapshot_private'
      : kind === 'intel_update' ? 'no_lube_snapshot_private'
      : null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const sources: Record<string, string> = {};

    // Global profile: includes the snapshot_use_mint_image toggle (default ON).
    // We read it here so the snapshot path can decide whether to attach the
    // token's mint image as the Telegram photo header.
    const { data: globalProfile } = await supabase
      .from('no_lube_global_profile')
      .select('snapshot_use_mint_image')
      .eq('id', 'singleton')
      .maybeSingle();
    const useMintImageOnSnapshot =
      (globalProfile as any)?.snapshot_use_mint_image !== false; // default true

    // Pull the latest hourly health snapshot for wallet-distribution vars so the
    // post isn't full of "—" when /holders has already been refreshed.
    const { data: healthRow } = await supabase
      .from('token_health_snapshots')
      .select('dust_percentage, whale_count, total_holders, real_holders, top10_pct, health_score, health_grade, snapshot_hour, whales_pct, whales_supply_pct, serious_pct, retail_pct, top10_supply_pct, fdv_usd, price_usd, ath_mcap_usd')
      .eq('token_mint', mint)
      .order('snapshot_hour', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (healthRow) sources.health = 'token_health_snapshots';

    // ATH from pumpfun_watchlist (fed by bagless-holders-report hydrate block)
    const { data: wlRow } = await supabase
      .from('pumpfun_watchlist')
      .select('ath_market_cap_usd')
      .eq('token_mint', mint)
      .maybeSingle();
    const athMcapUsd = (healthRow as any)?.ath_mcap_usd ?? wlRow?.ath_market_cap_usd ?? null;

    // Pull the 4-bucket Wallet Distribution. HoldersIntel bot's Quick Stats
    // reply is built by calling bagless-holders-report seconds before this
    // function runs, and now persists all four tier percentages onto
    // token_health_snapshots. So we only re-invoke bagless when the snapshot
    // row is missing the tier columns — otherwise reuse the scrape.
    let simpleTiers: any = null;
    let baglessData: any = null;
    let earlyWarnings: any[] = [];
    let devRep: any = null;
    const snapshotHasTiers =
      healthRow &&
      (healthRow as any).whales_pct != null &&
      (healthRow as any).serious_pct != null &&
      (healthRow as any).retail_pct != null &&
      (healthRow as any).dust_percentage != null;
    if (snapshotHasTiers) {
      sources.distribution = 'token_health_snapshots';
    }
    if (!snapshotHasTiers) {
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
          baglessData = await baglessResp.json();
          simpleTiers = baglessData?.simpleTiers ?? null;
          if (simpleTiers) sources.distribution = 'bagless-holders-report';
        }
      } catch (e) {
        console.error('[no-lube-compose] bagless-holders-report fetch failed', e);
      }
    }

    // Intel Alerts — same source the bot's Quick Stats uses. Always fetch
    // regardless of kind so snapshot posts also render the alert lines.
    {
      try {
        const { data: warnings } = await supabase
          .from('token_early_warnings')
          .select('plain_text, severity, scan_count, last_seen_at')
          .eq('token_mint', mint)
          .in('severity', ['critical', 'high', 'medium'])
          .order('last_seen_at', { ascending: false })
          .limit(10);
        if (warnings?.length) {
          const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
          earlyWarnings = warnings
            .sort((a: any, b: any) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9))
            .slice(0, 3);
          sources.intelAlerts = 'token_early_warnings';
        }
      } catch (e) {
        console.error('[no-lube-compose] token_early_warnings fetch failed', e);
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
    // Hard-coded snapshot/leaks/intel_update fallback if no template exists yet.
    if (!tplText && (kind === 'snapshot' || kind === 'leaks' || kind === 'intel_update')) {
      const header =
        kind === 'leaks' ? '💧 *LEAK* — {ticker}\n'
        : kind === 'intel_update' ? '🛰 *INTEL UPDATE* — {ticker}\n'
        : '⚡ *SNAPSHOT* — {ticker}\n';
      tplText =
        header +
        '`{ca}`\n\n' +
        '💰 MC: {mc}  ·  Entry: {mcEntry}\n' +
        '💧 LP: {lp}  ·  📊 24h Vol: {vol24h}\n' +
        '👥 Top10: {top10}\n' +
        '⏱ Mint: {mint_ago} ago\n\n' +
        '🔗 [Chart]({chartUrl}) · [Bubble]({bubbleMapUrl}) · [Buy]({buyUrl})\n\n' +
        '_Full intel incoming…_';
    }
    const tpl = tplText || '🐸 *{ticker}*\n{momentum} · {risk} · {verdict}';

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
      .select('market_cap_at_discovery, minted_at, entry_mcap_usd, dev_wallet, image_uri, banner_url')
      .eq('token_mint', mint)
      .maybeSingle();
    if (seenRow) sources.seen = 'holders_intel_seen_tokens';

    // Dev wallet reputation (powers {devReputation}, {pastLaunches}, {rugs})
    if (kind === 'big_picture' && seenRow?.dev_wallet) {
      try {
        const { data: rep } = await supabase
          .from('dev_wallet_reputation')
          .select('reputation_score, trust_level, total_tokens_launched, tokens_rugged, tokens_successful, dev_pattern, is_serial_spammer, is_legitimate_builder')
          .eq('wallet_address', seenRow.dev_wallet)
          .maybeSingle();
        if (rep) {
          devRep = rep;
          sources.devRep = 'dev_wallet_reputation';
        }
      } catch (e) {
        console.error('[no-lube-compose] dev_wallet_reputation fetch failed', e);
      }
    }

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
    // Token mint image — used as the Telegram photo header on snapshot posts
    // when the global toggle is enabled. Source order: Helius DAS content.links.image,
    // Helius first file URI, DexScreener pair info imageUrl, cached metadata image.
    const helLinksImage = (hel?.content?.links as any)?.image as string | undefined;
    const helFileUri = (hel?.content?.files as any)?.[0]?.uri as string | undefined;
    const helFileCdn = (hel?.content?.files as any)?.[0]?.cdn_uri as string | undefined;
    const dexImage = (dex?.info as any)?.imageUrl as string | undefined;
    const cachedImage = (cached?.metadata as any)?.image as string | undefined;
    // Live sources first, then fall back to persisted holders_intel_seen_tokens.image_uri
    // (so re-runs reuse the canonical URL once we've validated one).
    const seenImage = (seenRow as any)?.image_uri as string | undefined;
    // Pump.fun fallback — many pump.fun tokens don't have a Helius DAS image
    // or DexScreener info.imageUrl until they graduate. Their canonical PFP
    // lives on the pump.fun frontend API. Fetch it as a last resort so the
    // mint_pfp circle on the compose card never renders blank.
    let pumpImage: string | null = null;
    try {
      const pfRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
        headers: { Accept: 'application/json' },
      });
      if (pfRes.ok) {
        const pfJson: any = await pfRes.json().catch(() => null);
        if (pfJson?.image_uri && typeof pfJson.image_uri === 'string') {
          pumpImage = pfJson.image_uri;
        }
      }
    } catch (e) {
      console.warn('[no-lube-compose] pump.fun image fallback failed', (e as Error).message);
    }
    const tokenImageUrl: string | null =
      helLinksImage || helFileCdn || helFileUri || dexImage || seenImage || cachedImage || pumpImage || null;
    if (tokenImageUrl) sources.tokenImage =
      (helLinksImage || helFileCdn || helFileUri) ? 'helius'
      : dexImage ? 'dexscreener'
      : seenImage ? 'seen_token_cache'
      : cachedImage ? 'cache'
      : 'pump.fun';

    // DexScreener banner — read DB cache first, then live fetch, then persist.
    // Also surface a paid-DEX flag (boosts.active > 0) so the card compositor
    // can later overlay a 50X/100X strip when the user wires up the visual.
    let bannerUrl: string | null = (seenRow as any)?.banner_url || null;
    let bannerSource: string | null = bannerUrl ? 'seen_token_cache' : null;
    let hasPaidDex = false;
    try {
      // Detect paid boost from the live DexScreener pairs (cheap, public).
      const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
        headers: { Accept: 'application/json' },
      }).catch(() => null);
      if (dsRes?.ok) {
        const dsJson: any = await dsRes.json().catch(() => null);
        const dsPairs: any[] = Array.isArray(dsJson?.pairs) ? dsJson.pairs : [];
        hasPaidDex = dsPairs.some((p) => (p?.boosts?.active ?? 0) > 0 || !!p?.info?.header);
      }
      if (!bannerUrl) {
        const banner = await fetchDexBanner(mint);
        if (banner?.url) {
          bannerUrl = banner.url;
          bannerSource = banner.source || 'dexscreener';
        }
      }
    } catch (e) {
      console.warn('[no-lube-compose] banner fetch failed', (e as Error).message);
    }
    if (bannerUrl) sources.banner = bannerSource || 'dexscreener';
    if (hasPaidDex) sources.paidDex = 'dexscreener.boosts';

    // Persist fresh canonical image + banner back to holders_intel_seen_tokens
    // so subsequent milestone runs reuse the validated URLs and never
    // synthesize fake imagery.
    if (seenRow && !dry_run) {
      const patch: Record<string, any> = {};
      if (tokenImageUrl && tokenImageUrl !== (seenRow as any).image_uri) {
        patch.image_uri = tokenImageUrl;
      }
      if (bannerUrl && bannerUrl !== (seenRow as any).banner_url) {
        patch.banner_url = bannerUrl;
      }
      if (Object.keys(patch).length > 0) {
        try {
          await assertUpdate(
            supabase
              .from('holders_intel_seen_tokens')
              .update(patch)
              .eq('token_mint', mint),
            'holders_intel_seen_tokens',
          );
        } catch (e) {
          console.error('[no-lube-compose] image/banner persist failed', (e as Error).message);
        }
      }
    }
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
    // computed as the LOWEST MC observed by any authorized source (Insiders,
    // BlackBox/Phanes/DrRick, HoldersIntel) WITHIN the 30-minute discovery
    // window starting at first_seen_at. After the window closes, later sightings
    // (including price dumps) can NEVER lower or raise Entry MC. This is the
    // value the templates render as {mcEntry} and what milestone math compares
    // against.
    //
    // We route every observation through upsert_mesh_entry_mcap so the window
    // guard is enforced in one place (the RPC). The current DexScreener mcUsd
    // is fed in as source='blackbox' — it'll only lower Entry MC if compose is
    // running inside the discovery window.
    const persistedEntry = seenRow?.entry_mcap_usd != null ? Number(seenRow.entry_mcap_usd) : null;
    let mcEntryVal: number | null = persistedEntry;
    if (mcUsd != null && isFinite(mcUsd) && mcUsd > 0) {
      try {
        const { data: meshRow } = await supabase.rpc('upsert_mesh_entry_mcap', {
          p_mint: mint,
          p_symbol: ticker ?? null,
          p_name: name ?? null,
          p_observed_mcap: mcUsd,
          p_source: 'blackbox',
          p_observed_at: new Date().toISOString(),
        });
        const returned = Array.isArray(meshRow) ? meshRow[0] : meshRow;
        if (returned?.entry_mcap_usd != null && Number(returned.entry_mcap_usd) > 0) {
          mcEntryVal = Number(returned.entry_mcap_usd);
        }
      } catch (e) {
        console.error('[no-lube-compose] upsert_mesh_entry_mcap failed (non-fatal)', e);
      }
    }
    // Fall back to the lowest authorized historical signal we already have on
    // the row if the RPC didn't return one (e.g. token only just appeared).
    if (mcEntryVal == null) {
      const fallbacks = [
        seenRow?.market_cap_at_discovery != null ? Number(seenRow.market_cap_at_discovery) : null,
        historicalMin,
      ].filter((v): v is number => v != null && isFinite(v) && v > 0);
      if (fallbacks.length) mcEntryVal = Math.min(...fallbacks);
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

    // Bagless-derived fallbacks (used when the hourly token_health_snapshots row is missing)
    const bagRealHolders = baglessData?.realHolders ?? null;
    const bagTotalHolders = baglessData?.totalHolders ?? null;
    const bagTop10 = baglessData?.distributionStats?.top10Percentage ?? null;
    const bagHealthScore = baglessData?.healthScore?.score ?? baglessData?.stabilityScore ?? null;
    const bagHealthGrade = baglessData?.healthScore?.grade ?? null;
    // Prefer persisted snapshot tiers (same numbers HoldersIntel Quick Stats
    // just rendered) and fall back to bagless response when snapshot is missing.
    const hrWhales = (healthRow as any)?.whales_pct;
    const hrSerious = (healthRow as any)?.serious_pct;
    const hrRetail = (healthRow as any)?.retail_pct;
    const hrDust = healthRow?.dust_percentage;
    const whalesPctResolved = hrWhales ?? simpleTiers?.whales?.percentage ?? null;
    const seriousPctResolved = hrSerious ?? simpleTiers?.serious?.percentage ?? null;
    const retailPctResolved = hrRetail ?? simpleTiers?.retail?.percentage ?? null;
    const dustPctResolved = hrDust ?? simpleTiers?.dust?.percentage ?? null;
    const dustPctVal = dustPctResolved;
    const whalesPctVal = whalesPctResolved;
    const whalesCount = simpleTiers?.whales?.count ?? null;
    const dexFdv = (dex as any)?.fdv ?? null;
    const dexPriceUsd = (dex as any)?.priceUsd != null ? Number((dex as any).priceUsd) : null;
    const fdvResolved = (healthRow as any)?.fdv_usd ?? dexFdv ?? mcUsd ?? null;
    const priceResolved = (healthRow as any)?.price_usd ?? dexPriceUsd ?? null;
    // Structure classifier — top-heavy vs balanced vs dust-heavy
    let structureLabel: string = DASH;
    const whalesSupply = (healthRow as any)?.whales_supply_pct ?? simpleTiers?.whales?.supplyPercentage ?? null;
    if (whalesSupply != null && dustPctResolved != null) {
      if (whalesSupply >= 40) structureLabel = 'Top-heavy';
      else if (dustPctResolved >= 55) structureLabel = 'Dust-heavy';
      else if (whalesSupply >= 20) structureLabel = 'Concentrated';
      else structureLabel = 'Balanced';
    }
    // Activity classifier — volume / mcap ratio
    let activityLabel: string = DASH;
    if (typeof vol24 === 'number' && typeof mcUsd === 'number' && mcUsd > 0) {
      const r = vol24 / mcUsd;
      if (r >= 0.5) activityLabel = 'Hot';
      else if (r >= 0.1) activityLabel = 'Warm';
      else if (r > 0) activityLabel = 'Cold';
      else activityLabel = 'Dead';
    }
    const fmtPrice = (p: number | null) => {
      if (p == null || !isFinite(p) || p <= 0) return DASH;
      if (p >= 1) return `$${p.toFixed(4)}`;
      if (p >= 0.001) return `$${p.toFixed(6)}`;
      return `$${p.toExponential(2)}`;
    };

    // Intel Alerts strings
    const fmtAlert = (w: any) => {
      const seenNote = w.scan_count > 1 ? ` _(seen ${w.scan_count}x)_` : '';
      return `${w.plain_text}${seenNote}`;
    };
    const intelAlertLines = earlyWarnings.map(fmtAlert);
    const intelAlertsBlock = intelAlertLines.length
      ? `🚨 *Intel Alerts*\n${intelAlertLines.join('\n\n')}`
      : '';

    // Dev reputation strings
    const devTotal = devRep?.total_tokens_launched ?? null;
    const devRugs = devRep?.tokens_rugged ?? null;
    const devTrust = devRep?.trust_level || null;
    const devScore = devRep?.reputation_score ?? null;
    const devPattern = devRep?.dev_pattern || null;

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
      top10: top10Pct != null
        ? `${top10Pct.toFixed(1)}%`
        : (bagTop10 != null ? `${Number(bagTop10).toFixed(1)}%` : DASH),
      freshWallets: dustPctResolved != null
        ? `${Number(dustPctResolved).toFixed(1)}% dust`
        : DASH,
      walletSpread: healthRow?.real_holders != null && healthRow?.total_holders != null
        ? `${healthRow.real_holders}/${healthRow.total_holders} real`
        : (bagRealHolders != null && bagTotalHolders != null
            ? `${bagRealHolders}/${bagTotalHolders} real`
            : DASH),
      bundledRisk: healthRow?.whale_count != null
        ? `${healthRow.whale_count} whales`
        : (whalesCount != null
            ? `${whalesCount} whales${whalesPctVal != null ? ` (${Math.round(whalesPctVal)}%)` : ''}`
            : DASH),
      // ── Wallet Distribution buckets (persisted snapshot first, bagless fallback) ──
      whalesPct: whalesPctResolved != null ? `${Math.round(whalesPctResolved)}%` : DASH,
      seriousPct: seriousPctResolved != null ? `${Math.round(seriousPctResolved)}%` : DASH,
      retailPct: retailPctResolved != null ? `${Math.round(retailPctResolved)}%` : DASH,
      dustPct: dustPctResolved != null ? `${Math.round(dustPctResolved)}%` : DASH,
      whalesBar: whalesPctResolved != null ? fmtBondingBar(whalesPctResolved) : '░░░░░░░░░░',
      seriousBar: seriousPctResolved != null ? fmtBondingBar(seriousPctResolved) : '░░░░░░░░░░',
      retailBar: retailPctResolved != null ? fmtBondingBar(retailPctResolved) : '░░░░░░░░░░',
      dustBar: dustPctResolved != null ? fmtBondingBar(dustPctResolved) : '░░░░░░░░░░',
      walletDistBlock: (whalesPctResolved != null || seriousPctResolved != null || retailPctResolved != null || dustPctResolved != null)
        ? [
            `\`Whales  ${fmtBondingBar(whalesPctResolved ?? 0)} ${Math.round(whalesPctResolved ?? 0)}%\`  >$1K`,
            `\`Serious ${fmtBondingBar(seriousPctResolved ?? 0)} ${Math.round(seriousPctResolved ?? 0)}%\`  $200-$1K`,
            `\`Retail  ${fmtBondingBar(retailPctResolved ?? 0)} ${Math.round(retailPctResolved ?? 0)}%\`  $1-$199`,
            `\`Dust    ${fmtBondingBar(dustPctResolved ?? 0)} ${Math.round(dustPctResolved ?? 0)}%\`  <$1`,
          ].join('\n')
        : DASH,
      realHolders: healthRow?.real_holders != null
        ? String(healthRow.real_holders)
        : (bagRealHolders != null ? String(bagRealHolders) : DASH),
      totalHolders: healthRow?.total_holders != null
        ? String(healthRow.total_holders)
        : (bagTotalHolders != null ? String(bagTotalHolders) : DASH),
      // Alias so templates using {holders} also resolve
      holders: healthRow?.total_holders != null
        ? String(healthRow.total_holders)
        : (bagTotalHolders != null ? String(bagTotalHolders) : DASH),
      fdv: fdvResolved != null ? fmtMoney(fdvResolved) : DASH,
      price: fmtPrice(priceResolved),
      ath: athMcapUsd != null ? fmtMoney(athMcapUsd) : DASH,
      structure: structureLabel,
      activity: activityLabel,
      healthScore: healthRow?.health_score != null
        ? String(healthRow.health_score)
        : (bagHealthScore != null ? String(bagHealthScore) : DASH),
      healthGrade: healthRow?.health_grade || bagHealthGrade || DASH,
      // Intel Alerts (from token_early_warnings — same source as bot Quick Stats)
      intelAlerts: intelAlertsBlock || DASH,
      intelAlert1: intelAlertLines[0] || DASH,
      intelAlert2: intelAlertLines[1] || DASH,
      intelAlert3: intelAlertLines[2] || DASH,
      intelAlertCount: String(intelAlertLines.length),
      aiBullet1: intelAlertLines[0] || DASH,
      aiBullet2: intelAlertLines[1] || DASH,
      aiBullet3: intelAlertLines[2] || DASH,
      aiBullet4: DASH,
      fundedBy: DASH,
      pastLaunches: devTotal != null ? String(devTotal) : DASH,
      rugs: devRugs != null && devTotal != null
        ? `${devRugs}/${devTotal}`
        : (devRugs != null ? String(devRugs) : DASH),
      devReputation: devTrust
        ? `${devTrust}${devScore != null ? ` (${devScore})` : ''}${devPattern ? ` · ${devPattern}` : ''}`
        : DASH,
      blackboxScore: (healthRow?.health_grade || bagHealthGrade)
        ? `${healthRow?.health_grade || bagHealthGrade} (${healthRow?.health_score ?? bagHealthScore ?? '—'})`
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
      token_image_url: tokenImageUrl || DASH,
      banner_url: bannerUrl || DASH,
      has_paid_dex: hasPaidDex ? 'true' : 'false',
      ...profileVars,
    };

    let text = renderTemplate(tpl, vars);

    // Tidy up the two sections that often render as a wall of "pending":
    //   - BlackBox AI: drop "• pending" bullets, collapse to one n/a line if empty
    //   - Developer Intel: collapse to one n/a line when all 4 fields are pending
    text = collapseBlackBoxAi(text);
    text = collapseDeveloperIntel(text);

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
      // Surface the token's mint image so orchestrate/push can attach it as the
      // Telegram photo header. Applies to snapshot, big_picture (Private),
      // leaks (Public), and intel_update — gated by snapshot_use_mint_image.
      image_url: (kind === 'snapshot' || kind === 'big_picture' || kind === 'leaks' || kind === 'intel_update') && useMintImageOnSnapshot ? tokenImageUrl : null,
      token_image_url: tokenImageUrl,
      banner_url: bannerUrl,
      banner_source: bannerSource,
      has_paid_dex: hasPaidDex,
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