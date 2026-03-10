

## State-Aware Price Routing for FlipIt

### Problem

`resolvePrice()` runs a **blind sequential cascade** for every token:

1. pump.fun API (~1-3s if timeout)
2. pump.fun on-chain curve (~1-2s if not pump token)
3. Meteora DBC scan (~1-2s, only BAGS suffix)
4. Raydium Launchlab (~1-2s, only BONK suffix)
5. DexScreener (~1s)
6. Jupiter (~1s)

For a **graduated pump.fun token**, steps 1-2 both run and fail before hitting DexScreener at step 5 — wasting 2-4 seconds. For a **non-pump token** (like a Raydium native), it still tries pump.fun first.

Trojan Bot skips all this because it already knows the venue from its signal source.

### Solution

Add a `venueHint` parameter to `resolvePrice()` so callers can skip straight to the right source. The hint comes from:
- **Mint suffix**: `pump` → pump.fun, `BAGS` → bags.fm, `BONK` → bonk.fun
- **Signal metadata**: Telegram signals often include venue/pair info
- **Preflight result**: `flipit-preflight` already runs `detectVenue()` — pass that result through

### Changes

**File: `supabase/functions/_shared/price-resolver.ts`**

1. Add `venueHint` to the options type:
   ```
   venueHint?: 'pumpfun_curve' | 'pumpfun_graduated' | 'bags_fm' | 'bonk_fun' | 'dex' | undefined
   ```

2. Add **auto-detection from mint suffix** at the top of `resolvePrice()` (before any API calls):
   - If `tokenMint.endsWith('pump')` and no hint → set hint to `'pumpfun_curve'`
   - If `tokenMint.endsWith('BAGS')` → set hint to `'bags_fm'`
   - If `tokenMint.endsWith('BONK')` or `tokenMint.endsWith('bonk')` → set hint to `'bonk_fun'`

3. Use the hint to **skip irrelevant steps**:
   - `pumpfun_curve` → try pump.fun API only, skip bags/bonk/dex
   - `pumpfun_graduated` → skip pump.fun entirely, go straight to DexScreener
   - `bags_fm` → skip pump.fun, go straight to Meteora DBC
   - `bonk_fun` → skip pump.fun, go straight to Raydium Launchlab
   - `dex` → skip all bonding curve checks, go straight to DexScreener → Jupiter
   - `undefined` → current sequential behavior (backward compatible)

4. Add a **parallel fast-path** for graduated tokens: run DexScreener and Jupiter simultaneously via `Promise.race`, use whichever responds first.

**File: `supabase/functions/flipit-execute/index.ts`**

5. In `fetchTokenPrice()`, derive `venueHint` from the token mint suffix and pass it to `resolvePrice()`.

6. If the caller provides `isOnCurve` from preflight data, use it: `isOnCurve === false` → hint = `'dex'` or `'pumpfun_graduated'`.

**File: `supabase/functions/_shared/venue-aware-quote.ts`**

7. In `getVenueAwareQuote()`, the venue is already detected — pass it as `venueHint` to any internal `resolvePrice()` calls to avoid double-detection.

### Expected Impact

| Scenario | Before | After |
|---|---|---|
| Graduated pump token | ~3-4s (pump fail → curve fail → DexScreener) | ~1s (skip to DexScreener) |
| On-curve pump token | ~1-2s (pump API hit) | ~1-2s (no change, already fast) |
| Non-pump token (Raydium/Jupiter) | ~3-5s (pump fail → curve fail → bags fail → DexScreener) | ~1s (skip to DexScreener) |
| bags.fm token | ~4-5s (pump fail → curve fail → Meteora) | ~1-2s (skip to Meteora) |

### Backward Compatibility

All changes are additive. `venueHint` is optional and defaults to `undefined`, preserving current behavior for any caller that doesn't pass it.

