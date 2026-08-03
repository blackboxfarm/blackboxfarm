## Goal

Add a **⬆ SPREAD FROM W1·W1** button (reverse of CONSOLIDATE ALL) that sends SOL from Waterfall 1 · Wallet 1 out to any hand-picked set of wallets in the 10×10 grid, with a fuzzy (non-identical) split.

## 1. Button

Placed directly under `⬇ CONSOLIDATE ALL → W1·W1` in `src/components/admin/WaterfallGrid.tsx`. Source wallet is hard-locked to W1·Wallet 1 — it is never a selectable target. Opens the modal; disabled while any other cascade/consolidate/troll job is running.

## 2. Spread modal

New component `src/components/admin/WaterfallSpreadModal.tsx`.

- **Header:** live W1·W1 balance (read from the live balance map, refreshed on open) and an amount field.
  - Amount to spread: defaults to `balance − reserve`, editable.
  - Reserve field (default `0.02 SOL`) kept in W1·W1 for fees.
- **10×10 picker grid** — columns W1…W10, rows Wallet 1…10, matching the main grid layout.
  - Click a cell to toggle selection.
  - Click-and-drag across cells to paint selection (swipe on touch) — pointer events, drag mode = select or deselect based on the first cell touched.
  - Row / column header buttons toggle a whole row or column; **Select all** / **Clear** buttons.
  - W1·W1 shown greyed and unselectable. Each cell shows its current SOL so you can see where money already is.
- **Fuzz slider:** 0–15 %, default 5 %.
- **Live preview list:** each selected wallet with its computed amount, plus totals and min/max so you can see the variance before sending.

## 3. Fuzzy distribution math

```text
base   = amount / n
weights[i] = 1 + (random(-1..1) × fuzz)      // fuzz = 0.05 → ±5 %
amounts[i] = amount × weights[i] / Σweights  // renormalised so the sum is exact
```

Then clamp: each amount ≥ `0.001 SOL` (below that, drop the wallet and re-split), round to 6 decimals, and push any rounding remainder onto the largest amount so the total exactly equals the requested amount. A **Re-roll** button regenerates the random weights.

## 4. Execution

Sequential loop, one `waterfall-withdraw` call per target — the same edge function CONSOLIDATE already uses, no backend change needed:

```ts
body: { walletId: W1W1.id, mint: "SOL", amount: amounts[i], destination: target.pubkey }
```

~250 ms gap between calls to stay under RPC rate limits. Pre-flight solvency check: `amount + reserve + n × 0.000005` must be ≤ live W1·W1 balance, else abort with a clear message.

## 5. Live log + result

Same log panel style as CONSOLIDATE ALL:

```text
[00:00] SPREAD · 42.0000 SOL → 17 wallets · fuzz 5%
[00:01]   W3·W4  2.5514 SOL ok (sig 5xQ…)
[00:02]   W6·W9  2.3902 SOL FAILED: blockhash expired
[00:35] DONE · 16/17 sent · 39.61 SOL out · 1 error
```

Copy-log button, then an automatic balance refresh for W1·W1 and every target. Failures are listed by wallet label and the run continues; nothing is retried automatically.

## Technical notes

- New file: `src/components/admin/WaterfallSpreadModal.tsx` (selection grid, fuzz math, preview).
- Edited: `src/components/admin/WaterfallGrid.tsx` — add `spreadOpen` / `spreading` state, the button, the sequential send loop with log, and pass the live balance map + wallet list into the modal.
- No edge function or database changes.
