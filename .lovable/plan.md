## Goal

Stop the browser from getting killed. Two suspects identified, both addressable in one pass:

1. **Duplicate Supabase auth listeners** — three independent `onAuthStateChange` subscribers (`AuthContext`, `useSecureAuth`, `useUserSecrets`) all churn on every token refresh / tab focus, plus three independent `getSession()` initializers fighting the same lock. This is exactly the kind of fan-out that wedges Chrome's IndexedDB lock and freezes the tab.
2. **Price-fetch error paths still throwing in callers** — last turn fixed `raydium-quote` to return `200 + {fallback:true}`, but `helius-fast-price` and the FlipIt preflight chain still throw on failure inside React effects, which can blow up the page when Solana RPC hiccups.

---

## Part A — Auth listener consolidation (the real browser killer)

**Single source of truth = `AuthContext`.**

1. `src/hooks/useSecureAuth.ts` — remove its own `onAuthStateChange` + `getSession()`. Re-export `useAuth()` data and layer the "secure" behaviors (rate-limit / activity tracking) on top of context state. No second subscription.
2. `src/hooks/useUserSecrets.ts` — drop the `onAuthStateChange` block; instead `const { user } = useAuth()` and key the effect off `user?.id`. One listener total.
3. `src/hooks/usePasswordAuth.ts` — replace the inline `getSession()` call with `useAuth().session` (avoids competing with the AuthContext init for the storage lock on first paint).
4. Audit pass: any other `onAuthStateChange` added later flagged in a code comment at top of `AuthContext.tsx` ("Single auth listener — do not add more").

Expected effect: removes the duplicate IndexedDB/localStorage lock contention on tab focus and token refresh, which is the #1 known cause of the "browser dies" symptom in this project.

## Part B — Harden remaining edge-function fallbacks

Mirror the `raydium-quote` pattern (return 200 + `{ error, fallback: true }`) on the two functions whose 5xx responses currently bubble up into FlipIt and blank the screen:

1. `supabase/functions/helius-fast-price/index.ts` — wrap the upstream Helius / pump.fun curve calls; on any thrown error or null result, return `200 { error: 'PRICE_FETCH_FAILED', fallback: true }` instead of 500.
2. `supabase/functions/token-metadata/index.ts` — same treatment for the metadata lookup so the background fetch in `FlipItDashboard.tsx` (line ~1289) can never throw a 5xx into the React tree.

Client side: add a single guard in `FlipItDashboard.tsx` `fetchInputTokenData` so any `priceData?.fallback === true` path silently moves to the next source instead of toasting.

## Part C — Verify

1. Browser test: load `/admin` → FlipIt, paste a known-good mint, switch tabs for 30s, return. Confirm no freeze, no duplicate `/auth/v1/user` storm in network tab (currently firing ~12x per refresh based on auth logs).
2. Force a price-source failure (bad mint) and confirm UI degrades gracefully with no blank screen.

## Technical notes

- Files touched (Part A): `src/hooks/useSecureAuth.ts`, `src/hooks/useUserSecrets.ts`, `src/hooks/usePasswordAuth.ts`, `src/contexts/AuthContext.tsx` (comment only).
- Files touched (Part B): `supabase/functions/helius-fast-price/index.ts`, `supabase/functions/token-metadata/index.ts`, `src/components/admin/FlipItDashboard.tsx`.
- Zero schema / RLS / DB changes.
- No behavior change to login/logout flows — only the *number of subscribers* changes.

Awaiting **Plan Approved** before touching code.
