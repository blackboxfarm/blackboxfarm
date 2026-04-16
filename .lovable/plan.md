

# Make DexScreener Scrape URLs Admin-Configurable

## Current State
- Two URLs hard-coded in `supabase/functions/_shared/dex-top-pages.ts`:
  - `https://dexscreener.com/solana`
  - `https://dexscreener.com/solana/page-2`
- No admin UI to add, remove, or reorder scrape targets
- The `dex-top-200` cron scrapes these pages via Firecrawl every 30 minutes

## Plan

### 1. Database table: `dex_scrape_sources`
Create a new table to store configurable scrape URLs:
- `id` (UUID PK)
- `url` (TEXT, the full page URL)
- `label` (TEXT, e.g. "Solana Page 1")
- `sort_order` (INT, controls scrape sequence)
- `is_active` (BOOL, default true)
- `is_page2` (BOOL, default false — controls longer wait times)
- `wait_ms` (INT[], retry wait configs e.g. `{3000,5000,8000}`)
- `last_scraped_at` (TIMESTAMPTZ)
- `last_pair_count` (INT)
- `created_at` / `updated_at`
- RLS: super_admin only

Seed with the two current URLs so nothing breaks.

### 2. Update `_shared/dex-top-pages.ts`
- Replace hard-coded `DEX_TOP_PAGE_URLS` with a Supabase query to `dex_scrape_sources` (active, ordered by `sort_order`)
- Use each row's `is_page2` and `wait_ms` fields instead of the current hard-coded wait arrays
- After each page scrape, update `last_scraped_at` and `last_pair_count` on the row

### 3. Admin UI: Add to Funnel Feeds → Dex/CloudFlare tab
In the existing `DexCloudFlareFeed` component, add a "Scrape Sources" card:
- Table showing current URLs, label, active toggle, last scraped, pair count
- Add URL button (input + label + is_page2 toggle)
- Delete button per row
- Drag-to-reorder or sort_order input

### 4. No other changes needed
The `dex-top-200` edge function calls `scrapeDexTopPages()` from the shared module — once that reads from DB instead of the constant, everything downstream (token_lifecycle, Live Feed, holders-intel-scheduler) works automatically.

## Technical Notes
- Migration seeds the two existing URLs so there's zero downtime
- The edge function already has a Supabase service-role client available
- Wait configs per-source allow fine-tuning page-2 style delays without code changes

