import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Bulk X Community Enricher
 * 
 * Processes X communities missing admin/mod handles by calling
 * x-community-enricher for each. Runs in small batches (3-5) to 
 * stay within edge function timeout (~60s).
 * 
 * Designed to be called repeatedly (via cron or manual) until all
 * communities are enriched.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const apifyApiKey = Deno.env.get('APIFY_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (!apifyApiKey) {
    return new Response(JSON.stringify({ error: 'APIFY_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 3, 10); // Small batches to avoid timeout
    const maxAgeDays = body.maxAgeDays || 7;

    console.log(`[bulk-community-enricher] Batch of ${batchSize}`);

    // Get communities needing enrichment:
    // - Missing admin data OR stale
    // - Not deleted, not at max failures
    // - Has linked tokens (from HoldersIntel)
    const staleThreshold = new Date(Date.now() - maxAgeDays * 86400000).toISOString();

    // Fetch communities that might need enrichment - broad query, filter in code
    const { data: rawCommunities, error: fetchError } = await supabase
      .from('x_communities')
      .select('community_id, community_url, name, admin_usernames, linked_token_mints, last_scraped_at, failed_scrape_count')
      .eq('is_deleted', false)
      .lt('failed_scrape_count', 3)
      .not('linked_token_mints', 'is', null)
      .order('last_scraped_at', { ascending: true, nullsFirst: true })
      .limit(200);

    if (fetchError) throw fetchError;

    // Filter to:
    // 1. Numeric community IDs only (real X Communities)
    // 2. Missing admins (null or empty array) OR stale data
    // Only enrich communities MISSING admin data — never re-scrape existing ones
    const communities = (rawCommunities || [])
      .filter(c => {
        if (!/^\d+$/.test(c.community_id)) return false;
        const hasAdmins = c.admin_usernames && c.admin_usernames.length > 0;
        return !hasAdmins;
      })
      .slice(0, batchSize);

    if (communities.length === 0) {
      const { count: total } = await supabase
        .from('x_communities')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false);
      const { count: withAdmins } = await supabase
        .from('x_communities')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .not('admin_usernames', 'is', null);

      return new Response(JSON.stringify({
        success: true,
        message: 'All communities are enriched!',
        processed: 0,
        remaining: 0,
        totalCommunities: total || 0,
        withAdmins: withAdmins || 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let enriched = 0;
    let failed = 0;
    const results: any[] = [];

    // Process DIRECTLY with Apify (skip the enricher invocation to avoid double timeout)
    for (let i = 0; i < communities.length; i++) {
      const community = communities[i];
      const communityId = community.community_id;
      const communityUrl = community.community_url || `https://x.com/i/communities/${communityId}`;

      if (i > 0) await delay(1500);

      try {
        console.log(`[${i + 1}/${communities.length}] Scraping ${communityId}`);

        // Direct Apify call (same as x-community-enricher but inline)
        const apifyResponse = await fetch(
          `https://api.apify.com/v2/acts/danpoletaev~twitter-x-community-member-scraper/run-sync-get-dataset-items?token=${apifyApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              communityId,
              maxItems: 100, // ~$0.13/scrape — captures admins/mods reliably + blue checks
              proxyConfiguration: {
                useApifyProxy: true,
                apifyProxyGroups: ["RESIDENTIAL"],
              },
            }),
          }
        );

        if (!apifyResponse.ok) {
          const errText = await apifyResponse.text().catch(() => '');
          console.warn(`[bulk] Apify ${apifyResponse.status} for ${communityId}`);
          
          // Increment fail count
          await supabase.from('x_communities').upsert({
            community_id: communityId,
            failed_scrape_count: (community.failed_scrape_count || 0) + 1,
            scrape_status: `error_${apifyResponse.status}`,
            last_scraped_at: new Date().toISOString(),
          }, { onConflict: 'community_id' });
          
          failed++;
          results.push({ communityId, status: 'failed', error: `Apify ${apifyResponse.status}` });
          continue;
        }

        const members = await apifyResponse.json();

        // Extract admins and mods
        const admins: string[] = [];
        const mods: string[] = [];
        for (const member of (members || [])) {
          if (member.communityRole === 'Admin') admins.push(member.screenName.toLowerCase());
          if (member.communityRole === 'Moderator') mods.push(member.screenName.toLowerCase());
        }

        const uniqueAdmins = [...new Set(admins)];
        const uniqueMods = [...new Set(mods)];

        // Update community record
        await supabase.from('x_communities').upsert({
          community_id: communityId,
          community_url: communityUrl,
          admin_usernames: uniqueAdmins,
          moderator_usernames: uniqueMods,
          member_count: members?.length,
          last_scraped_at: new Date().toISOString(),
          scrape_status: 'complete',
          failed_scrape_count: 0,
          raw_data: (members || []).slice(0, 10),
        }, { onConflict: 'community_id' });

        // Create mesh links for admins/mods → community → tokens
        const meshLinks: any[] = [];
        const now = new Date().toISOString();
        const linkedTokens = community.linked_token_mints || [];

        for (const admin of uniqueAdmins) {
          meshLinks.push({
            source_type: 'x_account',
            source_id: admin,
            linked_type: 'x_community',
            linked_id: communityId,
            relationship: 'admin_of',
            confidence: 100,
            discovered_via: 'bulk_community_enricher',
            evidence: { scraped_at: now },
          });
        }

        for (const mod of uniqueMods) {
          meshLinks.push({
            source_type: 'x_account',
            source_id: mod,
            linked_type: 'x_community',
            linked_id: communityId,
            relationship: 'mod_of',
            confidence: 100,
            discovered_via: 'bulk_community_enricher',
            evidence: { scraped_at: now },
          });
        }

        // Community → token links
        for (const tokenMint of linkedTokens) {
          meshLinks.push({
            source_type: 'x_community',
            source_id: communityId,
            linked_type: 'token',
            linked_id: tokenMint,
            relationship: 'community_for',
            confidence: 95,
            discovered_via: 'bulk_community_enricher',
            evidence: { scraped_at: now },
          });
        }

        // Co-mod links (capped at first 6 staff)
        const allStaff = [...uniqueAdmins, ...uniqueMods].slice(0, 6);
        for (let s = 0; s < allStaff.length; s++) {
          for (let t = s + 1; t < allStaff.length; t++) {
            meshLinks.push({
              source_type: 'x_account',
              source_id: allStaff[s],
              linked_type: 'x_account',
              linked_id: allStaff[t],
              relationship: 'co_mod',
              confidence: 90,
              discovered_via: 'bulk_community_enricher',
              evidence: { community_id: communityId, scraped_at: now },
            });
          }
        }

        if (meshLinks.length > 0) {
          const { error: meshError } = await supabase
            .from('reputation_mesh')
            .upsert(meshLinks, {
              onConflict: 'source_type,source_id,linked_type,linked_id,relationship',
              ignoreDuplicates: true,
            });
          if (meshError) console.warn(`[bulk] Mesh upsert error for ${communityId}:`, meshError.message);
        }

        // Log API usage
        await supabase.from('api_usage_log').insert({
          service_name: 'apify',
          endpoint: 'danpoletaev~twitter-x-community-member-scraper',
          method: 'POST',
          function_name: 'bulk-community-enricher',
          credits_used: 1,
          success: true,
          response_status: 200,
          metadata: { communityId, admins: uniqueAdmins.length, mods: uniqueMods.length },
        });

        enriched++;
        results.push({
          communityId,
          status: 'enriched',
          admins: uniqueAdmins,
          mods: uniqueMods,
          meshLinks: meshLinks.length,
          linkedTokens: linkedTokens.length,
        });

        console.log(`[bulk] ✅ ${communityId}: ${uniqueAdmins.length} admins, ${uniqueMods.length} mods, ${meshLinks.length} mesh links`);
      } catch (e) {
        console.error(`[bulk] Exception for ${communityId}:`, e);
        failed++;
        results.push({ communityId, status: 'failed', error: String(e) });
      }
    }

    // Get remaining count
    const { count: remaining } = await supabase
      .from('x_communities')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .lt('failed_scrape_count', 3)
      .not('linked_token_mints', 'is', null)
      .or(`admin_usernames.is.null,last_scraped_at.is.null,last_scraped_at.lt.${staleThreshold}`);

    console.log(`[bulk-community-enricher] Done: ${enriched} enriched, ${failed} failed. ${remaining} remaining.`);

    return new Response(JSON.stringify({
      success: true,
      processed: communities.length,
      enriched,
      failed,
      remaining: remaining || 0,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[bulk-community-enricher] Fatal:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
