---
name: Blackbox-tick 24h change formatting
description: Cap fmtChange in blackbox-tick to switch to "Nx 24h" above ±1000% and always label timeframe
type: constraint
---
In supabase/functions/blackbox-tick/index.ts the `fmtChange` helper renders the
MC delta next to the market cap line. For runaway tokens (e.g. mcap 32k → 88M
inside 4h) the raw `price_change_24h_pct` can come back as 500,000%+ which
reads as a bug to users. fmtChange MUST:

- Always append a "24h" label so the value can't be mistaken for a lifetime move.
- For |pct| >= 1000, render as a multiplier `(+27.6x 24h)` using `1 + pct/100`,
  not the raw percent.
- Otherwise render `(+12.3% 24h)` / `(-4% 24h)` with 1 decimal under 10%.

Do not strip the label or revert to bare percent rendering — those huge percent
strings keep getting flagged as miscalculations.
