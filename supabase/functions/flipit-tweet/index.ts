import { createHmac } from "node:crypto";

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
  type: 'buy' | 'sell' | 'rebuy';
  tokenSymbol: string;
  tokenName?: string;
  entryPrice?: number;
  exitPrice?: number;
  targetMultiplier?: number;
  profitPercent?: number;
  profitSol?: number;
  amountSol?: number;
  txSignature?: string;
}

function buildTweetText(data: TweetRequest): string {
  const { type, tokenSymbol, tokenName, entryPrice, exitPrice, targetMultiplier, profitPercent, profitSol, amountSol, txSignature } = data;
  
  const symbol = tokenSymbol || 'TOKEN';
  const name = tokenName || symbol;
  
  switch (type) {
    case 'buy':
      return `🎯 FLIP IT: Just entered $${symbol}

💰 Entry: $${entryPrice?.toFixed(8) || 'N/A'}
🎯 Target: ${targetMultiplier || 2}x
📊 Amount: ${amountSol?.toFixed(4) || 'N/A'} SOL

Let's see if this one prints! 🚀

#Solana #${symbol} #FlipIt`;

    case 'sell':
      const emoji = (profitPercent || 0) >= 0 ? '🟢' : '🔴';
      const profitEmoji = (profitPercent || 0) >= 100 ? '🚀' : (profitPercent || 0) >= 50 ? '💪' : (profitPercent || 0) >= 0 ? '✅' : '📉';
      return `${emoji} FLIP IT CLOSED: $${symbol}

💰 Entry: $${entryPrice?.toFixed(8) || 'N/A'}
💵 Exit: $${exitPrice?.toFixed(8) || 'N/A'}
${profitEmoji} PnL: ${(profitPercent || 0) >= 0 ? '+' : ''}${profitPercent?.toFixed(2) || '0'}% (${(profitSol || 0) >= 0 ? '+' : ''}${profitSol?.toFixed(4) || '0'} SOL)

${(profitPercent || 0) >= 100 ? 'MASSIVE WIN! 🎉' : (profitPercent || 0) >= 50 ? 'Solid flip! 💰' : (profitPercent || 0) >= 0 ? 'Small win!' : 'Took the L, moving on.'}

#Solana #${symbol} #FlipIt`;

    case 'rebuy':
      return `🔄 FLIP IT REBUY: $${symbol}

💰 New Entry: $${entryPrice?.toFixed(8) || 'N/A'}
🎯 Target: ${targetMultiplier || 2}x
📊 Amount: ${amountSol?.toFixed(4) || 'N/A'} SOL

Back in for another round! 🎰

#Solana #${symbol} #FlipIt`;

    default:
      return `FlipIt trade on $${symbol}`;
  }
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
    
    const body: TweetRequest = await req.json();
    console.log("Tweet request:", JSON.stringify(body));
    
    const tweetText = buildTweetText(body);
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
