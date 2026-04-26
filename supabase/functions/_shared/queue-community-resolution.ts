/**
 * Lightweight enqueue helper for deferred X Community staff resolution.
 *
 * Any discovery function (DexScreener scraper, harvest-token-socials,
 * bulk-community-enricher, social-link-mint-checker, backfill-x-communities,
 * enrich-token-communities) calls this AFTER inserting a community_id stub
 * into x_communities. The backfill-x-community-members cron drains this
 * queue every 5 minutes and runs the canonical resolver (Apify member
 * scraper → admin + moderators + member_sample).
 *
 * Idempotent: ON CONFLICT (community_id) DO NOTHING.
 */

export function extractCommunityIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/communities\/(\d{6,25})/i);
  return m ? m[1] : null;
}

export async function enqueueCommunityResolution(
  supabase: any,
  communityIdOrUrl: string,
  discoveredVia: string,
  priority = 5,
): Promise<boolean> {
  const cid = /^\d{6,25}$/.test(communityIdOrUrl)
    ? communityIdOrUrl
    : extractCommunityIdFromUrl(communityIdOrUrl);
  if (!cid) return false;

  const { error } = await supabase
    .from('x_community_resolution_queue')
    .upsert(
      { community_id: cid, discovered_via: discoveredVia, priority },
      { onConflict: 'community_id', ignoreDuplicates: true },
    );

  if (error) {
    console.warn(`[queue-community-resolution] failed to enqueue ${cid}:`, error.message);
    return false;
  }
  return true;
}

export async function enqueueManyCommunityResolutions(
  supabase: any,
  ids: (string | null | undefined)[],
  discoveredVia: string,
  priority = 5,
): Promise<number> {
  const cids = [...new Set(
    ids
      .map(x => (x && /^\d{6,25}$/.test(x)) ? x : extractCommunityIdFromUrl(x ?? ''))
      .filter((x): x is string => !!x),
  )];
  if (cids.length === 0) return 0;

  const rows = cids.map(cid => ({ community_id: cid, discovered_via: discoveredVia, priority }));
  const { error } = await supabase
    .from('x_community_resolution_queue')
    .upsert(rows, { onConflict: 'community_id', ignoreDuplicates: true });

  if (error) {
    console.warn(`[queue-community-resolution] failed to bulk-enqueue ${cids.length}:`, error.message);
    return 0;
  }
  return cids.length;
}