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

// Your X Community ID for FlipIt announcements
const FLIPIT_COMMUNITY_ID = "2001683327686672789";

interface TweetRequest {
  type?: 'buy' | 'sell' | 'rebuy' | 'test';
  eventType?: 'buy' | 'sell' | 'rebuy' | 'test';
  tokenMint?: string;
  tokenSymbol?: string;
  tokenName?: string;
  twitterUrl?: string;
  entryPrice?: number;
  buyPriceUsd?: number;
  exitPrice?: number;
  sellPriceUsd?: number;
  targetMultiplier?: number;
  profitPercent?: number;
  profitSol?: number;
  amountSol?: number;
  txSignature?: string;
  positionId?: string;
  forceTweet?: boolean; // Bypass rate limiting for important tweets
  testMessage?: string; // For test tweets
  postToCommunity?: boolean; // Whether to also post to community (default: true for buys)
  communityOnly?: boolean; // Only post to community, not main feed
}

interface TweetSettings {
  daily_tweet_limit: number;
  min_profit_to_tweet: number;
  tweet_cooldown_minutes: number;
  tweets_enabled: boolean;
  skip_rebuy_tweets: boolean;
}

interface QuotaCheck {
  canTweet: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number;
  minutesSinceLastTweet?: number;
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

const DEFAULT_SETTINGS: TweetSettings = {
  daily_tweet_limit: 40,
  min_profit_to_tweet: 20,
  tweet_cooldown_minutes: 30,
  tweets_enabled: true,
  skip_rebuy_tweets: true,
};

async function getTweetSettings(supabase: any): Promise<TweetSettings> {
  try {
    const { data, error } = await supabase
      .from("flipit_tweet_settings")
      .select("*")
      .limit(1)
      .single();

    if (error || !data) {
      console.log("Using default tweet settings");
      return DEFAULT_SETTINGS;
    }

    return {
      daily_tweet_limit: data.daily_tweet_limit ?? DEFAULT_SETTINGS.daily_tweet_limit,
      min_profit_to_tweet: data.min_profit_to_tweet ?? DEFAULT_SETTINGS.min_profit_to_tweet,
      tweet_cooldown_minutes: data.tweet_cooldown_minutes ?? DEFAULT_SETTINGS.tweet_cooldown_minutes,
      tweets_enabled: data.tweets_enabled ?? DEFAULT_SETTINGS.tweets_enabled,
      skip_rebuy_tweets: data.skip_rebuy_tweets ?? DEFAULT_SETTINGS.skip_rebuy_tweets,
    };
  } catch (e) {
    console.error("Failed to fetch tweet settings:", e);
    return DEFAULT_SETTINGS;
  }
}

async function checkQuota(supabase: any, settings: TweetSettings): Promise<QuotaCheck> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // Get or create today's quota record
    let { data: quotaData, error } = await supabase
      .from("flipit_tweet_quota")
      .select("*")
      .eq("date", today)
      .single();

    if (error && error.code === 'PGRST116') {
      // No record for today, create one
      const { data: newQuota, error: insertError } = await supabase
        .from("flipit_tweet_quota")
        .insert({ date: today, tweet_count: 0 })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to create quota record:", insertError);
        return { canTweet: true }; // Fail open if DB issue
      }
      quotaData = newQuota;
    } else if (error) {
      console.error("Failed to check quota:", error);
      return { canTweet: true }; // Fail open if DB issue
    }

    const currentCount = quotaData.tweet_count || 0;
    const lastTweetAt = quotaData.last_tweet_at ? new Date(quotaData.last_tweet_at) : null;

    // Check daily limit
    if (currentCount >= settings.daily_tweet_limit) {
      return {
        canTweet: false,
        reason: `Daily limit reached (${currentCount}/${settings.daily_tweet_limit})`,
        currentCount,
        limit: settings.daily_tweet_limit,
      };
    }

    // Check cooldown
    if (lastTweetAt && settings.tweet_cooldown_minutes > 0) {
      const minutesSinceLastTweet = (Date.now() - lastTweetAt.getTime()) / (1000 * 60);
      if (minutesSinceLastTweet < settings.tweet_cooldown_minutes) {
        return {
          canTweet: false,
          reason: `Cooldown active (${Math.ceil(settings.tweet_cooldown_minutes - minutesSinceLastTweet)} mins remaining)`,
          currentCount,
          limit: settings.daily_tweet_limit,
          minutesSinceLastTweet: Math.floor(minutesSinceLastTweet),
        };
      }
    }

    return { canTweet: true, currentCount, limit: settings.daily_tweet_limit };
  } catch (e) {
    console.error("Quota check failed:", e);
    return { canTweet: true }; // Fail open
  }
}

async function incrementQuota(supabase: any): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  try {
    // Upsert: increment count and update last_tweet_at
    const { error } = await supabase
      .from("flipit_tweet_quota")
      .upsert(
        { 
          date: today, 
          tweet_count: 1, 
          last_tweet_at: now,
          updated_at: now 
        },
        { 
          onConflict: 'date',
          ignoreDuplicates: false 
        }
      );

    if (error) {
      // Fallback: try update with increment
      await supabase.rpc('increment_tweet_quota', { target_date: today });
    }
    
    // Also try direct SQL increment as final fallback
    await supabase
      .from("flipit_tweet_quota")
      .update({ 
        tweet_count: supabase.raw('tweet_count + 1'),
        last_tweet_at: now,
        updated_at: now
      })
      .eq("date", today);

  } catch (e) {
    console.error("Failed to increment quota:", e);
  }
}

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
  return s.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
}

async function fetchTokenInfo(tokenMint: string): Promise<{ symbol: string; name?: string } | null> {
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.symbol) return { symbol: String(data.symbol), name: String(data.name || data.symbol) };
    }
  } catch (e) {
    console.error("Jupiter token lookup failed:", e);
  }

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
  const { type, tokenSymbol, tokenName, tokenMint, twitterUrl, entryPrice, exitPrice, targetMultiplier, profitPercent, profitSol, amountSol } = data;
  
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
    '{{TOKEN_CA}}': tokenMint || '',
    '{{TOKEN_X}}': twitterUrl || '',
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

async function sendTweet(tweetText: string, communityId?: string): Promise<any> {
  const url = "https://api.x.com/2/tweets";
  const method = "POST";

  const oauthHeader = generateOAuthHeader(method, url);
  console.log("Sending tweet:", tweetText.substring(0, 50) + "...", communityId ? `to community ${communityId}` : "to main feed");

  // Build request body - include community_id if provided
  const requestBody: { text: string; community_id?: string } = { text: tweetText };
  if (communityId) {
    requestBody.community_id = communityId;
  }

  const response = await fetch(url, {
    method: method,
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  console.log("Twitter API Response:", response.status, responseText);

  if (!response.ok) {
    throw new Error(`Twitter API error: ${response.status} - ${responseText}`);
  }

  return JSON.parse(responseText);
}

// Send tweet to both main feed and community
async function sendTweetWithCommunity(
  tweetText: string, 
  postToCommunity: boolean = true,
  communityOnly: boolean = false
): Promise<{ mainFeed?: any; community?: any }> {
  const results: { mainFeed?: any; community?: any } = {};
  
  // Post to main feed (unless communityOnly)
  if (!communityOnly) {
    try {
      results.mainFeed = await sendTweet(tweetText);
      console.log("Posted to main feed:", results.mainFeed?.data?.id);
    } catch (e: any) {
      console.error("Failed to post to main feed:", e.message);
    }
  }
  
  // Also post to community
  if (postToCommunity) {
    try {
      results.community = await sendTweet(tweetText, FLIPIT_COMMUNITY_ID);
      console.log("Posted to community:", results.community?.data?.id);
    } catch (e: any) {
      console.error("Failed to post to community:", e.message);
    }
  }
  
  return results;
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
    
    // Handle test tweets - skip all checks
    if (body.type === 'test' || body.eventType === 'test') {
      const testText = body.testMessage || "TEST";
      console.log("Sending test tweet:", testText);
      
      // For test, only post to community (not main feed)
      const result = await sendTweet(testText, FLIPIT_COMMUNITY_ID);
      
      return new Response(JSON.stringify({ 
        success: true, 
        tweet_id: result.data?.id,
        tweet_text: testText,
        posted_to: "community"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Normalize: accept either 'type' or 'eventType', and 'entryPrice' or 'buyPriceUsd'
    const tweetType = body.type || body.eventType || 'buy';
    const entryPrice = body.entryPrice ?? body.buyPriceUsd;
    const exitPrice = body.exitPrice ?? body.sellPriceUsd;
    
    // Determine if we should post to community (default: true for buys)
    const postToCommunity = body.postToCommunity ?? (tweetType === 'buy');
    const communityOnly = body.communityOnly ?? false;
    
    // Get tweet settings
    const settings = await getTweetSettings(supabase);
    console.log("Tweet settings:", settings);
    
    // Check if tweets are globally enabled
    if (!settings.tweets_enabled) {
      console.log("Tweets are globally disabled");
      return new Response(JSON.stringify({ 
        success: false, 
        skipped: true,
        reason: "Tweets are globally disabled"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Skip rebuy tweets if configured
    if (tweetType === 'rebuy' && settings.skip_rebuy_tweets) {
      console.log("Rebuy tweets are disabled");
      return new Response(JSON.stringify({ 
        success: false, 
        skipped: true,
        reason: "Rebuy tweets are disabled"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // For sells, check minimum profit threshold
    if (tweetType === 'sell' && !body.forceTweet) {
      const profitPct = body.profitPercent || 0;
      // Only tweet if profit exceeds threshold OR if it's a significant loss (< -50%)
      if (profitPct < settings.min_profit_to_tweet && profitPct > -50) {
        console.log(`Profit ${profitPct}% below threshold ${settings.min_profit_to_tweet}%`);
        return new Response(JSON.stringify({ 
          success: false, 
          skipped: true,
          reason: `Profit ${profitPct.toFixed(1)}% below minimum ${settings.min_profit_to_tweet}% threshold`
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    
    // Check quota (rate limiting) unless forceTweet is set
    if (!body.forceTweet) {
      const quotaCheck = await checkQuota(supabase, settings);
      if (!quotaCheck.canTweet) {
        console.log(`Tweet skipped: ${quotaCheck.reason}`);
        return new Response(JSON.stringify({ 
          success: false, 
          skipped: true,
          reason: quotaCheck.reason,
          currentCount: quotaCheck.currentCount,
          limit: quotaCheck.limit
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
   
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

    // First: use DB (we already store token_symbol/token_name/twitter_url on the position)
    if (needsLookup && body.txSignature) {
      const { data, error } = await supabase
        .from("flip_positions")
        .select("token_symbol, token_name, twitter_url, token_mint")
        .or(`buy_signature.eq.${body.txSignature},sell_signature.eq.${body.txSignature}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("DB symbol lookup failed:", error);
      } else if (data) {
        if (data.token_symbol) body.tokenSymbol = data.token_symbol;
        if (data.token_name) body.tokenName = body.tokenName || data.token_name;
        if (data.twitter_url) body.twitterUrl = data.twitter_url;
        if (data.token_mint) body.tokenMint = body.tokenMint || data.token_mint;
        console.log("Resolved token info from DB:", { symbol: body.tokenSymbol, twitterUrl: body.twitterUrl, tokenMint: body.tokenMint });
      }

      rawSymbol = (body.tokenSymbol || "").trim();
      needsLookup = !rawSymbol || rawSymbol === "TOKEN" || rawSymbol === "UNKNOWN";
    }
    
    // Also try to fetch position data by positionId if provided
    if (body.positionId && (!body.twitterUrl || !body.tokenMint)) {
      const { data: posData } = await supabase
        .from("flip_positions")
        .select("token_symbol, token_name, twitter_url, token_mint")
        .eq("id", body.positionId)
        .single();
      
      if (posData) {
        if (!body.tokenSymbol && posData.token_symbol) body.tokenSymbol = posData.token_symbol;
        if (!body.tokenName && posData.token_name) body.tokenName = posData.token_name;
        if (!body.twitterUrl && posData.twitter_url) body.twitterUrl = posData.twitter_url;
        if (!body.tokenMint && posData.token_mint) body.tokenMint = posData.token_mint;
        console.log("Resolved token info from positionId:", { twitterUrl: body.twitterUrl, tokenMint: body.tokenMint });
      }
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
   
    // Send tweet to main feed and/or community
    const results = await sendTweetWithCommunity(tweetText, postToCommunity, communityOnly);
    
    // Consider success if at least one post succeeded
    const success = !!(results.mainFeed?.data?.id || results.community?.data?.id);
    
    if (success) {
      // Increment quota after successful tweet
      await incrementQuota(supabase);
    }
    
    return new Response(JSON.stringify({ 
      success,
      tweet_id: results.mainFeed?.data?.id,
      community_tweet_id: results.community?.data?.id,
      tweet_text: tweetText,
      posted_to: {
        main_feed: !!results.mainFeed?.data?.id,
        community: !!results.community?.data?.id
      }
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
