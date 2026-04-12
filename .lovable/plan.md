

# Fix: Stop Redundant DexScreener Scraping

## Root Cause

Four separate cron jobs all trigger `dex-top-200` scraping of DexScreener:

```text
Job #148  holdersintel-dex-scanner-5min   */5 * * * *   ← MAIN CULPRIT (every 5 min!)
Job #173  dex-top-200-30min               */30 * * * *  ← the intended job
Job #98   oracle-hourly-scan              0 * * * *     ← legacy duplicate
Job #145  holdersintel-scheduler-hourly   15 * * * *    ← also chains into dex-top-200
```

Each run triggers 3 retry attempts per page (Browserless fails to parse → retries), producing 6 scrape calls per invocation. At every-5-minutes frequency, that's **~72 scrape calls/hour**.

## Plan

### 1. Make `holders-intel-dex-scanner` use cached data instead of live-scraping
- Modify `holders-intel-dex-scanner` to read from the `token_metadata` or `dex_ranking_snapshots` table (which `dex-top-200` already populates every 30 min) instead of calling `dex-top-200` live
- This eliminates ~12 redundant scrape runs per hour

### 2. Make `holders-intel-scheduler` use cached data too
- Same change: read from the DB table instead of calling `dex-top-200` live
- Eliminates another hourly scrape

### 3. Remove legacy cron job #98 (`oracle-hourly-scan`)
- Migration to unschedule `cron.unschedule('oracle-hourly-scan')`
- It calls the old `dexscreener-top-200-scraper` which also chains into `dex-top-200` — pure duplication

### 4. Fix the Browserless retry storm
- The Browserless HTML→markdown conversion strips links, causing 0 pairs parsed, triggering max retries even on "successful" scrapes
- Already partially fixed in prior changes, but need to verify the `preferredProvider: 'firecrawl'` override in `dex-top-pages.ts` is deployed

## Result
- DexScreener scraping goes from **~72 calls/hour** down to **~4 calls/hour** (2 pages × 1 attempt × every 30 min)
- Other functions get the same data from DB cache (< 30 min stale, which is fine for trending tokens)

## Files to modify
- `supabase/functions/holders-intel-dex-scanner/index.ts` — read from DB instead of calling dex-top-200
- `supabase/functions/holders-intel-scheduler/index.ts` — read from DB instead of calling dex-top-200
- `supabase/functions/dexscreener-top-200-scraper/index.ts` — read from DB instead of calling dex-top-200
- New migration: `cron.unschedule('oracle-hourly-scan')`

