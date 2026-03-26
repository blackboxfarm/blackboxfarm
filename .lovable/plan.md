

# Bulk Backfill X Communities for ALL Tokens

## Problem Found

Three compounding issues are preventing community discovery:

1. **`harvest-token-socials` queries a materialized view** (`master_token_directory`) which is read-only and stale — the filter `x_community_urls.eq.{}` may not even work correctly with PostgREST for empty arrays
2. **The view's `x_community_urls` is derived from `x_communities.linked_token_mints`** — the harvest function can never "mark" a token as processed, so it re-processes the same tokens forever or gets 0 results
3. **No tracking of which tokens have been checked** — there's no flag saying "we already looked at DexScreener for this token's community"

**Current state**: 38,371 tokens with no community data. Only 364 have communities linked. 3,176 total communities exist.

## Plan

### Step 1: Create a dedicated `backfill-x-communities` edge function

A focused, lean function that:
- Queries tokens from **actual source tables** (`scraped_tokens`, `holders_intel_seen_tokens`) instead of the materialized view
- LEFT JOINs against `x_communities` to find tokens NOT already linked to any community
- Hits DexScreener batch API (30 tokens per call) to extract community URLs from both `socials` and `websites` arrays
- Inserts new communities into `x_communities` with `scrape_status: 'pending'`
- Tracks progress via a simple `processed_at` marker or by checking `x_communities.linked_token_mints`

Processing rate: ~300 tokens per invocation × 288 runs/day = all 38k tokens in ~1 day

### Step 2: Fix the query in `harvest-token-socials`

Change the DexScreener mode to query source tables directly instead of the materialized view, using a subquery:
```sql
SELECT DISTINCT token_mint FROM (
  SELECT token_mint FROM scraped_tokens
  UNION SELECT token_mint FROM holders_intel_seen_tokens
) t
WHERE NOT EXISTS (
  SELECT 1 FROM x_communities xc 
  WHERE t.token_mint = ANY(xc.linked_token_mints)
)
LIMIT batchSize
```

This ensures the function always finds un-processed tokens.

### Step 3: Add a cron job for the backfill

Add `backfill-x-communities` to the reconcile-cron-jobs list, running every 5 minutes until all tokens are processed. The function self-terminates (returns early) when no more tokens need processing.

### Step 4: Refresh the materialized view

After backfill batches complete, trigger `REFRESH MATERIALIZED VIEW CONCURRENTLY master_token_directory` so the admin UI reflects new communities.

## Technical Details

- **DexScreener rate limit**: 30 tokens per API call, 500ms delay between batches = ~300 tokens/min safely
- **Community extraction**: Check both `info.socials` (twitter type URLs containing `/communities/`) and `info.websites` for community URLs using `extractXCommunityId()`
- **Deduplication**: Upsert into `x_communities` by `community_id`, append token mint to `linked_token_mints` array if not already present
- **Estimated completion**: ~128 runs × 5 min = ~10.5 hours to process all 38,371 tokens

