# Family Intel Tab → New Allstar Registry Rewire

## Current state

- `FamilyDashboard` calls `family-graph-api` `action: 'list'` which reads `wallet_families` + members. No link back to the **Allstar Registry** row (tier, twitter handle, status, best mcap).
- `FamilyMintFeed` reads `wallet_family_mint_events` only — ignores parallel inserts into `allstar_mint_alerts`.
- No realtime: Registry edits (add/remove dev, retier) don't propagate; mint monitor inserts don't appear until manual refresh.
- No tier/registry filter, no "discover now for these devs" trigger, no header KPIs sourced from Registry.

## Goals

1. Family Intel views display data **joined with the Allstar Registry** (tier, X handle, status, best mcap).
2. UI updates **live** when Registry, families, members, edges, or mints change.
3. Operator can **trigger discovery** for filtered Registry rows from the tab.
4. Mint feed shows the **union of `wallet_family_mint_events` + `allstar_mint_alerts`** (deduped on `mint_address`), matching the Mint Alerts tab.

## Implementation

### 1. `family-graph-api` (edge fn) — enrich `list` action
- Join `wallet_families.allstar_id` → `allstar_dev_registry` and return per-family: `tier`, `twitter_handle`, `status`, `best_mcap_achieved`, `best_token_symbol`.
- Add optional filter params: `tier` (e.g. `T8`), `status`, `min_members`, `has_mints`.
- Keep existing `family_id` / `seed_wallet` actions untouched.

### 2. `FamilyDashboard.tsx`
- New columns: **Tier**, **X Handle** (links to `x.com/<handle>`), **Best $MC**.
- Header KPIs (sourced from Registry counts): `Active Devs`, `Discovered Families`, `Coverage % (families ÷ active devs)`, `Unread Mints`.
- Tier filter dropdown (T1–T9 + All) and "Has mints only" toggle, both routed as `family-graph-api` params.
- "🔄 Discover now" button → invokes `family-discovery-engine` with `{ maxSeeds: 10 }` then `refetch()`.
- Supabase Realtime subs on `wallet_families`, `wallet_family_members`, `allstar_dev_registry` → debounced `refetch()`.

### 3. `FamilyMintFeed.tsx`
- Replace single-table query with parallel fetch:
  - `wallet_family_mint_events` joined with `wallet_families(family_name, allstar_id)`
  - `allstar_mint_alerts` for the same `creator_wallet`s
- Merge + dedupe by `mint_address`, keep newest, attach Allstar tier + handle from registry.
- Realtime subs on both tables → re-fetch.
- Row click deep-links to `/super-admin?tab=allstars&sub=alerts&mint=<addr>` (matches the deep-link convention from System Alerts).

### 4. `FamilyIntelTab.tsx`
- Header row showing the same KPIs (compact) so they're visible in Dashboard, Graph, and Feed views.
- Pass `registryFilter` (tier) state down so Mint Feed and Dashboard share the same lens.

### 5. No DB schema changes
- Reuse existing tables: `wallet_families`, `wallet_family_members`, `wallet_family_edges`, `wallet_family_mint_events`, `allstar_dev_registry`, `allstar_mint_alerts`.
- Realtime publication: confirm `wallet_families`, `wallet_family_members`, `wallet_family_mint_events`, `allstar_mint_alerts`, `allstar_dev_registry` are in `supabase_realtime`. If any are missing, add via migration (one tiny SQL).

## Files touched

- **Edit:** `supabase/functions/family-graph-api/index.ts` (enrich list action + filters)
- **Edit:** `src/components/admin/allstar/FamilyDashboard.tsx` (columns, KPIs, filters, realtime, discover button)
- **Edit:** `src/components/admin/allstar/FamilyMintFeed.tsx` (union query, realtime, deep-link)
- **Edit:** `src/components/admin/allstar/FamilyIntelTab.tsx` (header KPIs, shared filter state)
- **Possible migration:** add missing tables to `supabase_realtime` publication only if not present.

## Open questions

1. **Discover-now scope:** should the button respect the active tier filter (e.g. only T8/T9 devs), or always run the global `maxSeeds=10` rotation?
2. **Dedupe rule for Mint Feed:** if a mint exists in both `wallet_family_mint_events` and `allstar_mint_alerts`, prefer the **family event** (richer evidence) or the **allstar alert** (canonical)? Default: allstar alert wins, family evidence shown as expandable detail.
3. **KPI "Coverage %":** counted vs **all** active devs in Registry, or only devs with `best_tier >= T5`? Default: all active.

Reply **"Plan Approved"** (and answer the 3 questions if you have preferences) and I'll build it.
