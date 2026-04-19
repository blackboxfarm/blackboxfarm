

User is asking whether the elevated graduation-fee settings I proposed are configured per-position (in the GRAD popover on each token row) or globally from the main Flipit settings row at the top of the dashboard.

Answer: in my proposed plan they live **per-position inside the GRAD popover** — same place as trigger %, max capture %, trail drop, etc. That keeps each position self-contained and lets you tune fees by token (a low-mcap grad with heavy MEV competition might warrant a 0.005 SOL tip, while a quieter one is fine at 0.001).

But there's a fair argument for a **global default** too — you don't want to set turbo fees on every new position manually. So the cleanest pattern is **both**:

## Plan (refined)

### Where the settings live

**Global defaults** — `flipit_settings` table (one new row group):
- `graduation_sell_priority_fee_mode_default` ('turbo')
- `graduation_sell_priority_fee_micro_lamports_default` (null = preset)
- `graduation_sell_jito_tip_lamports_default` (1,000,000 = 0.001 SOL)

Set once in the **Flipit Settings panel** at the top of `/super-admin` Flipit dashboard. Applied automatically to every new position when graduation sell is enabled.

**Per-position overrides** — `flip_positions` columns (from previous plan):
- `graduation_sell_priority_fee_mode` (nullable — falls back to global)
- `graduation_sell_priority_fee_micro_lamports` (nullable)
- `graduation_sell_jito_tip_lamports` (nullable)

Edited in the **GRAD popover** on each row. Empty = use global default.

### Resolution logic in `graduation-sell-evaluator.ts`
```
const feeMode = pos.graduation_sell_priority_fee_mode ?? settings.graduation_sell_priority_fee_mode_default ?? 'turbo';
const jitoTip  = pos.graduation_sell_jito_tip_lamports ?? settings.graduation_sell_jito_tip_lamports_default ?? 1_000_000;
```

### UI changes
1. **`FlipItSettingsPanel`** (or wherever global Flipit settings live) — new "Graduation Sell Defaults" subsection with the 3 fields.
2. **`GraduationSellControl.tsx`** popover — new "Execution Speed" section with:
   - "Use global defaults" toggle (default ON)
   - When toggled OFF → show priority fee preset + Jito tip inputs
   - Inline display of the resolved values either way: "Will use: Turbo + 0.001 SOL Jito tip (~$0.34)"

### Files
- 1 migration: 3 columns on `flipit_settings` + 3 nullable columns on `flip_positions`
- `_shared/graduation-sell-evaluator.ts` — read settings, resolve fees, pass to `flipit-execute`
- `flipit-execute/index.ts` — accept per-call fee overrides
- `GraduationSellControl.tsx` — execution speed UI
- `FlipItSettingsPanel.tsx` (or equivalent) — global defaults UI

Backwards compatible. Defaults fire automatically on new positions; you can override per-token when you want to tune.

