import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createApiLogger } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * scrape-twitter-posts
 * 
 * Uses Apify tweet-scraper to fetch recent posts (with images) from preset accounts.
 * Stores them in repurpose_scraped_posts, skipping duplicates by tweet_id.
 */

interface ApifyTweet {
  id: string;
  text: string;
  full_text?: string;
  url: string;
  createdAt: string;
  author?: {
    userName: string;
    name: string;
  };
  media?: Array<{
    type: string;
    url: string;
    media_url_https?: string;
    fullUrl?: string;
  }>;
  extendedEntities?: {
    media?: Array<{
      type: string;
      media_url_https: string;
    }>;
  };
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  viewCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
}

Deno.serve(withRunLog('scrape-twitter-posts', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
    if (!APIFY_API_KEY) throw new Error('APIFY_API_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse optional body
    let targetUsername: string | null = null;
    let maxTweets = 20;
    try {
      const body = await req.json();
      targetUsername = body.username || null;
      maxTweets = body.max_tweets || 20;
    } catch { /* no body */ }

    // Get accounts to scrape
    let accounts: { id: string; username: string }[] = [];
    if (targetUsername) {
      const { data } = await supabase
        .from('repurpose_source_accounts')
        .select('id, username')
        .ilike('username', targetUsername)
        .eq('is_active', true)
        .limit(1);
      accounts = data || [];
      if (accounts.length === 0) {
        // Auto-add if not exists
        const { data: inserted } = await supabase
          .from('repurpose_source_accounts')
          .insert({ username: targetUsername.toLowerCase().replace('@', '') })
          .select('id, username')
          .single();
        if (inserted) accounts = [inserted];
      }
    } else {
      const { data } = await supabase
        .from('repurpose_source_accounts')
        .select('id, username')
        .eq('is_active', true);
      accounts = data || [];
    }

    if (accounts.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No active source accounts configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Scraping ${accounts.length} accounts:`, accounts.map(a => a.username));

    const allResults: { username: string; scraped: number; skipped: number }[] = [];

    for (const account of accounts) {
      const actorId = 'apidojo~tweet-scraper';
      const logger = createApiLogger({
        serviceName: 'apify',
        endpoint: `${actorId}/tweet-scrape`,
        method: 'POST',
        functionName: 'scrape-twitter-posts',
        metadata: { username: account.username },
      });

      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url: `https://twitter.com/${account.username}` }],
            maxItems: maxTweets,
            sort: 'Latest',
            tweetLanguage: 'en',
          }),
        }
      );

      await logger.complete(runResponse.status);

      if (!runResponse.ok) {
        console.error(`Apify error for @${account.username}:`, await runResponse.text());
        allResults.push({ username: account.username, scraped: 0, skipped: 0 });
        continue;
      }

      const tweets: ApifyTweet[] = await runResponse.json();
      console.log(`Got ${tweets.length} tweets from @${account.username}`);

      let scraped = 0;
      let skipped = 0;

      for (const tweet of tweets) {
        const tweetId = tweet.id || tweet.url?.split('/').pop();
        if (!tweetId) continue;

        // Extract image URLs from media
        const imageUrls: string[] = [];
        if (tweet.extendedEntities?.media) {
          for (const m of tweet.extendedEntities.media) {
            if (m.media_url_https) imageUrls.push(m.media_url_https);
          }
        } else if (tweet.media) {
          for (const m of tweet.media) {
            const url = m.media_url_https || m.fullUrl || m.url;
            if (url && (m.type === 'photo' || m.type === 'image')) imageUrls.push(url);
          }
        }

        const { error } = await supabase
          .from('repurpose_scraped_posts')
          .upsert({
            tweet_id: tweetId,
            source_account_id: account.id,
            username: account.username,
            tweet_text: tweet.full_text || tweet.text || '',
            image_urls: imageUrls,
            tweet_url: tweet.url || `https://twitter.com/${account.username}/status/${tweetId}`,
            posted_at: tweet.createdAt ? new Date(tweet.createdAt).toISOString() : null,
            engagement: {
              likes: tweet.likeCount || 0,
              retweets: tweet.retweetCount || 0,
              replies: tweet.replyCount || 0,
              views: tweet.viewCount || 0,
              quotes: tweet.quoteCount || 0,
              bookmarks: tweet.bookmarkCount || 0,
            },
          }, { onConflict: 'tweet_id', ignoreDuplicates: true });

        if (error) {
          console.warn(`Failed to insert tweet ${tweetId}:`, error.message);
          skipped++;
        } else {
          scraped++;
        }
      }

      // Update last_scraped_at
      await supabase
        .from('repurpose_source_accounts')
        .update({ last_scraped_at: new Date().toISOString() })
        .eq('id', account.id);

      allResults.push({ username: account.username, scraped, skipped });
    }

    const totalScraped = allResults.reduce((s, r) => s + r.scraped, 0);
    console.log(`Scraping complete: ${totalScraped} new tweets stored`);

    return new Response(JSON.stringify({
      success: true,
      total_scraped: totalScraped,
      results: allResults,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Scrape error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
