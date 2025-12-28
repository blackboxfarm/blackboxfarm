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

function validateEnvironmentVariables() {
  if (!API_KEY) throw new Error("Missing TWITTER_CONSUMER_KEY");
  if (!API_SECRET) throw new Error("Missing TWITTER_CONSUMER_SECRET");
  if (!ACCESS_TOKEN) throw new Error("Missing TWITTER_ACCESS_TOKEN");
  if (!ACCESS_TOKEN_SECRET) throw new Error("Missing TWITTER_ACCESS_TOKEN_SECRET");
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(
    Object.entries(params)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
  )}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const hmacSha1 = createHmac("sha1", signingKey);
  return hmacSha1.update(signatureBaseString).digest("base64");
}

function generateOAuthHeader(method: string, url: string): string {
  const oauthParams = {
    oauth_consumer_key: API_KEY!,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN!,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    API_SECRET!,
    ACCESS_TOKEN_SECRET!
  );

  const signedOAuthParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  return (
    "OAuth " +
    Object.entries(signedOAuthParams)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(", ")
  );
}

interface TweetRequest {
  type?: 'buy' | 'sell' | 'rebuy';
  eventType?: 'buy' | 'sell' | 'rebuy';
  tokenMint?: string;
  tokenSymbol?: string;
  tokenName?: string;
  entryPrice?: number;
  buyPriceUsd?: number;
  exitPrice?: number;
  sellPriceUsd?: number;
  targetMultiplier?: number;
  profitPercent?: number;
  profitSol?: number;
  amountSol?: number;
  txSignature?: string;
}

// Default templates (fallback if DB not available)
const DEFAULT_TEMPLATES: Record<string, string> = {
  buy: `🎯 FLIP IT: Just entered \${{TOKEN_SYMBOL}}

💰 Entry: \${{ENTRY_PRICE}}
🎯 Target: {{TARGET_MULTIPLIER}}x
📊 Amount: {{AMOUNT_SOL}} SOL

Let's see if this one prints! 🚀

#Solana #{{TOKEN_SYMBOL}} #FlipIt`,
  sell: `{{PROFIT_EMOJI}} FLIP IT CLOSED: \${{TOKEN_SYMBOL}}

💰 Entry: \${{ENTRY_PRICE}}
💵 Exit: \${{EXIT_PRICE}}
{{RESULT_EMOJI}} PnL: {{PROFIT_SIGN}}{{PROFIT_PERCENT}}% ({{PROFIT_SIGN}}{{PROFIT_SOL}} SOL)

{{RESULT_MESSAGE}}

#Solana #{{TOKEN_SYMBOL}} #FlipIt`,
  rebuy: `🔄 FLIP IT REBUY: \${{TOKEN_SYMBOL}}

💰 New Entry: \${{ENTRY_PRICE}}
🎯 Target: {{TARGET_MULTIPLIER}}x
📊 Amount: {{AMOUNT_SOL}} SOL

Back in for another round! 🎰

#Solana #{{TOKEN_SYMBOL}} #FlipIt`,
};

async function getTemplate(supabase: any, templateType: string): Promise<{ text: string; enabled: boolean }> {
  try {
    const { data, error } = await supabase
      .from("flipit_tweet_templates")
      .select("template_text, is_enabled")
      .eq("template_type", templateType)
      .single();

    if (error || !data) {
      console.log(`Using default template for ${templateType}`);
      return { text: DEFAULT_TEMPLATES[templateType] || "", enabled: true };
    }

    return { text: data.template_text, enabled: data.is_enabled };
  } catch (e) {
    console.error("Failed to fetch template:", e);
    return { text: DEFAULT_TEMPLATES[templateType] || "", enabled: true };
  }
}

function sanitizeSymbol(input: string | undefined): string {
  const s = (input || "").trim();
  // Keep it hashtag-friendly and predictable
  return s.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
}

async function fetchTokenInfo(tokenMint: string): Promise<{ symbol: string; name?: string } | null> {
  // Primary: Jupiter token endpoint
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.symbol) return { symbol: String(data.symbol), name: String(data.name || data.symbol) };
    }
  } catch (e) {
    console.error("Jupiter token lookup failed:", e);
  }

  // Fallback: DexScreener
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      const pair = data?.pairs?.[0];
      if (pair?.baseToken?.symbol) {
        return { symbol: pair.baseToken.symbol, name: pair.baseToken.name || pair.baseToken.symbol };
      }
    }
  } catch (e) {
    console.error("DexScreener token lookup failed:", e);
  }

  return null;
}

function buildTweetText(template: string, data: TweetRequest): string {
  const { type, tokenSymbol, tokenName, entryPrice, exitPrice, targetMultiplier, profitPercent, profitSol, amountSol } = data;
  
  const symbol = sanitizeSymbol(tokenSymbol) || 'TOKEN';
  const profitSign = (profitPercent || 0) >= 0 ? '+' : '';
  const profitEmoji = (profitPercent || 0) >= 0 ? '🟢' : '🔴';
  
  let resultEmoji = '✅';
  let resultMessage = 'Small win!';
  
  if (type === 'sell') {
    if ((profitPercent || 0) >= 100) {
      resultEmoji = '🚀';
      resultMessage = 'MASSIVE WIN! 🎉';
    } else if ((profitPercent || 0) >= 50) {
      resultEmoji = '💪';
      resultMessage = 'Solid flip! 💰';
    } else if ((profitPercent || 0) >= 0) {
      resultEmoji = '✅';
      resultMessage = 'Small win!';
    } else {
      resultEmoji = '📉';
      resultMessage = 'Took the L, moving on.';
    }
  }

  const replacements: Record<string, string> = {
    '{{TOKEN_SYMBOL}}': symbol,
    '{{TOKEN_NAME}}': tokenName || symbol,
    '{{ENTRY_PRICE}}': entryPrice?.toFixed(8) || 'N/A',
    '{{EXIT_PRICE}}': exitPrice?.toFixed(8) || 'N/A',
    '{{TARGET_MULTIPLIER}}': String(targetMultiplier || 2),
    '{{AMOUNT_SOL}}': amountSol?.toFixed(4) || 'N/A',
    '{{PROFIT_PERCENT}}': Math.abs(profitPercent || 0).toFixed(2),
    '{{PROFIT_SOL}}': Math.abs(profitSol || 0).toFixed(4),
    '{{PROFIT_SIGN}}': profitSign,
    '{{PROFIT_EMOJI}}': profitEmoji,
    '{{RESULT_EMOJI}}': resultEmoji,
    '{{RESULT_MESSAGE}}': resultMessage,
  };

  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  });

  return text;
}

async function sendTweet(tweetText: string): Promise<any> {
  const url = "https://api.x.com/2/tweets";
  const method = "POST";

  const oauthHeader = generateOAuthHeader(method, url);
  console.log("Sending tweet:", tweetText.substring(0, 50) + "...");

  const response = await fetch(url, {
    method: method,
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: tweetText }),
  });

  const responseText = await response.text();
  console.log("Twitter API Response:", response.status, responseText);

  if (!response.ok) {
    throw new Error(`Twitter API error: ${response.status} - ${responseText}`);
  }

  return JSON.parse(responseText);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    validateEnvironmentVariables();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
     let body: TweetRequest = await req.json();
     console.log("Tweet request:", JSON.stringify(body));
     
     // Normalize: accept either 'type' or 'eventType', and 'entryPrice' or 'buyPriceUsd'
     const tweetType = body.type || body.eventType || 'buy';
     const entryPrice = body.entryPrice ?? body.buyPriceUsd;
     const exitPrice = body.exitPrice ?? body.sellPriceUsd;
    
     // Get template from database
     const { text: template, enabled } = await getTemplate(supabase, tweetType);
     
     if (!enabled) {
       console.log(`Tweeting disabled for ${tweetType}`);
       return new Response(JSON.stringify({ 
         success: false, 
         skipped: true,
         reason: `${tweetType} tweets are disabled`
       }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     }

     // Resolve token symbol/name if missing
     let rawSymbol = (body.tokenSymbol || "").trim();
     let needsLookup = !rawSymbol || rawSymbol === "TOKEN" || rawSymbol === "UNKNOWN";

     // First: use DB (we already store token_symbol/token_name on the position)
     if (needsLookup && body.txSignature) {
       const { data, error } = await supabase
         .from("flip_positions")
         .select("token_symbol, token_name")
         .or(`buy_signature.eq.${body.txSignature},sell_signature.eq.${body.txSignature}`)
         .order("created_at", { ascending: false })
         .limit(1)
         .maybeSingle();

       if (error) {
         console.warn("DB symbol lookup failed:", error);
       } else if (data?.token_symbol) {
         body.tokenSymbol = data.token_symbol;
         body.tokenName = body.tokenName || data.token_name || undefined;
         console.log("Resolved token info from DB:", { symbol: body.tokenSymbol });
       }

       rawSymbol = (body.tokenSymbol || "").trim();
       needsLookup = !rawSymbol || rawSymbol === "TOKEN" || rawSymbol === "UNKNOWN";
     }

     // Fallback: external lookup by mint
     if (needsLookup && body.tokenMint) {
       const meta = await fetchTokenInfo(body.tokenMint);
       if (meta?.symbol) {
         body.tokenSymbol = meta.symbol;
         body.tokenName = body.tokenName || meta.name;
         console.log("Resolved token info:", { tokenMint: body.tokenMint, symbol: body.tokenSymbol });
       }
     }
     
     // Merge normalized values back into body for buildTweetText
     body.type = tweetType;
     body.entryPrice = entryPrice;
     body.exitPrice = exitPrice;
     
     const tweetText = buildTweetText(template, body);
     console.log("Generated tweet text:", tweetText);
    
    const result = await sendTweet(tweetText);
    
    return new Response(JSON.stringify({ 
      success: true, 
      tweet_id: result.data?.id,
      tweet_text: tweetText 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Tweet error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
