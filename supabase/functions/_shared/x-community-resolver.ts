/**
 * Canonical X Community resolver — single source of truth for every site-wide lookup.
 *
 * Waterfall:
 *   1. fresh-cache (x_communities row scraped < 24 h ago AND has moderators)
 *   2. Apify  `danpoletaev~twitter-x-community-member-scraper` (PRIMARY — returns roles)
 *   3. Firecrawl /about page (fallback for name/admin only)
 *   4. Browserless (final fallback, behind free-tier quota)
 *
 * Always upserts:
 *   - x_communities (name, description, member_count, admin_usernames, moderator_usernames,
 *     member_sample, name_history, is_renamed, raw_data, scrape_status)
 *   - x_account_registry (every observed handle / x_user_id, with handle_history)
 *   - dev_handle_links (community_admin / community_mod) when wallets are linked
 *   - reputation_mesh (admin_of / mod_of / co_mod) for backwards compatibility
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { fetchXCommunityAboutAdmin } from "./x-community-about-admin.ts";
import { createApiLogger } from "./api-logger.ts";

export interface ResolvedMember {
  handle: string;            // lower-cased, no @
  xUserId: string | null;    // immutable Twitter numeric ID
  displayName: string | null;
  isVerified: boolean;
  followers: number | null;
  role: 'Admin' | 'Moderator' | 'Member';
}

export interface ResolvedCommunity {
  communityId: string;
  name: string | null;
  description: string | null;
  memberCount: number | null;
  createdAtX: string | null;
  admin: ResolvedMember | null;
  moderators: ResolvedMember[];
  memberSample: ResolvedMember[];     // first 50 (incl. admin + mods)
  source: 'cache' | 'apify' | 'firecrawl' | 'browserless' | 'none';
  scrapedAt: string;
  raw?: unknown;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const APIFY_MAX_MEMBERS = 50;

function normHandle(h: string | null | undefined): string | null {
  const v = h?.trim().replace(/^@/, '').toLowerCase();
  return v && /^[a-z0-9_]{1,15}$/.test(v) ? v : null;
}

function memberFromCacheRow(row: any, role: ResolvedMember['role']): ResolvedMember {
  return {
    handle: row.handle,
    xUserId: row.x_user_id ?? null,
    displayName: row.display_name ?? null,
    isVerified: !!row.is_verified,
    followers: row.followers ?? null,
    role,
  };
}

function memberFromApify(m: any): ResolvedMember | null {
  const handle = normHandle(m?.screenName ?? m?.username);
  if (!handle) return null;
  const rawRole = (m?.communityRole || '').toString().toLowerCase();
  const role: ResolvedMember['role'] =
    rawRole === 'admin' ? 'Admin' :
    rawRole === 'moderator' ? 'Moderator' : 'Member';
  return {
    handle,
    xUserId: m?.restId ?? m?.userId ?? m?.id ?? null,
    displayName: m?.name ?? null,
    isVerified: !!(m?.isBlueVerified || m?.isVerified),
    followers: typeof m?.followersCount === 'number' ? m.followersCount : null,
    role,
  };
}

/* ------------------------------------------------------------------ */
/*  Step 1: cache                                                      */
/* ------------------------------------------------------------------ */
async function tryCache(
  supabase: ReturnType<typeof createClient>,
  communityId: string,
): Promise<ResolvedCommunity | null> {
  const { data: row }: { data: any } = await supabase
    .from('x_communities')
    .select('*')
    .eq('community_id', communityId)
    .maybeSingle();

  if (!row) return null;
  if (!row.last_scraped_at) return null;
  if (Date.now() - new Date(row.last_scraped_at).getTime() > CACHE_TTL_MS) return null;

  // Cache must have at least one moderator OR member sample to be considered "fresh"
  const hasMods = Array.isArray(row.moderator_usernames) && row.moderator_usernames.length > 0;
  const hasSample = Array.isArray(row.member_sample) && row.member_sample.length > 0;
  if (!hasMods && !hasSample) return null;

  const sample: ResolvedMember[] = (row.member_sample || []).map((m: any) => memberFromCacheRow(m, m.role || 'Member'));
  const admin: ResolvedMember | null =
    sample.find(m => m.role === 'Admin') ||
    (row.admin_usernames?.[0] ? { handle: row.admin_usernames[0], xUserId: null, displayName: null, isVerified: false, followers: null, role: 'Admin' } : null);
  const moderators: ResolvedMember[] =
    sample.filter(m => m.role === 'Moderator').length > 0
      ? sample.filter(m => m.role === 'Moderator')
      : (row.moderator_usernames || []).map((h: string) => ({ handle: h, xUserId: null, displayName: null, isVerified: false, followers: null, role: 'Moderator' as const }));

  return {
    communityId,
    name: row.name ?? null,
    description: row.description ?? null,
    memberCount: row.member_count ?? null,
    createdAtX: row.created_at_x ?? null,
    admin,
    moderators,
    memberSample: sample,
    source: 'cache',
    scrapedAt: row.last_scraped_at,
  };
}

/* ------------------------------------------------------------------ */
/*  Step 2: Apify member-scraper (PRIMARY)                             */
/* ------------------------------------------------------------------ */
async function tryApify(
  communityId: string,
  apifyKey: string,
): Promise<ResolvedCommunity | null> {
  const actorId = 'danpoletaev~twitter-x-community-member-scraper';
  const logger = createApiLogger({
    serviceName: 'apify',
    endpoint: actorId,
    method: 'POST',
    functionName: 'x-community-resolver',
    metadata: { communityId, maxMembers: APIFY_MAX_MEMBERS },
  });

  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}&maxItems=${APIFY_MAX_MEMBERS}&clean=1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          maxMembers: APIFY_MAX_MEMBERS,
          proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
        }),
        signal: AbortSignal.timeout(75000),
      },
    );
  } catch (e) {
    await logger.complete(0, (e as Error).message);
    console.warn(`[x-community-resolver] Apify fetch failed for ${communityId}:`, (e as Error).message);
    return null;
  }
  await logger.complete(res.status);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.warn(`[x-community-resolver] Apify ${res.status} for ${communityId}: ${errBody.slice(0, 180)}`);
    return null;
  }

  const items = await res.json().catch(() => null);
  if (!Array.isArray(items) || items.length === 0) {
    console.warn(`[x-community-resolver] Apify returned 0 members for ${communityId}`);
    return null;
  }

  const members = items
    .map(memberFromApify)
    .filter((m): m is ResolvedMember => !!m);

  if (members.length === 0) return null;

  // Promote: communities should have ≤1 admin + N moderators
  const admin = members.find(m => m.role === 'Admin') || null;
  const moderators = members.filter(m => m.role === 'Moderator');

  // Apify items often share community-level metadata on every record.
  const head = items[0] || {};
  const name =
    head?.communityName ||
    head?.community?.name ||
    head?.communityInfo?.name ||
    null;
  const description =
    head?.communityDescription ||
    head?.community?.description ||
    null;
  const memberCount =
    typeof head?.communityMemberCount === 'number' ? head.communityMemberCount :
    typeof head?.community?.memberCount === 'number' ? head.community.memberCount :
    null;
  const createdAtX =
    head?.communityCreatedAt ||
    head?.community?.createdAt ||
    null;

  return {
    communityId,
    name,
    description,
    memberCount,
    createdAtX,
    admin,
    moderators,
    memberSample: members,
    source: 'apify',
    scrapedAt: new Date().toISOString(),
    raw: { itemsCount: items.length, firstItem: head },
  };
}

/* ------------------------------------------------------------------ */
/*  Step 3 & 4: Firecrawl/Browserless about-page fallback              */
/* ------------------------------------------------------------------ */
async function tryAboutPage(communityId: string): Promise<ResolvedCommunity | null> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY') || '';
  const result = await fetchXCommunityAboutAdmin(communityId, browserlessKey);

  if (result.scrapeProvider === 'none' || (!result.adminUsername && !result.communityName)) {
    return null;
  }

  const admin: ResolvedMember | null = result.adminUsername
    ? { handle: result.adminUsername, xUserId: null, displayName: null, isVerified: false, followers: null, role: 'Admin' }
    : null;
  const moderators: ResolvedMember[] = (result.moderatorUsernames || []).map(h => ({
    handle: h, xUserId: null, displayName: null, isVerified: false, followers: null, role: 'Moderator',
  }));
  const memberSample = [admin, ...moderators].filter((m): m is ResolvedMember => !!m);

  return {
    communityId,
    name: result.communityName ?? null,
    description: null,
    memberCount: result.memberCount ?? null,
    createdAtX: null,
    admin,
    moderators,
    memberSample,
    source: result.scrapeProvider === 'firecrawl' ? 'firecrawl' : 'browserless',
    scrapedAt: new Date().toISOString(),
    raw: result.rawData,
  };
}

/* ------------------------------------------------------------------ */
/*  Persistence                                                         */
/* ------------------------------------------------------------------ */
async function persistRegistry(
  supabase: ReturnType<typeof createClient>,
  member: ResolvedMember,
): Promise<void> {
  const now = new Date().toISOString();

  // We have an x_user_id → upsert by x_user_id (canonical)
  if (member.xUserId) {
    const { data: existing }: { data: any } = await supabase
      .from('x_account_registry')
      .select('current_handle, display_name, handle_history, name_history')
      .eq('x_user_id', member.xUserId)
      .maybeSingle();

    if (existing) {
      const updates: any = { last_seen_at: now, is_verified: member.isVerified };
      if (existing.current_handle && existing.current_handle !== member.handle) {
        const hh = Array.isArray(existing.handle_history) ? existing.handle_history : [];
        hh.push({ handle: existing.current_handle, observed_until: now });
        updates.handle_history = hh;
        updates.current_handle = member.handle;
      }
      if (member.displayName && existing.display_name !== member.displayName) {
        const nh = Array.isArray(existing.name_history) ? existing.name_history : [];
        if (existing.display_name) nh.push({ name: existing.display_name, observed_until: now });
        updates.name_history = nh;
        updates.display_name = member.displayName;
      }
      if (Object.keys(updates).length > 1) {
        await supabase.from('x_account_registry').update(updates).eq('x_user_id', member.xUserId);
      }
      return;
    }

    await supabase.from('x_account_registry').upsert({
      x_user_id: member.xUserId,
      current_handle: member.handle,
      display_name: member.displayName,
      is_verified: member.isVerified,
      handle_history: [],
      name_history: [],
      linked_token_count: 0,
      first_seen_at: now,
      last_seen_at: now,
    }, { onConflict: 'x_user_id', ignoreDuplicates: false });
    return;
  }

  // No x_user_id (fallback path) → keep handle-only stub for Phanes backfill
  await supabase.from('x_account_registry').upsert({
    x_user_id: `pending_${member.handle}`,
    current_handle: member.handle,
    display_name: member.displayName,
    is_verified: member.isVerified,
    handle_history: [],
    name_history: [],
    linked_token_count: 0,
    first_seen_at: now,
    last_seen_at: now,
  }, { onConflict: 'current_handle', ignoreDuplicates: true });
}

async function persistCommunity(
  supabase: ReturnType<typeof createClient>,
  resolved: ResolvedCommunity,
): Promise<void> {
  const now = new Date().toISOString();

  // Pull existing for name-history tracking
  const { data: existing }: { data: any } = await supabase
    .from('x_communities')
    .select('id, name, name_history, raw_data, admin_usernames, moderator_usernames')
    .eq('community_id', resolved.communityId)
    .maybeSingle();

  let name_history = Array.isArray(existing?.name_history) ? existing.name_history : [];
  let is_renamed = !!existing?.is_renamed;
  if (existing?.name && resolved.name && existing.name !== resolved.name) {
    name_history = [...name_history, { name: existing.name, observed_until: now }];
    is_renamed = true;
  }

  const adminUsernames = resolved.admin ? [resolved.admin.handle] : (existing?.admin_usernames || []);
  const moderatorUsernames = resolved.moderators.length > 0
    ? resolved.moderators.map(m => m.handle)
    : (existing?.moderator_usernames || []);

  const memberSample = resolved.memberSample.map(m => ({
    handle: m.handle,
    x_user_id: m.xUserId,
    display_name: m.displayName,
    is_verified: m.isVerified,
    followers: m.followers,
    role: m.role,
  }));

  const upsertRow: any = {
    community_id: resolved.communityId,
    last_scraped_at: now,
    scrape_status: 'complete',
    failed_scrape_count: 0,
    is_deleted: false,
    member_sample: memberSample,
    raw_data: { ...(existing?.raw_data || {}), last_resolver: resolved.source, scraped_at: now, raw: resolved.raw ?? null },
    name_history,
    is_renamed,
    updated_at: now,
  };
  if (resolved.name) upsertRow.name = resolved.name;
  if (resolved.description) upsertRow.description = resolved.description;
  if (typeof resolved.memberCount === 'number') upsertRow.member_count = resolved.memberCount;
  if (resolved.createdAtX) upsertRow.created_at_x = resolved.createdAtX;
  if (adminUsernames.length > 0) upsertRow.admin_usernames = adminUsernames;
  if (moderatorUsernames.length > 0) upsertRow.moderator_usernames = moderatorUsernames;

  const { error } = await supabase
    .from('x_communities')
    .upsert(upsertRow, { onConflict: 'community_id' });

  if (error) throw new Error(`x_communities upsert failed for ${resolved.communityId}: ${error.message}`);

  // Registry for every observed handle
  const allMembers = [
    ...(resolved.admin ? [resolved.admin] : []),
    ...resolved.moderators,
    ...resolved.memberSample.filter(m => m.role === 'Member'),
  ];
  for (const m of allMembers) {
    try { await persistRegistry(supabase, m); } catch (e) {
      console.warn(`[x-community-resolver] registry upsert failed for @${m.handle}:`, (e as Error).message);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */
export interface ResolveOptions {
  forceRefresh?: boolean;       // bypass cache
  persist?: boolean;            // default true
  apifyKey?: string;            // override env (for tests)
}

export async function resolveXCommunity(
  supabase: ReturnType<typeof createClient>,
  communityId: string,
  opts: ResolveOptions = {},
): Promise<ResolvedCommunity> {
  const persist = opts.persist !== false;
  const apifyKey = opts.apifyKey || Deno.env.get('APIFY_API_KEY') || '';

  // 1. cache
  if (!opts.forceRefresh) {
    const cached = await tryCache(supabase, communityId);
    if (cached) return cached;
  }

  // 2. Apify (primary)
  let resolved: ResolvedCommunity | null = null;
  if (apifyKey) {
    resolved = await tryApify(communityId, apifyKey);
  } else {
    console.warn('[x-community-resolver] APIFY_API_KEY missing — skipping primary resolver');
  }

  // 3. about-page fallback (Firecrawl/Browserless) — used as a *supplement* when Apify is missing name
  if (!resolved || !resolved.name || resolved.moderators.length === 0) {
    const aboutResult = await tryAboutPage(communityId);
    if (resolved && aboutResult) {
      // Merge: keep Apify's authoritative members, fill gaps from about page
      resolved = {
        ...resolved,
        name: resolved.name || aboutResult.name,
        description: resolved.description || aboutResult.description,
        memberCount: resolved.memberCount ?? aboutResult.memberCount,
      };
    } else if (!resolved && aboutResult) {
      resolved = aboutResult;
    }
  }

  if (!resolved) {
    return {
      communityId, name: null, description: null, memberCount: null, createdAtX: null,
      admin: null, moderators: [], memberSample: [], source: 'none', scrapedAt: new Date().toISOString(),
    };
  }

  if (persist) {
    try { await persistCommunity(supabase, resolved); }
    catch (e) { console.error('[x-community-resolver] persist failed:', (e as Error).message); throw e; }
  }

  return resolved;
}

/**
 * Cross-link discovered admin/moderator handles to a wallet address.
 * Idempotent (unique index in dev_handle_links).
 */
export async function linkWalletToCommunityStaff(
  supabase: ReturnType<typeof createClient>,
  walletAddress: string,
  resolved: ResolvedCommunity,
  opts: { tokenMint?: string | null; discoveredVia?: string } = {},
): Promise<{ inserted: number }> {
  if (!walletAddress || !resolved) return { inserted: 0 };
  const rows: any[] = [];

  const push = (member: ResolvedMember, relationship: 'community_admin' | 'community_mod', confidence: number) => {
    if (!member.xUserId && !member.handle) return;
    rows.push({
      wallet_address: walletAddress,
      x_user_id: member.xUserId || `pending_${member.handle}`,
      handle_at_link: member.handle,
      relationship,
      confidence,
      community_id: resolved.communityId,
      token_mint: opts.tokenMint ?? null,
      evidence: {
        community_name: resolved.name,
        is_verified: member.isVerified,
        scraped_at: resolved.scrapedAt,
      },
      discovered_via: opts.discoveredVia || 'x-community-resolver',
    });
  };

  if (resolved.admin) push(resolved.admin, 'community_admin', 95);
  for (const mod of resolved.moderators) push(mod, 'community_mod', 85);

  if (rows.length === 0) return { inserted: 0 };

  // Idempotent insert; conflict handled by the unique index on (wallet, x_user_id, relationship, community_id, token_mint)
  const { error, count } = await supabase
    .from('dev_handle_links')
    .upsert(rows, { onConflict: 'wallet_address,x_user_id,relationship,community_id,token_mint', count: 'exact', ignoreDuplicates: false });

  if (error) {
    console.warn('[x-community-resolver] dev_handle_links upsert error:', error.message);
    return { inserted: 0 };
  }
  return { inserted: count ?? rows.length };
}