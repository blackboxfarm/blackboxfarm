

# Plan: Replace DexScreener Fetching with Cloudflare KV Worker

## Overview
Replace the complex dual-fetching strategy (boosted + search endpoints) in the Intel XBot scheduler with a single call to your Cloudflare KV worker. This provides better reliability, caching, and bypasses DexScreener's Cloudflare protection.

## Benefits
- **No more 403 blocks** - Your worker handles DexScreener's anti-bot protection
- **Faster & cached** - KV edge-cached globally, sub-50ms responses
- **Simpler code** - Single fetch replaces 80+ lines of dual-fetch logic
- **More reliable** - Your worker can handle retries/fallbacks internally

## Changes Required

### 1. Update `holders-intel-scheduler/index.ts`

Replace the `fetchTrendingTokens()` function (lines 73-157):

**Current:** 85 lines of code with:
- Browser header spoofing
- Two separate DexScreener API calls
- Manual Solana chain filtering
- Deduplication logic
- Error handling for both endpoints

**New:** ~25 lines:
```text
const CLOUDFLARE_WORKER_URL = 'https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana';

async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  console.log('[scheduler] Fetching from Cloudflare KV worker...');
  
  const response = await fetch(CLOUDFLARE_WORKER_URL);
  
  if (!response.ok) {
    console.error('[scheduler] Worker fetch failed:', response.status);
    return [];
  }
  
  const data = await response.json();
  
  if (data.stale) {
    console.warn('[scheduler] Warning: Worker data is stale');
  }
  
  console.log(`[scheduler] Got ${data.countPairsResolved}/${data.countPairsRequested} pairs`);
  
  // Map worker response to our TrendingToken format
  return (data.pairs || [])
    .filter((p: any) => p.ok && p.tokenMint)
    .map((p: any) => ({
      mint: p.tokenMint,
      symbol: p.symbol || 'UNKNOWN',
      name: p.name || 'Unknown Token',
      marketCap: p.fdv || 0,
      priceChange24h: 0, // Not provided by worker
    }))
    .slice(0, 50);
}
```

### 2. Optional: Add Fallback Logic

For extra reliability, keep the original DexScreener fetch as a fallback:

```text
async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  // Try Cloudflare worker first
  try {
    const tokens = await fetchFromCloudflareWorker();
    if (tokens.length > 0) return tokens;
  } catch (err) {
    console.warn('[scheduler] Worker failed, falling back to DexScreener:', err);
  }
  
  // Fallback to direct DexScreener
  return fetchFromDexScreenerDirect();
}
```

## Data Mapping

| Worker Field | Scheduler Field | Notes |
|--------------|-----------------|-------|
| `tokenMint` | `mint` | Direct map |
| `symbol` | `symbol` | Direct map |
| `name` | `name` | Direct map |
| `fdv` | `marketCap` | FDV used as market cap |
| `volume24h` | - | Available for future sorting |
| `liquidityUsd` | - | Available for future filtering |

## Technical Details

- **No secrets required** - Public worker endpoint
- **No new dependencies** - Standard fetch API
- **Backward compatible** - Same output format, rest of scheduler unchanged
- **Logging preserved** - Worker responses include count metadata

## Files to Modify

1. `supabase/functions/holders-intel-scheduler/index.ts` - Replace `fetchTrendingTokens()` function

## Testing

After deployment:
1. Manually trigger scheduler: Call the edge function directly
2. Check logs for "Fetching from Cloudflare KV worker" message
3. Verify tokens are queued in `holders_intel_post_queue` table

