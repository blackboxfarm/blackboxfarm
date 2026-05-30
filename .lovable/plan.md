## What this fixes

Two distinct problems with the current sweeper behavior:

1. The primary sweeper re-enriches and re-orchestrates flat tokens just because they're past 2x. We only want enrichment + a fresh post when the multiplier has **actually advanced upward** since the last post (e.g. 4x → 6x), because enrichment is time-sensitive and pointless on a stalled token.
2. The primary sweeper hard-stops at 48h. We want long-tail visibility: tokens that keep climbing past 48h should still produce posts — but framed as **"look what we called"** marketing, not as fresh-fomo alerts. This reinforces the value of private-tier subscriptions.

---

## Step 1 — Make the primary sweeper progression-gated (not just 2x-gated)

File: `supabase/functions/no-lube-milestone-sweeper/index.ts`

Replace the static `MULTIPLIER_THRESHOLD = 2.0` gate with an **upward-progression** check:

- Select `last_multiplier` (from the most recent `no_lube_post_log` row for that mint) alongside the existing lifecycle fields.
- Eligibility now requires:
  - `first_called_at` within freshness window (30 min) — unchanged
  - `peak_multiplier >= 2.0` (still need to have crossed the first milestone at least once)
  - **AND** `peak_multiplier >= last_multiplier * PROGRESS_STEP` where `PROGRESS_STEP = 1.5` (configurable on `no_lube_global_profile`)
  - If no prior multiplier post exists, treat `last_multiplier = 1.0` so the first 2x still fires
- Only when eligibility passes do we call `no-lube-orchestrate` (which itself triggers re-enrichment via the ingest chain).

Result: flat tokens are not re-touched. A token that went 4x and is still at 4x is ignored. The moment it hits ~6x, it gets one enrichment + one post, then waits for the next step up.

---

## Step 2 — New "legacy brag" sweeper for 48h+ winners

New file: `supabase/functions/no-lube-legacy-sweeper/index.ts`

Purpose: find tokens that were called more than 48h ago and have **continued to climb** since their last post, and fire a retrospective marketing post.

Selection logic:
- Pull lifecycle rows where `first_called_at` is between 48h and `LEGACY_MAX_AGE_DAYS` (default 30 days) ago.
- Join most-recent `no_lube_post_log` row (any kind) per mint to get `last_multiplier` and `last_posted_at`.
- Require `last_posted_at` older than `LEGACY_MIN_GAP_HOURS` (default 24h) — no spam.
- Fetch current mcap (live, via existing price fetch path used by orchestrate).
- Require `current_mcap / entry_market_cap >= last_multiplier * LEGACY_PROGRESS_STEP` (default 1.5) AND `current_mcap >= LEGACY_MIN_MCAP` (default $250k — drop dead carcasses).
- Cap at `LEGACY_MAX_MINTS_PER_RUN` (default 10) per tick.

Action per eligible mint:
- Call `no-lube-orchestrate` with `{ mint, source: 'legacy-sweeper', flow_hint: 'legacy_brag' }`.
- Orchestrate routes this to a new `legacy_brag` post kind (see Step 3) instead of the normal `big_picture` flow.
- Stamp `last_legacy_swept_at` on the lifecycle row.

Cadence: separate cron entry, runs every 30 min (much slower than the primary 2–5 min sweeper — these posts are marketing, not signals).

---

## Step 3 — `legacy_brag` post kind in orchestrate

File: `supabase/functions/no-lube-orchestrate/index.ts`

- When `source === 'legacy-sweeper'` (or `flow_hint === 'legacy_brag'`):
  - Skip the freshness/dead-token guards that block normal flow.
  - Compose against a new template kind `legacy_brag` (template lives in `no_lube_templates`, seeded separately by the user via the admin UI — not in this plan).
  - Variables exposed to the template: `{entry_mcap}`, `{current_mcap}`, `{multiplier}`, `{days_since_call}`, `{token_symbol}`.
  - Route to BOTH `PRIVATE` and `PUBLIC` channels (the marketing message is valuable in both — private gets "you were here", public gets "you missed out, subscribe").
  - Log to `no_lube_post_log` with `post_kind = 'legacy_brag'` so it doesn't collide with snapshot/big_picture counters.

---

## Step 4 — Database & cron wiring

DB migration:
- Add `last_legacy_swept_at TIMESTAMPTZ` to `telegram_insider_token_lifecycle`.
- Add columns to `no_lube_global_profile`: `progress_step NUMERIC DEFAULT 1.5`, `legacy_min_mcap NUMERIC DEFAULT 250000`, `legacy_min_gap_hours INT DEFAULT 24`, `legacy_max_age_days INT DEFAULT 30`, `legacy_progress_step NUMERIC DEFAULT 1.5`.
- Extend `post_kind` allowed values to include `'legacy_brag'` (if there's a CHECK constraint).

Cron:
- Add `pg_cron` entry for `no-lube-legacy-sweeper` at `*/30 * * * *`.

---

## Out of scope

- Template authoring (you'll seed the `legacy_brag` template via the admin UI once the kind exists).
- Any change to the existing 30-min backlog gate inside orchestrate — it stays as a safety net for the normal flow, and is bypassed only for `legacy-sweeper` source.
- No change to `no-lube-ingest` — enrichment is still triggered via orchestrate's existing path; the gate is just stricter about when orchestrate runs.

## Files touched

1. `supabase/functions/no-lube-milestone-sweeper/index.ts` — progression-gate logic
2. `supabase/functions/no-lube-legacy-sweeper/index.ts` — NEW
3. `supabase/functions/no-lube-orchestrate/index.ts` — `legacy_brag` branch
4. New migration — lifecycle column, global profile columns, cron schedule
