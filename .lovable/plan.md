

# Fix FLIP IT: Speed + Price Accuracy + Browser CPU

## Root Causes (found in code, not guessed)

### 1. Paste-to-price is slow because `flipit-preflight` runs 5-10 serial network hops
For any `*pump` mint, paste triggers `flipit-preflight`, which internally runs:
- `detectVenue` → pump.fun HTTP (often 530) → Helius on-chain curve PDA → DexScreener fallback
- `runMeshGuard` → DB lookup
- `getVenueAwareQuote` → ANOTHER venue detect + curve math

That's 3–10 seconds on a flaky pump.fun API day.

### 2. `EXTREME_DEVIATION` blocks are our own fault
- UI "display price" = `flipit-preflight.executablePriceUsd` (probe of **0.01 SOL**)
- Trade guard "executable price" = `validateBuyQuote` → fresh `getVenueAwareQuote` at your **actual** buy size (e.g. 0.5 SOL)

On a volatile curve, these two numbers can legitimately differ 50–90%. The guard treats that as "garbage quote" and blocks the trade. **We're comparing executable against executable and calling the difference a display mismatch.**

### 3. Second preflight on FLIP IT click re-quotes the curve
Even with the 5s cache, the `isCurveToken` branch (added last turn) **always** re-fetches, so every curve buy pays `flipit-preflight` twice — and the second result becomes the "fresh" price sent to `flipit-execute`, which then gets re-compared against a THIRD quote inside trade-guard.

### 4. Browser CPU load
- `FlipItDashboard.tsx` is 6,057 lines, re-renders on every position/interval tick
- 2s interval for limit orders runs even when tab is hidden / no watching orders
- 5s unified monitor always runs
- Two realtime Postgres subscriptions (`flip_positions`, `flip_limit_orders`)
- No `document.visibilitychange` pause

---

## Fix Plan

### A. Make paste-to-price instant (~250ms target)

**File: `src/components/admin/FlipItDashboard.tsx` (around line 1106-1196)**

For `*pump` mints, **stop calling `flipit-preflight` on paste**. Call `helius-fast-price` instead (same as non-pump tokens). It already has a pump.fun bonding-curve fallback built in and returns in 200-400ms. Preflight is for the *execute* phase, not the *display* phase.

Change:
```
const pricePromise = isPumpMint
  ? supabase.functions.invoke('flipit-preflight', { solAmount: 0.01, ... })  // ← SLOW
  : supabase.functions.invoke('helius-fast-price', { tokenMint });
```
To:
```
const pricePromise = supabase.functions.invoke('helius-fast-price', { tokenMint: mint });
// Keep flipit-preflight as STEP 2 fallback only (already in place at line 1204)
```

### B. Fix `EXTREME_DEVIATION` false-positives

**File: `supabase/functions/_shared/trade-guard.ts` (line 697-713)**

The comparison logic is wrong for bonding-curve tokens. When the display price came from a 0.01 SOL probe and execution is e.g. 0.5 SOL, natural price impact on a thin curve can be >90% — that's real, not a quote error.

Fix:
- If `venueUsed === 'pumpfun' || 'bags_fm' || 'bonk_fun'` AND `isOnCurve`, **use `priceImpactPct` (not raw deviation)** as the block signal. Price impact already accounts for size.
- Keep the 500% sanity cap for "truly garbage" quotes, but remove the 90% block for on-curve tokens. The slippage setting (already set per-trade) is the user's chosen protection.
- Adverse deviation on graduated/Jupiter tokens stays at 90%.

### C. Stop re-quoting on FLIP IT click for curve tokens

**File: `src/components/admin/FlipItDashboard.tsx` (lines 2088-2152)**

Drop the `isCurveToken` carve-out that forces a fresh preflight. Use the cached price IF fresh (<5s), pass `isOnCurve: true` + `venueHint: 'pumpfun_curve'` to `flipit-execute`, and let the backend's `validateBuyQuote` be the single source of truth. No double-quote.

### D. Don't send UI display price as "display" when it's an executable quote

**File: `src/components/admin/FlipItDashboard.tsx` (line 2174) and `supabase/functions/flipit-execute/index.ts` (line 897)**

Add a flag `displayPriceIsExecutable: true` in the body when the UI price came from `flipit-preflight` or `helius-fast-price` curve fallback. In `flipit-execute`, when that flag is set, **skip the deviation check entirely** — trade-guard still runs tax check + price-impact check + slippage protection, but does not compare display↔executable.

### E. Browser CPU savers (the "system runs slow with you open" complaint)

**File: `src/components/admin/FlipItDashboard.tsx`**

1. **Pause intervals when tab hidden**: add a `document.visibilitychange` listener; when `document.hidden` is true, `clearInterval` for both the 5s unified monitor AND the 2s limit-order poll. Resume on focus.
2. **Gate the 2s limit-order poll harder**: it already checks `hasWatching`, but re-subscribes on every `limitOrders` array change. Memoize the watching flag so the effect doesn't tear down/rebuild every render.
3. **Drop polling to 10s** when no holdings AND no watching orders (currently it still runs at 5s just to check).
4. **Remove duplicate realtime subscription teardowns**: `flip-limit-orders-realtime` channel has no cleanup-safe unsubscribe for rapid unmount; wrap in `isMountedRef` guard.

Expected impact: ~60% less background JS activity when dashboard is idle, measurable in browser Performance tab.

---

## Latency Target After Fixes

| Step | Before | After |
|---|---|---|
| Paste pump mint → price on screen | 1.5–5s (preflight chain) | **200–400ms** (helius-fast-price) |
| Click FLIP IT (fresh cache) | 0ms + execute | 0ms + execute (unchanged, stays fast) |
| Click FLIP IT (curve token) | preflight + execute + trade-guard re-quote = 3 quotes | 1 quote inside trade-guard |
| Buy blocked by false EXTREME_DEVIATION | Common on volatile pump tokens | Eliminated (price impact check instead) |
| Browser idle CPU | 5s + 2s intervals always on | Paused when hidden, 10s when nothing to watch |

## Files Touched

- `src/components/admin/FlipItDashboard.tsx` — swap paste fetcher, drop curve re-quote, add visibility-aware intervals
- `supabase/functions/_shared/trade-guard.ts` — replace 90% deviation block with price-impact-based check for on-curve tokens
- `supabase/functions/flipit-execute/index.ts` — honor `displayPriceIsExecutable` flag, skip deviation check when set

## Out of Scope

- `flipit-preflight` itself (still used as execute-time backstop and for non-paste flows)
- `helius-fast-price` (already optimized last turn)
- The 6,057-line component split — worth doing later but not this patch

