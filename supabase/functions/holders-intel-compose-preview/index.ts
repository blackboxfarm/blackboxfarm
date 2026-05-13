import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { assessNetworkRisk } from "../_shared/network-risk-assessment.ts";
import { fetchDexBanner } from "../_shared/dexscreener-banner.ts";

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
  const tickerSafe = (data.symbol || 'TOKEN').toUpperCase().replace(/^\$+/, '');
  const tokenName = sanitizeUrlLikeName(data.name || data.tokenName || 'Unknown');
  const comment1 = data.timesPosted <= 1 ? ' 🆕 First call out!' : ' 💪 Steady & Strong';
  const timestamp = formatTimestamp();

  return template
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
      .select('id, token_mint, symbol, name, dex_banner_url')
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

        const tweetText = processTemplate(tweetTemplate, stats);

        const updatePayload: Record<string, unknown> = { tweet_text: tweetText };

        // Auto-fetch DexScreener banner the first time we compose this row
        // (or when caller explicitly asks to refresh).
        if (!item.dex_banner_url || force_refresh === true) {
          try {
            const banner = await fetchDexBanner(item.token_mint);
            if (banner.url) updatePayload.dex_banner_url = banner.url;
          } catch (e) {
            console.warn(`[compose-preview] banner fetch failed for ${item.token_mint}: ${(e as Error).message}`);
          }
        }

        const { error: updErr } = await supabase
          .from('holders_intel_post_queue')
          .update(updatePayload)
          .eq('id', item.id);
        if (updErr) throw updErr;

        results.push({ id: item.id, ok: true, length: tweetText.length, dex_banner_url: updatePayload.dex_banner_url ?? item.dex_banner_url ?? null });
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