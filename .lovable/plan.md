
The user wants to track LP dissolution events as new "Reclaimed" flip positions. Key insight: no PnL math against original buy — treat the LP collapse moment as a synthetic buy at the prevailing price for the returned token amount.

Let me design this minimally and cleanly.

## Plan: LP Reclaimed Position Tracking

### Concept
When a Meteora LP is dissolved, the wallet receives back tokens (e.g. 3M xoin.ai + some SOL). We create a synthetic `flip_positions` row:
- `quantity_tokens` = exact returned amount from the LP withdrawal tx
- `buy_price_usd` = token price at the timestamp of the LP withdrawal
- `buy_amount_usd` = quantity × price (synthetic cost basis = current value at reclaim moment)
- `created_at` = LP withdrawal tx timestamp
- New flag `position_source = 'lp_reclaimed'` so the system never tries to reconcile against a real buy tx
- `entry_verified = true` (on-chain sourced)
- SOL portion is NOT a position — it just sits in the wallet balance

### Schema change
Add to `flip_positions`:
- `position_source TEXT DEFAULT 'buy'` — values: `'buy' | 'lp_reclaimed' | 'manual'`
- `lp_pool_address TEXT NULL` — the Meteora pool the tokens came from
- `lp_withdrawal_signature TEXT NULL` — the dissolution tx signature (also serves as dedup key)
- Unique index on `lp_withdrawal_signature` where not null (prevents double-import)

### New edge function: `flipit-lp-reclaim`
Two modes:
1. **Manual** (admin clicks "Import as Reclaimed Position" on a pool row in Meteora Pools view): admin pastes/selects the withdrawal tx signature, function fetches it via Helius, identifies the SPL token transfer back to the FlipIt wallet, gets the token price at that timestamp via DexScreener/Jupiter, creates the position.
2. **Auto-detect** (button "Scan for LP Withdrawals"): scans recent FlipIt wallet txs that touch known Meteora pool addresses, finds dissolution events, prompts admin to confirm-and-import each one.

Both use `assertInsert` (per zero-tolerance silent-fails rule).

### UI changes — `FlipItDashboard.tsx`
- Position row gets a small badge "LP RECLAIMED" when `position_source = 'lp_reclaimed'`
- "Invested" label changes to "Reclaimed Value" for these rows
- PnL still calculates as `currentValue − buy_amount_usd` (so it shows drift since reclaim moment, which is desired behavior — user said "held or displayed as appropriate going forward")
- The Meteora Pools panel gets a new "Import LP Withdrawal" button per pool

### Files touched
- Migration: add 3 columns + unique index to `flip_positions`
- New: `supabase/functions/flipit-lp-reclaim/index.ts`
- Edit: `src/components/admin/FlipItDashboard.tsx` (badge + label)
- Edit: Meteora Pools UI section (add import button + signature input modal)

### What's NOT included (confirm if needed)
- Tracking the SOL side of the LP return as a separate "position" — per spec, SOL just lands in wallet balance
- Computing impermanent loss vs original LP deposit — explicitly out of scope per user ("no relative PnL")
- Auto-detecting LP withdrawals on a cron — manual import only for v1

Sound right? Send **"Plan Approved"** to build it.
