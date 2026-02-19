import { createHmac } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_KEY = Deno.env.get("TWITTER_CONSUMER_KEY")?.trim();
const API_SECRET = Deno.env.get("TWITTER_CONSUMER_SECRET")?.trim();
const ACCESS_TOKEN = Deno.env.get("TWITTER_ACCESS_TOKEN")?.trim();
const ACCESS_TOKEN_SECRET = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET")?.trim();

const COMMUNITY_ID = "2001683327686672789";

function generateOAuthSignature(
  method: string, url: string, params: Record<string, string>,
  consumerSecret: string, tokenSecret: string
): string {
  const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(
    Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join("&")
  )}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return createHmac("sha1", signingKey).update(signatureBaseString).digest("base64");
}

function generateOAuthHeader(method: string, url: string): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: API_KEY!,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN!,
    oauth_version: "1.0",
  };
  const signature = generateOAuthSignature(method, url, oauthParams, API_SECRET!, ACCESS_TOKEN_SECRET!);
  return "OAuth " + Object.entries({ ...oauthParams, oauth_signature: signature })
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(", ");
}

async function sendTweet(text: string, communityId?: string): Promise<any> {
  const url = "https://api.x.com/2/tweets";
  const oauthHeader = generateOAuthHeader("POST", url);
  const body: any = { text };
  if (communityId) body.community_id = communityId;

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: oauthHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  console.log("Twitter API Response:", response.status, responseText);
  if (!response.ok) throw new Error(`Twitter API error: ${response.status} - ${responseText}`);
  return JSON.parse(responseText);
}

// Default templates (fallback)
const DEFAULT_TEMPLATES: Record<string, string> = {
  buy: `🤖 ALPHA DETECTED — ${{TOKEN_SYMBOL}}

⚡ AI Signal Lock
💰 Entry: ${{ENTRY_PRICE}}
🎯 Target: {{TARGET_MULTIPLIER}}x
📊 Position: {{AMOUNT_SOL}} SOL
👥 Holders: {{HOLDERS}} | MCap: ${{MCAP}}

🔗 https://pump.fun/coin/{{TOKEN_CA}}

#Solana #PumpFun #{{TOKEN_SYMBOL}}`,
  sell: `{{PROFIT_EMOJI}} TARGET LOCKED — ${{TOKEN_SYMBOL}}

🏆 {{RESULT_MESSAGE}}
💰 Entry: ${{ENTRY_PRICE}}
💵 Exit: ${{EXIT_PRICE}} ({{MULTIPLIER}}x)
📈 P&L: {{PROFIT_SIGN}}{{PROFIT_SOL}} SOL ({{PROFIT_SIGN}}{{PROFIT_PERCENT}}%)
⏱️ Hold: {{HOLD_DURATION}}

🔗 https://pump.fun/coin/{{TOKEN_CA}}

#Solana #PumpFun #{{TOKEN_SYMBOL}}`,
};

interface FantasyTweetRequest {
  type: 'buy' | 'sell';
  tokenMint: string;
  tokenSymbol: string;
  tokenName?: string;
  entryPrice: number;
  // Buy-specific
  targetMultiplier?: number;
  amountSol?: number;
  amountUsd?: number;
  holders?: number;
  mcap?: number;
  // Sell-specific
  exitPrice?: number;
  multiplier?: number;
  profitSol?: number;
  profitPercent?: number;
  exitReason?: string;
  holdDurationMins?: number;
}

function sanitizeSymbol(s: string | undefined): string {
  return (s || "").trim().replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
}

function buildTweetText(template: string, data: FantasyTweetRequest): string {
  const symbol = sanitizeSymbol(data.tokenSymbol) || 'TOKEN';
  const profitSign = (data.profitPercent || 0) >= 0 ? '+' : '-';
  const profitEmoji = (data.profitPercent || 0) >= 0 ? '🟢' : '🔴';

  let resultEmoji = '✅';
  let resultMessage = 'Small flip!';
  const pct = data.profitPercent || 0;
  if (pct >= 100) { resultEmoji = '🚀'; resultMessage = 'MASSIVE HIT! 🎉 AI called it.'; }
  else if (pct >= 50) { resultEmoji = '💪'; resultMessage = 'Solid target lock! 💰'; }
  else if (pct >= 20) { resultEmoji = '✅'; resultMessage = 'Clean extraction.'; }
  else if (pct >= 0) { resultEmoji = '📊'; resultMessage = 'Small win secured.'; }

  // Format hold duration
  let holdDuration = 'N/A';
  if (data.holdDurationMins !== undefined && data.holdDurationMins !== null) {
    if (data.holdDurationMins < 60) holdDuration = `${Math.round(data.holdDurationMins)}m`;
    else holdDuration = `${(data.holdDurationMins / 60).toFixed(1)}h`;
  }

  // Format MCap
  let mcapStr = 'N/A';
  if (data.mcap) {
    if (data.mcap >= 1000000) mcapStr = `${(data.mcap / 1000000).toFixed(1)}M`;
    else if (data.mcap >= 1000) mcapStr = `${(data.mcap / 1000).toFixed(1)}K`;
    else mcapStr = data.mcap.toFixed(0);
  }

  const replacements: Record<string, string> = {
    '{{TOKEN_SYMBOL}}': symbol,
    '{{TOKEN_NAME}}': data.tokenName || symbol,
    '{{TOKEN_CA}}': data.tokenMint || '',
    '{{ENTRY_PRICE}}': data.entryPrice?.toFixed(8) || 'N/A',
    '{{EXIT_PRICE}}': data.exitPrice?.toFixed(8) || 'N/A',
    '{{TARGET_MULTIPLIER}}': String(data.targetMultiplier || 2),
    '{{AMOUNT_SOL}}': data.amountSol?.toFixed(4) || 'N/A',
    '{{AMOUNT_USD}}': data.amountUsd?.toFixed(0) || 'N/A',
    '{{HOLDERS}}': String(data.holders || '?'),
    '{{MCAP}}': mcapStr,
    '{{MULTIPLIER}}': data.multiplier?.toFixed(2) || 'N/A',
    '{{PROFIT_PERCENT}}': Math.abs(data.profitPercent || 0).toFixed(1),
    '{{PROFIT_SOL}}': Math.abs(data.profitSol || 0).toFixed(4),
    '{{PROFIT_SIGN}}': profitSign,
    '{{PROFIT_EMOJI}}': profitEmoji,
    '{{RESULT_EMOJI}}': resultEmoji,
    '{{RESULT_MESSAGE}}': resultMessage,
    '{{HOLD_DURATION}}': holdDuration,
    '{{EXIT_REASON}}': data.exitReason || 'Target hit',
  };

  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  });
  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET) {
      throw new Error("Missing Twitter API credentials");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: FantasyTweetRequest = await req.json();
    const { type, tokenMint, tokenSymbol } = body;

    console.log(`[fantasy-tweet] ${type} request for $${tokenSymbol} (${tokenMint?.slice(0, 8)}...)`);

    // RULE: Only post buys and profitable sells
    if (type === 'sell' && (body.profitPercent === undefined || body.profitPercent <= 0)) {
      console.log(`[fantasy-tweet] Skipping loss sell for $${tokenSymbol} (P&L: ${body.profitPercent}%)`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Loss trade - not posted' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get template from DB
    const { data: tmpl } = await supabase
      .from('fantasy_tweet_templates')
      .select('template_text, is_enabled, post_to_community, post_to_main_feed')
      .eq('template_type', type)
      .single();

    if (tmpl && !tmpl.is_enabled) {
      console.log(`[fantasy-tweet] ${type} template is disabled`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Template disabled' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const templateText = tmpl?.template_text || DEFAULT_TEMPLATES[type] || '';
    const postToCommunity = tmpl?.post_to_community ?? true;
    const postToMainFeed = tmpl?.post_to_main_feed ?? false;

    const tweetText = buildTweetText(templateText, body);
    console.log(`[fantasy-tweet] Built tweet (${tweetText.length} chars):`, tweetText.substring(0, 80) + '...');

    const results: { community?: any; mainFeed?: any } = {};

    // Post to community
    if (postToCommunity) {
      try {
        results.community = await sendTweet(tweetText, COMMUNITY_ID);
        console.log(`[fantasy-tweet] ✅ Posted to community:`, results.community?.data?.id);
      } catch (e: any) {
        console.error(`[fantasy-tweet] ❌ Community post failed:`, e.message);
      }
    }

    // Post to main feed (off by default)
    if (postToMainFeed) {
      try {
        results.mainFeed = await sendTweet(tweetText);
        console.log(`[fantasy-tweet] ✅ Posted to main feed:`, results.mainFeed?.data?.id);
      } catch (e: any) {
        console.error(`[fantasy-tweet] ❌ Main feed post failed:`, e.message);
      }
    }

    const success = !!(results.community?.data?.id || results.mainFeed?.data?.id);

    return new Response(JSON.stringify({
      success,
      tweet_text: tweetText,
      community_id: results.community?.data?.id,
      main_feed_id: results.mainFeed?.data?.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[fantasy-tweet] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
