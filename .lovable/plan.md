## SIM Mode v2 — Funding Controls & Reset

Refines the existing client-side Simulation Mode in `WaterfallGrid.tsx`. No edge function or DB changes.

### What changes

**1. Default seed funding**
- When SIM mode is toggled ON (or "Reset Sim" is clicked), Wallet 1 (R1) of each waterfall column is seeded with **12 SOL** of fake funds. All other rows start at 0 SOL / 0 tokens.
- Live SOL/USD price (from existing `useSolPrice` hook) drives every USD figure in the sim log and cell overlays — no hardcoded price.

**2. Manual funding control (toolbar)**
A new compact funding bar sits in the SIM banner:

```text
[ Waterfall ▼ ]  [ Amount: 10 ] SOL  → Wallet 1   [ + Add ]
```

- `Waterfall` dropdown: lists every column (Waterfall 1, Waterfall 2, …) plus an **"All waterfalls"** option.
- `Amount` numeric input (default 10, min 0.001, step 0.1).
- Target is fixed to **Wallet 1 (R1)** of the chosen column — matches how real funding always lands on R1 before cascading.
- `Add` button credits the sim balance and writes a log line: `14:22:05  W2·R1  SIM FUND +10 SOL  ($1,847.20)`.

**3. Reset controls**

Three scopes, all sim-only:

- **Per-column "Clear"** — small button at the top of each waterfall column. Zeroes all 100 wallets in that column (SOL + tokens) and logs `W2  SIM CLEAR  (100 wallets zeroed)`.
- **Per-column "Seed 12"** — re-seeds just that column's R1 with 12 SOL (handy after a clear).
- **"Reset All Grid"** — wipes every column back to the default seed state (R1 = 12 SOL, rest = 0) and clears the sim log. Replaces the current "Reset Sim" button.

All three only act on `simState` — real on-chain balances are never touched.

### Acceptance
- Toggle SIM ON → every column's R1 shows `12.0000 SOL` with SIM badge; USD value reflects live `useSolPrice`.
- Pick "Waterfall 3", amount 5, click Add → W3·R1 jumps to 17 SOL, log entry appears with live USD conversion.
- Pick "All waterfalls", amount 2, Add → every column's R1 gains +2 SOL in one log batch.
- Click a column's `Clear` → that column's 100 cells go to 0, others untouched.
- Click `Reset All Grid` → all columns return to 12 SOL on R1, log cleared.
- Real balances and edge functions remain completely untouched (verify via network tab: zero `waterfall-*` invocations during any SIM action).

### Files
- `src/components/admin/WaterfallGrid.tsx` — only file edited. Adds funding toolbar, per-column Clear/Seed buttons, Reset-All behavior change, default 12 SOL seed on enable/reset, and USD formatting via `useSolPrice`.

### Out of scope
- No changes to `WaterfallWalletDrawer.tsx`, edge functions, or DB.
- No per-row manual funding (R1 only — matches real cascade entry point).
- No persisted sim history.
