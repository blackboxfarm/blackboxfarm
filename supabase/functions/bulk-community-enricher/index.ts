import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { fetchXCommunityAboutAdmin } from "../_shared/x-community-about-admin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Bulk X Community Enricher
 * 
 * Uses Browserless to scrape the /about page for each community
 * and extract the admin handle. No Apify. No member scraping.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const browserlessApiKey = Deno.env.get('BROWSERLESS_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (!browserlessApiKey) {
    return new Response(JSON.stringify({ error: 'BROWSERLESS_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 3, 10);

    console.log(`[bulk-community-enricher] Batch of ${batchSize} using Browserless about-page`);

    // Get communities missing admin data
    const { data: rawCommunities, error: fetchError } = await supabase
      .from('x_communities')
      .select('community_id, community_url, name, admin_usernames, linked_token_mints, last_scraped_at, failed_scrape_count, scrape_status')
      .eq('is_deleted', false)
      .lt('failed_scrape_count', 3)
      .not('linked_token_mints', 'is', null)
      .order('last_scraped_at', { ascending: true, nullsFirst: true })
      .limit(200);

    if (fetchError) throw fetchError;

    // Only communities with numeric IDs, missing admins, not already exhausted
    const communities = (rawCommunities || [])
      .filter(c => {
        if (!/^\d+$/.test(c.community_id)) return false;
        const hasAdmins = c.admin_usernames && c.admin_usernames.length > 0;
        if (hasAdmins) return false;
        // Skip if about page already checked and found nothing
        if (c.scrape_status === 'no_admin_on_about_page') return false;
        return true;
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

    for (let i = 0; i < communities.length; i++) {
      const community = communities[i];
      const communityId = community.community_id;
      const communityUrl = community.community_url || `https://x.com/i/communities/${communityId}`;

      if (i > 0) await delay(2000); // Be nice to Browserless

      try {
        console.log(`[${i + 1}/${communities.length}] About-page lookup for ${communityId}`);

        const aboutResult = await fetchXCommunityAboutAdmin(communityId, browserlessApiKey);

        if (aboutResult.httpStatus >= 400 || (aboutResult.httpStatus === 0 && aboutResult.error)) {
          console.warn(`[bulk] About-page failed for ${communityId}: ${aboutResult.error || aboutResult.httpStatus}`);
          
          await supabase.from('x_communities').upsert({
            community_id: communityId,
            failed_scrape_count: (community.failed_scrape_count || 0) + 1,
            scrape_status: `error_${aboutResult.httpStatus || 'browserless'}`,
            last_scraped_at: new Date().toISOString(),
            raw_data: aboutResult.rawData,
          }, { onConflict: 'community_id' });
          
          failed++;
          results.push({ communityId, status: 'failed', error: aboutResult.error || `HTTP ${aboutResult.httpStatus}` });
          continue;
        }

        const adminUsername = aboutResult.adminUsername;
        const memberCount = aboutResult.memberCount;
        const now = new Date().toISOString();

        // Update community record
        const scrapeStatus = adminUsername ? 'complete' : 'no_admin_on_about_page';
        await supabase.from('x_communities').upsert({
          community_id: communityId,
          community_url: communityUrl,
          admin_usernames: adminUsername ? [adminUsername] : [],
          member_count: memberCount ?? community.member_count,
          last_scraped_at: now,
          scrape_status: scrapeStatus,
          failed_scrape_count: 0,
          raw_data: aboutResult.rawData,
        }, { onConflict: 'community_id' });

        // Create mesh links
        const meshLinks: any[] = [];
        const linkedTokens = community.linked_token_mints || [];

        if (adminUsername) {
          meshLinks.push({
            source_type: 'x_account',
            source_id: adminUsername,
            linked_type: 'x_community',
            linked_id: communityId,
            relationship: 'admin_of',
            confidence: 100,
            discovered_via: 'bulk_community_enricher',
            evidence: { scraped_at: now, source: 'about_page' },
          });

          // Admin → token links
          for (const tokenMint of linkedTokens) {
            meshLinks.push({
              source_type: 'x_account',
              source_id: adminUsername,
              linked_type: 'token',
              linked_id: tokenMint,
              relationship: 'admin_of_community_for',
              confidence: 90,
              discovered_via: 'bulk_community_enricher',
              evidence: { community_id: communityId, scraped_at: now },
            });
          }
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

        if (meshLinks.length > 0) {
          const { error: meshError } = await supabase
            .from('reputation_mesh')
            .upsert(meshLinks, {
              onConflict: 'source_type,source_id,linked_type,linked_id,relationship',
              ignoreDuplicates: true,
            });
          if (meshError) console.warn(`[bulk] Mesh upsert error for ${communityId}:`, meshError.message);
        }

        // Log API usage (Browserless, not Apify)
        await supabase.from('api_usage_log').insert({
          service_name: 'browserless',
          endpoint: 'function_about_page',
          method: 'POST',
          function_name: 'bulk-community-enricher',
          credits_used: 1,
          success: true,
          response_status: aboutResult.httpStatus,
          metadata: { communityId, admin: adminUsername, memberCount },
        });

        enriched++;
        results.push({
          communityId,
          status: adminUsername ? 'enriched' : 'no_admin_found',
          admin: adminUsername,
          memberCount,
          meshLinks: meshLinks.length,
        });

        console.log(`[bulk] ✅ ${communityId}: admin=${adminUsername || 'none'}, members=${memberCount || '?'}`);
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
      .is('admin_usernames', null)
      .neq('scrape_status', 'no_admin_on_about_page');

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
