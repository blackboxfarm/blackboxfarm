

# Fix: Revenue Collector Stale Cache Fallback

## Problem
`enhanced-revenue-collector` lines 62-78 has a fallback path that reads `sol_price_cache` directly without checking `updated_at`. If the primary `getSolPriceQuick()` fails, it could silently use a days-old cached price for revenue calculations.

## Fix (1 file, ~5 lines)
Replace the raw `sol_price_cache` query fallback in `enhanced-revenue-collector/index.ts` with `getSolPriceFromCache(supabaseService)`, which already has the 5-minute staleness guard built in.

**Before (lines 62-78):**
```typescript
try {
  solPriceUSD = await getSolPriceQuick();
} catch {
  // Raw cache read — NO staleness check
  const { data: cached } = await supabaseService
    .from('sol_price_cache')
    .select('price_usd')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  solPriceUSD = cached?.price_usd || 0;
  ...
}
```

**After:**
```typescript
try {
  solPriceUSD = await getSolPriceFromCache(supabaseService);
} catch {
  throw new Error('Cannot collect revenue: SOL price unavailable from all sources');
}
```

### Technical detail
- Add `import { getSolPriceFromCache } from '../_shared/sol-price-cache.ts';`
- Remove the `getSolPriceQuick` import (no longer needed — `getSolPriceFromCache` already falls through to the live fetcher)
- The staleness-guarded cache tries cache first → live fetch → throws. No stale data, no hardcoded fallback.

