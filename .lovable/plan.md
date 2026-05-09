# FlipIt: Return-on-Submit Buy Path

Goal: make manual buys feel sub-second like Trojan, by responding the moment the tx is submitted to Solana, then finishing confirmation + accounting in the background.

## What the user sees

1. Click FLIP IT
2. Within ~1.5 s: toast "Buy submitted — sig: 5xK…", row appears in Active Flips with status `pending`, signature link to Solscan
3. Background: row auto-updates to `confirmed` (with real token quantity) or `failed` (with retry/error) within 2–8 s

## Files to change

### 1. `supabase/functions/raydium-swap/index.ts`
- Add `fastReturn?: boolean` flag in request body (default false, opt-in for buys only)
- Add `positionId?: string` in request body so background task can update the row
- For Jupiter V0 path (the main buy path) wrap the confirm+retry block in `EdgeRuntime.waitUntil(...)`:
  - Return `{ signatures: [sig], status: 'submitted', venue: 'jupiter' }` immediately after `sendTransaction` resolves
  - Background task runs `hardConfirmTransaction` + retries + writes outcome to `flip_positions` (`status`, `error_code`, `confirmed_at`)
- Pump.fun, Meteora, Bags.fm, Legacy paths: leave synchronous for now (smaller traffic, higher complexity). Out of scope.

### 2. `supabase/functions/flipit-execute/index.ts`
- Pass `fastReturn: true` and `positionId: position.id` to raydium-swap on the buy path only (sells still wait — user needs to know proceeds)
- When `swapResult.status === 'submitted'`:
  - Skip Helius Parse Transaction (the 500–2000 ms accounting step)
  - Set position to `status: 'pending'`, store signature, return success to frontend
  - Schedule a follow-up via `EdgeRuntime.waitUntil` that calls Helius Parse 4 s later to back-fill exact `quantity_tokens` / `quantity_tokens_raw` / `entry_price`
- Keep the synchronous confirmation as a fallback when `fastReturn` is false (auto-rebuy, deep-order monitor) so those paths are unchanged

### 3. `src/components/admin/FlipItDashboard.tsx`
- Toast text: "Buy submitted ✓" with Solscan signature link instead of "Buy filled"
- Active Flips row already realtime-subscribes to `flip_positions` so it'll auto-update when the background task writes `confirmed`/`failed` — no polling code needed

## Technical notes

- `EdgeRuntime.waitUntil(promise)` is the Supabase/Deno-deploy primitive that lets an edge function return a response while the promise keeps running. Already used elsewhere in the project.
- The position row gets `status` enum: `pending` (submitted, not confirmed) → `confirmed` | `failed`. Need a tiny migration to add `pending` if it isn't already a valid value.
- Idempotency: background task only updates the row if it's still `pending` (avoids overwriting a manual sell that came in between).
- Failure UX: if confirmation fails, the row flips to `failed` with `error_code` populated and the existing toast/notification system surfaces it.

## Out of scope

- Pump.fun / Meteora / Bags.fm fast path (do later if Jupiter wins prove the pattern)
- Sell side (intentionally kept synchronous)
- Pre-warming the RPC connection (separate optimization)
- Parallelizing venue hint + blockhash + priority fee (separate optimization, also worthwhile)

## Expected impact

- Click → toast: **6–15 s → 0.8–1.8 s** for Jupiter buys (the common case for graduated tokens)
- Confirmation reliability: identical (same `hardConfirmTransaction` + retries, just running in background)
- Risk: a pending row could linger if the edge worker dies mid-confirmation. Mitigation: a 60 s sweeper (existing `flipit-deep-order-monitor` already runs frequently) can mark rows stuck on `pending` >60 s as `failed` and re-query the chain.
