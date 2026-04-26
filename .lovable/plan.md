## Why we're changing this

Yesterday's fix nailed the **community name** and **admin** for LASTMAN, but the screenshot proves we're still missing the rich `Moderators` block (quiet, Big Chad, de8en, Dionio99, YBD, …). The reason is structural, not parsing:

- Firecrawl on `/i/communities/<id>/about` is being silently redirected by X to the **main community tab** (the snippet stored in `raw_data.textSnippet` for LASTMAN contains *no* "Moderators" heading at all — only the public "Created by" sidebar).
- Browserless can occasionally see it, but the free tier is exhausted and the result is inconsistent.
- Database evidence: **852 communities have an admin, only 106 have any moderator** (12% coverage). That's the parser silently giving up on a page that never contained the data.

But we already have the gold-standard tool wired in elsewhere:
**`danpoletaev~twitter-x-community-member-scraper`** (Apify) — used today only inside `x-community-follow` and `social-larp-detector`. It returns every member with an authoritative `communityRole` field (`Admin` / `Moderator` / `member`), follower counts, blue-check status, X user IDs, and display names. This is the data behind your screenshot.

The plan promotes that scraper to the **canonical resolver** for *every* X-Community lookup site-wide, then builds the cross-linking master mesh you asked for.

---

## 1 · Canonical resolver: `_shared/x-community-resolver.ts` (NEW)

A single shared module every caller uses. Internal waterfall:

| Step | Source | Returns |
|---|---|---|
| 1 | `community_follow_targets` cache (≤ 24 h old) | full member list with roles |
| 2 | **Apify member-scraper** (primary) — `maxMembers: 50`, residential proxy | name, description, member_count, admin, moderators[], member sample, all `x_user_id`s |
| 3 | Firecrawl `/about` (existing) | name + admin only — *fallback for name when Apify returns 0 members* |
| 4 | Browserless (existing) | last-resort same as today |

Output shape (single source of truth):
```ts
{
  communityId, name, description, memberCount, createdAt,
  admin:     { handle, xUserId, displayName, isVerified, followers },
  moderators:[{ handle, xUserId, displayName, isVerified, followers }],
  memberSample:[{ handle, xUserId, isVerified }],   // first 50 for evidence
  source: 'cache' | 'apify' | 'firecrawl' | 'browserless',
  scrapedAt
}
```

Also persists every member's `x_user_id` so handle-recycling (rename) is detectable later via Phanes.

## 2 · Replace ad-hoc scrapers with the resolver

Edit these to call the new resolver instead of their inline logic:

- `x-community-enricher/index.ts` — main pipeline (drops the Firecrawl-first path)
- `bulk-community-enricher/index.ts`
- `backfill-x-communities/index.ts`
- `enrich-token-communities/index.ts`
- `oracle-master-spider/index.ts`
- `social-mesh-linker/index.ts`
- `harvest-token-socials/index.ts`
- `dexscreener-top-200-scraper/index.ts` (community link discovery)
- `x-pinned-community-finder/index.ts` (after finding a community, immediately resolve it)
- `social-link-mint-checker/index.ts`

`x-community-about-admin.ts` becomes a thin Firecrawl-only fallback used by the resolver (no longer called directly anywhere).

## 3 · Persist the rich data

`x_communities` already has the columns we need; we just start filling them:

- `admin_usernames` → `[admin.handle]`
- `moderator_usernames` → all mods' handles (the field that's currently 88% empty)
- `member_count`, `name`, `description`, `created_at_x` → from Apify
- `raw_data.members` → full member sample with `xUserId`s for forensic re-resolution

For every admin **and moderator**, write to the master mesh (see §4).

## 4 · Master Mesh: Dev ↔ Handle ↔ Community cross-linking

Two new tables (`reputation_mesh` is too generic for the directional facts you described):

### `x_handle_registry` (handle as the canonical entity)

```
id uuid pk
handle              text unique (lowercased current handle)
x_user_id           text unique  -- the immutable Twitter numeric ID
display_name        text
is_verified         boolean
followers_count     int
first_seen_at, last_seen_at
handle_history      jsonb  -- [{handle, observed_at}]  ← recycling
display_name_history jsonb -- [{name, observed_at}]
linked_token_count  int
linked_wallet_count int
linked_community_count int
metadata            jsonb
```

Whenever a handle is observed, we upsert by `x_user_id` so a rename automatically appends to `handle_history` and updates `handle` — that's your **handle-recycling tracker**.

### `dev_handle_links` (the many-to-many master mesh)

```
id uuid pk
wallet_address text not null
x_user_id      text not null         -- joins to x_handle_registry
handle_at_link text                  -- handle observed at link time
relationship   text                  -- 'community_admin', 'community_mod',
                                     --  'token_official_x', 'pinned_community_admin',
                                     --  'genealogy_funder', 'mesh_inferred'
confidence     int                   -- 0-100
evidence       jsonb                 -- {community_id?, token_mint?, source_fn, scraped_at}
discovered_at  timestamptz default now()
unique (wallet_address, x_user_id, relationship, (evidence->>'community_id'))
```

This gives you **both** directions natively:
- "All handles for wallet X" → `select x_user_id from dev_handle_links where wallet=X`
- "All wallets behind handle Y" → `select wallet from dev_handle_links where x_user_id=Y`
- "Community recycling" → join on `x_handle_registry.handle_history`

`reputation_mesh` keeps getting populated for backwards compatibility, but `dev_handle_links` is the authoritative graph for analytics, the bubble map, and the dev report.

### View: `v_dev_social_graph`

```sql
SELECT d.wallet_address,
       array_agg(DISTINCT r.handle)         FILTER (WHERE r.handle IS NOT NULL)         AS current_handles,
       array_agg(DISTINCT h)                FILTER (WHERE h IS NOT NULL)                AS historical_handles,
       array_agg(DISTINCT l.evidence->>'community_id')
                                            FILTER (WHERE l.evidence ? 'community_id') AS communities,
       count(*) AS link_count
FROM dev_handle_links l
JOIN x_handle_registry r ON r.x_user_id = l.x_user_id
LEFT JOIN LATERAL jsonb_array_elements_text(r.handle_history) h(h) ON true
GROUP BY d.wallet_address;
```

The bubble map and `/dev` Telegram report both read from this view → one query gives the full picture.

## 5 · Wire-in points (ensures coverage *everywhere*)

| Where a community URL is discovered | Action |
|---|---|
| DexScreener token row (`socials[]`) | resolver runs → mesh upserts |
| Pump.fun mint metadata `twitter` field | if it's a community URL → resolver; if it's a profile → `x-pinned-community-finder` → resolver |
| Helius `tokenMetadata` JSON | same as above |
| `token_social_links` insert trigger | new DB trigger calls `enrich-token-communities` async via `pg_net` (already used elsewhere) |
| Pinned community finder result | calls resolver before returning |
| Manual paste in `/super-admin → Mesh` | calls resolver |
| Dev report `/dev` Telegram | reads `v_dev_social_graph` |

## 6 · Recycling tracking

- `x_handle_registry.handle_history` updated on every observation where the existing row's `handle` ≠ incoming handle for the same `x_user_id`.
- Phanes already returns `phanes_recycled_accounts`; we extend `phanes-x-query` to write into `x_handle_registry` so we capture rebrands proactively, not only when re-scraped.
- Communities themselves: a new boolean `x_communities.is_renamed` + `name_history jsonb` (parallel to handles).

## 7 · Backfill

One-shot edge function `backfill-x-community-members`:
- Iterates every `x_communities` row where `array_length(moderator_usernames,1) IS NULL OR < 1`.
- Throttled to **30 communities / 5 min** (Apify quota friendly).
- Re-runs the resolver and upserts admin + mods + populates the new tables.
- Estimated cost: 7 070 communities × ~$0.0007 = **≈ $5 USD** of Apify credits, run once.

After backfill completes, a cron `bulk-community-enricher` already exists — we extend its rotation to refresh the *oldest 200 communities every 6 h* so the data stays warm.

## 8 · UI surfacing (small but visible)

- Bubble map: when an X-Community node is hovered, the tooltip lists Admin + first 3 moderators with verified badges (already designed, just needs the data).
- `/super-admin → Dev Teams`: the "+N admins/mods" chip lights up properly now that mods aren't empty.
- `/dev` Telegram report: adds a `🛡 Mods:` line under the existing `👑 Admin:` line for the token's official community.

## 9 · Non-goals (kept explicit)

- We are **not** following or DMing community members (that's the separate `x-community-follow` workflow, untouched here).
- We are **not** fetching every member of every community — `maxMembers: 50` is enough to capture the entire admin/mod set (X caps mods at ~25) plus a representative member sample.
- No changes to the bubble simulation, schematic view, or share-card pipeline.

---

## Files to be created / modified

**New**
- `supabase/functions/_shared/x-community-resolver.ts`
- `supabase/functions/backfill-x-community-members/index.ts`
- migration: `x_handle_registry`, `dev_handle_links`, `v_dev_social_graph`, `x_communities.name_history` + `is_renamed`

**Modified**
- `supabase/functions/_shared/x-community-about-admin.ts` (downgraded to fallback only)
- `supabase/functions/x-community-enricher/index.ts`
- `supabase/functions/bulk-community-enricher/index.ts`
- `supabase/functions/backfill-x-communities/index.ts`
- `supabase/functions/enrich-token-communities/index.ts`
- `supabase/functions/x-pinned-community-finder/index.ts`
- `supabase/functions/social-mesh-linker/index.ts`
- `supabase/functions/oracle-master-spider/index.ts`
- `supabase/functions/dexscreener-top-200-scraper/index.ts`
- `supabase/functions/phanes-x-query/index.ts` (writes to registry)
- `src/hooks/useMeshGraph.ts` (consumes `v_dev_social_graph`)
- `src/components/bubble-map/PublicBubbleMap.tsx` (tooltip mods)
- `src/components/admin/DevTeamsView.tsx` (no schema change, but data finally populates)

After approval I'll run the migration, deploy the resolver and rewired functions, kick off the backfill, and verify with the LASTMAN community that all 5+ moderators land in `moderator_usernames` and the master mesh.