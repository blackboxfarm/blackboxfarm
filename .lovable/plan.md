## Problem

Switching away from the Waterfall tab unmounts `WaterfallGrid`, so every piece of in-component state (sim ledger, sim log, per-column mints, buy %, "use same mint" flag, BUY-enabled toggles, target mint) is thrown away. Only `simMode` is persisted today (via `SIM_STORAGE_KEY`). On return, the grid rehydrates from DB balances and seeds a fresh SIM ledger, which looks like a reset.

Separately, the preview itself is reloading mid-test — most likely Vite HMR fired because of unrelated edits in other panels on the same `/super-admin` page (Solscan dashboard refresh, suspended-service toggles seen in the session replay). That can't be fixed in code, but persisting state means a reload no longer wipes progress.

## Changes (frontend only, `src/components/admin/WaterfallGrid.tsx`)

1. **Persist all user-controlled SIM state to `localStorage`** under a single namespaced key `waterfall-grid:v1`:
   - `simState` (the fake SOL + token ledger)
   - `simLog` (last 500 entries — already capped)
   - `targetMint`, `useSameMint`, `perColMints`, `buySizePct`, `buyEnabled`
   - `simFundCol`, `simFundAmount`
2. **Lazy-init each `useState`** from the persisted blob (fall back to current defaults when absent or malformed).
3. **Single debounced `useEffect`** (150 ms) writes the merged blob back to `localStorage` whenever any of those values change. Wrap in `try/catch` so quota errors don't crash the grid.
4. **`Reset All Grid` button** (already present) additionally clears the persisted key so users have a one-click wipe.
5. **No change** to: live DB wallets, balances, edge functions, CASCADE logic, or `simMode` persistence (already working).

## Verification

- Seed 12 SOL on W3, run a partial cascade, switch to another super-admin tab, switch back → grid shows the same SIM ledger, log entries, and toggle states.
- Hard refresh the browser → same persistence holds.
- Click **Reset All Grid** → localStorage key cleared, grid returns to defaults.
