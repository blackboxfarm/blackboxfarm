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

// Configuration thresholds
const VERIFIED_BONUS = 500;
const INFLUENCER_THRESHOLD = 10000;
const MAJOR_INFLUENCER_THRESHOLD = 50000;
const SCAN_COOLDOWN_HOURS = 2; // Don't re-scan same token within 2 hours

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
  let score = (likes * 3) + (retweets * 5) + (replies * 2);
  score += Math.floor(impressions / 1000);
  
  if (isVerified) {
    score += VERIFIED_BONUS;
  }
  
  if (followers > MAJOR_INFLUENCER_THRESHOLD) {
    score += 500;
  } else if (followers > INFLUENCER_THRESHOLD) {
    score += 200;
  }
  
  return score;
}

async function searchTwitter(
  bearerToken: string,
  query: string,
  maxResults: number = 100 // Twitter API max per request
): Promise<TwitterSearchResponse | null> {
  const params = new URLSearchParams({
    query,
    max_results: maxResults.toString(),
    'tweet.fields': 'created_at,public_metrics,author_id',
    'user.fields': 'username,public_metrics,verified_type',
    expansions: 'author_id',
  });

  const url = `https://api.x.com/2/tweets/search/recent?${params}`;
  
  console.log(`🔍 Searching Twitter: ${query}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Twitter API error (${response.status}):`, errorText);
    
    const remaining = response.headers.get('x-rate-limit-remaining');
    const resetTime = response.headers.get('x-rate-limit-reset');
    console.log(`Rate limit remaining: ${remaining}, resets at: ${resetTime}`);
    
    if (response.status === 429) {
      console.error('⚠️ Rate limited by Twitter API');
      return null;
    }
    
    throw new Error(`Twitter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  const remaining = response.headers.get('x-rate-limit-remaining');
  console.log(`✅ Twitter API rate limit remaining: ${remaining}`);
  
  return data;
}

// Calculate virality score for token prioritization
function calculateViralityScore(source: string, healthGrade?: string, timesSeen?: number): number {
  let score = 0;
  
  // Source-based scoring
  if (source === 'dex_boost_100') score += 1000;
  else if (source === 'dex_paid') score += 500;
  else if (source === 'queue') score += 300;
  else if (source === 'seen') score += 100;
  
  // Health grade bonus
  if (healthGrade === 'A') score += 200;
  else if (healthGrade === 'B') score += 100;
  
  // Times seen bonus
  if (timesSeen) score += timesSeen * 50;
  
  return score;
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
      token_searched: null as string | null,
      symbol_searched: null as string | null,
      virality_score: 0,
      source: null as string | null,
      tweets_scanned: 0,
      mentions_saved: 0,
      best_sources_selected: 0,
      duplicates_marked: 0,
      state_populated: 0,
      skipped_duplicate: 0,
      verified_accounts: 0,
    };

    // STEP 1: Check if we need to populate the scanner state table
    const { data: stateCount } = await supabase
      .from('twitter_scanner_state')
      .select('id', { count: 'exact', head: true });
    
    const twoHoursAgo = new Date(Date.now() - SCAN_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    // If state table is empty or has very few entries, populate it from sources
    const { count: availableCount } = await supabase
      .from('twitter_scanner_state')
      .select('id', { count: 'exact', head: true })
      .or(`last_scanned_at.is.null,last_scanned_at.lt.${twoHoursAgo}`);
    
    if (!availableCount || availableCount < 5) {
      console.log('📥 Populating scanner state from sources...');
      
      // Source 1: DEX triggers (highest priority)
      const { data: dexTriggers } = await supabase
        .from('holders_intel_dex_triggers')
        .select('token_mint, symbol, trigger_type')
        .gte('created_at', yesterday)
        .limit(20);
      
      for (const trigger of dexTriggers || []) {
        if (!trigger.token_mint) continue;
        const source = trigger.trigger_type === 'boost_100' ? 'dex_boost_100' : 
                       trigger.trigger_type === 'dex_paid' ? 'dex_paid' : 'dex';
        const viralityScore = calculateViralityScore(source);
        
        await supabase
          .from('twitter_scanner_state')
          .upsert({
            token_mint: trigger.token_mint,
            symbol: trigger.symbol || 'UNKNOWN',
            source,
            virality_score: viralityScore,
          }, { onConflict: 'token_mint' });
        stats.state_populated++;
      }
      
      // Source 2: Post queue (medium priority)
      const { data: queueTokens } = await supabase
        .from('holders_intel_post_queue')
        .select('token_mint, symbol')
        .gte('created_at', twoDaysAgo)
        .limit(20);
      
      for (const token of queueTokens || []) {
        if (!token.token_mint) continue;
        const viralityScore = calculateViralityScore('queue');
        
        await supabase
          .from('twitter_scanner_state')
          .upsert({
            token_mint: token.token_mint,
            symbol: token.symbol || 'UNKNOWN',
            source: 'queue',
            virality_score: viralityScore,
          }, { onConflict: 'token_mint' });
        stats.state_populated++;
      }
      
      // Source 3: Seen tokens with good grades (lower priority)
      const { data: seenTokens } = await supabase
        .from('holders_intel_seen_tokens')
        .select('token_mint, symbol, health_grade, times_seen')
        .gte('first_seen_at', yesterday)
        .in('health_grade', ['A', 'B'])
        .limit(30);
      
      for (const token of seenTokens || []) {
        if (!token.token_mint) continue;
        const viralityScore = calculateViralityScore('seen', token.health_grade, token.times_seen);
        
        await supabase
          .from('twitter_scanner_state')
          .upsert({
            token_mint: token.token_mint,
            symbol: token.symbol || 'UNKNOWN',
            source: 'seen',
            virality_score: viralityScore,
          }, { onConflict: 'token_mint' });
        stats.state_populated++;
      }
      
      console.log(`✅ Populated ${stats.state_populated} tokens into scanner state`);
    }

    // STEP 2: Pick the SINGLE strongest token that hasn't been scanned recently
    const { data: nextToken } = await supabase
      .from('twitter_scanner_state')
      .select('token_mint, symbol, virality_score, source')
      .or(`last_scanned_at.is.null,last_scanned_at.lt.${twoHoursAgo}`)
      .order('virality_score', { ascending: false })
      .order('last_scanned_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();
    
    if (!nextToken) {
      console.log('⏳ No tokens available for scanning (all recently scanned)');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No tokens available for scanning - all recently scanned',
          stats,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    stats.token_searched = nextToken.token_mint;
    stats.symbol_searched = nextToken.symbol;
    stats.virality_score = nextToken.virality_score;
    stats.source = nextToken.source;
    
    console.log(`🎯 Selected token: $${nextToken.symbol} (score: ${nextToken.virality_score}, source: ${nextToken.source})`);

    // STEP 3: Search Twitter for this ONE token - get EVERYTHING (posts, replies, retweets)
    const shortMint = nextToken.token_mint.slice(0, 8);
    // No filters - get ALL tweets mentioning this token
    const query = `(${shortMint} OR ${nextToken.token_mint} OR $${nextToken.symbol})`;
    
    const result = await searchTwitter(bearerToken, query, 100); // Max 100 per API call
    
    // Mark token as scanned (even if no results or rate limited)
    await supabase
      .from('twitter_scanner_state')
      .update({ 
        last_scanned_at: new Date().toISOString(),
        scan_count: supabase.rpc ? undefined : 1, // Will increment via update
      })
      .eq('token_mint', nextToken.token_mint);
    
    // Also increment scan_count
    await supabase.rpc('', {}).catch(() => {}); // Placeholder - we'll use raw SQL
    await supabase
      .from('twitter_scanner_state')
      .update({ 
        scan_count: (await supabase
          .from('twitter_scanner_state')
          .select('scan_count')
          .eq('token_mint', nextToken.token_mint)
          .single()
          .then(r => (r.data?.scan_count || 0) + 1))
      })
      .eq('token_mint', nextToken.token_mint);
    
    if (!result?.data) {
      console.log(`📭 No Twitter results for $${nextToken.symbol}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: `No results for $${nextToken.symbol}`,
          stats,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build user lookup map
    const userMap = new Map<string, TwitterUser>();
    for (const user of result.includes?.users || []) {
      userMap.set(user.id, user);
    }

    // Get existing tweet IDs to avoid duplicates
    const { data: existingMentions } = await supabase
      .from('twitter_token_mentions')
      .select('tweet_id')
      .order('created_at', { ascending: false })
      .limit(500);
    
    const existingTweetIds = new Set(existingMentions?.map(m => m.tweet_id) || []);

    const savedMentions: Array<{ tweet_id: string; quality_score: number }> = [];

    // STEP 4: Process and save ALL tweets - no filtering, save everything
    for (const tweet of result.data) {
      stats.tweets_scanned++;
      
      // Only skip exact duplicates we already have
      if (existingTweetIds.has(tweet.id)) {
        stats.skipped_duplicate++;
        continue;
      }

      const author = userMap.get(tweet.author_id);
      const followers = author?.public_metrics?.followers_count || 0;
      const verifiedType = author?.verified_type || null;
      const isVerified = !!verifiedType;

      const additionalContracts = extractContracts(tweet.text);
      const contracts = [nextToken.token_mint, ...additionalContracts.filter(c => c !== nextToken.token_mint)];
      const tickers = extractTickers(tweet.text);

      if (isVerified) stats.verified_accounts++;

      const likes = tweet.public_metrics?.like_count || 0;
      const retweets = tweet.public_metrics?.retweet_count || 0;
      const replies = tweet.public_metrics?.reply_count || 0;
      const impressions = tweet.public_metrics?.impression_count || 0;

      const qualityScore = calculateQualityScore(likes, retweets, replies, impressions, followers, isVerified);

      const mentionData = {
        tweet_id: tweet.id,
        tweet_text: tweet.text,
        tweet_url: `https://x.com/${author?.username || 'unknown'}/status/${tweet.id}`,
        author_username: author?.username || null,
        author_id: tweet.author_id,
        author_followers: followers,
        detected_contracts: contracts,
        detected_tickers: tickers.length > 0 ? tickers : [nextToken.symbol],
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
      savedMentions.push({ tweet_id: tweet.id, quality_score: qualityScore });
    }

    // STEP 5: Mark best source for this token (highest quality tweet)
    if (savedMentions.length > 0) {
      savedMentions.sort((a, b) => b.quality_score - a.quality_score);
      const bestTweet = savedMentions[0];
      
      await supabase
        .from('twitter_token_mentions')
        .update({ is_best_source: true })
        .eq('tweet_id', bestTweet.tweet_id);
      
      stats.best_sources_selected++;
      
      // Mark others as duplicates
      for (let i = 1; i < savedMentions.length; i++) {
        await supabase
          .from('twitter_token_mentions')
          .update({ 
            is_best_source: false,
            duplicate_of: bestTweet.tweet_id 
          })
          .eq('tweet_id', savedMentions[i].tweet_id);
        
        stats.duplicates_marked++;
      }
    }

    console.log(`✅ Scan complete for $${nextToken.symbol}:`, stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scanned $${nextToken.symbol}: ${stats.mentions_saved} mentions saved`,
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
