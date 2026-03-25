import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from "../_shared/run-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * reconcile-x-posts
 * 
 * Fetches recent tweets from @HoldersIntel via the X API v2,
 * extracts Solana token mint addresses mentioned in tweet text,
 * and backfills holders_intel_post_queue + holders_intel_seen_tokens
 * so the Dex feed table shows accurate "Posted" status.
 */

// OAuth 1.0a helpers
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildOAuthHeader(method: string, url: string, params: Record<string, string> = {}): Promise<string> {
  const consumerKey = Deno.env.get('TWITTER_CONSUMER_KEY')!;
  const consumerSecret = Deno.env.get('TWITTER_CONSUMER_SECRET')!;
  const accessToken = Deno.env.get('TWITTER_ACCESS_TOKEN')!;
  const accessTokenSecret = Deno.env.get('TWITTER_ACCESS_TOKEN_SECRET')!;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  // Combine all params for signature base
  const allParams = { ...params, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys.map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`).join('&');

  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;
  const signature = await hmacSha1(signingKey, signatureBase);

  oauthParams['oauth_signature'] = signature;
  const headerParts = Object.keys(oauthParams).sort().map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`);
  return `OAuth ${headerParts.join(', ')}`;
}

// Solana mint address regex (32-44 base58 chars)
const MINT_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

// Known non-mint patterns to exclude
const EXCLUDE_PATTERNS = ['blackbox', 'farm', 'holders', 'twitter', 'http', 'pump'];

function extractMints(text: string): string[] {
  const matches = text.match(MINT_REGEX) || [];
  return matches.filter(m => {
    if (m.length < 32 || m.length > 44) return false;
    const lower = m.toLowerCase();
    return !EXCLUDE_PATTERNS.some(p => lower.includes(p));
  });
}

Deno.serve(withRunLog('reconcile-x-posts', async (req, logger) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Parse optional params
  let maxResults = 100; // max allowed by X API v2 for user timeline
  try {
    const body = await req.clone().text();
    if (body) {
      const parsed = JSON.parse(body);
      if (parsed.max_results) maxResults = Math.min(parsed.max_results, 100);
    }
  } catch { /* ignore */ }

  logger?.info('Starting X post reconciliation', { maxResults });

  // Step 1: Get @HoldersIntel user ID (cached or lookup)
  let userId: string | null = null;

  // Try to get from config first
  const { data: configRow } = await supabase
    .from('holders_intel_config')
    .select('value')
    .eq('key', 'x_user_id')
    .maybeSingle();

  if (configRow?.value) {
    userId = configRow.value;
  } else {
    // Lookup via X API
    const lookupUrl = 'https://api.x.com/2/users/by/username/HoldersIntel';
    const authHeader = await buildOAuthHeader('GET', lookupUrl);
    const lookupRes = await fetch(lookupUrl, {
      headers: { 'Authorization': authHeader },
    });
    const lookupData = await lookupRes.json();
    if (lookupData.data?.id) {
      userId = lookupData.data.id;
      // Cache it
      await supabase.from('holders_intel_config').upsert({
        key: 'x_user_id',
        value: userId,
      });
    } else {
      logger?.error('Failed to lookup @HoldersIntel user ID', lookupData);
      return new Response(JSON.stringify({ error: 'Failed to lookup user ID', details: lookupData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  logger?.info('Using X user ID', { userId });

  // Step 2: Fetch recent tweets
  const timelineUrl = `https://api.x.com/2/users/${userId}/tweets`;
  const queryParams: Record<string, string> = {
    'max_results': maxResults.toString(),
    'tweet.fields': 'created_at,text',
    'exclude': 'retweets,replies',
  };

  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const fullUrl = `${timelineUrl}?${queryString}`;

  const authHeader = await buildOAuthHeader('GET', timelineUrl, queryParams);
  const tweetsRes = await fetch(fullUrl, {
    headers: { 'Authorization': authHeader },
  });

  if (!tweetsRes.ok) {
    const errBody = await tweetsRes.text();
    logger?.error(`X API error ${tweetsRes.status}`, errBody);
    return new Response(JSON.stringify({ error: `X API ${tweetsRes.status}`, body: errBody }), {
      status: tweetsRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const tweetsData = await tweetsRes.json();
  const tweets = tweetsData.data || [];
  logger?.info(`Fetched ${tweets.length} tweets`);

  // Step 3: Extract mints from each tweet
  const mintTweetMap = new Map<string, { tweetId: string; tweetedAt: string; symbol?: string }>();

  for (const tweet of tweets) {
    const mints = extractMints(tweet.text);
    // Also try to extract $SYMBOL
    const symbolMatch = tweet.text.match(/\$([A-Za-z0-9_]+)/);
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : undefined;

    for (const mint of mints) {
      if (!mintTweetMap.has(mint)) {
        mintTweetMap.set(mint, {
          tweetId: tweet.id,
          tweetedAt: tweet.created_at,
          symbol,
        });
      }
    }
  }

  logger?.info(`Extracted ${mintTweetMap.size} unique mints from tweets`);

  if (mintTweetMap.size === 0) {
    return new Response(JSON.stringify({ 
      reconciled: 0, 
      tweets_scanned: tweets.length,
      message: 'No token mints found in recent tweets' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Step 4: Check which mints are NOT already marked as posted
  const allMints = Array.from(mintTweetMap.keys());

  const [queueRes, seenRes] = await Promise.all([
    supabase.from('holders_intel_post_queue')
      .select('token_mint, status, tweet_id')
      .in('token_mint', allMints),
    supabase.from('holders_intel_seen_tokens')
      .select('token_mint, was_posted')
      .in('token_mint', allMints),
  ]);

  const queueStatusMap = new Map<string, { status: string; hasTweetId: boolean }>();
  for (const q of (queueRes.data || [])) {
    const existing = queueStatusMap.get(q.token_mint);
    if (q.status === 'posted' || !existing) {
      queueStatusMap.set(q.token_mint, { status: q.status, hasTweetId: !!q.tweet_id });
    }
  }

  const seenPostMap = new Map<string, boolean>();
  for (const s of (seenRes.data || [])) {
    seenPostMap.set(s.token_mint, s.was_posted ?? false);
  }

  let reconciledQueue = 0;
  let reconciledSeen = 0;
  let alreadyCorrect = 0;

  for (const [mint, info] of mintTweetMap) {
    const queueEntry = queueStatusMap.get(mint);
    const seenWasPosted = seenPostMap.get(mint);

    // Update post_queue if exists but not marked posted
    if (queueEntry && queueEntry.status !== 'posted') {
      const { error } = await supabase
        .from('holders_intel_post_queue')
        .update({
          status: 'posted',
          posted_at: info.tweetedAt,
          tweet_id: info.tweetId,
        })
        .eq('token_mint', mint)
        .neq('status', 'posted');
      if (!error) reconciledQueue++;
    } else if (queueEntry && !queueEntry.hasTweetId) {
      // Has posted status but missing tweet_id — backfill it
      await supabase
        .from('holders_intel_post_queue')
        .update({ tweet_id: info.tweetId })
        .eq('token_mint', mint)
        .is('tweet_id', null);
    }

    // If not in queue at all, insert a reconciled entry
    if (!queueEntry) {
      const { error } = await supabase
        .from('holders_intel_post_queue')
        .insert({
          token_mint: mint,
          status: 'posted',
          posted_at: info.tweetedAt,
          tweet_id: info.tweetId,
          symbol: info.symbol || null,
          trigger_source: 'x_reconcile',
          trigger_comment: 'Backfilled from X post reconciliation',
          scheduled_at: info.tweetedAt,
        });
      if (!error) reconciledQueue++;
    }

    // Update seen_tokens
    if (seenWasPosted === false) {
      const { error } = await supabase
        .from('holders_intel_seen_tokens')
        .update({ was_posted: true })
        .eq('token_mint', mint)
        .eq('was_posted', false);
      if (!error) reconciledSeen++;
    } else if (seenWasPosted === undefined) {
      // Not in seen_tokens — upsert
      const { error } = await supabase
        .from('holders_intel_seen_tokens')
        .upsert({
          token_mint: mint,
          was_posted: true,
          symbol: info.symbol || null,
          first_seen_at: info.tweetedAt,
          last_seen_at: info.tweetedAt,
          times_seen: 1,
          times_posted: 1,
        }, { onConflict: 'token_mint' });
      if (!error) reconciledSeen++;
    } else {
      alreadyCorrect++;
    }
  }

  const summary = {
    tweets_scanned: tweets.length,
    unique_mints_found: mintTweetMap.size,
    queue_reconciled: reconciledQueue,
    seen_reconciled: reconciledSeen,
    already_correct: alreadyCorrect,
  };

  logger?.info('Reconciliation complete', summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
