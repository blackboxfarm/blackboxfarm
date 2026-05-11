
## Goal

Make dev-wallet → coins list resolution resilient by adding a scrape-based fallback for `pump.fun/profile/{wallet}` whenever the official `frontend-api-v3.pump.fun /coins/user-created-coins` endpoint returns empty / rate-limits / 403s. The page itself reliably renders the full coin list, so we can read it via Browserless (primary) or Apify (overflow), and feed the same downstream pipelines (mesh links, `developer_tokens`, copycat, dev monitor).

## What changes

### 1. New shared resolver: `_shared/pumpfun-creator-coins-resolver.ts`

A single entry point used everywhere we currently call `fetchPumpFunCreatorCoins`. Tiered chain:

```text
Tier 1: Pump.fun API v3  (existing fetchPumpFunCreatorCoins, paginated)
   ↓ if 0 results / 403 / 429 / timeout
Tier 2: Browserless /content on https://pump.fun/profile/{wallet}
        - waitForSelector for the coins grid
        - parse anchor hrefs matching /coin/{mint} + adjacent ticker/name/mcap text
   ↓ if Browserless fails or wallet has >N coins (lazy-loaded list)
Tier 3: Apify (existing pump.fun profile actor or generic-web-scraper actor)
        - only fired when Tier 2 returns < expected and wallet looks "important"
          (e.g. flagged by mesh-kyc / has dev_profile.kyc_verified or appears in
          developer_profiles with >5 tokens already known)
        - cost-gated through api-logger (apify = paid)
```

Returns the same shape as `fetchPumpFunCreatorCoins` so callers don't change.

### 2. Wire the resolver into existing callers (no behavior change on Tier 1 success)

- `mesh-wallet-token-discovery` — replace direct `fetchPumpFunCreatorCoins` loop with resolver. This is the biggest beneficiary (it's the function that feeds dev_token coverage for mesh).
- `pumpfun-dev-analyzer` — same swap.
- `pumpfun-dev-wallet-monitor` — same swap.
- `pumpfun-websocket-listener` — same swap.
- `_shared/copycat-detector.ts` — same swap.

`oracle-unified-lookup` keeps its dead herokuapp call removed (already noted in earlier work) and uses the resolver too.

### 3. Cost & rate guardrails

- Browserless: gated by existing `BROWSERLESS_URL`/`BROWSERLESS_TOKEN`. Per-wallet cooldown (e.g. 6 h) stored in a tiny new table `pumpfun_profile_scrape_log (wallet, last_scraped_at, source, coins_found)` so the 5-min KYC cron / mesh funnel doesn't re-scrape the same wallet every cycle.
- Apify: respects existing `apify_pause_state` + the 1-credit/run cost in `api-logger`. Hard cap: max 50 Apify runs/day across all callers, configurable.
- All failures fall through silently — if every tier fails, return `[]` (same as today).

### 4. New diagnostic edge function: `pumpfun-profile-scrape-test`

Manual `POST { wallet }` endpoint that runs the resolver with verbose logging and returns `{ tier_used, coins_found, elapsed_ms, errors }`. Lets you spot-check from the admin panel without touching any pipeline.

### 5. Admin panel surface (small)

In `DevKycCoveragePanel`, add a "Re-scrape coins via Browserless" button per row that calls the diagnostic function and displays the result. No new page.

### 6. Memory update

Append a new section to `mem/features/oracle/kyc-fast-path-and-self-expanding-dictionary.md` documenting the 3-tier resolver + the `pumpfun_profile_scrape_log` cooldown table.

## Files touched

- **Created**
  - `supabase/functions/_shared/pumpfun-creator-coins-resolver.ts`
  - `supabase/functions/pumpfun-profile-scrape-test/index.ts`
  - `supabase/migrations/<ts>_pumpfun_profile_scrape_log.sql`
- **Edited**
  - `supabase/functions/mesh-wallet-token-discovery/index.ts`
  - `supabase/functions/pumpfun-dev-analyzer/index.ts`
  - `supabase/functions/pumpfun-dev-wallet-monitor/index.ts`
  - `supabase/functions/pumpfun-websocket-listener/index.ts`
  - `supabase/functions/_shared/copycat-detector.ts`
  - `src/components/admin/oracle/DevKycCoveragePanel.tsx`
  - `mem/features/oracle/kyc-fast-path-and-self-expanding-dictionary.md`

## Open questions before I build

1. **Apify actor:** do you already have a specific pump.fun profile actor in your Apify account you want me to use, or should Tier 3 use the generic Cheerio/Puppeteer actor (`apify/web-scraper`)? If the latter, I'll write a small page-function that targets the `/profile/{wallet}` coin grid.
2. **Cooldown window:** is 6 h per wallet right, or do you want shorter (e.g. 1 h) for wallets that just got promoted to allstar / KYC-verified?
3. **Tier 3 trigger threshold:** I proposed Apify only fires for "important" wallets (KYC-verified or >5 known tokens). OK, or should Apify be on-demand only (admin button), never automatic?
