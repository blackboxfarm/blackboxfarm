import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createApiLogger } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * scrape-installer-x-profiles
 * 
 * For each channel_installation admin with a telegram_username but no known X profile,
 * uses Apify twitter-user-scraper to search Twitter for that TG username
 * and stores any found X profile in installer_x_profiles.
 */

Deno.serve(async (req) => {
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

    // 1. Get all installer user_ids from channel_installations
    const { data: installations } = await supabase
      .from('channel_installations')
      .select('user_id')
      .not('user_id', 'is', null);

    if (!installations || installations.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No installations found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userIds = [...new Set(installations.map(i => i.user_id))];

    // 2. Get TG usernames for these users
    const { data: tgLinks } = await supabase
      .from('telegram_bot_interactions')
      .select('linked_user_id, telegram_username')
      .in('linked_user_id', userIds)
      .not('telegram_username', 'is', null)
      .order('created_at', { ascending: false });

    const tgMap = new Map<string, string>();
    if (tgLinks) {
      for (const t of tgLinks) {
        if (t.linked_user_id && t.telegram_username && !tgMap.has(t.linked_user_id)) {
          tgMap.set(t.linked_user_id, t.telegram_username);
        }
      }
    }

    // 3. Check which ones already have X profiles
    const { data: existing } = await supabase
      .from('installer_x_profiles')
      .select('user_id');

    const existingSet = new Set((existing || []).map(e => e.user_id));

    // 4. Filter to users needing scraping
    const toScrape: { userId: string; tgUsername: string }[] = [];
    for (const [userId, tgUsername] of tgMap) {
      if (!existingSet.has(userId)) {
        toScrape.push({ userId, tgUsername });
      }
    }

    console.log(`[scrape-installer-x] ${toScrape.length} profiles to scrape out of ${tgMap.size} with TG usernames`);

    if (toScrape.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'All profiles already scraped', total: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { tgUsername: string; xUsername: string | null; status: string }[] = [];

    // Process in batches of 3 to avoid Apify rate limits
    for (let i = 0; i < toScrape.length; i += 3) {
      const batch = toScrape.slice(i, i + 3);

      const batchPromises = batch.map(async ({ userId, tgUsername }) => {
        try {
          // Search Twitter for this TG username — people often use the same handle
          const actorId = 'apidojo~twitter-user-scraper';
          const logger = createApiLogger({
            serviceName: 'apify',
            endpoint: `${actorId}/twitter-user-search`,
            method: 'POST',
            functionName: 'scrape-installer-x-profiles',
            metadata: { tgUsername },
          });

          const response = await fetch(
            `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                startUrls: [{ url: `https://twitter.com/${tgUsername}` }],
                maxItems: 1,
              }),
            }
          );

          await logger.complete(response.status);

          if (!response.ok) {
            console.warn(`[scrape-installer-x] Apify error for @${tgUsername}: ${response.status}`);
            // Still save a record so we don't re-scrape
            await supabase.from('installer_x_profiles').upsert({
              user_id: userId,
              telegram_username: tgUsername,
              x_username: null,
              scraped_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
            results.push({ tgUsername, xUsername: null, status: 'apify_error' });
            return;
          }

          const users = await response.json();
          
          if (users && users.length > 0) {
            const u = users[0];
            const xUsername = u.username || u.screen_name || u.userName || null;
            const xDisplayName = u.name || u.displayName || null;
            const xFollowers = u.followers_count || u.followersCount || u.followers || null;
            const xBio = u.description || u.bio || null;
            const xUrl = xUsername ? `https://x.com/${xUsername}` : null;

            await supabase.from('installer_x_profiles').upsert({
              user_id: userId,
              telegram_username: tgUsername,
              x_username: xUsername,
              x_url: xUrl,
              x_display_name: xDisplayName,
              x_followers: xFollowers,
              x_bio: xBio,
              scraped_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

            console.log(`[scrape-installer-x] Found X profile for TG @${tgUsername}: @${xUsername}`);
            results.push({ tgUsername, xUsername, status: 'found' });
          } else {
            // No match — save empty record to prevent re-scraping
            await supabase.from('installer_x_profiles').upsert({
              user_id: userId,
              telegram_username: tgUsername,
              x_username: null,
              scraped_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
            console.log(`[scrape-installer-x] No X profile found for TG @${tgUsername}`);
            results.push({ tgUsername, xUsername: null, status: 'not_found' });
          }
        } catch (err) {
          console.error(`[scrape-installer-x] Error for @${tgUsername}:`, err);
          results.push({ tgUsername, xUsername: null, status: 'error' });
        }
      });

      await Promise.all(batchPromises);

      // Small delay between batches
      if (i + 3 < toScrape.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const found = results.filter(r => r.status === 'found').length;
    console.log(`[scrape-installer-x] Complete: ${found}/${results.length} X profiles found`);

    return new Response(JSON.stringify({
      success: true,
      total: results.length,
      found,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[scrape-installer-x] Error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
