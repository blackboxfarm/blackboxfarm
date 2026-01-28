import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana contract address pattern (base58, 32-44 chars)
const CONTRACT_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

// Pump.fun URL pattern
const PUMPFUN_URL_PATTERN = /pump\.fun\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})/gi;

// Common ticker patterns
const TICKER_PATTERNS = [
  /\$([A-Z]{2,10})\b/gi,
];

// Common false positive tickers to ignore
const IGNORE_TICKERS = new Set(['SOL', 'ETH', 'BTC', 'USD', 'USDC', 'USDT', 'THE', 'FOR', 'AND', 'NOT', 'ARE', 'BUT', 'NFT', 'APE', 'DCA']);

// Search queries to find token mentions
const SEARCH_QUERIES = [
  'pump.fun -is:retweet -is:reply lang:en',
  '(solana OR $SOL) (gem OR alpha OR moon OR 100x) -is:retweet -is:reply lang:en',
];

interface TwitterUser {
  id: string;
  username: string;
  public_metrics?: {
    followers_count: number;
  };
}

interface TwitterTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
  };
}

interface TwitterSearchResponse {
  data?: TwitterTweet[];
  includes?: {
    users?: TwitterUser[];
  };
  meta?: {
    result_count: number;
    newest_id?: string;
  };
}

function extractContracts(text: string): string[] {
  const contracts = new Set<string>();
  
  // Extract from pump.fun URLs
  let match;
  const pumpPattern = new RegExp(PUMPFUN_URL_PATTERN.source, PUMPFUN_URL_PATTERN.flags);
  while ((match = pumpPattern.exec(text)) !== null) {
    contracts.add(match[1]);
  }
  
  // Extract standalone contract addresses
  const potentialContracts = text.match(CONTRACT_PATTERN) || [];
  for (const addr of potentialContracts) {
    if (addr.length >= 32 && addr.length <= 44) {
      // Basic validation - exclude obvious non-addresses
      if (!addr.startsWith('http') && !addr.includes('.')) {
        contracts.add(addr);
      }
    }
  }
  
  return Array.from(contracts);
}

function extractTickers(text: string): string[] {
  const tickers = new Set<string>();
  
  for (const pattern of TICKER_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const ticker = match[1]?.toUpperCase();
      if (ticker && !IGNORE_TICKERS.has(ticker) && ticker.length >= 2) {
        tickers.add(ticker);
      }
    }
  }
  
  return Array.from(tickers);
}

async function searchTwitter(
  bearerToken: string,
  query: string,
  maxResults: number = 20
): Promise<TwitterSearchResponse | null> {
  const params = new URLSearchParams({
    query,
    max_results: maxResults.toString(),
    'tweet.fields': 'created_at,public_metrics,author_id',
    'user.fields': 'username,public_metrics',
    expansions: 'author_id',
  });

  const url = `https://api.x.com/2/tweets/search/recent?${params}`;
  
  console.log(`Searching Twitter: ${query}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Twitter API error (${response.status}):`, errorText);
    
    // Check for rate limiting
    const remaining = response.headers.get('x-rate-limit-remaining');
    const resetTime = response.headers.get('x-rate-limit-reset');
    console.log(`Rate limit remaining: ${remaining}, resets at: ${resetTime}`);
    
    if (response.status === 429) {
      console.error('Rate limited by Twitter API');
      return null;
    }
    
    throw new Error(`Twitter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Log rate limit status
  const remaining = response.headers.get('x-rate-limit-remaining');
  console.log(`Twitter API rate limit remaining: ${remaining}`);
  
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const bearerToken = Deno.env.get('TWITTER_BEARER_TOKEN');

    if (!bearerToken) {
      throw new Error('TWITTER_BEARER_TOKEN not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Configuration
    const MIN_FOLLOWERS = 500; // Minimum follower count to consider
    const MIN_ENGAGEMENT = 10; // Minimum likes + RTs to consider high-value
    const MAX_AGE_HOURS = 2; // Only consider tweets from last 2 hours
    
    const stats = {
      tweets_scanned: 0,
      contracts_found: 0,
      mentions_saved: 0,
      tokens_queued: 0,
      skipped_low_followers: 0,
      skipped_old: 0,
      skipped_duplicate: 0,
      skipped_no_contract: 0,
    };

    // Get existing tweet IDs to avoid duplicates
    const { data: existingMentions } = await supabase
      .from('twitter_token_mentions')
      .select('tweet_id')
      .order('created_at', { ascending: false })
      .limit(500);
    
    const existingTweetIds = new Set(existingMentions?.map(m => m.tweet_id) || []);

    // Get tokens already in queue or recently posted (last 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentQueueItems } = await supabase
      .from('holders_intel_post_queue')
      .select('token_mint')
      .gte('created_at', yesterday);
    
    const recentlyQueuedMints = new Set(recentQueueItems?.map(q => q.token_mint) || []);

    // Run searches
    for (const query of SEARCH_QUERIES) {
      try {
        const result = await searchTwitter(bearerToken, query, 25);
        
        if (!result?.data) {
          console.log(`No results for query: ${query}`);
          continue;
        }

        // Build user lookup map
        const userMap = new Map<string, TwitterUser>();
        for (const user of result.includes?.users || []) {
          userMap.set(user.id, user);
        }

        const cutoffTime = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000);

        for (const tweet of result.data) {
          stats.tweets_scanned++;
          
          // Skip if already seen
          if (existingTweetIds.has(tweet.id)) {
            stats.skipped_duplicate++;
            continue;
          }

          // Skip if too old
          const tweetTime = new Date(tweet.created_at);
          if (tweetTime < cutoffTime) {
            stats.skipped_old++;
            continue;
          }

          // Get author info
          const author = userMap.get(tweet.author_id);
          const followers = author?.public_metrics?.followers_count || 0;
          
          // Skip low-follower accounts
          if (followers < MIN_FOLLOWERS) {
            stats.skipped_low_followers++;
            continue;
          }

          // Extract contracts and tickers
          const contracts = extractContracts(tweet.text);
          const tickers = extractTickers(tweet.text);

          if (contracts.length === 0) {
            stats.skipped_no_contract++;
            continue;
          }

          stats.contracts_found += contracts.length;

          // Calculate engagement score
          const likes = tweet.public_metrics?.like_count || 0;
          const retweets = tweet.public_metrics?.retweet_count || 0;
          const replies = tweet.public_metrics?.reply_count || 0;
          const engagementScore = likes + retweets + replies;

          // Save the mention
          const mentionData = {
            tweet_id: tweet.id,
            tweet_text: tweet.text,
            tweet_url: `https://x.com/${author?.username || 'unknown'}/status/${tweet.id}`,
            author_username: author?.username || null,
            author_id: tweet.author_id,
            author_followers: followers,
            detected_contracts: contracts,
            detected_tickers: tickers,
            engagement_score: engagementScore,
            likes_count: likes,
            retweets_count: retweets,
            replies_count: replies,
            posted_at: tweet.created_at,
            scanned_at: new Date().toISOString(),
            queued_for_analysis: false,
          };

          const { error: insertError } = await supabase
            .from('twitter_token_mentions')
            .upsert(mentionData, { onConflict: 'tweet_id' });

          if (insertError) {
            console.error(`Error saving mention ${tweet.id}:`, insertError);
            continue;
          }

          stats.mentions_saved++;
          existingTweetIds.add(tweet.id);

          // Queue high-engagement tokens for analysis
          if (engagementScore >= MIN_ENGAGEMENT) {
            for (const contract of contracts) {
              // Skip if already queued recently
              if (recentlyQueuedMints.has(contract)) {
                continue;
              }

              // Check if this contract is already in seen tokens
              const { data: seenToken } = await supabase
                .from('holders_intel_seen_tokens')
                .select('token_mint, was_posted')
                .eq('token_mint', contract)
                .maybeSingle();

              // Skip if already posted
              if (seenToken?.was_posted) {
                continue;
              }

              // Queue for analysis with special trigger source
              const queueItem = {
                token_mint: contract,
                symbol: tickers[0] || 'UNKNOWN',
                name: `Twitter Mention`,
                status: 'pending',
                scheduled_at: new Date().toISOString(),
                snapshot_slot: 'twitter_mention',
                trigger_source: 'twitter_mention',
                trigger_comment: '🐦 Twitter Buzz!',
              };

              const { data: queueResult, error: queueError } = await supabase
                .from('holders_intel_post_queue')
                .insert(queueItem)
                .select('id')
                .single();

              if (!queueError && queueResult) {
                stats.tokens_queued++;
                recentlyQueuedMints.add(contract);

                // Update mention with queue reference
                await supabase
                  .from('twitter_token_mentions')
                  .update({ 
                    queued_for_analysis: true, 
                    queue_id: queueResult.id 
                  })
                  .eq('tweet_id', tweet.id);
              }
            }
          }
        }

        // Small delay between queries to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (queryError: any) {
        console.error(`Error with query "${query}":`, queryError.message);
      }
    }

    console.log('Twitter Token Scanner completed:', stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Twitter token mention scan complete',
        stats,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Twitter Token Scanner error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
