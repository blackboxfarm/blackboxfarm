import { withRunLog } from '../_shared/run-logger.ts';
import { createApiLogger } from '../_shared/api-logger.ts';
import { extractXCommunityId } from '../_shared/x-handle-extractor.ts';

/**
 * X Pinned-Community Finder
 * 
 * Breadcrumb resolver for "token → X handle → pinned X Community".
 * 
 * X (Twitter) blocks Firecrawl-style HTML scraping (returns empty markdown/links),
 * so we use Apify's `apidojo~twitter-user-scraper` (profile + bio entities) and
 * `apidojo~tweet-scraper` (recent + pinned tweets) to find any community URL the
 * user has pinned, linked in their bio, or recently shared.
 * 
 * Input:  { handle: "dunaldtrompx" }
 * Output: { handle, communityUrl, communityId, source, displayName, bio }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const COMMUNITY_REGEX = /(?:x\.com|twitter\.com)\/i\/communities\/(\d+)/i;

function findCommunityInText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = String(text).match(COMMUNITY_REGEX);
  return m ? `https://x.com/i/communities/${m[1]}` : null;
}

async function fetchProfileBio(handle: string, apifyKey: string): Promise<{
  communityUrl: string | null;
  displayName: string | null;
  bio: string | null;
}> {
  const actorId = 'apidojo~twitter-user-scraper';
  const logger = createApiLogger({
    serviceName: 'apify',
    endpoint: `${actorId}/pinned-community-bio`,
    method: 'POST',
    functionName: 'x-pinned-community-finder',
    metadata: { handle },
  });

  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        twitterHandles: [handle],
        maxItems: 1,
        getFollowers: false,
        getFollowing: false,
        getRetweeters: false,
      }),
    }
  );
  await logger.complete(res.status);

  if (!res.ok) return { communityUrl: null, displayName: null, bio: null };

  const arr = await res.json();
  const profile = Array.isArray(arr) ? arr[0] : null;
  if (!profile) return { communityUrl: null, displayName: null, bio: null };

  // Search every text-bearing field for a community URL
  const candidates: string[] = [
    profile.description,
    profile.url,
    profile.location,
  ].filter(Boolean);

  // Bio entities and URL entities expand t.co links to their full target
  const bioUrls = profile.entities?.description?.urls || [];
  const urlEntities = profile.entities?.url?.urls || [];
  for (const e of [...bioUrls, ...urlEntities]) {
    if (e?.expanded_url) candidates.push(e.expanded_url);
    if (e?.display_url) candidates.push(e.display_url);
    if (e?.url) candidates.push(e.url);
  }

  let communityUrl: string | null = null;
  for (const c of candidates) {
    const found = findCommunityInText(c);
    if (found) { communityUrl = found; break; }
  }

  return {
    communityUrl,
    displayName: profile.name || null,
    bio: profile.description || null,
  };
}

async function fetchPinnedAndRecentTweets(handle: string, apifyKey: string): Promise<string | null> {
  const actorId = 'apidojo~tweet-scraper';
  const logger = createApiLogger({
    serviceName: 'apify',
    endpoint: `${actorId}/pinned-community-tweets`,
    method: 'POST',
    functionName: 'x-pinned-community-finder',
    metadata: { handle },
  });

  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        twitterHandles: [handle],
        maxItems: 25,            // pinned tweet usually surfaces in top results
        sort: 'Latest',
        includeSearchTerms: false,
      }),
    }
  );
  await logger.complete(res.status);
  if (!res.ok) return null;

  const tweets = await res.json();
  if (!Array.isArray(tweets)) return null;

  for (const t of tweets) {
    const text = [t.text, t.full_text, t.url].filter(Boolean).join(' ');
    // Also walk URL entities, which expand t.co links
    const urls = (t.entities?.urls || []).map((u: any) => u.expanded_url || u.url).filter(Boolean);
    const haystack = [text, ...urls].join(' ');
    const found = findCommunityInText(haystack);
    if (found) return found;
  }
  return null;
}

Deno.serve(withRunLog('x-pinned-community-finder', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { handle: rawHandle } = await req.json();
    if (!rawHandle || typeof rawHandle !== 'string') {
      return new Response(JSON.stringify({ error: 'handle required' }), { status: 400, headers: corsHeaders });
    }

    const handle = rawHandle.replace(/^@/, '').trim().toLowerCase();
    if (!handle || handle.length > 15) {
      return new Response(JSON.stringify({ error: 'invalid handle' }), { status: 400, headers: corsHeaders });
    }

    const apifyKey = Deno.env.get('APIFY_API_KEY');
    if (!apifyKey) {
      return new Response(JSON.stringify({ error: 'APIFY_API_KEY missing' }), { status: 500, headers: corsHeaders });
    }

    console.log(`[x-pinned-community-finder] Resolving @${handle}…`);

    // Step 1 — bio + url entities (cheap, single-record)
    const bioResult = await fetchProfileBio(handle, apifyKey);
    let communityUrl = bioResult.communityUrl;
    let source: 'bio' | 'pinned_tweet' | null = communityUrl ? 'bio' : null;

    // Step 2 — fall back to scanning recent/pinned tweets
    if (!communityUrl) {
      const tweetCommunity = await fetchPinnedAndRecentTweets(handle, apifyKey);
      if (tweetCommunity) {
        communityUrl = tweetCommunity;
        source = 'pinned_tweet';
      }
    }

    const communityId = communityUrl ? extractXCommunityId(communityUrl) : null;

    const result = {
      handle,
      communityUrl,
      communityId,
      source,
      displayName: bioResult.displayName,
      bio: bioResult.bio,
    };

    console.log(`[x-pinned-community-finder] @${handle} → ${communityUrl || 'no community'} (source=${source || 'none'})`);
    return new Response(JSON.stringify(result), { headers: corsHeaders });
  } catch (err) {
    console.error('[x-pinned-community-finder] error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
}));