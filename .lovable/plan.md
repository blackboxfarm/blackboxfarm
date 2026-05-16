# Token Archive — Standalone Page

Per memory, this requires "Plan Approved" before any code changes.

## Goal
Expose the existing Token Archive (currently a Super Admin sub-tab) as a standalone page at `/token-archive` so the full 15,612-token list is browsable outside the admin panel.

## What exists already
- `src/components/admin/holders-intel/TokenArchive.tsx` — paginated archive (50/100/250/500), search by mint/name/symbol, trigger-source filter, ordered most-recent-first
- `src/components/admin/holders-intel/HoldersIntelTweetCard.tsx` — renders each row as an @HoldersIntel X-style card
- Data source: `holders_intel_post_queue` (posted rows + `manual_tweet_url`)

## Changes

1. **New page** `src/pages/TokenArchive.tsx`
   - Wraps the existing `<TokenArchive />` component inside `<SiteLayout>`
   - Adds H1 "Token Archive", short intro, SEO title/meta/canonical
   - Each card's "View on X" button links to `manual_tweet_url` (already wired in `HoldersIntelTweetCard`)

2. **Route** in `src/App.tsx`
   - Add `<Route path="/token-archive" element={<TokenArchive />} />`

3. **Nav** in `src/components/layout/SiteLayout.tsx`
   - Add `{ label: 'Token Archive', path: '/token-archive' }` to `BASE_NAV_ITEMS` (public, visible to everyone)

## Out of scope
- No DB changes (schema already has the required columns from the prior migration)
- No edge function changes
- No backfill of the ~159k legacy rows with no composed `tweet_text` — archive shows only posted rows with content, as designed

## Risks
- Public exposure of `holders_intel_post_queue` posted rows — confirm RLS allows anon SELECT on `manual_status='posted_manual'` rows, or route reads through an edge function. **Need your call:** public anon read, or require login?

Reply **Plan Approved** to proceed (and answer the public-vs-login question).