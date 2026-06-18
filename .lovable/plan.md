## Add "Sell Waterfall" (per column) and "Sell Grid" (global) buttons

Adds bulk-sell controls to `WaterfallGrid.tsx`. Both respect SIM mode (route through `simSell`) and live mode (invoke `waterfall-swap` edge function, same as the per-wallet SELL button).

### Behavior

**Sell Waterfall (per column)**
- Button in each column header next to existing `Seed` / `Clear` (label: `Sell W{n}`, rose color).
- Disabled when no `targetMint` is set or no wallet in that column holds the target token.
- Click → `confirm("Sell ALL {target} in every wallet of W{n}? This sells {X} wallets immediately.")`
- On confirm: iterate the 10 wallets in that column; for each wallet that holds `targetMint` with amount > 0:
  - SIM mode → call existing `simSell(w, targetMint)`
  - Live mode → `supabase.functions.invoke("waterfall-swap", { body: { walletId: w.id, mint: targetMint, side: "sell" } })`
- Fire sequentially with a small (~200ms) gap to avoid RPC bursts; track a per-column `sellingCol` busy flag to show spinner and disable the button.
- Toast summary at the end: `Sold X/Y wallets in W{n}` (errors counted, first error message surfaced).

**Sell Grid (global)**
- Button in the top toolbar near `Reset All Grid` (rose color, prominent).
- Disabled when no `targetMint` set or zero wallets hold the target.
- Click → `confirm("SELL GRID: Sell ALL {target} across ALL 100 wallets? This cannot be undone.")`
- On confirm: iterate all 10 columns sequentially, running the same per-wallet sell logic as above. Global `sellingGrid` busy flag disables all sell controls during the run.
- Toast summary: `Grid sell complete: X/Y wallets sold` plus per-column counts in description.

### UI placement

- Column header (in the existing `Seed`/`Clear` row): add `Sell W{n}` button after `Clear`.
- Top toolbar: add `SELL GRID` button to the right of `Reset All Grid` (visible in both live and sim mode).
- Both buttons use the same rose styling as existing per-wallet SELL for visual consistency.

### Technical notes

- New state: `sellingCol: number | null`, `sellingGrid: boolean`.
- New helpers (inside `WaterfallGrid`): `sellColumn(col: number)` and `sellGrid()`. They reuse `balances` (already in state) to discover which wallets hold `targetMint`.
- Sim log entries: emit `WX·RY SIM SELL` lines (already supported by `simSell`); add a final `WX SIM SELL WATERFALL (n wallets)` / `GRID SIM SELL (n wallets)` summary line.
- Live mode: no edge-function changes; reuses existing `waterfall-swap` invocation pattern.
- No DB / schema changes.

### Files

- `src/components/admin/WaterfallGrid.tsx` — only file touched.

### Also fix (drive-by)

Runtime preview shows `ReferenceError: resetSim is not defined` — a stale reference left from the SIM v2 rename. Replace with `resetAllGrid` while in this file.
