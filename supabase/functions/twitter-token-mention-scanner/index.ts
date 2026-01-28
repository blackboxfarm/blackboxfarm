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

// We now search for specific tokens from our data sources instead of generic queries
// Configuration thresholds
const MIN_FOLLOWERS = 500;
const MIN_QUALITY_SCORE = 50;
const MAX_AGE_HOURS = 2;
const VERIFIED_BONUS = 500;
const INFLUENCER_THRESHOLD = 10000;
const MAJOR_INFLUENCER_THRESHOLD = 50000;

interface TwitterUser {
  id: string;
  username: string;
  public_metrics?: {
    followers_count: number;
  };
  verified_type?: string;
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
    impression_count?: number;
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

interface SavedMention {
  tweet_id: string;
  detected_contracts: string[];
  quality_score: number;
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

function calculateQualityScore(
  likes: number,
  retweets: number,
  replies: number,
  impressions: number,
  followers: number,
  isVerified: boolean
): number {
  // Base engagement score with weighted metrics
  let score = (likes * 3) + (retweets * 5) + (replies * 2);
  
  // Views contribute less (1 point per 1000 views)
  score += Math.floor(impressions / 1000);
  
  // Verified account bonus
  if (isVerified) {
    score += VERIFIED_BONUS;
  }
  
  // Influencer bonuses
  if (followers > MAJOR_INFLUENCER_THRESHOLD) {
    score += 500; // Major influencer
  } else if (followers > INFLUENCER_THRESHOLD) {
    score += 200; // Regular influencer
  }
  
  return score;
}

async function searchTwitter(
  bearerToken: string,
  query: string,
  maxResults: number = 25
): Promise<TwitterSearchResponse | null> {
  const params = new URLSearchParams({
    query,
    max_results: maxResults.toString(),
    'tweet.fields': 'created_at,public_metrics,author_id',
    'user.fields': 'username,public_metrics,verified_type',
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
    
    const stats = {
      tweets_scanned: 0,
      contracts_found: 0,
      mentions_saved: 0,
      tokens_queued: 0,
      skipped_low_followers: 0,
      skipped_old: 0,
      skipped_duplicate: 0,
      skipped_no_contract: 0,
      verified_accounts: 0,
      best_sources_selected: 0,
      duplicates_marked: 0,
      tokens_from_queue: 0,
      tokens_from_seen: 0,
      tokens_from_dex: 0,
    };

    // STEP 1: Gather tokens from our data sources
    const tokensToSearch: Array<{ mint: string; symbol: string; source: string }> = [];

    // Source 1: Recent queue items (last 48h)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: queueTokens } = await supabase
      .from('holders_intel_post_queue')
      .select('token_mint, symbol')
      .gte('created_at', twoDaysAgo)
      .limit(20);
    
    for (const token of queueTokens || []) {
      if (token.token_mint && !tokensToSearch.find(t => t.mint === token.token_mint)) {
        tokensToSearch.push({ mint: token.token_mint, symbol: token.symbol || 'UNKNOWN', source: 'queue' });
        stats.tokens_from_queue++;
      }
    }

    // Source 2: Recent seen tokens (last 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: seenTokens } = await supabase
      .from('holders_intel_seen_tokens')
      .select('token_mint, symbol')
      .gte('first_seen_at', yesterday)
      .limit(30);
    
    for (const token of seenTokens || []) {
      if (token.token_mint && !tokensToSearch.find(t => t.mint === token.token_mint)) {
        tokensToSearch.push({ mint: token.token_mint, symbol: token.symbol || 'UNKNOWN', source: 'seen' });
        stats.tokens_from_seen++;
      }
    }

    // Source 3: Recent DEX trending data (dex_trending_tokens last 24h)
    const { data: dexTokens } = await supabase
      .from('dex_trending_tokens')
      .select('token_address, symbol')
      .gte('fetched_at', yesterday)
      .limit(20);
    
    for (const token of dexTokens || []) {
      if (token.token_address && !tokensToSearch.find(t => t.mint === token.token_address)) {
        tokensToSearch.push({ mint: token.token_address, symbol: token.symbol || 'UNKNOWN', source: 'dex' });
        stats.tokens_from_dex++;
      }
    }

    console.log(`Found ${tokensToSearch.length} tokens to search Twitter for (queue: ${stats.tokens_from_queue}, seen: ${stats.tokens_from_seen}, dex: ${stats.tokens_from_dex})`);

    // Get existing tweet IDs to avoid duplicates
    const { data: existingMentions } = await supabase
      .from('twitter_token_mentions')
      .select('tweet_id')
      .order('created_at', { ascending: false })
      .limit(500);
    
    const existingTweetIds = new Set(existingMentions?.map(m => m.tweet_id) || []);

    // Get tokens already queued recently (last 24h) to avoid re-queueing
    const { data: recentQueueItems } = await supabase
      .from('holders_intel_post_queue')
      .select('token_mint')
      .gte('created_at', yesterday);
    
    const recentlyQueuedMints = new Set(recentQueueItems?.map(q => q.token_mint) || []);

    // Collect all saved mentions for deduplication pass
    const savedMentions: SavedMention[] = [];

    // PASS 1: Search Twitter for each token from our data sources
    for (const tokenInfo of tokensToSearch) {
      try {
        // Build search query for this specific token
        // Search by contract address OR ticker symbol
        const shortMint = tokenInfo.mint.slice(0, 8);
        const query = `(${shortMint} OR $${tokenInfo.symbol}) -is:retweet -is:reply lang:en`;
        
        console.log(`Searching Twitter for ${tokenInfo.symbol} (${tokenInfo.source}): ${shortMint}...`);
        
        const result = await searchTwitter(bearerToken, query, 15);
        
        if (!result?.data) {
          console.log(`No results for ${tokenInfo.symbol}`);
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
          const verifiedType = author?.verified_type || null;
          const isVerified = !!verifiedType;
          
          // Skip low-follower accounts
          if (followers < MIN_FOLLOWERS) {
            stats.skipped_low_followers++;
            continue;
          }

          // For targeted searches, we already know the contract - use the token we searched for
          // Also extract any additional contracts mentioned
          const additionalContracts = extractContracts(tweet.text);
          const contracts = [tokenInfo.mint, ...additionalContracts.filter(c => c !== tokenInfo.mint)];
          const tickers = extractTickers(tweet.text);

          stats.contracts_found++;
          if (isVerified) stats.verified_accounts++;

          // Get engagement metrics
          const likes = tweet.public_metrics?.like_count || 0;
          const retweets = tweet.public_metrics?.retweet_count || 0;
          const replies = tweet.public_metrics?.reply_count || 0;
          const impressions = tweet.public_metrics?.impression_count || 0;

          // Calculate quality score
          const qualityScore = calculateQualityScore(
            likes,
            retweets,
            replies,
            impressions,
            followers,
            isVerified
          );

          // Save the mention with quality data
          const mentionData = {
            tweet_id: tweet.id,
            tweet_text: tweet.text,
            tweet_url: `https://x.com/${author?.username || 'unknown'}/status/${tweet.id}`,
            author_username: author?.username || null,
            author_id: tweet.author_id,
            author_followers: followers,
            detected_contracts: contracts,
            detected_tickers: tickers.length > 0 ? tickers : [tokenInfo.symbol],
            engagement_score: likes + retweets + replies,
            likes_count: likes,
            retweets_count: retweets,
            replies_count: replies,
            impression_count: impressions,
            is_verified: isVerified,
            verified_type: verifiedType,
            quality_score: qualityScore,
            posted_at: tweet.created_at,
            scanned_at: new Date().toISOString(),
            queued_for_analysis: false,
            is_best_source: null,
            duplicate_of: null,
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
          
          // Track for deduplication pass
          savedMentions.push({
            tweet_id: tweet.id,
            detected_contracts: contracts,
            quality_score: qualityScore,
          });
        }

        // Small delay between token searches to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (queryError: any) {
        console.error(`Error searching for ${tokenInfo.symbol}:`, queryError.message);
      }
    }

    // PASS 2: Deduplicate by contract - pick best source for each token
    const contractToTweets = new Map<string, Array<{ tweet_id: string; quality_score: number }>>();

    for (const mention of savedMentions) {
      for (const contract of mention.detected_contracts) {
        if (!contractToTweets.has(contract)) {
          contractToTweets.set(contract, []);
        }
        contractToTweets.get(contract)!.push({
          tweet_id: mention.tweet_id,
          quality_score: mention.quality_score,
        });
      }
    }

    // For each contract, pick the best tweet and queue it
    for (const [contract, tweets] of contractToTweets) {
      // Sort by quality score descending
      tweets.sort((a, b) => b.quality_score - a.quality_score);
      const bestTweet = tweets[0];
      
      // Mark the best tweet as best source
      await supabase
        .from('twitter_token_mentions')
        .update({ is_best_source: true })
        .eq('tweet_id', bestTweet.tweet_id);
      
      stats.best_sources_selected++;
      
      // Mark others as duplicates
      for (let i = 1; i < tweets.length; i++) {
        await supabase
          .from('twitter_token_mentions')
          .update({ 
            is_best_source: false,
            duplicate_of: bestTweet.tweet_id 
          })
          .eq('tweet_id', tweets[i].tweet_id);
        
        stats.duplicates_marked++;
      }
      
      // Only queue if meets minimum quality threshold
      if (bestTweet.quality_score < MIN_QUALITY_SCORE) {
        console.log(`Skipping ${contract} - quality score ${bestTweet.quality_score} below threshold ${MIN_QUALITY_SCORE}`);
        continue;
      }

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

      // Get the best tweet's ticker for the queue
      const bestMention = savedMentions.find(m => m.tweet_id === bestTweet.tweet_id);
      const { data: mentionDetails } = await supabase
        .from('twitter_token_mentions')
        .select('detected_tickers')
        .eq('tweet_id', bestTweet.tweet_id)
        .maybeSingle();

      const ticker = mentionDetails?.detected_tickers?.[0] || 'UNKNOWN';

      // Queue for analysis with special trigger source
      const queueItem = {
        token_mint: contract,
        symbol: ticker,
        name: `Twitter Mention`,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        snapshot_slot: 'twitter_mention',
        trigger_source: 'twitter_mention',
        trigger_comment: `🐦 Twitter Buzz! (Score: ${bestTweet.quality_score})`,
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
          .eq('tweet_id', bestTweet.tweet_id);
      }
    }

    console.log('Twitter Token Scanner completed:', stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Twitter token mention scan complete with quality filtering',
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
