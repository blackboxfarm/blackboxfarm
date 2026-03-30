import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from '../_shared/run-logger.ts';
import { extractXHandle, extractXCommunityId } from '../_shared/x-handle-extractor.ts';
import { fetchPumpFunCoin } from '../_shared/pumpfun-fetch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Social Link Mint Checker
 * 
 * Cycles through tokens in Master DB that are missing social links (X, website, community).
 * Two-step resolution:
 *   1. Metaplex on-chain metadata (token URI → JSON with socials)
 *   2. Pump.fun API fallback
 * 
 * If an X Community is found but not yet spidered → queues for Apify enrichment.
 * 
 * Params: { batchSize?: number, source?: string }
 */

interface TokenSocials {
  twitter?: string;
  website?: string;
  telegram?: string;
  discord?: string;
  community?: string;
}

async function fetchMetaplexSocials(tokenMint: string): Promise<TokenSocials | null> {
  try {
    // Use Helius DAS to get the token metadata URI
    const heliusKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusKey) return null;

    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'social-check',
        method: 'getAsset',
        params: { id: tokenMint },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const uri = data?.result?.content?.json_uri || data?.result?.content?.links?.external_url;
    
    if (!uri) return null;

    // Fetch the JSON metadata
    const metaRes = await fetch(uri, { signal: AbortSignal.timeout(10000) });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();

    const socials: TokenSocials = {};

    // Check extensions.socials or top-level fields
    const socialData = meta?.extensions?.socials || meta?.socials || {};
    if (socialData.twitter) socials.twitter = socialData.twitter;
    if (socialData.website) socials.website = socialData.website;
    if (socialData.telegram) socials.telegram = socialData.telegram;
    if (socialData.discord) socials.discord = socialData.discord;

    // Also check external_url / website at top level
    if (!socials.website && meta?.external_url) socials.website = meta.external_url;
    if (!socials.website && meta?.website) socials.website = meta.website;

    // Check for X community links in any URL field
    const allUrls = [socials.twitter, socials.website, meta?.external_url].filter(Boolean);
    for (const url of allUrls) {
      const communityId = extractXCommunityId(url);
      if (communityId) {
        socials.community = `https://x.com/i/communities/${communityId}`;
        break;
      }
    }

    return Object.keys(socials).length > 0 ? socials : null;
  } catch (e) {
    console.warn(`[social-check] Metaplex error for ${tokenMint}:`, e);
    return null;
  }
}

async function fetchPumpFunSocials(tokenMint: string): Promise<TokenSocials | null> {
  try {
    const data = await fetchPumpFunCoin(tokenMint, 'social-link-mint-checker');
    if (!data) return null;

    const socials: TokenSocials = {};
    if (data.twitter) socials.twitter = data.twitter;
    if (data.website) socials.website = data.website;
    if (data.telegram) socials.telegram = data.telegram;

    // Check for community in twitter URL
    if (data.twitter) {
      const communityId = extractXCommunityId(data.twitter);
      if (communityId) {
        socials.community = `https://x.com/i/communities/${communityId}`;
      }
    }

    return Object.keys(socials).length > 0 ? socials : null;
  } catch (e) {
    console.warn(`[social-check] PumpFun error for ${tokenMint}:`, e);
    return null;
  }
}

Deno.serve(withRunLog('social-link-mint-checker', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(body.batchSize || 10, 30);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Find tokens with no social links in reputation_mesh
  // (no twitter, no website, no community linked)
  const { data: candidates, error: queryErr } = await supabase
    .from('master_token_directory')
    .select('token_mint, symbol, mesh_x_handles, websites, x_community_urls, launchpad')
    .or('mesh_x_handles.eq.{},mesh_x_handles.is.null')
    .or('websites.eq.{},websites.is.null')
    .order('created_at', { ascending: false })
    .limit(batchSize * 3); // over-fetch since we filter further

  if (queryErr) {
    console.error('[social-check] Query error:', queryErr);
    return new Response(JSON.stringify({ error: queryErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Filter to tokens with NO x handles AND NO websites (truly bare)
  const bareTokens = (candidates || []).filter(t => {
    const hasX = t.mesh_x_handles && t.mesh_x_handles.length > 0;
    const hasWeb = t.websites && t.websites.length > 0;
    return !hasX && !hasWeb;
  }).slice(0, batchSize);

  let processed = 0;
  let socialsFound = 0;
  let meshLinksAdded = 0;
  let communitiesQueued = 0;

  for (const token of bareTokens) {
    processed++;

    // Step 1: Metaplex on-chain metadata
    let socials = await fetchMetaplexSocials(token.token_mint);
    await delay(1000); // rate limit

    // Step 2: Pump.fun fallback
    if (!socials || (!socials.twitter && !socials.website)) {
      const pumpSocials = await fetchPumpFunSocials(token.token_mint);
      await delay(5000); // pump.fun rate limit (stay well under radar)

      if (pumpSocials) {
        socials = { ...socials, ...pumpSocials };
      }
    }

    if (!socials) continue;
    socialsFound++;

    // Insert into reputation_mesh
    const meshLinks: any[] = [];

    if (socials.twitter) {
      const handle = extractXHandle(socials.twitter);
      if (handle) {
        meshLinks.push({
          source_type: 'token',
          source_id: token.token_mint,
          linked_type: 'twitter',
          linked_id: handle,
          relationship: 'has_social',
          confidence: 0.8,
          evidence: { source: 'social_link_mint_checker', method: socials.twitter.includes('pump.fun') ? 'pumpfun_api' : 'metaplex' },
          discovered_via: 'social_link_mint_checker',
        });
      }
    }

    if (socials.website) {
      meshLinks.push({
        source_type: 'token',
        source_id: token.token_mint,
        linked_type: 'website',
        linked_id: socials.website,
        relationship: 'has_website',
        confidence: 0.8,
        evidence: { source: 'social_link_mint_checker' },
        discovered_via: 'social_link_mint_checker',
      });
    }

    if (socials.community) {
      const communityId = extractXCommunityId(socials.community);
      if (communityId) {
        meshLinks.push({
          source_type: 'token',
          source_id: token.token_mint,
          linked_type: 'community',
          linked_id: socials.community,
          relationship: 'has_community',
          confidence: 0.8,
          evidence: { source: 'social_link_mint_checker' },
          discovered_via: 'social_link_mint_checker',
        });

        // Check if community exists and needs spidering
        const { data: existing } = await supabase
          .from('x_communities')
          .select('id, admin_usernames')
          .eq('community_id', communityId)
          .maybeSingle();

        if (!existing) {
          // Insert new community for enrichment
          await supabase.from('x_communities').upsert({
            community_id: communityId,
            community_url: socials.community,
            linked_token_mints: [token.token_mint],
            is_deleted: false,
            scrape_status: 'pending',
          }, { onConflict: 'community_id' });
          communitiesQueued++;
        } else if (!existing.admin_usernames || existing.admin_usernames.length === 0) {
          // Existing but no admin yet — mark for re-scrape
          await supabase.from('x_communities')
            .update({ scrape_status: 'pending' })
            .eq('id', existing.id);
          communitiesQueued++;
        }
      }
    }

    if (meshLinks.length > 0) {
      const { error: meshErr } = await supabase
        .from('reputation_mesh')
        .upsert(meshLinks, { onConflict: 'source_type,source_id,linked_type,linked_id' });
      if (!meshErr) meshLinksAdded += meshLinks.length;
    }
  }

  const result = { processed, socialsFound, meshLinksAdded, communitiesQueued };
  console.log(`[social-link-mint-checker] ${JSON.stringify(result)}`);

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
