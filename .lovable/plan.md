

## Current State Assessment

**What exists today:**
- **`withRunLog` wrapper** — 63 of ~209 functions use it. It records start/end/status/duration to `edge_function_runs` table.
- **~146 functions have NO run logging at all** — they silently fail with no record.
- The existing logger only records `success`/`error` + HTTP status code + an optional error message. It does **not** capture rich context like "retrieved 23 records" or "fallback to Helius succeeded".
- **Monitoring UI** — `MonitoringTab.tsx` has a basic "Function Health (24h)" panel showing runs/errors/avg time, but no per-day calendar view, no function catalog, no data-flow descriptions.
- **Morning Report** — has `EDGE_FUNCTION_CONTEXT` with purpose descriptions for only ~4 functions.

**What's missing (your ask):**
1. Rich success/error context logging with human-readable reasons in every function
2. A Function Catalog & Daily Operations Dashboard in Utilities

---

## Plan

### Step 1: Enhanced Run Logger with Rich Context

Upgrade `supabase/functions/_shared/run-logger.ts`:
- Add a `logEvent(level, message, data?)` method to `RunLogger` that appends structured events to a `events` array stored in `metadata.events`
- Events capture things like: `{ level: 'success', msg: 'Retrieved 23 holders', ts: ... }` or `{ level: 'error', msg: 'Solscan 404 — fallback to Helius', ts: ... }`
- On completion, the events array is persisted alongside the existing metadata
- Add convenience methods: `logger.info(msg)`, `logger.warn(msg)`, `logger.error(msg)` that call `logEvent` internally

No schema change needed — events go into the existing `metadata` JSONB column.

### Step 2: Add `withRunLog` to All Unwrapped Functions

Batch-wrap the ~146 functions that currently use bare `serve(async (req) => ...)` with `withRunLog('function-name', async (req) => ...)`. This is a mechanical change — add the import and wrap the handler. Functions that are test/utility stubs can be skipped.

### Step 3: Add Rich Logging Hooks to Key Functions

For the most critical ~20-30 functions, add contextual `logger.info()` / `logger.warn()` calls at key decision points. Examples:
- `pumpfun-token-enricher`: `logger.info('Enriched 12 tokens, 3 skipped')` 
- `wallet-genealogy-scanner`: `logger.info('Traced 5 hops, found KYC root')` or `logger.warn('Max depth reached without KYC')`
- `bagless-holders-report`: `logger.info('Generated report for 45 holders')`

This will be done progressively — the wrapper gives us success/error baseline immediately.

### Step 4: Function Registry Table

Create a new DB table `edge_function_registry`:

| Column | Type | Purpose |
|--------|------|---------|
| `function_name` | text PK | Matches `edge_function_runs.function_name` |
| `description` | text | Brief human description |
| `data_in` | text | Where it gets data (DB, API, another function) |
| `data_out` | text | What it does with results (writes DB, posts X, Telegram) |
| `category` | text | e.g. 'monitoring', 'trading', 'social', 'admin' |
| `is_active` | boolean | Whether currently deployed/used |
| `created_at` | timestamptz | |

Seed it with all ~209 functions and their descriptions derived from code inspection.

### Step 5: New "Function Operations" Utilities Tab

Create `src/components/admin/FunctionOperationsDashboard.tsx` as a new sub-tab in Utilities:

**Layout:**
- **Date picker** at the top (calendar-style, defaults to today)
- **Summary bar**: Total runs, total successes, total failures, overall success rate for selected day
- **Function table** with columns:
  - Function Name (with category badge)
  - Description (from registry)
  - Data In / Data Out (from registry)  
  - Successes (count, green)
  - Failures (count, red)
  - Success Rate (% bar)
  - Avg Duration
- **Click a row** to expand and see individual run events for that function on that day, including the rich context messages
- **Filter/search** by function name or category
- **Sort** by failures, total runs, or name

**Data source**: Joins `edge_function_runs` (filtered by selected date) with `edge_function_registry` for descriptions.

### Step 6: Wire Into Utilities Tab

Add a new tab trigger `"⚙️ Function Ops"` to `UtilitiesTab.tsx` pointing to the lazy-loaded `FunctionOperationsDashboard`.

---

### Technical Details

- **No schema changes to `edge_function_runs`** — rich events go into existing `metadata` JSONB
- **New table**: `edge_function_registry` — simple reference table, no RLS needed (admin only)
- **Query optimization**: The daily view will query `edge_function_runs` with a date range filter + `function_name` grouping, using the existing `created_at` index
- **Progressive rollout**: Step 2 (wrapping all functions) gives immediate visibility. Step 3 (rich logging) can be done incrementally over time for critical functions first.

