## Problem

On `/super-admin` → Articles tab, the per-row exposure dots (the row of platform icons next to each article) don't reflect newly logged Twitter/X publications. But opening the article's edit drawer, the **Exposure History** panel correctly shows Twitter/X seeded.

## Root cause

`src/components/admin/IntelBriefingsManager.tsx` (line ~349) fetches **all publications** once for the list-view exposure column with these caching options:

```ts
queryKey: ['intel-publications', 'exposure-all'],
staleTime: 5 * 60_000,
gcTime: 30 * 60_000,
refetchOnWindowFocus: false,
refetchOnMount: false,
```

The per-article `ExposurePanel` (inside the edit drawer) uses default React Query settings — so it always refetches and is fresh.

When a publication is logged via the Publications tab, `PublicationForm`'s mutation invalidates `['intel-publications', 'exposure-all']`. That works fine if the Articles list is currently mounted. But if you're on another tab when invalidation fires, the cache is just marked stale; with `refetchOnMount: false` the Articles list never refetches when you come back, so the dot row keeps showing the old (empty) state.

The same issue applies to the variant-count column (`['intel-briefing-variants', 'all']`), which uses identical settings.

## Fix

In `src/components/admin/IntelBriefingsManager.tsx`, relax the cache settings on these two queries so they refresh after invalidation and on tab return:

1. `['intel-publications', 'exposure-all']`
   - Remove `refetchOnMount: false`
   - Set `refetchOnWindowFocus: true` (or just remove the override — true is the default)
   - Drop `staleTime` to ~30 s (so casual navigation still benefits from cache, but new publications appear quickly)

2. `['intel-briefing-variants', 'all']` — apply the same change for parity, since variants have the same staleness symptom.

3. Also invalidate `['intel-publications', 'exposure-all']` from any other place a publication can be created/deleted (already done in `IntelPublicationsManager`'s add/delete mutations — confirmed). No additional invalidation calls needed; the cache settings change is sufficient.

## Files touched

- `src/components/admin/IntelBriefingsManager.tsx` — adjust cache options on the two list-level queries.

No DB or edge-function changes required.