import { createHmac } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default env credentials (for backward compat)
const DEFAULT_API_KEY = Deno.env.get("TWITTER_CONSUMER_KEY")?.trim();
const DEFAULT_API_SECRET = Deno.env.get("TWITTER_CONSUMER_SECRET")?.trim();
const DEFAULT_ACCESS_TOKEN = Deno.env.get("TWITTER_ACCESS_TOKEN")?.trim();
const DEFAULT_ACCESS_TOKEN_SECRET = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET")?.trim();

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

function generateOAuthHeader(
  method: string, 
  url: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string
): string {
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    apiSecret,
    accessTokenSecret
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

async function sendTweet(
  tweetText: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  communityId?: string
): Promise<any> {
  const url = "https://api.x.com/2/tweets";
  const method = "POST";
  const oauthHeader = generateOAuthHeader(method, url, apiKey, apiSecret, accessToken, accessTokenSecret);

  console.log("Sending tweet:", tweetText.substring(0, 50) + "...");
  if (communityId) {
    console.log("Posting to X Community:", communityId);
  }

  // Build request body
  const body: Record<string, any> = { text: tweetText };
  if (communityId) {
    body.community_id = communityId;
  }

  const response = await fetch(url, {
    method: method,
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log("Twitter API response status:", response.status);

  if (!response.ok) {
    console.error("Twitter API error:", responseText);
    // Bubble up the raw response for better troubleshooting
    throw new Error(`Twitter API error: ${response.status} - ${responseText}`);
  }

  return JSON.parse(responseText);
}

function formatTwitterErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  // Common X/Twitter misconfiguration: app has Read-only permissions.
  if (msg.includes('oauth1-permissions') || msg.includes('not configured with the appropriate oauth1 app permissions')) {
    return [
      msg,
      "\n\nFIX: In the X Developer Portal, set your App permissions to 'Read and Write', then regenerate the Access Token & Secret used for this account.",
    ].join('');
  }

  return msg;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tweetText, twitterHandle, tokenStats, communityId } = body;

    // Determine tweet content
    let finalTweetText: string;

    if (tweetText) {
      // Use the provided template-processed tweet text directly
      finalTweetText = tweetText;
    } else if (tokenStats) {
      // Legacy: build tweet from tokenStats (backward compat)
      const dustPct = tokenStats.dustPercentage || Math.round((tokenStats.dustCount / tokenStats.totalHolders) * 100);
      finalTweetText = `🔍 $${tokenStats.symbol} Holder Analysis

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
    } else {
      throw new Error("Missing tweetText or tokenStats in request body");
    }

    // Determine credentials
    let apiKey = DEFAULT_API_KEY;
    let apiSecret = DEFAULT_API_SECRET;
    let accessToken = DEFAULT_ACCESS_TOKEN;
    let accessTokenSecret = DEFAULT_ACCESS_TOKEN_SECRET;

    // If a specific twitter handle is requested, fetch credentials from DB
    if (twitterHandle) {
      console.log(`Looking up credentials for @${twitterHandle}`);
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: account, error } = await supabase
        .from('twitter_accounts')
        .select('api_key_encrypted, api_secret_encrypted, access_token_encrypted, access_token_secret_encrypted')
        .eq('username', twitterHandle)
        .single();

      if (error || !account) {
        console.error('Failed to fetch twitter account:', error);
        throw new Error(`Twitter account @${twitterHandle} not found or missing credentials`);
      }

      if (!account.api_key_encrypted || !account.access_token_encrypted) {
        throw new Error(`Twitter account @${twitterHandle} is missing API credentials`);
      }

      // Use the account's credentials (they're stored as plaintext with "_encrypted" suffix)
      apiKey = account.api_key_encrypted;
      apiSecret = account.api_secret_encrypted;
      accessToken = account.access_token_encrypted;
      accessTokenSecret = account.access_token_secret_encrypted;

      console.log(`Using credentials for @${twitterHandle}`);
    }

    // Validate credentials
    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      throw new Error("Missing Twitter API credentials");
    }

    console.log("Tweet length:", finalTweetText.length);
    if (communityId) {
      console.log("Target community:", communityId);
    }

    const result = await sendTweet(finalTweetText, apiKey, apiSecret, accessToken, accessTokenSecret, communityId);

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
    const friendly = formatTwitterErrorMessage(error);
    return new Response(
      // IMPORTANT: return 200 so supabase-js doesn't throw FunctionsHttpError,
      // allowing the client to show the real error message.
      JSON.stringify({ success: false, error: friendly }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
