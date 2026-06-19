## Problem

The Sell buttons (per-wallet SELL, bulk "Sell W1", "SELL GRID") are gated on the column's **configured target mint**:

- Per-wallet `SELL` is `disabled` unless `targetHeld` (a token matching the column's `targetMint`) exists in that wallet.
- "Sell W1" is `disabled` unless `colMint` is set for the column.

W1 currently holds `JBXS…pump` (yns), but if the W1 target-mint slot isn't set to that exact mint, every Sell control stays greyed out — even though the tokens are clearly visible on-chain. That's why you can't sell yns.

On top of that, `waterfall-swap` defaults `priorityFeeMode` to `"medium"`, and there's no one-click way to sweep all remaining SOL from every wallet back to a main wallet.

## Plan

### 1. Sell ANY held token, not just the configured target mint

In `src/components/admin/WaterfallGrid.tsx`, inside each wallet card's token list:

- Render a tiny red `Sell` button next to every token row that has `amount > 0` (right beside the existing "Tokens: $X.XX" / per-token line).
- Clicking it calls the existing `waterfall-swap` edge function with that token's mint and `side: "sell"` (100% of holdings) — same path the current per-wallet SELL uses, just with the row's mint instead of `targetMint`.
- Confirm dialog shows the mint + amount before executing.

This unblocks selling yns in W1 immediately without touching the column target mint.

### 2. "Sell ALL Holdings" — per wallet and per column

- Add a small `Sell All` button on each wallet card (next to the existing SELL/BUY pair) that iterates over every non-SOL token in `balances[w.pubkey].tokens` and calls `waterfall-swap` sequentially (200ms gap between calls). Confirms once up front with the full list.
- Add a `Sell ALL W{n}` button in each column header next to the existing `Sell W{n}` — same behavior across every wallet in that column.

### 3. One-click "Sweep SOL → Main Wallet"

- Add a `Sweep SOL` button in the top toolbar (near the existing SELL GRID / BUY GRID buttons).
- Prompts once for the destination address (remembers it in `localStorage` for next time).
- Iterates over every wallet with SOL > 0.000015 (dust threshold = rent + fee) and calls the existing `waterfall-withdraw` edge function with `mint: "SOL", amount: -1` (the existing "sweep" sentinel that already drains all SOL minus the 5000-lamport fee).
- Sequential with a 200ms gap, progress toast, summary at the end.

### 4. Reduce fees to the minimum

- In `src/components/admin/WaterfallGrid.tsx`, change every `waterfall-swap` invocation body to pass `priorityFeeMode: "low"` (currently inherits the function's `"medium"` default).
- In `supabase/functions/waterfall-swap/index.ts`, change the default fallback from `"medium"` to `"low"` so any other caller also benefits.
- `waterfall-withdraw` already uses the minimum 5000-lamport base fee with no priority fee — no change needed there.

Slippage stays at the existing 1500 bps (15%) default — already loose enough for tail liquidity on pump.fun graduates; tightening it would just cause more rejected sells, which is the opposite of what you want right now.

### Files touched

- `src/components/admin/WaterfallGrid.tsx` — per-token Sell button, Sell-All-Holdings per wallet + per column, Sweep SOL toolbar button, switch swap calls to `priorityFeeMode: "low"`.
- `supabase/functions/waterfall-swap/index.ts` — default `priorityFeeMode` → `"low"`.

No DB migrations, no new edge functions — reuses `waterfall-swap` and `waterfall-withdraw` exactly as they exist.
