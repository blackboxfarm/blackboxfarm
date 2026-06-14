## What this does

Adds a **CASCADE** button next to TROLL on Wallet 1 of each column. One click runs the full waterfall through that column's 10 wallets.

### Per-hop logic (wallets 1→9)

For each wallet N in order (1, 2, 3, 4, 5, 6, 7, 8, 9):

1. Run TROLL on wallet N — keep retrying any failed buy/sell until **10 successful buy+sell cycles** have completed (since these are ~$0.02 trades, failures should be rare and recoverable).
2. Pick a random "leave-behind" amount between **0.75 and 0.95 SOL** (uniform random, 6-decimal precision).
3. Transfer `(current_balance − leave_behind − fee_buffer)` SOL from wallet N to wallet N+1.
4. Wait for confirmation, then move to wallet N+1.

### Wallet 10 (terminal)

- Run TROLL (10 successful cycles, with retries).
- Stop. Leave whatever SOL remains in wallet 10. No further forwarding.

### Failure behavior

- TROLL buy/sell failures: retry the individual cycle until 10 successes accumulate. Cap retries per cycle at ~20 attempts to avoid infinite loops if the wallet truly runs out of SOL.
- SOL transfer failure between wallets: halt cascade, return error showing which hop failed and current balances. Funds stay where they are — you can resume manually.
- Insufficient SOL to leave 0.75–0.95 behind: halt with clear error ("wallet N only has X SOL, can't leave 0.75 behind and forward anything").

### UI

- **CASCADE** button (purple, lightning-bolt icon) added beside the TROLL button on the Wallet 1 row of each of the 10 columns.
- Click → confirm dialog showing the column number and total estimated time (~25 minutes for 10 wallets × ~2.5min TROLL each).
- Live status badge under the button showing current step: `Cascading: W3 trolling 7/10` or `Cascading: W5 → W6 transfer`.
- Toast notifications on each wallet completion and on final completion / failure.
- Button disabled during a run; other column cascades can run in parallel.

### Technical details

**New edge function:** `supabase/functions/waterfall-cascade/index.ts`

- Input: `{ columnIndex: number }` (0–9). Server fetches all 10 wallets for that column, ordered by row.
- Super-admin auth check (same pattern as `waterfall-troll`).
- Reuses the existing TROLL swap logic — refactor the cycle loop from `waterfall-troll/index.ts` into a shared helper `_shared/troll-cycle.ts` that exports `runTrollCycles(connection, kp, { cycles: 10, maxRetriesPerCycle: 20 })` returning success count and SOL spent. Both `waterfall-troll` and `waterfall-cascade` import it.
- Per hop: call the shared troll helper, then build a `SystemProgram.transfer` for `balance − leaveBehindLamports − 10_000` (fee buffer), sign with the wallet keypair (decrypted via `decryptWalletSecretAuto`), confirm, then proceed.
- Streams progress via Supabase Realtime broadcast on channel `waterfall-cascade-{columnIndex}` so the UI can render live step text without polling.
- Long-running (~25 min). Edge functions support up to 400s default — we'll need to either:
  - (a) run as a background task using `EdgeRuntime.waitUntil()` and persist progress to a new `waterfall_cascade_runs` table that the UI subscribes to, OR
  - (b) chain per-wallet invocations: the function does ONE wallet's troll+transfer then enqueues itself for wallet N+1 via a second `functions.invoke` call.
  - **Recommendation: (a)** — single function call, background task, status row in DB, realtime updates to UI. Cleaner state, easier to resume/inspect.

**New table:** `waterfall_cascade_runs`
- `column_index` (0–9), `status` (running/completed/failed), `current_wallet_row`, `current_step` (text), `started_at`, `completed_at`, `error`, `hop_log` (jsonb array of {row, leftBehind, forwarded, trollCycles, durationMs}).
- RLS: super-admin only, same pattern as `waterfall_wallets`.

**Edited files:**
- `src/components/admin/WaterfallGrid.tsx` — add CASCADE button to wallet 1 of each column, realtime subscription to `waterfall_cascade_runs` for live status.
- `supabase/functions/waterfall-troll/index.ts` — refactor to use shared helper.

### Time / cost estimate (per column, your $68/SOL math)

- TROLL × 10 wallets = ~25 min total (each TROLL is ~2.5min: 10 cycles × ~7s + retries).
- 9 SOL transfers ≈ 9 × $0.0007 ≈ negligible.
- TROLL fees: ~$0.10–$0.25 per wallet × 10 = **~$1–$2.50 in fees per full column cascade**.
- Starting with 11 SOL in wallet 1: after 9 hops leaving 0.85 SOL avg behind, wallet 10 receives roughly `11 − 9×0.85 − fees ≈ 3.3 SOL`.
