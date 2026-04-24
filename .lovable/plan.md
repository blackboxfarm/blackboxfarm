## Plan

Fix FlipIt so live prices use the normal trusted source path for graduated tokens and stop showing stale Jupiter-only values for tokens like FAITH.

### What will be changed

1. Update the shared price resolver in `supabase/functions/_shared/price-resolver.ts`
   - Change graduated-token selection so it does not blindly prefer Jupiter.
   - Prefer DexScreener when it has a valid best-liquidity pair.
   - Use Jupiter only as a fallback when DexScreener has no usable price.
   - Keep curve pricing unchanged for true on-curve tokens.

2. Align `flipit-unified-monitor` with the shared resolver
   - Remove the inline `fetchTokenPricesAndMarketData` pricing path as the source of truth.
   - Reuse `resolvePricesBulk(...)` so the dashboard poller and execution monitor share the same live price logic.
   - Preserve DexScreener market-data sidecar fields (`priceChange`, `volume`) for UI indicators.

3. Return and persist source transparency
   - Include resolver metadata where useful for logging/debugging.
   - Ensure `price_source`, `is_on_curve`, `bonding_curve_progress`, and `price_fetched_at` remain consistent with the actual source used.

4. Verify the fix against the active failure case
   - Re-check `6PtXEZH9Yb9FroSTtPs5sypMrTJiKs9iXBCmhyvqbrrr` and confirm the unified monitor and price monitor report the same corrected live price.
   - Confirm the dashboard’s `currentPrices` feed now matches the corrected backend response.

### Expected result

- Graduated tokens will stop inheriting stale Jupiter route prices when DexScreener has the proper market price.
- Unified polling and manual price checks will agree.
- Pump.fun curve tokens will still use the deterministic curve path.

### Technical details

- Root issue found: `pickPreferredGraduatedPrice(...)` currently returns Jupiter first, even though DexScreener is already selecting the highest-liquidity pair.
- Secondary issue: `flipit-unified-monitor` still uses a separate inline fetcher instead of the shared resolver, so pricing behavior is inconsistent.
- Implementation will centralize both flows on:

```text
on-curve token      -> curve math / on-chain path
graduated token     -> DexScreener best-liquidity pair
if Dex unavailable  -> Jupiter fallback
```
