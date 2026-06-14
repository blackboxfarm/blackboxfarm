## Dynamic Even-Split Cascade (with jitter)

Replace the fixed `0.75–0.95 SOL` leave-behind with a **per-column dynamic target** derived from W1's balance, so 6 SOL spreads as ~0.6 SOL/wallet and 17 SOL spreads as ~1.7 SOL/wallet — with a little randomness so it's not a perfectly equal split.

### Math

On CASCADE click for a column:

1. Read W1 balance `B` (SOL).
2. `target = B / 10` — the ideal even share per wallet.
3. For each of W1..W9, roll `leaveBehind = target * (1 + jitter)` where `jitter` is uniform in `[-0.15, +0.15]` (±15%).
4. W10 just receives whatever's left (terminal, no forward).
5. Walk the projection forward (`forward[N] = incoming[N] − leaveBehind[N] − feeBuffer`) exactly like today.
6. After rolling all 9, the natural variance means W10's landed amount will also sit near `target` ± a few percent. No normalization needed — randomness is the point.

### Examples

```text
B = 6 SOL    → target 0.60 → each wallet lands ~0.51–0.69 SOL
B = 11 SOL   → target 1.10 → each wallet lands ~0.94–1.27 SOL
B = 17 SOL   → target 1.70 → each wallet lands ~1.45–1.96 SOL
B = 20 SOL   → target 2.00 → each wallet lands ~1.70–2.30 SOL
```

### Minimum guard

- If `target < 0.05 SOL` (i.e. W1 has < 0.5 SOL), CASCADE is disabled with tooltip "need ≥ 0.5 SOL in Wallet 1".
- If any projected `forward[N] < 0.005 SOL` after the roll, that row renders `INSUFFICIENT` in red and EXECUTE is blocked for that column (extremely unlikely once the dynamic target is in place, but kept as a safety net).

### Technical changes

- **`src/components/admin/WaterfallGrid.tsx`** — `buildCascadePlan(w1BalanceLamports)`:
  - Compute `targetLamports = floor(w1BalanceLamports / 10)`.
  - For rows 0..8: `leaveBehindLamports = floor(targetLamports * (1 + (Math.random() * 0.30 - 0.15)))`.
  - Remove the hard-coded `0.75–0.95` range and the `< 0.80 SOL` button gate; replace with `targetLamports >= 0.05 SOL` gate.
  - Projection chips and EXECUTE flow unchanged.

- **`supabase/functions/waterfall-cascade/index.ts`** — relax the server-side validation:
  - When a `plan` is supplied, validate `leaveBehindLamports` is within `[0.01, 5.00] SOL` (wide guardrail just to catch obvious bugs) instead of the current `[0.70, 1.00]` window.
  - Server-side fallback path (no plan supplied) is rarely used now, but keep it working — change `randLeaveBehindLamports()` to accept the wallet's current balance and roll `balance/10 × jitter` the same way, so direct API callers get the same behavior.

- **`.lovable/plan.md`** — update the spec to describe the dynamic target instead of the fixed range.

### Out of scope

- TROLL button, troll cycle, transfer logic, W10 terminal behavior — unchanged.
- No DB migration needed (the `plan jsonb` column already stores whatever leave-behind values we send).
