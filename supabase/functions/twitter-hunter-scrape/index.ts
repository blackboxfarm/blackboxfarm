import { createClient } from "npm:@supabase/supabase-js@2";
import { withRunLog } from '../_shared/run-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana address regex (base58, 32-44 chars)
const SOLANA_ADDRESS_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

// Common Solana token mint patterns (ends with "pump" for pump.fun tokens)
const PUMP_TOKEN_REGEX = /[1-9A-HJ-NP-Za-km-z]{30,44}pump/g;

// Ticker regex ($TICKER)
const TICKER_REGEX = /\$([A-Z]{2,10})\b/g;

/**
 * TWITTER HUNTER SCRAPE
 * 
 * Periodically scrapes hunter target X accounts for tweets containing token addresses.
 * Uses Apify tweet-scraper to fetch recent tweets, then extracts Solana token addresses.
 * 
 * Actions:
 *   - scan-targets: Scrape a batch of targets (cron, every 6h)
 *   - scan-single: Scrape a single target handle
 *   - add-to-mtproto: Add a discovered TG group to MTProto monitoring
 */
Deno.serve(withRunLog('twitter-hunter-scrape', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
  if (!APIFY_API_KEY) {
    return new Response(JSON.stringify({ error: 'APIFY_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* no body for cron */ }
  const action = body.action || 'scan-targets';

  try {
    // ========================================================
    // ACTION: add-to-mtproto
    // ========================================================
    if (action === 'add-to-mtproto') {
      const { target_id, tg_link, channel_name } = body;
      if (!target_id || !tg_link) {
        return new Response(JSON.stringify({ error: 'target_id and tg_link required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Extract username from t.me link
      const tgUsername = tg_link.replace('https://t.me/', '').replace('http://t.me/', '').replace('t.me/', '').split('/')[0].split('?')[0];

      // Insert into telegram_channel_config for MTProto monitoring
      const { data: existingConfig } = await supabase
        .from('telegram_channel_config')
        .select('id')
        .eq('channel_username', tgUsername)
        .maybeSingle();

      if (existingConfig) {
        // Already exists, just mark as joined
        await supabase
          .from('twitter_tg_targets')
          .update({ tg_group_joined: true, tg_group_chat_id: tgUsername })
          .eq('id', target_id);

        return new Response(JSON.stringify({ success: true, message: 'Channel already monitored', channel_username: tgUsername }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Add new channel config
      const { error: insertErr } = await supabase
        .from('telegram_channel_config')
        .insert({
          channel_username: tgUsername,
          channel_name: channel_name || `Hunter: ${tgUsername}`,
          channel_type: 'group',
          is_active: true,
          fantasy_mode: false,
          trading_mode: 'simple',
        });

      if (insertErr) {
        console.error('[hunter-scrape] Error adding to MTProto config:', insertErr);
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark target as joined
      await supabase
        .from('twitter_tg_targets')
        .update({ tg_group_joined: true, tg_group_chat_id: tgUsername })
        .eq('id', target_id);

      console.log(`[hunter-scrape] Added ${tgUsername} to MTProto monitoring`);
      return new Response(JSON.stringify({ success: true, channel_username: tgUsername }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================
    // ACTION: scan-single or scan-targets (batch)
    // ========================================================
    let targetsToScan: any[] = [];

    if (action === 'scan-single') {
      const { handle } = body;
      if (!handle) {
        return new Response(JSON.stringify({ error: 'handle required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data } = await supabase
        .from('twitter_tg_targets')
        .select('*')
        .eq('handle', handle.replace('@', ''))
        .eq('is_active', true)
        .limit(1);
      targetsToScan = data || [];
    } else {
      // scan-targets: pick up to 10 targets, oldest scanned first
      const { data } = await supabase
        .from('twitter_tg_targets')
        .select('*')
        .eq('is_active', true)
        .order('last_tweet_scan_at', { ascending: true, nullsFirst: true })
        .limit(10);
      targetsToScan = data || [];
    }

    if (targetsToScan.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No targets to scan', scanned: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[hunter-scrape] Scanning ${targetsToScan.length} targets: ${targetsToScan.map((t: any) => t.handle).join(', ')}`);

    let totalFindings = 0;
    const results: any[] = [];

    for (const target of targetsToScan) {
      try {
        // Fetch recent tweets via Apify
        const actorId = 'apidojo~tweet-scraper';
        const runResponse = await fetch(
          `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startUrls: [{ url: `https://twitter.com/${target.handle}` }],
              maxItems: 20,
              sort: 'Latest',
              tweetLanguage: 'en',
            }),
          }
        );

        if (!runResponse.ok) {
          console.error(`[hunter-scrape] Apify error for @${target.handle}: ${runResponse.status}`);
          results.push({ handle: target.handle, error: `Apify ${runResponse.status}`, findings: 0 });
          continue;
        }

        const tweets: any[] = await runResponse.json();
        console.log(`[hunter-scrape] Got ${tweets.length} tweets from @${target.handle}`);

        // Extract token addresses from tweets
        const findings: any[] = [];
        for (const tweet of tweets) {
          const text = tweet.full_text || tweet.text || '';
          const tweetId = tweet.id_str || tweet.id || '';

          // Look for Solana addresses
          const solAddresses = [...text.matchAll(SOLANA_ADDRESS_REGEX)].map(m => m[0]);
          const pumpTokens = [...text.matchAll(PUMP_TOKEN_REGEX)].map(m => m[0]);
          const tickers = [...text.matchAll(TICKER_REGEX)].map(m => m[1]);

          // Combine and dedupe, filter out known non-token addresses
          const allTokens = [...new Set([...solAddresses, ...pumpTokens])].filter(addr => {
            // Filter out addresses that are too short or known system addresses
            if (addr.length < 32) return false;
            if (addr.startsWith('11111')) return false; // System program
            return true;
          });

          if (allTokens.length > 0 || tickers.length > 0) {
            findings.push({
              target_id: target.id,
              handle: target.handle,
              tweet_id: tweetId,
              tweet_text: text.substring(0, 1000),
              tweet_url: `https://x.com/${target.handle}/status/${tweetId}`,
              detected_tokens: allTokens,
              detected_tickers: [...new Set(tickers)],
              tweet_date: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
              engagement_score: (tweet.favorite_count || 0) + (tweet.retweet_count || 0) * 2 + (tweet.reply_count || 0) * 3,
            });
          }
        }

        // Upsert findings
        if (findings.length > 0) {
          const { error: upsertErr } = await supabase
            .from('hunter_tweet_findings')
            .upsert(findings, { onConflict: 'tweet_id' });

          if (upsertErr) {
            console.error(`[hunter-scrape] Error storing findings for @${target.handle}:`, upsertErr.message);
          }
        }

        // Update target stats
        await supabase
          .from('twitter_tg_targets')
          .update({
            last_tweet_scan_at: new Date().toISOString(),
            tweet_scan_count: (target.tweet_scan_count || 0) + 1,
            token_mentions_found: (target.token_mentions_found || 0) + findings.length,
          })
          .eq('id', target.id);

        totalFindings += findings.length;
        results.push({ handle: target.handle, tweets: tweets.length, findings: findings.length });

        // Rate limit pause between targets
        if (targetsToScan.indexOf(target) < targetsToScan.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }

      } catch (err: any) {
        console.error(`[hunter-scrape] Error scanning @${target.handle}:`, err.message);
        results.push({ handle: target.handle, error: err.message, findings: 0 });
      }
    }

    console.log(`[hunter-scrape] Complete: ${targetsToScan.length} targets, ${totalFindings} findings`);

    return new Response(JSON.stringify({
      success: true,
      scanned: targetsToScan.length,
      total_findings: totalFindings,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[hunter-scrape] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
