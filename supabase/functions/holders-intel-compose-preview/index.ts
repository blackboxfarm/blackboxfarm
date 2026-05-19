import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { assessNetworkRisk } from "../_shared/network-risk-assessment.ts";
import { fetchDexBanner } from "../_shared/dexscreener-banner.ts";
import { sanitizeForTwitter, sanitizeTickerForTwitter } from "../_shared/twitter-template-sanitizer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACK_TEMPLATE = `🔍 {TICKER} Holder Analysis

📊 {TOTAL_WALLETS} Total | ✅ {REAL_HOLDERS} Real
{DUST_PERCENTAGE}% Dust | Health: {HEALTH_GRADE}

👉 blackbox.farm/holders?token={TOKEN_ADDRESS}`;

function asCount(v: any): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  if (v && typeof v === 'object' && typeof v.count !== 'undefined') {
    const n = Number(v.count); return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sanitizeUrlLikeName(name: string): string {
  if (!name) return name;
  const tlds = /\.(fun|com|io|xyz|net|org|co|ai|app|dev|gg|me|tv|live|lol|meme|wtf|sol|pump|token|coin|finance|fi|exchange|swap|trade|market|money|cash|pay|crypto|nft|dao|defi|web3|eth|btc|dex)$/i;
  if (tlds.test(name)) return name.replace(/\.([a-z]+)$/i, ' .$1');
  return name;
}

function formatTimestamp(): string {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: 'America/Toronto',
  }) + ' EST';
}

function processTemplate(template: string, data: any): string {
  // X/Twitter post path: do NOT obfuscate. Twitter needs the raw ticker so
  // $TICKER renders as a clickable cashtag and #TICKER hashtags work.
  // (Telegram poster has its own obfuscation in holders-intel-poster.)
  const tickerSafe = sanitizeTickerForTwitter(data.symbol);
  const tokenName = sanitizeUrlLikeName(data.name || data.tokenName || 'Unknown');
  const comment1 = data.timesPosted <= 1 ? ' 🆕 First call out!' : ' 💪 Steady & Strong';
  const timestamp = formatTimestamp();

  const raw = template
    .replace(/\{TICKER\}/g, tickerSafe).replace(/\{ticker\}/g, tickerSafe)
    .replace(/\{NAME\}/g, tokenName).replace(/\{name\}/g, tokenName)
    .replace(/\{comment1\}/g, comment1).replace(/\{COMMENT1\}/g, comment1)
    .replace(/\{timestamp\}/g, timestamp).replace(/\{TIMESTAMP\}/g, timestamp)
    .replace(/\{TOTAL_WALLETS\}/g, (data.totalHolders || 0).toLocaleString())
    .replace(/\{totalWallets\}/g, (data.totalHolders || 0).toLocaleString())
    .replace(/\{REAL_HOLDERS\}/g, (data.realHolders || 0).toLocaleString())
    .replace(/\{realHolders\}/g, (data.realHolders || 0).toLocaleString())
    .replace(/\{DUST_PERCENTAGE\}/g, String(data.dustPercentage || 0))
    .replace(/\{dustPct\}/g, String(data.dustPercentage || 0))
    .replace(/\{WHALES\}/g, (data.whaleCount || 0).toLocaleString())
    .replace(/\{whales\}/g, (data.whaleCount || 0).toLocaleString())
    .replace(/\{SERIOUS\}/g, (data.seriousCount || 0).toLocaleString())
    .replace(/\{serious\}/g, (data.seriousCount || 0).toLocaleString())
    .replace(/\{REAL_RETAIL\}/g, (data.activeCount || 0).toLocaleString())
    .replace(/\{retail\}/g, (data.activeCount || 0).toLocaleString())
    .replace(/\{DUST_COUNT\}/g, (data.dustCount || 0).toLocaleString())
    .replace(/\{dust\}/g, (data.dustCount || 0).toLocaleString())
    .replace(/\{HEALTH_GRADE\}/g, data.healthGrade || 'N/A')
    .replace(/\{healthGrade\}/g, data.healthGrade || 'N/A')
    .replace(/\{HEALTH_SCORE\}/g, String(data.healthScore || 0))
    .replace(/\{healthScore\}/g, String(data.healthScore || 0))
    .replace(/\{TOKEN_ADDRESS\}/g, data.tokenMint || '')
    .replace(/\{ca\}/g, data.tokenMint || '')
    .replace(/\{risk\}/g, data.risk || '').replace(/\{RISK\}/g, data.risk || '')
    .replace(/\{risk_detail\}/g, data.riskDetail || '').replace(/\{RISK_DETAIL\}/g, data.riskDetail || '')
    .replace(/\{dev_rep\}/g, data.devRep || 'Unknown').replace(/\{DEV_REP\}/g, data.devRep || 'Unknown')
    .replace(/\{x_community\}/g, data.xCommunity || 'N/A').replace(/\{X_COMMUNITY\}/g, data.xCommunity || 'N/A')
    .replace(/\{website\}/g, data.website || 'N/A').replace(/\{WEBSITE\}/g, data.website || 'N/A')
    .replace(/\{ai_summary\}/g, '').replace(/\{AI_SUMMARY\}/g, '')
    .replace(/\{ai_overview\}/g, '').replace(/\{AI_OVERVIEW\}/g, '')
    .replace(/\{lifecycle\}/g, '').replace(/\{LIFECYCLE\}/g, '')
    .replace(/\{ath_24h\}/g, 'N/A').replace(/\{ATH_24H\}/g, 'N/A')
    .replace(/\{padre\}/g, `https://trade.padre.gg/rk/blackbox/trade/solana/${data.tokenMint || ''}`)
    .replace(/\{PADRE\}/g, `https://trade.padre.gg/rk/blackbox/trade/solana/${data.tokenMint || ''}`)
    .replace(/\{momentumGrade\}/g, '').replace(/\{MOMENTUM_GRADE\}/g, '')
    .replace(/\{structuralScore\}/g, '').replace(/\{STRUCTURAL_SCORE\}/g, '')
    .replace(/\{activityScore\}/g, '').replace(/\{ACTIVITY_SCORE\}/g, '');

  // Final pass: strip any zero-width / invisible chars that may have been
  // present in the original template text itself (e.g. copied from Telegram).
  // Belt-and-suspenders: enforce ?token={ca} on every blackbox.farm/holders
  // URL regardless of which template variant was used. Stops legacy
  // ?v=holders5 (or any other query string) from ever shipping in a manual
  // X post — we want the canonical token-deeplink the FIRST time we compose,
  // not after a banner re-fetch rewrites it.
  const ca = data.tokenMint || '';
  const normalized = ca
    ? raw.replace(
        /https?:\/\/blackbox\.farm\/holders(?:\?[^\s)]*)?/gi,
        `https://blackbox.farm/holders?token=${ca}`,
      )
    : raw;
  return sanitizeForTwitter(normalized);
}

/**
 * Generate a single-sentence analytical AI snippet via Lovable AI Gateway.
 * Returns null on any failure (fail-open — the card just skips the line).
 */
async function generateAiSnippet(stats: any, report: any): Promise<string | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return null;

  const facts = {
    ticker: stats.symbol,
    name: stats.name,
    healthGrade: stats.healthGrade,
    healthScore: stats.healthScore,
    totalWallets: stats.totalHolders,
    realHolders: stats.realHolders,
    dustPct: stats.dustPercentage,
    whales: stats.whaleCount,
    serious: stats.seriousCount,
    retail: stats.activeCount,
    riskSignal: stats.risk,
    riskDetail: stats.riskDetail,
    top10Pct: report?.distributionStats?.top10Percentage ?? null,
    devTrustLevel: report?.devReputation?.trustLevel ?? null,
  };

  const system = `You write a single analytical sentence about a Solana token's holder distribution for the @HoldersIntel X account.
RULES (strict):
- Output EXACTLY one sentence, max 140 characters.
- Plain analytical voice. No hype, no shilling, no emojis, no hashtags, no $TICKER cashtags, no @mentions, no URLs.
- Reference concrete distribution facts (real-holder ratio, dust %, whale concentration, top-10 %, or risk signal).
- Do not say "the token" repeatedly; use the ticker name once at most without a $.
- No quotation marks around the sentence.`;

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Facts:\n${JSON.stringify(facts)}` },
        ],
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[compose-preview] ai_snippet gateway ${res.status}`);
      return null;
    }
    const data = await res.json();
    let text: string = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return null;
    // Strip wrapping quotes, hashtags, $cashtags, urls, emoji-ish leading chars
    text = text.replace(/^["'`]+|["'`]+$/g, '').trim();
    text = text.replace(/https?:\/\/\S+/g, '').trim();
    text = text.replace(/[#$@]\w+/g, (m) => m.slice(1)).trim();
    if (text.length > 200) text = text.slice(0, 197).replace(/\s+\S*$/, '') + '…';
    return text || null;
  } catch (e) {
    console.warn(`[compose-preview] ai_snippet error: ${(e as Error).message}`);
    return null;
  }
}

async function fetchActiveTemplate(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('holders_intel_templates')
    .select('template_text')
    .in('template_name', ['small', 'large'])
    .eq('is_active', true)
    .maybeSingle();
  return data?.template_text || FALLBACK_TEMPLATE;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { queue_id, queue_ids, force_refresh } = await req.json().catch(() => ({}));
    const ids: string[] = queue_ids || (queue_id ? [queue_id] : []);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: 'queue_id or queue_ids required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || serviceKey;
    const supabase = createClient(supabaseUrl, serviceKey);

    const tweetTemplate = await fetchActiveTemplate(supabase);

    const { data: items, error: fetchErr } = await supabase
      .from('holders_intel_post_queue')
      .select('id, token_mint, symbol, name, dex_banner_url, ai_snippet')
      .in('id', ids);

    if (fetchErr) throw fetchErr;

    const results: any[] = [];

    for (const item of items || []) {
      try {
        const reportRes = await fetch(`${supabaseUrl}/functions/v1/bagless-holders-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({ tokenMint: item.token_mint }),
        });
        const report = await reportRes.json();
        if (!reportRes.ok || report?.error) throw new Error(report?.error || `report ${reportRes.status}`);

        const totalHolders = asCount(report?.totalHolders);
        const dustCount = asCount(report?.tierBreakdown?.dust ?? report?.dustWallets ?? report?.simpleTiers?.dust);
        const dustPercentage = totalHolders > 0 ? Math.round((dustCount / totalHolders) * 100) : 0;

        const stats: any = {
          symbol: report?.tokenSymbol || report?.symbol || item.symbol || 'UNKNOWN',
          name: report?.tokenName || report?.name || item.name || 'Unknown',
          tokenMint: item.token_mint,
          totalHolders,
          timesPosted: 1,
          realHolders: asCount(report?.realHolders ?? report?.realWalletCount),
          dustCount,
          dustPercentage,
          whaleCount: asCount(report?.tierBreakdown?.whale ?? report?.simpleTiers?.whales),
          seriousCount: asCount(report?.tierBreakdown?.serious ?? report?.simpleTiers?.serious),
          activeCount: asCount(report?.tierBreakdown?.retail ?? report?.simpleTiers?.retail),
          healthGrade: (report?.stabilityGrade ?? report?.healthScore?.grade ?? 'N/A').toString(),
          healthScore: asCount(report?.stabilityScore ?? report?.healthScore?.score),
          devRep: 'Unknown',
          xCommunity: report?.socials?.twitter || 'N/A',
          website: report?.socials?.website || 'N/A',
        };

        const risk = assessNetworkRisk({
          healthScore: stats.healthScore,
          totalHolders: stats.totalHolders,
          realHolders: stats.realHolders,
          dustPercentage: stats.dustPercentage,
          whaleCount: stats.whaleCount,
          seriousCount: stats.seriousCount,
          top10Pct: report?.distributionStats?.top10Percentage ?? null,
          devTrustLevel: report?.devReputation?.trustLevel ?? null,
          devReputationScore: report?.devReputation?.score ?? null,
          isBlacklisted: report?.devReputation?.isBlacklisted ?? false,
        });
        stats.risk = risk.signal;
        stats.riskDetail = risk.detail;

        // Generate AI snippet (cached unless force_refresh). Fail-open.
        if (force_refresh === true || !item.ai_snippet) {
          stats.aiSnippet = await generateAiSnippet(stats, report);
        } else {
          stats.aiSnippet = item.ai_snippet;
        }

        const tweetText = processTemplate(tweetTemplate, stats);

        // Extract hashtag line from rendered tweet (last line starting with #)
        const lines = tweetText.split('\n').map((l) => l.trim()).filter(Boolean);
        const hashtagsLine = [...lines].reverse().find((l) => /^#\w/.test(l)) || null;
        const snapshotLabel = formatTimestamp();

        const updatePayload: Record<string, unknown> = {
          tweet_text: tweetText,
          tweet_composed_at: new Date().toISOString(),
          ai_snippet: stats.aiSnippet || null,
          health_grade: stats.healthGrade || null,
          health_score: stats.healthScore || null,
          health_label: stats.timesPosted <= 1 ? 'King!!' : null,
          real_holders: stats.realHolders ?? null,
          total_wallets: stats.totalHolders ?? null,
          whales_count: stats.whaleCount ?? null,
          serious_count: stats.seriousCount ?? null,
          retail_count: stats.activeCount ?? null,
          dust_count: stats.dustCount ?? null,
          dust_pct: stats.dustPercentage ?? null,
          snapshot_label: snapshotLabel,
          hashtags_line: hashtagsLine,
          posted_handle: 'HoldersIntel',
        };

        // Auto-fetch DexScreener banner the first time we compose this row
        // (or when caller explicitly asks to refresh).
        if (!item.dex_banner_url || force_refresh === true) {
          try {
            const banner = await fetchDexBanner(item.token_mint);
            if (banner.url) {
              updatePayload.dex_banner_url = banner.url;
            }
          } catch (e) {
            console.warn(`[compose-preview] banner fetch failed for ${item.token_mint}: ${(e as Error).message}`);
          }
        }

        // Stamp banner_used_url = decorated if present else dex banner
        updatePayload.banner_used_url =
          (updatePayload.dex_banner_url as string | undefined) ??
          item.dex_banner_url ??
          null;

        // Quality gate: auto-skip dead-on-arrival tokens so they never reach the
        // Manual X queue UI. Triggers when holders snapshot is junk:
        //  - 0 real holders, OR
        //  - dust_pct >= 95%, OR
        //  - total wallets < 50
        const realH = stats.realHolders ?? 0;
        const dustP = stats.dustPercentage ?? 0;
        const totalH = stats.totalHolders ?? 0;
        const qualityFail =
          realH === 0 || dustP >= 95 || totalH < 50;
        if (qualityFail) {
          updatePayload.manual_status = 'skipped_manual';
          updatePayload.manual_skip_reason =
            `quality_gate: real=${realH} dust=${dustP}% total=${totalH}`;
          updatePayload.status = 'skipped';
        }

        // Fresh DexScreener snapshot so the admin sees current mcap & 1h
        // volume on regenerate — for posting-decision context only, NOT
        // injected into the tweet template.
        let snapshot: {
          mcap: number | null;
          vol1h: number | null;
          vol24h: number | null;
          priceUsd: number | null;
          liquidityUsd: number | null;
          boosts: number | null;
          pairAgeHours: number | null;
        } = {
          mcap: null, vol1h: null, vol24h: null, priceUsd: null,
          liquidityUsd: null, boosts: null, pairAgeHours: null,
        };
        try {
          const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${item.token_mint}`);
          if (dsRes.ok) {
            const j: any = await dsRes.json();
            const pairs: any[] = Array.isArray(j?.pairs) ? j.pairs : [];
            pairs.sort((a, b) => (b?.liquidity?.usd ?? 0) - (a?.liquidity?.usd ?? 0));
            const p = pairs[0];
            if (p) {
              snapshot = {
                mcap: typeof p.marketCap === 'number' ? p.marketCap : (typeof p.fdv === 'number' ? p.fdv : null),
                vol1h: typeof p.volume?.h1 === 'number' ? p.volume.h1 : null,
                vol24h: typeof p.volume?.h24 === 'number' ? p.volume.h24 : null,
                priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
                liquidityUsd: typeof p.liquidity?.usd === 'number' ? p.liquidity.usd : null,
                boosts: typeof p.boosts?.active === 'number' ? p.boosts.active : null,
                pairAgeHours: p.pairCreatedAt
                  ? Math.round((Date.now() - new Date(p.pairCreatedAt).getTime()) / 3_600_000)
                  : null,
              };
            }
          }
        } catch (e) {
          console.warn(`[compose-preview] snapshot fetch failed: ${(e as Error).message}`);
        }

        const { error: updErr } = await supabase
          .from('holders_intel_post_queue')
          .update(updatePayload)
          .eq('id', item.id);
        if (updErr) throw updErr;

        results.push({
          id: item.id,
          ok: true,
          length: tweetText.length,
          dex_banner_url: updatePayload.dex_banner_url ?? item.dex_banner_url ?? null,
          snapshot,
        });
      } catch (e: any) {
        results.push({ id: item.id, ok: false, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});