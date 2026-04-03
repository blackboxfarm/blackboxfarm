

## DexScreener Page 2 Timeout Fix

### Problem
Page 2 of DexScreener (`/solana/page-2`) consistently times out because it relies on heavy lazy-loaded JavaScript. The current max timeout is 45 seconds with a 15-second `waitFor`, which is not enough for this page to fully render.

### Root Cause
DexScreener Page 2 content loads via JavaScript after initial page render. The Firecrawl scraper times out waiting for the DOM to populate. Page 1 works fine because its content renders faster.

### Fix: Increase Page 2 timeout and waitFor values

**File**: `supabase/functions/_shared/dex-top-pages.ts`

Update `SCRAPE_CONFIGS_PAGE2` (lines 113-117) from:
```text
waitFor: 8000,  timeout: 30000
waitFor: 12000, timeout: 35000
waitFor: 15000, timeout: 45000
```
To:
```text
waitFor: 10000, timeout: 45000
waitFor: 15000, timeout: 55000
waitFor: 20000, timeout: 60000
```

Also increase the inter-page stagger delay (line 245) from 5 seconds to 8 seconds to give Firecrawl more breathing room between requests.

### Why these values
- Firecrawl's max timeout is 60 seconds -- we push the final retry to that ceiling
- `waitFor` of 20s on the last attempt gives DexScreener's lazy JS ample time to hydrate
- The 8s stagger reduces concurrent pressure on Firecrawl's infrastructure
- Page 1 configs remain unchanged (working fine)

### Risk
Minimal. Longer timeouts only affect Page 2 and only when earlier attempts fail. Successful scrapes still return as fast as before.

