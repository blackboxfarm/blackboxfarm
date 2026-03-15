import { createHmac } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const API_KEY = Deno.env.get("TWITTER_CONSUMER_KEY")?.trim();
const API_SECRET = Deno.env.get("TWITTER_CONSUMER_SECRET")?.trim();
const ACCESS_TOKEN = Deno.env.get("TWITTER_ACCESS_TOKEN")?.trim();
const ACCESS_TOKEN_SECRET = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET")?.trim();

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
  return createHmac("sha1", signingKey).update(signatureBaseString).digest("base64");
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

  const signature = generateOAuthSignature(method, url, oauthParams, API_SECRET!, ACCESS_TOKEN_SECRET!);

  return (
    "OAuth " +
    Object.entries({ ...oauthParams, oauth_signature: signature })
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(", ")
  );
}

/**
 * X Community Follow Manager
 * 
 * Actions:
 * - scrape_blue_checks: Scrapes community, returns blue-checked members, saves to follow targets table
 * - follow: Follows selected accounts from HoldersIntel account
 * - get_targets: Returns current follow targets for a community
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { action, communityId, targetHandles } = await req.json();

    if (!communityId) {
      return new Response(JSON.stringify({ error: 'communityId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: Scrape community and index blue-checked members
    if (action === 'scrape_blue_checks') {
      const apifyApiKey = Deno.env.get('APIFY_API_KEY');
      if (!apifyApiKey) throw new Error('APIFY_API_KEY not configured');

      console.log(`[follow] Scraping blue checks for community ${communityId}`);

      const response = await fetch(
        `https://api.apify.com/v2/acts/danpoletaev~twitter-x-community-member-scraper/run-sync-get-dataset-items?token=${apifyApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId,
            maxItems: 50, // Need more for blue check filtering
            proxyConfiguration: {
              useApifyProxy: true,
              apifyProxyGroups: ['RESIDENTIAL'],
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Apify error ${response.status}: ${errText.slice(0, 200)}`);
      }

      const members = await response.json();
      const blueChecked = (members || []).filter((m: any) => m.isBlueVerified);

      console.log(`[follow] Found ${blueChecked.length} blue-checked out of ${members?.length || 0} members`);

      // Check existing follow status for these handles
      const handles = blueChecked.map((m: any) => m.screenName.toLowerCase());
      const { data: existing } = await supabase
        .from('community_follow_targets')
        .select('target_handle, follow_status')
        .eq('community_id', communityId)
        .in('target_handle', handles);

      const existingMap = new Map((existing || []).map((e: any) => [e.target_handle, e.follow_status]));

      // Upsert all blue-checked members
      const upsertData = blueChecked.map((m: any) => ({
        community_id: communityId,
        target_handle: m.screenName.toLowerCase(),
        target_x_user_id: m.restId || null,
        is_blue_verified: true,
        community_role: m.communityRole || 'member',
        followers_count: m.followersCount || null,
        // Preserve existing follow_status if already tracked
        follow_status: existingMap.get(m.screenName.toLowerCase()) || 'not_followed',
        updated_at: new Date().toISOString(),
      }));

      if (upsertData.length > 0) {
        const { error: upsertErr } = await supabase
          .from('community_follow_targets')
          .upsert(upsertData, { onConflict: 'community_id,target_handle' });
        if (upsertErr) console.error('[follow] Upsert error:', upsertErr.message);
      }

      // Log API usage
      await supabase.from('api_usage_log').insert({
        service_name: 'apify',
        endpoint: 'danpoletaev~twitter-x-community-member-scraper',
        method: 'POST',
        function_name: 'x-community-follow',
        success: true,
        credits_used: 1,
        response_time_ms: 0,
        metadata: { communityId, totalMembers: members?.length, blueChecked: blueChecked.length },
      });

      return new Response(JSON.stringify({
        success: true,
        totalMembers: members?.length || 0,
        blueChecked: blueChecked.length,
        targets: upsertData.map(t => ({
          handle: t.target_handle,
          xUserId: t.target_x_user_id,
          role: t.community_role,
          followers: t.followers_count,
          status: t.follow_status,
        })),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ACTION: Follow selected accounts
    if (action === 'follow') {
      if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET) {
        throw new Error('Twitter API credentials not configured');
      }

      if (!targetHandles || !Array.isArray(targetHandles) || targetHandles.length === 0) {
        throw new Error('targetHandles array required');
      }

      // Get target user IDs from DB
      const { data: targets, error: fetchErr } = await supabase
        .from('community_follow_targets')
        .select('*')
        .eq('community_id', communityId)
        .in('target_handle', targetHandles.map((h: string) => h.toLowerCase()));

      if (fetchErr) throw fetchErr;
      if (!targets?.length) throw new Error('No matching targets found');

      // First, get our own user ID (HoldersIntel)
      const meUrl = 'https://api.x.com/2/users/me';
      const meHeader = generateOAuthHeader('GET', meUrl);
      const meRes = await fetch(meUrl, {
        headers: { 'Authorization': meHeader },
      });
      
      if (!meRes.ok) {
        const errText = await meRes.text();
        throw new Error(`Failed to get HoldersIntel user ID: ${meRes.status} ${errText.slice(0, 200)}`);
      }
      
      const meData = await meRes.json();
      const sourceUserId = meData.data?.id;
      if (!sourceUserId) throw new Error('Could not resolve HoldersIntel user ID');

      console.log(`[follow] Following ${targets.length} accounts from user ${sourceUserId}`);

      const results: any[] = [];
      let followed = 0;
      let errors = 0;

      for (const target of targets) {
        if (!target.target_x_user_id) {
          results.push({ handle: target.target_handle, status: 'error', error: 'No X user ID' });
          errors++;
          continue;
        }

        // Rate limit: 1 second between follows
        if (followed > 0) await new Promise(r => setTimeout(r, 1500));

        try {
          const followUrl = `https://api.x.com/2/users/${sourceUserId}/following`;
          const authHeader = generateOAuthHeader('POST', followUrl);

          const followRes = await fetch(followUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ target_user_id: target.target_x_user_id }),
          });

          const followData = await followRes.json();

          if (followRes.ok && followData.data) {
            const status = followData.data.following ? 'followed' : 'pending';
            
            await supabase
              .from('community_follow_targets')
              .update({
                follow_status: status,
                followed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', target.id);

            results.push({ handle: target.target_handle, status });
            followed++;
            console.log(`   ✅ Followed @${target.target_handle} (${status})`);
          } else {
            const errMsg = followData.detail || followData.title || JSON.stringify(followData.errors?.[0]) || 'Unknown error';
            
            await supabase
              .from('community_follow_targets')
              .update({
                follow_status: 'error',
                error_message: errMsg,
                updated_at: new Date().toISOString(),
              })
              .eq('id', target.id);

            results.push({ handle: target.target_handle, status: 'error', error: errMsg });
            errors++;
            console.warn(`   ❌ Failed @${target.target_handle}: ${errMsg}`);
          }
        } catch (e) {
          results.push({ handle: target.target_handle, status: 'error', error: String(e) });
          errors++;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        followed,
        errors,
        results,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ACTION: Get existing targets
    if (action === 'get_targets') {
      const { data, error } = await supabase
        .from('community_follow_targets')
        .select('*')
        .eq('community_id', communityId)
        .order('followers_count', { ascending: false, nullsFirst: false });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, targets: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use: scrape_blue_checks, follow, get_targets' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[x-community-follow] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
