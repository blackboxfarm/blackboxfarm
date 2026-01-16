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
  console.log("Twitter API response status:", response.status);

  if (!response.ok) {
    console.error("Twitter API error:", responseText);
    throw new Error(`Twitter API error: ${response.status} - ${responseText}`);
  }

  return JSON.parse(responseText);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    validateEnvironmentVariables();

    const body = await req.json();
    const { tokenStats } = body;

    if (!tokenStats) {
      throw new Error("Missing tokenStats in request body");
    }

    console.log("Generating tweet for token:", tokenStats.symbol);

    // Build the tweet text with holder analysis data
    const dustPct = tokenStats.dustPercentage || Math.round((tokenStats.dustCount / tokenStats.totalHolders) * 100);
    
    const tweetText = `🔍 $${tokenStats.symbol} Holder Analysis

📊 ${tokenStats.totalHolders.toLocaleString()} Total Wallets
↓
✅ Only ${tokenStats.realHolders.toLocaleString()} Real Holders!

${dustPct}% are dust wallets from failed txns

🐋 ${tokenStats.whaleCount} Whales ($5K+)
💪 ${tokenStats.strongCount} Strong ($50-$5K)
🌱 ${tokenStats.activeCount.toLocaleString()} Active ($1-$50)
💨 ${tokenStats.dustCount.toLocaleString()} Dust (<$1)

Health Grade: ${tokenStats.healthGrade} (${tokenStats.healthScore}/100)

Free report 👉 blackbox.farm/holders`;

    console.log("Tweet length:", tweetText.length);

    const result = await sendTweet(tweetText);

    console.log("Tweet posted successfully:", result.data?.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        tweetId: result.data?.id,
        tweetUrl: `https://x.com/i/status/${result.data?.id}`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error posting tweet:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
