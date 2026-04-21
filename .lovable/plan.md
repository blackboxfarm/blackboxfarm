

# Flow Surgery: Make the FLIP IT Price Path Instant

## What's actually slow (root cause)

Three real bottlenecks were found in `src/components/admin/FlipItDashboard.tsx` + `supabase/functions/helius-fast-price/index.ts`:

1. **500 ms artificial debounce on paste** (line 1384). Even after pasting, the code waits 500 ms before calling Helius. So the absolute minimum is `500 ms + Helius`.
2. **Helius price call is serialized with a DexScreener "validation" call** inside `helius-fast-price` (lines 73–96). Helius alone returns in ~150–400 ms, but the function then does a SECOND fetch to DexScreener (up to 2 s) before responding. So the function itself is 500 ms–2.5 s on every call, even when Helius already returned a perfect price.
3. **FLIP IT button re-fetches the price AGAIN with the same slow function** (line 2049) and shows a `"can take up to 60s"` toast with a **90-second** AbortController. So even after price is already on screen, pressing the button waits another 0.5–2.5 s (sometimes far worse if a fallback chain hits pump.fun + CoinGecko serially).

That's why paste feels sluggish and pressing FLIP IT feels like it locks up.

---

## Fix Plan

### A. Frontend — `src/components/admin/FlipItDashboard.tsx`

1. **Kill the paste debounce** for full-length addresses.
   - When a string is pasted (or typed) and `length === 43` or `length === 44` (valid Solana mint length) → fire `fetchInputTokenData` immediately, no `setTimeout`.
   - Keep a tiny 150 ms debounce only while the user is mid-typing (length < 43).
2. **Cache the just-fetched price for 5 seconds** in a ref. When FLIP IT is clicked and `Date.now() - inputToken.lastFetched < 5000`, **skip the second Helius call entirely** and pass `inputToken.price` straight through to `executeFlip`.
3. **Background-refresh on click** instead of blocking. Fire a non-awaited `helius-fast-price` call in parallel with `flipit-execute` so we record the freshest price for logs without delaying the buy.
4. **Drop the misleading 90 s toast / 90 s AbortController.** Replace with a 4-second hard timeout — if Helius doesn't answer in 4 s we proceed with the cached price (zero-tolerance for fake "loading 60s" UX).
5. **Disable FLIP IT only while `isFlipping`**, not while metadata/blacklist are still loading. Price is the only blocker; everything else is decoration (per your direction).

### B. Edge function — `supabase/functions/helius-fast-price/index.ts`

1. **Remove the inline DexScreener "validation" round trip** (lines 73–96) from the hot path. Return the Helius price the moment it's available.
2. **Move DexScreener cross-check into a fire-and-forget `EdgeRuntime.waitUntil`** that logs deviation but does NOT block the response. (We still get the deviation log for monitoring; the user gets the price in ~200 ms.)
3. **Return as soon as `price_per_token > 0`** — no waiting on `tokenInfo` decoration.
4. **Tighten Helius timeout** from 3 s → 1.5 s. If it doesn't answer in 1.5 s, fall through to pump.fun bonding curve.
5. **Pre-warm SOL price** by reading from the existing `_shared/sol-price-fetcher` cache instead of calling CoinGecko inline (CoinGecko adds ~600–1500 ms when used).

### C. Net latency target

| Step | Before | After |
|---|---|---|
| Paste → price on screen | 500 ms debounce + 500–2500 ms RPC = **1.0–3.0 s** | 0 ms debounce + 200–400 ms RPC = **~250 ms** |
| Click FLIP IT → buy submitted | 500–2500 ms re-fetch + flipit-execute | **0 ms** re-fetch (cached) + flipit-execute |

---

## Files Touched

- `src/components/admin/FlipItDashboard.tsx` (debounce, cache-then-fire, button gating, toast cleanup)
- `supabase/functions/helius-fast-price/index.ts` (drop blocking DexScreener call, tighter timeouts, instant return)

## Out of scope (deliberately)

- Metadata/image/socials/blacklist deep check — left as-is, they continue running in the background as they already do. They never block the FLIP IT button after this change.
- `flipit-execute` itself — already correct from yesterday's fix; not re-touched.

