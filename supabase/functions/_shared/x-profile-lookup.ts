/**
 * getXProfile(handle) — cached display_name + followers_count for an external
 * X profile, backed by Apify's apidojo/twitter-user-scraper. Results are
 * cached in `x_account_registry` (followers_count, followers_fetched_at,
 * display_name) so repeat allstar mint alerts for the same dev don't re-hit
 * Apify within the TTL window.
 */

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface XProfileLite {
  handle: string;
  displayName: string | null;
  followers: number | null;
}

function normalize(handle: string): string {
  return handle.replace(/^@/, '').trim().toLowerCase();
}

export function formatFollowers(n: number | null | undefined): string {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export async function getXProfile(
  supabase: SupabaseClient,
  rawHandle: string,
): Promise<XProfileLite | null> {
  const handle = normalize(rawHandle);
  if (!handle) return null;

  // 1. Cache lookup
  try {
    const { data: cached } = await supabase
      .from('x_account_registry')
      .select('current_handle, display_name, followers_count, followers_fetched_at')
      .ilike('current_handle', handle)
      .maybeSingle();
    if (cached?.followers_count != null && cached.followers_fetched_at) {
      const ageMs = Date.now() - new Date(cached.followers_fetched_at).getTime();
      if (ageMs < CACHE_TTL_MS) {
        return {
          handle,
          displayName: cached.display_name ?? null,
          followers: Number(cached.followers_count),
        };
      }
    }
  } catch (e) {
    console.warn('[x-profile-lookup] cache read failed:', e);
  }

  // 2. Apify fetch
  const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
  if (!APIFY_API_KEY) {
    console.warn('[x-profile-lookup] APIFY_API_KEY missing, returning null');
    return null;
  }

  try {
    const resp = await fetch(
      `https://api.apify.com/v2/acts/apidojo~twitter-user-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
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
      },
    );
    if (!resp.ok) {
      console.warn(`[x-profile-lookup] Apify ${resp.status} for @${handle}`);
      return null;
    }
    const profiles = await resp.json();
    const p = Array.isArray(profiles) ? profiles[0] : null;
    if (!p?.userName) return null;

    const out: XProfileLite = {
      handle,
      displayName: p.name ?? null,
      followers: typeof p.followers === 'number' ? p.followers : null,
    };

    // 3. Cache write — UPDATE if registry row exists for this handle.
    // INSERT path is skipped because x_account_registry.x_user_id is NOT
    // NULL (no synthetic id is safe to invent here); the registry is
    // seeded elsewhere from real X user IDs.
    try {
      const { data: existing } = await supabase
        .from('x_account_registry')
        .select('x_user_id')
        .ilike('current_handle', handle)
        .maybeSingle();
      if (existing?.x_user_id) {
        await supabase
          .from('x_account_registry')
          .update({
            display_name: out.displayName,
            followers_count: out.followers,
            followers_fetched_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .eq('x_user_id', existing.x_user_id);
      } else if (p.id) {
        // First-time insert using real X user id from Apify response.
        await supabase.from('x_account_registry').insert({
          x_user_id: String(p.id),
          current_handle: handle,
          display_name: out.displayName,
          followers_count: out.followers,
          followers_fetched_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('[x-profile-lookup] cache write failed:', e);
    }

    return out;
  } catch (e) {
    console.warn('[x-profile-lookup] Apify call threw:', e);
    return null;
  }
}