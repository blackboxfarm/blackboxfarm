import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function extractCommunityId(url: string): string | null {
  const match = url.match(/communities\/(\d+)/);
  return match ? match[1] : null;
}

function isTwitterUrl(url: string): boolean {
  return url.includes('twitter.com') || url.includes('x.com');
}

function extractCommunityFromPair(pair: any): { communityId: string; communityUrl: string } | null {
  if (!pair?.info) return null;

  // Check socials
  if (pair.info.socials) {
    for (const social of pair.info.socials) {
      if (social.url && isTwitterUrl(social.url)) {
        const cid = extractCommunityId(social.url);
        if (cid) return { communityId: cid, communityUrl: social.url };
      }
    }
  }

  // Check websites
  if (pair.info.websites) {
    for (const site of pair.info.websites) {
      const url = typeof site === 'string' ? site : site?.url;
      if (url && isTwitterUrl(url)) {
        const cid = extractCommunityId(url);
        if (cid) return { communityId: cid, communityUrl: url };
      }
    }
  }

  return null;
}

/**
 * BACKFILL X COMMUNITIES
 * 
 * Queries unchecked tokens from source tables (scraped_tokens + holders_intel_seen_tokens),
 * hits DexScreener batch API to find X community URLs, and inserts them into x_communities.
 * 
 * Uses community_checked_at column to track progress — runs every 5 min via cron
 * until all tokens are processed, then self-terminates (returns early).
 * 
 * Processing rate: ~300 tokens per invocation (10 batches of 30).
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

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 300, 300);

    // Get unchecked tokens from BOTH source tables
    const { data: uncheckedScraped } = await supabase
      .from('scraped_tokens')
      .select('token_mint, symbol')
      .is('community_checked_at', null)
      .limit(batchSize);

    const { data: uncheckedHI } = await supabase
      .from('holders_intel_seen_tokens')
      .select('token_mint, symbol')
      .is('community_checked_at', null)
      .limit(batchSize);

    // Deduplicate by token_mint
    const tokenMap = new Map<string, string>();
    for (const t of (uncheckedScraped || [])) tokenMap.set(t.token_mint, t.symbol || '');
    for (const t of (uncheckedHI || [])) {
      if (!tokenMap.has(t.token_mint)) tokenMap.set(t.token_mint, t.symbol || '');
    }

    const allMints = Array.from(tokenMap.keys()).slice(0, batchSize);

    if (allMints.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'All tokens have been checked — backfill complete',
        processed: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[backfill-x-communities] Processing ${allMints.length} unchecked tokens`);

    let communitiesFound = 0;
    let communitiesCreated = 0;
    let communitiesUpdated = 0;
    let noSocials = 0;
    let dexFails = 0;
    let bondedUpdated = 0;
    let meshLinksCreated = 0;

    // Process in DexScreener batch chunks (30 per API call)
    const CHUNK_SIZE = 30;
    for (let i = 0; i < allMints.length; i += CHUNK_SIZE) {
      const chunk = allMints.slice(i, i + CHUNK_SIZE);
      const mintsParam = chunk.join(',');

      if (i > 0) await delay(500);

      let dexData: any = null;
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintsParam}`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; BlackBox/1.0)',
          }
        });

        if (res.status === 429) {
          console.warn(`[backfill] Rate limited at chunk ${i}, stopping early`);
          break;
        }
        if (res.ok) {
          dexData = await res.json();
        } else {
          console.warn(`[backfill] DexScreener HTTP ${res.status}`);
          dexFails += chunk.length;
          // Still mark as checked so we don't retry forever
          await markChecked(supabase, chunk);
          continue;
        }
      } catch (err) {
        console.error(`[backfill] Fetch error:`, err);
        dexFails += chunk.length;
        await markChecked(supabase, chunk);
        continue;
      }

      // Build mint -> best pair map
      const pairsByMint = new Map<string, any>();
      if (dexData?.pairs) {
        for (const pair of dexData.pairs) {
          const mint = pair.baseToken?.address;
          if (mint && !pairsByMint.has(mint)) {
            pairsByMint.set(mint, pair);
          }
        }
      }

      for (const mint of chunk) {
        const pair = pairsByMint.get(mint);

        if (!pair) {
          noSocials++;
          continue;
        }

        // Update bonded_at if graduated
        const isBonded = pair.dexId && ['raydium', 'orca', 'meteora'].includes(pair.dexId.toLowerCase());
        if (isBonded) {
          const bondedTime = pair.pairCreatedAt
            ? new Date(pair.pairCreatedAt).toISOString()
            : new Date().toISOString();
          const { error: bondErr } = await supabase
            .from('holders_intel_seen_tokens')
            .update({ bonded_at: bondedTime })
            .eq('token_mint', mint)
            .is('bonded_at', null);
          if (!bondErr) bondedUpdated++;
        }

        // Update banner_url
        if (pair.info?.header) {
          await supabase
            .from('holders_intel_seen_tokens')
            .update({ banner_url: pair.info.header })
            .eq('token_mint', mint)
            .is('banner_url', null);
        }

        // Extract community
        const community = extractCommunityFromPair(pair);
        if (!community) {
          noSocials++;
          continue;
        }

        communitiesFound++;
        const symbol = tokenMap.get(mint) || '';

        // Upsert into x_communities
        const { data: existing } = await supabase
          .from('x_communities')
          .select('id, linked_token_mints')
          .eq('community_id', community.communityId)
          .single();

        if (existing) {
          const mints = (existing.linked_token_mints as string[]) || [];
          if (!mints.includes(mint)) {
            await supabase
              .from('x_communities')
              .update({
                linked_token_mints: [...mints, mint],
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            communitiesUpdated++;
          }
        } else {
          await supabase
            .from('x_communities')
            .insert({
              community_id: community.communityId,
              community_url: community.communityUrl,
              name: symbol ? `$${symbol} Community` : null,
              linked_token_mints: [mint],
              scrape_status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          communitiesCreated++;
        }

        // Also create mesh link
        const { data: meshExists } = await supabase
          .from('reputation_mesh')
          .select('id')
          .eq('source_type', 'x_community')
          .eq('source_id', community.communityId)
          .eq('linked_type', 'token')
          .eq('linked_id', mint)
          .maybeSingle();

        if (!meshExists) {
          await supabase
            .from('reputation_mesh')
            .insert({
              source_type: 'x_community',
              source_id: community.communityId,
              linked_type: 'token',
              linked_id: mint,
              relationship: 'community_for',
              confidence: 90,
              discovered_via: 'backfill-x-communities',
              discovered_at: new Date().toISOString(),
            });
          meshLinksCreated++;
        }
      }

      // Mark entire chunk as checked
      await markChecked(supabase, chunk);
    }

    const summary = {
      success: true,
      processed: allMints.length,
      communitiesFound,
      communitiesCreated,
      communitiesUpdated,
      meshLinksCreated,
      noSocials,
      dexFails,
      bondedUpdated,
    };

    console.log(`[backfill-x-communities] Done:`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[backfill-x-communities] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

async function markChecked(supabase: any, mints: string[]) {
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('scraped_tokens').update({ community_checked_at: now }).in('token_mint', mints),
    supabase.from('holders_intel_seen_tokens').update({ community_checked_at: now }).in('token_mint', mints),
  ]);
}
