import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Bulk X Community Enricher
 * 
 * Processes all X communities in our database that are missing admin/mod handles.
 * Calls x-community-enricher for each one sequentially with rate limiting.
 * Designed to be run in batches (default 25 per invocation) to stay within
 * edge function timeout limits.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 25, 50); // Cap at 50 per run
    const forceRescrape = body.forceRescrape || false; // Re-scrape even if already has admins
    const maxAgeDays = body.maxAgeDays || 7; // Consider stale after N days

    console.log(`[bulk-community-enricher] Starting batch of ${batchSize}, forceRescrape=${forceRescrape}, maxAge=${maxAgeDays}d`);

    // Query communities that need enrichment:
    // 1. Never scraped (no admin_usernames)
    // 2. Stale (last_scraped_at > maxAgeDays ago)
    // 3. Not deleted
    // 4. Not at max failures (3+)
    // 5. Has linked token mints (came from HoldersIntel posts)
    let query = supabase
      .from('x_communities')
      .select('community_id, community_url, name, admin_usernames, moderator_usernames, last_scraped_at, failed_scrape_count, linked_token_mints')
      .eq('is_deleted', false)
      .lt('failed_scrape_count', 3)
      .not('linked_token_mints', 'is', null)
      .order('last_scraped_at', { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (!forceRescrape) {
      // Only get communities missing admins OR stale
      query = query.or(
        `admin_usernames.is.null,last_scraped_at.is.null,last_scraped_at.lt.${new Date(Date.now() - maxAgeDays * 86400000).toISOString()}`
      );
    }

    const { data: communities, error: fetchError } = await query;

    if (fetchError) {
      console.error('[bulk-community-enricher] Query error:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!communities || communities.length === 0) {
      console.log('[bulk-community-enricher] No communities need enrichment');
      return new Response(JSON.stringify({
        success: true,
        message: 'All communities are up to date',
        processed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[bulk-community-enricher] Processing ${communities.length} communities`);

    let enriched = 0;
    let failed = 0;
    let skipped = 0;
    const results: Array<{
      communityId: string;
      status: 'enriched' | 'failed' | 'skipped';
      admins?: string[];
      mods?: string[];
      linkedTokens?: number;
      error?: string;
    }> = [];

    for (let i = 0; i < communities.length; i++) {
      const community = communities[i];
      const communityId = community.community_id;
      const communityUrl = community.community_url || `https://x.com/i/communities/${communityId}`;

      // Rate limit: 2 seconds between Apify calls to avoid hammering
      if (i > 0) await delay(2000);

      try {
        console.log(`[${i + 1}/${communities.length}] Enriching community ${communityId} (${community.name || 'unnamed'})`);

        // Call the existing x-community-enricher
        const { data: enrichResult, error: enrichError } = await supabase.functions.invoke('x-community-enricher', {
          body: {
            communityUrl,
            linkedTokenMint: community.linked_token_mints?.[0],
            triggerTeamDetection: true,
          },
        });

        if (enrichError) {
          console.warn(`[bulk] Error for ${communityId}:`, enrichError.message);
          failed++;
          results.push({ communityId, status: 'failed', error: enrichError.message });
          continue;
        }

        if (enrichResult?.skipped) {
          skipped++;
          results.push({ communityId, status: 'skipped', error: enrichResult.reason });
          continue;
        }

        if (enrichResult?.success) {
          enriched++;
          const admins = enrichResult.admins || [];
          const mods = enrichResult.moderators || [];
          results.push({
            communityId,
            status: 'enriched',
            admins,
            mods,
            linkedTokens: community.linked_token_mints?.length || 0,
          });
          console.log(`[bulk] ✅ ${communityId}: ${admins.length} admins, ${mods.length} mods`);
        } else {
          failed++;
          results.push({ communityId, status: 'failed', error: enrichResult?.error || 'Unknown error' });
        }
      } catch (e) {
        console.error(`[bulk] Exception for ${communityId}:`, e);
        failed++;
        results.push({ communityId, status: 'failed', error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Get updated totals
    const { count: totalCommunities } = await supabase
      .from('x_communities')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);

    const { count: withAdmins } = await supabase
      .from('x_communities')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .not('admin_usernames', 'is', null);

    const { count: remaining } = await supabase
      .from('x_communities')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .lt('failed_scrape_count', 3)
      .or('admin_usernames.is.null,last_scraped_at.is.null')
      .not('linked_token_mints', 'is', null);

    console.log(`[bulk-community-enricher] Done: ${enriched} enriched, ${failed} failed, ${skipped} skipped. ${remaining} still need enrichment.`);

    return new Response(JSON.stringify({
      success: true,
      processed: communities.length,
      enriched,
      failed,
      skipped,
      remaining: remaining || 0,
      totalCommunities: totalCommunities || 0,
      withAdmins: withAdmins || 0,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[bulk-community-enricher] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
