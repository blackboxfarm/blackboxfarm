# solscanDiscoverFunders — STOPPED

**Status:** No-op stub. Retired. Callers fall through to Helius / funding-resolver.
**Location:** `supabase/functions/_shared/solscan-intelligence.ts`
**Reason:** Burned Solscan Pro v2.0 credits on `/v2.0/account/transfer` with poor
ROI. All funder discovery now handled by Helius transaction history.

## Current stub

```ts
export async function solscanDiscoverFunders(
  _walletAddress: string,
  _apiErrors: string[] = [],
  _maxPages: number = 2
): Promise<SolscanFunder[]> {
  return [];
}
```

## Callers (all handle empty array)

- `oracle-unified-lookup`
- `mesh-kyc-deep-search`
- `auto-genealogy`
- `solscanFullIntelSweep` (same file)

## Restore path

Legacy body was deleted intentionally. To restore, re-implement using
`solscanFetch` against `/v2.0/account/transfer?activity_type[]=ACTIVITY_SPL_TRANSFER`
with `flow=in` and `token=SOL_NATIVE_MINT`, paginated up to `maxPages`. See
`solscanDiscoverCreatedTokens` in the same file for the current pattern.

## Related sibling also disabled

`solscanScrapeFundingInfoWithFirecrawl` in the same file is a no-op — was
burning Firecrawl credits and triggering `firecrawl_self_throttle` alerts.

## Related also-stopped

- `liquidity-lock-checker` — see `docs/archived-functions/liquidity-lock-checker.md`