

# Three-Part Build: Hypothetical PnL + Per-Row Mesh Controls + Mesh Verdict Editor

## Part 1 — "$10 Per Call" Hypothetical PnL Simulator

A new collapsible section at the top of the **Insiders Lifecycle** tab.

### What the numbers show right now (live preview from your DB)

| Metric | Value |
|---|---|
| Tokens with usable entry+peak data | **191** of 636 |
| Total spent ($10 each, ATH-sell strategy) | **$1,910** |
| Total returned at peak MC | **$13,648** |
| **Net PnL** | **+$11,738 (+614%)** |
| Best winner contribution | $MAGA at 131x = ~$1,310 from $10 |
| Tokens with no entry MC (excluded) | 57 |
| Tokens that would lose ($10 → less) | counted as full $10 loss if peak < entry |

### UI: "Hypothetical $10 Per Call" card

- **Bet size input** (default $10, slider 1–1000)
- **Sell strategy dropdown:** Sell at peak ATH (default) | Sell at 2x | Sell at 5x or peak | Hold to current MC
- **4 KPI tiles:** Total Spent · Total Returned · Net PnL ($) · ROI (%)
- **Cumulative chart** (Recharts AreaChart, dual line):
  - X-axis: time (daily buckets of `first_called_at`)
  - Line A (red, area): cumulative spent
  - Line B (green, area): cumulative returned at sell strategy
  - Tooltip: # tokens that day, day's PnL, running PnL
- **Bar chart:** Daily PnL per day (green bars = profit days, red = loss days)
- **Top 10 winners table:** symbol, entry MC, peak MC, multiplier, $ profit
- **Worst 10 duds table:** same columns
- **"Tokens excluded from PnL"** badge with hover-card listing why (no entry MC, no peak data)
- **Export PnL CSV** button (per-token: bet, return, profit, sell trigger)

All math is computed client-side from rows already loaded — no new edge function, no new table, instant.

## Part 2 — Per-Row "Promote / Reject / Reconsider" Buttons

Added to the **Actions** column in the lifecycle table (super-admin only).

| Button | Shown when | Action |
|---|---|---|
| **Promote** | `mesh_promotion_status` is `not_eligible` or `pending` | Calls `insiders-mesh-promoter` with `{ token_mint }` to evaluate just this token |
| **Reconsider** | `mesh_promotion_status` is `rejected_rug` or already `promoted` | Re-runs evaluation with current data; can flip the verdict |
| **Reject** | `mesh_promotion_status` is `promoted` | Marks token as manually rejected, removes its `good_actor_creator` row from `reputation_mesh` |
| **Override → Promote** | `mesh_promotion_status` is `rejected_rug` | Force-promote with mandatory reason (admin override, written into `mesh_decision_trace.manual_override`) |

All four wired to a single new edge function: **`insiders-mesh-row-action`**:
- Verifies `is_super_admin`
- Accepts `{ token_mint, action: 'promote'|'reconsider'|'reject'|'override_promote', reason? }`
- Writes back: `mesh_promotion_status`, `mesh_promotion_reason`, `mesh_decision_trace` (with `manual_action_by`, `manual_action_at`, `manual_reason`)
- For `promote`/`override_promote`: upserts row into `reputation_mesh` with `discovered_via='insiders_manual_admin'`
- For `reject`: deletes matching `reputation_mesh` row
- Toast confirms result, table re-fetches

Inline placement: small icon-buttons (✓ Promote, ↻ Reconsider, ✕ Reject) in a new Actions column. The drill-down dialog also gets a full-width version with the reason textarea for overrides.

## Part 3 — Mesh Verdict Editor (`OracleMeshViewer`)

A generic editor for any row in `reputation_mesh`, accessible from the existing **Oracle → Mesh Viewer** tab.

### What changes

Each mesh row gets an **Edit** pencil icon (super-admin only) that opens a `MeshVerdictEditorDialog`:

- **Display (read-only):** source_type/id, linked_type/id, discovered_via, discovered_at
- **Editable fields:**
  - `relationship` — dropdown of known relationships (`created_token`, `good_actor_creator`, `confirmed_bad`, `funded_by`, `recovering_actor_creator`, etc.) + free-text "custom"
  - `confidence` — slider 0–100
  - `evidence` (JSON) — JSON textarea with validate-on-save, plus a "Add admin note" helper that appends `{ admin_notes: [...], last_edited_by, last_edited_at }`
- **Buttons:** Save · Delete row (red, requires confirm) · Cancel

### Backend

New edge function **`mesh-verdict-edit`**:
- Verifies `is_super_admin`
- Accepts `{ id, action: 'update'|'delete', relationship?, confidence?, evidence? }`
- Validates JSON, clamps confidence 0–100
- Writes audit trail into `evidence.admin_notes[]` with timestamp + admin user_id
- Returns updated row

No schema migration needed — `evidence jsonb` already holds arbitrary structure.

## Technical Details

**Files created:**
- `supabase/functions/insiders-mesh-row-action/index.ts`
- `supabase/functions/mesh-verdict-edit/index.ts`
- `src/components/admin/HypotheticalPnlPanel.tsx` (the $10-per-call simulator)
- `src/components/admin/oracle/MeshVerdictEditorDialog.tsx`

**Files modified:**
- `src/components/admin/tabs/InsidersLifecycleTab.tsx` — mounts `<HypotheticalPnlPanel rows={rows} />` at top, adds Actions column with per-row buttons, adds override section in drill-down dialog
- `src/components/admin/oracle/OracleMeshViewer.tsx` — adds Edit pencil per row, mounts the editor dialog

**No DB migration required** (Part 1 is pure client compute, Parts 2–3 reuse existing columns).

**Recharts** (already installed, used by `AnalyticsTab.tsx`) powers the PnL charts.

**Security:** Both new edge functions gate on `supabase.rpc('is_super_admin', { _user_id })` — same pattern as `admin-stripe-customer-details`.

