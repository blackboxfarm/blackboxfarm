## Goal

Refine the existing `⬇ CONSOLIDATE ALL → W1·W1` flow in `src/components/admin/WaterfallGrid.tsx` so it refreshes per waterfall, always reclaims rent, supports a demo dry run, and narrates every step live.

## 1. Refresh one waterfall at a time (replaces the fixed 20-key chunks)

Group by `column_index` instead of slicing a flat list:

```text
W1 → wallets 2-10  (9 keys — W1·Wallet 1 refreshed separately first)
W2 → wallets 1-10  (10 keys)
W3 → wallets 1-10  (10 keys)
...
W10 → wallets 1-10 (10 keys)
```

Each group is one `waterfall-refresh-balances-solscan` call, well inside the edge function wall clock. A failed group is logged by waterfall name (`W4 refresh failed`) and the run continues; the existing "continue anyway?" confirm stays but now names which waterfalls are stale.

## 2. W1 pre-balance check + demo mode

- Keep the live check: `required = needFunding.length × 0.006 SOL`; abort with a clear message if W1·Wallet 1 is short.
- Add a **DEMO / DRY RUN** toggle next to the button. When on:
  - the solvency check is skipped (money is assumed present),
  - no `waterfall-withdraw` or `waterfall-dust-sweep` call is made,
  - the full step log is printed exactly as it would run, with each line prefixed `[DRY]`.

## 3. Token-2022 (already deployed)

`waterfall-withdraw` now resolves the owning token program from the mint account and derives the ATA with the matching program id. No further change; the step log will show the resolved program per transfer failure.

## 4. Dust-sweep close pass — automatic, no prompt

Remove the `confirm()`. After the token phase, run `waterfall-dust-sweep` for every waterfall column (rows 0-9, `dry_run: false`) automatically, then proceed to the SOL sweep so the reclaimed rent is included in the sweep.

## 5. Live step-by-step log

Add a scrolling log panel below the button (also mirrored to console), appended in real time as each step completes:

```text
[00:00] PHASE 1 · Refresh balances
[00:02]   W1 (9 wallets) ......... ok
[00:05]   W2 (10 wallets) ........ ok
...
[00:31] PHASE 2 · Plan — 34 token moves in 12 wallets, 87 SOL sweeps
[00:31]   W1·Wallet 1 has 0.4120 SOL, needs 0.0420 → OK
[00:32] PHASE 3 · Pre-fund 7 wallets × 0.006 SOL
[00:33]   → W3·W4 funded (sig 5xQ…)
[00:41] PHASE 4 · Move tokens
[00:42]   W2·W1 BONK max → W1·W1 ok (sig 2aP…)
[00:44]   W6·W9 PEPE max → W1·W1 FAILED: no token balance
[01:20] PHASE 5 · Dust sweep (rent reclaim), 10 waterfalls
[01:52]   W7 closed 6 accounts, +0.0122 SOL
[02:30] PHASE 6 · Sweep SOL → W1·Wallet 1
[02:31]   W2·W1 0.0119 SOL ok
[03:10] DONE · tokens 33/34 · rent +0.184 SOL · SOL swept 86 · 1 error
```

Each line carries elapsed time, phase, wallet label (`W3·W7`), action, result, and truncated signature. A **Copy log** button so the whole run can be pasted back for review.

## Technical notes

All changes are in `src/components/admin/WaterfallGrid.tsx`: replace the flat chunk loop with a column-grouped loop, add `demoMode` and `consolidateLog` state, thread a `log()` helper through every phase, drop the two `confirm()`s that gate rent reclaim, and render the log panel + Copy button under the consolidate button. No backend change needed.
