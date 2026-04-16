

# Add Scrape History Log & Polling Timer to Dex/CloudFlare Tab

## What this does
1. **Scrape History Log** — A new table (`dex_scrape_log`) records every scrape attempt per source URL: success/fail, pair count, provider used, error message, and duration. The admin UI shows this as a scrollable log with color-coded rows (green = success, red = fail).
2. **Polling Timer Toggle** — A dropdown or input in the admin UI to change how often the `dex-top-200` cron fires (e.g. 15min / 30min / 60min). This updates the `pg_cron` schedule via a small edge function or DB function call.

## Plan

### 1. Database: `dex_scrape_log` table
- `id` UUID PK
- `source_id` UUID FK → `dex_scrape_sources.id` (nullable for fallback sources)
- `source_url` TEXT (always logged regardless)
- `source_label` TEXT
- `success` BOOLEAN
- `pair_count` INT (0 on failure)
- `provider` TEXT (e.g. "firecrawl")
- `error_message` TEXT (null on success)
- `duration_ms` INT
- `created_at` TIMESTAMPTZ default now()
- RLS: super_admin read-only
- Auto-prune: trigger or scheduled cleanup to keep last 7 days only (storage management)

### 2. Edge function: log each scrape result
In `_shared/dex-top-pages.ts`, after each source scrape (success or catch block), insert a row into `dex_scrape_log` with the outcome. Minimal change — just add a `logScrapeResult()` helper next to `updateSourceStats()`.

### 3. Admin UI: Scrape History panel
Add a `ScrapeHistoryLog` component below the existing `ScrapeSourcesManager` in `DexCloudFlareFeed.tsx`:
- Fetches last 50 rows from `dex_scrape_log` ordered by `created_at DESC`
- Table: timestamp, source label, success ✅/❌, pairs found, provider, error (truncated), duration
- Refresh button
- Simple filter: All / Failures only

### 4. Admin UI: Polling interval control
Add a small control card above or beside the Scrape Sources manager:
- Shows current cron interval (read from a `site_settings` or `dex_scrape_sources` meta, or a dedicated key in an existing settings table)
- Dropdown: 15min / 30min / 60min
- On change: calls `supabase.functions.invoke('dex-top-200', { body: { action: 'update_cron', interval_minutes: N } })` which runs `SELECT cron.schedule(...)` to update the cron
- Alternatively, store the interval in a `dex_scrape_config` row and have the edge function self-throttle based on it

### 5. Cleanup migration
Add a `cron.schedule` job that runs daily to `DELETE FROM dex_scrape_log WHERE created_at < now() - interval '7 days'` to prevent unbounded growth.

## Technical notes
- The log insert uses the existing service-role client already available in `dex-top-pages.ts`
- Duration tracked with `Date.now()` before/after each `scrapePageMarkdown` call
- No changes to the scrape logic itself — purely observational logging
- The cron update requires `pg_cron` extension (already enabled per existing cron jobs)

