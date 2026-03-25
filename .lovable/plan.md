

# Auto-Queue Top 200 "New" Tokens for X Posting

## Problem
The Dex Top 200 feed shows 111 tokens marked "New" — these are trending on DexScreener but have never been posted to X. Currently the Top 200 is **display-only**; there's no pipeline that automatically feeds new discoveries into the `holders_intel_post_queue` for the Intel XBot to post.

Only two sources currently feed the posting queue:
1. **funnel-feed-scanner** (Telegram funnel discoveries)
2. **holders-intel-dex-scanner** (boost/CTO/ads triggers)

The Top 200 is a major discovery signal that's being wasted.

## Plan

### 1. Add a "Queue New from Top 200" action to the `dex-top-200` edge function

After scraping and resolving the top 200, automatically insert any tokens marked "New" (not in `holders_intel_seen_tokens` or `holders_intel_post_queue`) into the posting queue with:
- `trigger_source: 'dex_top_200'`
- `trigger_comment` based on rank (e.g., "🔥 DexScreener #3")
- `scheduled_at: NOW()` so the poster picks them up immediately
- Priority weighting: top-ranked tokens get queued first

This runs every time the scraper fires (every ~5 min via cron), so new entries are caught automatically.

### 2. Deduplication guard

Before inserting, check both:
- `holders_intel_post_queue` (any status) — don't re-queue posted/skipped/expired tokens
- `holders_intel_seen_tokens` — don't queue tokens we've already analyzed and dismissed

### 3. Add a manual "Queue All New" button to the DexCloudFlareFeed UI

On the admin panel, add a button next to Refresh that bulk-queues all currently displayed "New" tokens. This gives you manual control alongside the automatic flow.

### 4. Rate limiting

Cap auto-queuing to ~20 tokens per scrape tick to avoid flooding the poster. The highest-ranked "New" tokens get priority.

## Technical Details

**Edge function changes** (`supabase/functions/dex-top-200/index.ts`):
- After building `finalTokens`, filter for tokens not in seen/queue tables
- Insert up to 20 into `holders_intel_post_queue` with `trigger_source: 'dex_top_200'`

**Frontend changes** (`src/components/admin/funnel-feeds/DexCloudFlareFeed.tsx`):
- Add "Queue New" button that calls `dex-top-200` with `{ action: 'queue_new' }` or directly inserts via Supabase client

**No migration needed** — the `holders_intel_post_queue` table already has all required columns including `trigger_source`.

