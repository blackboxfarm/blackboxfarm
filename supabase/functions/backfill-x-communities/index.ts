import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Backfill X Communities from reputation_mesh and token_socials_history.
 * Scans all community links that exist in the mesh but are missing from x_communities table,
 * and also scans DexScreener social links for community URLs not yet indexed.
 */
Deno.serve(withRunLog('backfill-x-communities', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const stats = {
      meshCommunitiesFound: 0,
      socialsCommunitiesFound: 0,
      newCommunitiesInserted: 0,
      meshLinksCreated: 0,
      enricherTriggered: 0,
      errors: 0,
    };

    // ============ SOURCE 1: reputation_mesh x_community entries missing from x_communities ============
    console.log('[Backfill] 🔍 Scanning reputation_mesh for x_community entries...');
    
    const { data: meshCommunities } = await supabase
      .from('reputation_mesh')
      .select('source_id, linked_id, linked_type')
      .eq('source_type', 'x_community')
      .eq('linked_type', 'token');

    const meshCommunityIds = new Set<string>();
    const communityTokenMap = new Map<string, string[]>();

    for (const mc of meshCommunities || []) {
      meshCommunityIds.add(mc.source_id);
      const existing = communityTokenMap.get(mc.source_id) || [];
      if (!existing.includes(mc.linked_id)) {
        existing.push(mc.linked_id);
      }
      communityTokenMap.set(mc.source_id, existing);
    }

    stats.meshCommunitiesFound = meshCommunityIds.size;
    console.log(`[Backfill] Found ${meshCommunityIds.size} unique communities in mesh`);

    // ============ SOURCE 2: Scan DexScreener token socials for community URLs ============
    console.log('[Backfill] 🔍 Scanning token_socials_history for community URLs...');
    
    const { data: socialsCommunities } = await supabase
      .from('token_socials_history')
      .select('twitter, token_mint')
      .like('twitter', '%/communities/%');

    for (const sc of socialsCommunities || []) {
      const match = sc.twitter?.match(/communities\/(\d+)/);
      if (match) {
        const cid = match[1];
        meshCommunityIds.add(cid);
        const existing = communityTokenMap.get(cid) || [];
        if (!existing.includes(sc.token_mint)) {
          existing.push(sc.token_mint);
        }
        communityTokenMap.set(cid, existing);
        stats.socialsCommunitiesFound++;
      }
    }

    console.log(`[Backfill] Total unique communities to check: ${meshCommunityIds.size}`);

    // ============ CHECK: Which communities are already in x_communities? ============
    const { data: existingCommunities } = await supabase
      .from('x_communities')
      .select('community_id');

    const existingSet = new Set((existingCommunities || []).map(c => c.community_id));
    const missingIds = [...meshCommunityIds].filter(id => !existingSet.has(id));

    console.log(`[Backfill] ${existingSet.size} already exist, ${missingIds.length} missing — inserting...`);

    // ============ INSERT missing communities ============
    const batchSize = 50;
    for (let i = 0; i < missingIds.length; i += batchSize) {
      const batch = missingIds.slice(i, i + batchSize);
      const inserts = batch.map(communityId => ({
        community_id: communityId,
        community_url: `https://x.com/i/communities/${communityId}`,
        linked_token_mints: communityTokenMap.get(communityId) || [],
        scrape_status: 'pending',
      }));

      const { error: insertErr } = await supabase
        .from('x_communities')
        .upsert(inserts, { onConflict: 'community_id', ignoreDuplicates: true });

      if (insertErr) {
        console.error(`[Backfill] Batch insert error:`, insertErr);
        stats.errors++;
      } else {
        stats.newCommunitiesInserted += batch.length;
      }
    }

    // ============ ALSO: Create missing mesh links for existing communities ============
    // For communities from socials that may not have mesh links yet
    console.log('[Backfill] 🕸️ Creating missing mesh links...');
    
    for (const [communityId, tokenMints] of communityTokenMap.entries()) {
      for (const tokenMint of tokenMints) {
        // Check if mesh link exists
        const { data: existing } = await supabase
          .from('reputation_mesh')
          .select('id')
          .eq('source_type', 'x_community')
          .eq('source_id', communityId)
          .eq('linked_type', 'token')
          .eq('linked_id', tokenMint)
          .maybeSingle();

        if (!existing) {
          const { error } = await supabase
            .from('reputation_mesh')
            .insert({
              source_type: 'x_community',
              source_id: communityId,
              linked_type: 'token',
              linked_id: tokenMint,
              relationship: 'community_for',
              confidence: 90,
              discovered_via: 'backfill-x-communities',
              discovered_at: new Date().toISOString(),
            });

          if (!error) stats.meshLinksCreated++;
        }
      }
      
      // Rate limit to avoid overwhelming DB
      if (stats.meshLinksCreated % 50 === 0 && stats.meshLinksCreated > 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // ============ TRIGGER enricher for un-scraped communities (first 20) ============
    const { data: unscraped } = await supabase
      .from('x_communities')
      .select('community_id, community_url')
      .or('scrape_status.eq.pending,scrape_status.is.null')
      .is('admin_usernames', null)
      .limit(20);

    for (const community of unscraped || []) {
      supabase.functions.invoke('x-community-enricher', {
        body: {
          communityUrl: community.community_url,
        }
      }).catch(e => console.warn(`[Backfill] Enricher trigger failed for ${community.community_id}:`, e));
      stats.enricherTriggered++;
      
      // 2s delay between enricher calls
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('[Backfill] ✅ Complete:', JSON.stringify(stats));

    return new Response(
      JSON.stringify({ success: true, ...stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Backfill] ❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
