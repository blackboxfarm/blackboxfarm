## Why 3 wallets didn't sell

Each sell needs ~0.0008–0.0012 SOL for fees + ATA rent. Wallets showing `0.0000 SOL` (or only dust) can't pay the swap fee, so `raydium-swap` rejects them. That's why W1 reported `7/10` — 3 wallets were too dry to sell.

## Plan

Add two new one-click consolidation actions on each column header, plus a global "Consolidate Grid" button. No edge function changes — both reuse the existing `waterfall-withdraw` function (already handles SOL sweep with `amount: -1` and SPL transfers with explicit amounts).

### 1. "Consolidate W{n} → Wallet 1" button (per column)

Added next to `Sell ALL W{n}` in each column header. When clicked:

1. For each wallet 2..10 in that column with `yns` balance > 0:
   - Call `waterfall-withdraw` with `mint: <yns_mint>, amount: <full_token_balance>, destination: <wallet1_pubkey>`
   - 250ms gap between calls
2. Then for each wallet 2..10 with SOL > 0.000015:
   - Call `waterfall-withdraw` with `mint: "SOL", amount: -1, destination: <wallet1_pubkey>`
   - 250ms gap
3. Toast progress + final summary

Result: Wallet 1 of that column ends up holding ALL yns tokens AND all SOL from the column — guaranteed enough SOL to cover the sell fee.

### 2. "Sell W{n} Wallet 1" follow-up

After consolidation, the existing per-token red "Sell" button on Wallet 1's yns row already does the right thing — one swap, one fee, all tokens gone. No new button needed; the toast after consolidation will tell you "Now click Sell on Wallet 1".

Optional convenience: a `Consolidate + Sell W{n}` combo button that chains both automatically (250ms gap after the last withdraw confirms, then fires the sell).

### 3. Global "Sweep ALL SOL → Wallet 1 of W1" (toolbar)

Replaces / augments the existing `SWEEP SOL` button behavior: instead of prompting for an external address, defaults the destination to `Waterfall 1 · Wallet 1`'s pubkey. Iterates over every wallet in the grid except W1·Wallet1 with SOL > 0.000015 and sweeps. Existing external-address mode kept as a secondary option (small dropdown).

### Files touched

- `src/components/admin/WaterfallGrid.tsx` — new `consolidateColumn(col)` callback, `consolidateAndSellColumn(col)`, header buttons, optional global sweep-to-W1-W1 button. All use existing `supabase.functions.invoke("waterfall-withdraw", ...)` calls.

No edge function changes. No DB migrations.
