## Goal
Add a **Test / Simulation Mode** to the Waterfall Wallet Grid so you can dry-run the whole pipeline (Generate, Buy, Sell, Troll, Cascade, Withdraw) without spending real SOL or hitting Solana mainnet.

## How it would work

**1. UI toggle (top of `WaterfallGrid.tsx`)**
- New prominent switch: `🧪 SIMULATION MODE` (sticky, yellow/orange banner when ON).
- Persisted to `localStorage` (`waterfall_sim_mode`) so it survives reloads.
- When ON, every action button is relabeled (`BUY → SIM BUY`, `TROLL → SIM TROLL`, `CASCADE → SIM CASCADE`) and the grid header shows a "SIMULATION — no real transactions" badge.

**2. Client-side dry-run (no edge function calls)**
The cleanest, safest approach: when sim mode is ON, the grid never calls the edge functions. Instead it runs a local simulator that:
- Uses the existing `buildCascadePlan()` logic (already pure math) to project hop-by-hop SOL flow.
- For BUY: computes `lamports_in × (1 - 0.01 slippage) / dexscreener_price` → fake token amount, writes to a **local** `simBalances` state overlay.
- For SELL: reverse — converts simulated token balance back to SOL at current DexScreener price.
- For TROLL: runs N fake cycles (configurable, default 5), each subtracting ~0.001 SOL "fee" from the wallet's sim balance, appending log lines.
- For CASCADE: animates row-by-row, moving lamports between sim balances using the same plan, with a 400ms delay per hop so you visually see the waterfall.
- For WITHDRAW: zeros out the sim balance to a "destination" line in the log.

**3. Simulation overlay state**
- New `simBalances: Record<walletId, { sol, tokens }>` initialized from real `balances` when sim mode is enabled (snapshot).
- Grid renders `simBalances` instead of `balances` while sim mode is ON, with a `SIM` chip next to each amount.
- "Reset Simulation" button re-snapshots from real balances.

**4. Simulation event log (bottom drawer)**
- New collapsible panel that streams every simulated action with timestamp, e.g.:
  ```
  14:02:11  W3·R1  SIM BUY 0.095 SOL → 1,234,567 PEPE @ $0.0000076
  14:02:11  W3·R1  SIM CASCADE  → forward 0.085 SOL to W3·R2
  ```
- Export log as JSON / copy-to-clipboard for later review.

**5. Edge-function safety net (defense in depth)**
- Add an optional `simulate: true` flag accepted by `waterfall-swap`, `waterfall-troll`, `waterfall-cascade`, `waterfall-withdraw`. If passed, the function short-circuits before any `sendRawTransaction` and returns a fake signature like `SIM_<uuid>` plus the computed plan.
- The client never sends `simulate` in normal mode, but this prevents accidental wiring mistakes from ever spending real SOL during testing.

## Files to touch
- `src/components/admin/WaterfallGrid.tsx` — toggle, sim state, dry-run handlers, sim log panel, button relabeling.
- `src/components/admin/WaterfallWalletDrawer.tsx` — show SIM badge, route Withdraw through sim path when active.
- `supabase/functions/waterfall-swap/index.ts`
- `supabase/functions/waterfall-troll/index.ts`
- `supabase/functions/waterfall-cascade/index.ts`
- `supabase/functions/waterfall-withdraw/index.ts`
  → each: accept `{ simulate?: true }`, return mocked signature without touching the chain.

## Out of scope
- No DB schema changes. Sim state is purely client-side (ephemeral). If you later want persisted sim runs for review, that's a follow-up.
- `Generate Missing` / `Refresh Balances` / `Export Private Keys` stay unchanged — they're read/admin ops, not chain-spending.

## Acceptance
- Flip the toggle → banner appears, all action buttons get `SIM` prefix.
- Click SIM CASCADE on column 1 → log fills with 10 hops, sim balances update visibly row-by-row, **zero edge-function invocations** (verifiable in network tab).
- Flip toggle off → real balances reappear, real buttons restored, sim log cleared.
