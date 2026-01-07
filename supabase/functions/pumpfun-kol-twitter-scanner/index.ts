import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    impression_count: number;
  };
  author_id: string;
}

interface ApifyTweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  viewCount: number;
  url: string;
  author: {
    userName: string;
    id: string;
  };
}

// Common token tickers and patterns to detect
const TICKER_PATTERNS = [
  /\$([A-Z]{2,10})\b/gi,                    // $TOKEN format
  /\b([A-Z]{3,10})\/SOL\b/gi,               // TOKEN/SOL pairs
  /\bcaught\s+\$?([A-Z]{2,10})\b/gi,        // "caught $TOKEN"
  /\baped\s+(?:into\s+)?\$?([A-Z]{2,10})\b/gi, // "aped TOKEN"
  /\bbought\s+\$?([A-Z]{2,10})\b/gi,        // "bought TOKEN"
  /\bentry\s+on\s+\$?([A-Z]{2,10})\b/gi,    // "entry on TOKEN"
];

// Solana contract address pattern (base58, 32-44 chars)
const CONTRACT_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

// Pump.fun URL pattern
const PUMPFUN_URL_PATTERN = /pump\.fun\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})/gi;

// Common false positive tickers to ignore
const IGNORE_TICKERS = new Set(['SOL', 'ETH', 'BTC', 'USD', 'USDC', 'USDT', 'THE', 'FOR', 'AND', 'NOT', 'ARE', 'BUT', 'NFT', 'APE', 'DCA']);

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

function extractContracts(text: string): string[] {
  const contracts = new Set<string>();
  
  // Extract from pump.fun URLs
  let match;
  while ((match = PUMPFUN_URL_PATTERN.exec(text)) !== null) {
    contracts.add(match[1]);
  }
  
  // Extract standalone contract addresses
  const potentialContracts = text.match(CONTRACT_PATTERN) || [];
  for (const addr of potentialContracts) {
    // Filter out things that are probably not Solana addresses
    if (addr.length >= 32 && addr.length <= 44) {
      contracts.add(addr);
    }
  }
  
  return Array.from(contracts);
}

function classifyTweet(text: string, tickers: string[], contracts: string[]): { type: string; sentiment: number; isPromotion: boolean } {
  const lowerText = text.toLowerCase();
  
  // Sentiment keywords
  const bullishKeywords = ['moon', 'pump', 'buy', 'bullish', 'gem', 'alpha', 'entry', 'ape', 'caught', '🚀', '💎', '🔥', 'send it', 'bags'];
  const bearishKeywords = ['dump', 'sell', 'rug', 'scam', 'exit', 'bearish', 'avoid', 'warning', 'dead', '💀', '🪦'];
  
  let sentiment = 0;
  for (const kw of bullishKeywords) {
    if (lowerText.includes(kw)) sentiment += 0.15;
  }
  for (const kw of bearishKeywords) {
    if (lowerText.includes(kw)) sentiment -= 0.2;
  }
  sentiment = Math.max(-1, Math.min(1, sentiment));
  
  // Determine tweet type
  let type = 'general';
  const isPromotion = (tickers.length > 0 || contracts.length > 0);
  
  if (contracts.length > 0 && sentiment > 0.3) {
    type = 'shill';
  } else if (lowerText.includes('alpha') || lowerText.includes('gem')) {
    type = 'alpha_call';
  } else if (['buy', 'entry', 'ape', 'caught', 'bought'].some(kw => lowerText.includes(kw))) {
    type = 'buy_signal';
  } else if (['sell', 'sold', 'exit', 'taking profit'].some(kw => lowerText.includes(kw))) {
    type = 'sell_signal';
  } else if (['rug', 'scam', 'avoid', 'warning'].some(kw => lowerText.includes(kw))) {
    type = 'fud';
  } else if (isPromotion) {
    type = 'shill';
  }
  
  return { type, sentiment, isPromotion };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apifyKey = Deno.env.get('APIFY_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...params } = await req.json();

    switch (action) {
      case 'scan-kol': {
        // Scan a single KOL's timeline
        const { kol_id, twitter_handle, limit = 20 } = params;
        
        if (!twitter_handle) {
          throw new Error('twitter_handle is required');
        }
        
        if (!apifyKey) {
          throw new Error('APIFY_API_KEY not configured');
        }

        console.log(`Scanning timeline for @${twitter_handle}`);
        
        // Use Apify Twitter scraper
        const actorId = "apidojo~tweet-scraper";
        const runResponse = await fetch(
          `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startUrls: [`https://twitter.com/${twitter_handle}`],
              maxItems: limit,
              addUserInfo: true,
              scrapeTweetReplies: false,
            }),
          }
        );

        if (!runResponse.ok) {
          const errorText = await runResponse.text();
          console.error("Apify error:", errorText);
          throw new Error(`Apify API error: ${runResponse.status}`);
        }

        const tweets: ApifyTweet[] = await runResponse.json();
        console.log(`Got ${tweets.length} tweets from @${twitter_handle}`);

        // Get KOL wallet if kol_id provided
        let kolWallet = params.kol_wallet || '';
        if (kol_id && !kolWallet) {
          const { data: kol } = await supabase
            .from('pumpfun_kol_registry')
            .select('wallet_address')
            .eq('id', kol_id)
            .single();
          kolWallet = kol?.wallet_address || '';
        }

        const processedTweets = [];
        
        for (const tweet of tweets) {
          const tickers = extractTickers(tweet.text);
          const contracts = extractContracts(tweet.text);
          const { type, sentiment, isPromotion } = classifyTweet(tweet.text, tickers, contracts);
          
          const tweetData = {
            kol_id,
            kol_wallet: kolWallet,
            twitter_handle: twitter_handle.toLowerCase(),
            tweet_id: tweet.id,
            tweet_text: tweet.text,
            tweet_url: tweet.url || `https://twitter.com/${twitter_handle}/status/${tweet.id}`,
            posted_at: tweet.createdAt,
            likes_count: tweet.likeCount || 0,
            retweets_count: tweet.retweetCount || 0,
            replies_count: tweet.replyCount || 0,
            views_count: tweet.viewCount || 0,
            detected_tickers: tickers,
            detected_contracts: contracts,
            tweet_type: type,
            sentiment_score: sentiment,
            is_token_promotion: isPromotion,
            scanned_at: new Date().toISOString(),
          };
          
          // Upsert tweet
          const { error } = await supabase
            .from('pumpfun_kol_tweets')
            .upsert(tweetData, { onConflict: 'tweet_id' });
          
          if (error) {
            console.error(`Error saving tweet ${tweet.id}:`, error);
          } else {
            processedTweets.push(tweetData);
          }
        }

        // Update KOL registry with scan timestamp
        if (kol_id) {
          await supabase
            .from('pumpfun_kol_registry')
            .update({ 
              twitter_last_scanned_at: new Date().toISOString(),
              total_tweets_scanned: processedTweets.length,
              total_token_mentions: processedTweets.filter(t => t.is_token_promotion).length
            })
            .eq('id', kol_id);
        }

        return new Response(JSON.stringify({
          success: true,
          twitter_handle,
          tweets_scanned: tweets.length,
          tweets_saved: processedTweets.length,
          token_mentions: processedTweets.filter(t => t.is_token_promotion).length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'scan-all-kols': {
        // Scan all KOLs with Twitter handles
        const { limit_per_kol = 10, max_kols = 10 } = params;
        
        const { data: kols } = await supabase
          .from('pumpfun_kol_registry')
          .select('id, wallet_address, twitter_handle')
          .eq('is_active', true)
          .eq('twitter_scan_enabled', true)
          .not('twitter_handle', 'is', null)
          .order('twitter_last_scanned_at', { ascending: true, nullsFirst: true })
          .limit(max_kols);

        if (!kols || kols.length === 0) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: 'No KOLs with Twitter handles to scan' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const results = [];
        for (const kol of kols) {
          try {
            // Make internal call to scan-kol
            const scanResult = await scanKolTimeline(
              supabase, 
              apifyKey!, 
              kol.id, 
              kol.twitter_handle, 
              kol.wallet_address, 
              limit_per_kol
            );
            results.push({ kol: kol.twitter_handle, ...scanResult });
          } catch (err: any) {
            results.push({ kol: kol.twitter_handle, error: err.message });
          }
          
          // Rate limit: wait 2 seconds between KOLs
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return new Response(JSON.stringify({
          success: true,
          kols_scanned: results.length,
          results,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'correlate-trading': {
        // Correlate tweets with trading activity
        const { kol_id, hours_window = 24 } = params;
        
        const windowStart = new Date(Date.now() - hours_window * 60 * 60 * 1000).toISOString();
        
        // Get recent tweets with token mentions
        let tweetQuery = supabase
          .from('pumpfun_kol_tweets')
          .select('*')
          .eq('is_token_promotion', true)
          .gte('posted_at', windowStart)
          .is('correlated_activity_id', null);
        
        if (kol_id) {
          tweetQuery = tweetQuery.eq('kol_id', kol_id);
        }
        
        const { data: tweets } = await tweetQuery;
        
        if (!tweets || tweets.length === 0) {
          return new Response(JSON.stringify({ 
            success: true, 
            correlations_found: 0 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let correlationsFound = 0;
        
        for (const tweet of tweets) {
          // Look for trading activity within 60 mins of tweet
          const tweetTime = new Date(tweet.posted_at);
          const searchStart = new Date(tweetTime.getTime() - 30 * 60 * 1000);
          const searchEnd = new Date(tweetTime.getTime() + 60 * 60 * 1000);
          
          // Match by contract addresses if present
          if (tweet.detected_contracts?.length > 0) {
            const { data: activities } = await supabase
              .from('pumpfun_kol_activity')
              .select('id, action, detected_at, token_mint')
              .eq('kol_wallet', tweet.kol_wallet)
              .in('token_mint', tweet.detected_contracts)
              .gte('detected_at', searchStart.toISOString())
              .lte('detected_at', searchEnd.toISOString())
              .limit(1);
            
            if (activities && activities.length > 0) {
              const activity = activities[0];
              const activityTime = new Date(activity.detected_at);
              const deltaMs = activityTime.getTime() - tweetTime.getTime();
              const deltaMins = Math.round(deltaMs / 60000);
              
              // Determine correlation type
              let correlationType = 'general';
              if (deltaMins < -10) {
                correlationType = 'post_buy'; // Tweet after buying
              } else if (deltaMins >= -10 && deltaMins <= 10) {
                correlationType = 'during_buy'; // Tweet around buy time
              } else if (deltaMins > 10) {
                correlationType = 'pre_buy'; // Tweet before buying (pumping first)
              }
              
              // Update tweet with correlation
              await supabase
                .from('pumpfun_kol_tweets')
                .update({
                  correlated_activity_id: activity.id,
                  correlation_type: correlationType,
                  correlation_delta_mins: deltaMins,
                })
                .eq('id', tweet.id);
              
              correlationsFound++;
            }
          }
        }

        return new Response(JSON.stringify({
          success: true,
          tweets_checked: tweets.length,
          correlations_found: correlationsFound,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-tweets': {
        // Get tweets with filters
        const { kol_id, twitter_handle, limit = 50, offset = 0, token_only = false, type } = params;
        
        let query = supabase
          .from('pumpfun_kol_tweets')
          .select('*')
          .order('posted_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (kol_id) query = query.eq('kol_id', kol_id);
        if (twitter_handle) query = query.eq('twitter_handle', twitter_handle.toLowerCase());
        if (token_only) query = query.eq('is_token_promotion', true);
        if (type) query = query.eq('tweet_type', type);
        
        const { data, error, count } = await query;
        if (error) throw error;
        
        return new Response(JSON.stringify({ success: true, tweets: data, count }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-stats': {
        const { data: tweets } = await supabase
          .from('pumpfun_kol_tweets')
          .select('tweet_type, is_token_promotion, correlated_activity_id, sentiment_score');
        
        const total = tweets?.length || 0;
        const tokenMentions = tweets?.filter(t => t.is_token_promotion).length || 0;
        const correlated = tweets?.filter(t => t.correlated_activity_id).length || 0;
        const byType = {
          shill: tweets?.filter(t => t.tweet_type === 'shill').length || 0,
          alpha_call: tweets?.filter(t => t.tweet_type === 'alpha_call').length || 0,
          buy_signal: tweets?.filter(t => t.tweet_type === 'buy_signal').length || 0,
          sell_signal: tweets?.filter(t => t.tweet_type === 'sell_signal').length || 0,
          fud: tweets?.filter(t => t.tweet_type === 'fud').length || 0,
          general: tweets?.filter(t => t.tweet_type === 'general').length || 0,
        };
        const avgSentiment = tweets?.reduce((sum, t) => sum + (t.sentiment_score || 0), 0) / (total || 1);

        return new Response(JSON.stringify({
          success: true,
          stats: { total, tokenMentions, correlated, byType, avgSentiment }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: any) {
    console.error('KOL Twitter Scanner error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function scanKolTimeline(
  supabase: any,
  apifyKey: string,
  kolId: string,
  twitterHandle: string,
  kolWallet: string,
  limit: number
): Promise<{ tweets_scanned: number; token_mentions: number }> {
  const actorId = "apidojo~tweet-scraper";
  
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [`https://twitter.com/${twitterHandle}`],
        maxItems: limit,
        addUserInfo: true,
        scrapeTweetReplies: false,
      }),
    }
  );

  if (!runResponse.ok) {
    throw new Error(`Apify error: ${runResponse.status}`);
  }

  const tweets: ApifyTweet[] = await runResponse.json();
  let tokenMentions = 0;

  for (const tweet of tweets) {
    const tickers = extractTickers(tweet.text);
    const contracts = extractContracts(tweet.text);
    const { type, sentiment, isPromotion } = classifyTweet(tweet.text, tickers, contracts);
    
    if (isPromotion) tokenMentions++;

    await supabase
      .from('pumpfun_kol_tweets')
      .upsert({
        kol_id: kolId,
        kol_wallet: kolWallet,
        twitter_handle: twitterHandle.toLowerCase(),
        tweet_id: tweet.id,
        tweet_text: tweet.text,
        tweet_url: tweet.url || `https://twitter.com/${twitterHandle}/status/${tweet.id}`,
        posted_at: tweet.createdAt,
        likes_count: tweet.likeCount || 0,
        retweets_count: tweet.retweetCount || 0,
        replies_count: tweet.replyCount || 0,
        views_count: tweet.viewCount || 0,
        detected_tickers: tickers,
        detected_contracts: contracts,
        tweet_type: type,
        sentiment_score: sentiment,
        is_token_promotion: isPromotion,
        scanned_at: new Date().toISOString(),
      }, { onConflict: 'tweet_id' });
  }

  await supabase
    .from('pumpfun_kol_registry')
    .update({ 
      twitter_last_scanned_at: new Date().toISOString(),
    })
    .eq('id', kolId);

  return { tweets_scanned: tweets.length, token_mentions: tokenMentions };
}
