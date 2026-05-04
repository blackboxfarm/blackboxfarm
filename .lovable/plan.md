## Problem

The progress dialog currently shows just the phase label ("Hydrate token mesh") with a spinner. There's no narration of what that phase is actually doing, no per-attempt log, and the internal sub-steps of `token-mesh-hydrate` only appear *after* the whole phase finishes. From the user's seat it looks like the app froze.

## Goal

Live, verbose, scrolling activity log inside the existing `PipelineProgressDialog` so every action is visible as it happens:

```
✓ Resolve candidate row (0.5s)
   └ created/upserted 390589f2…

⟳ Hydrate token mesh — attempt 2/10
   Purpose: pull identity, creator wallet, socials, and holder snapshot
            from Helius + DexScreener + Pump.fun + harvest-token-socials.
   ⏱ 14s elapsed
   ✓ identity-resolve         ($REAPER · pump.fun)
   ✓ creator-wallet           (Fjdx…vpump)
   ⟳ harvest-token-socials    running… (12s)
   ✗ x-community-enricher     timeout after 45s — retrying
   ⋯ capture-holder-snapshot  pending
   ⚠ attempt 1 failed: harvest-token-socials timeout — backing off 2s
```

## Changes

### 1. Per-phase metadata (client-side, static)

In `runFullAutopsyPipeline.ts`, attach a `purpose` string to every phase when it's added, e.g.:

- `candidate` → "Find or create the autopsy_candidates row for this mint."
- `mesh-hydrate` → "Pull identity, creator wallet, socials, holder snapshot via token-mesh-hydrate."
- `tx-timeline` → "Reconstruct on-chain buy/sell timeline via autopsy-tx-timeline."
- `tg-deep-pull` → "Scrape Telegram channel members + recent messages."
- `community-sweep` → "Run X-community vulture + dissent lenses for sentiment forensics."
- `writer` → "Send the assembled mesh to the AI writer to draft the autopsy report."

Show it under the phase title the moment the phase starts.

### 2. Per-attempt activity log

Extend `PipelinePhase` with `log: { ts: number; level: 'info'|'warn'|'error'|'success'; msg: string }[]`.

`runPhase` pushes a log line at every state change:
- `info` — "Attempt N/Max — invoking token-mesh-hydrate…"
- `error` — "Attempt N failed: <reason>"
- `info` — "Backing off 2.0s before retry…"
- `success` — "Attempt N succeeded in X.Ys"

Render the log as a small monospace tail inside the phase card (last 6 lines, full list expandable).

### 3. Live sub-step streaming for `token-mesh-hydrate`

This is the long phase that currently feels frozen. Two-pronged fix:

**a. Server side** — `supabase/functions/token-mesh-hydrate/index.ts` already builds a `steps[]` array. Wrap each sub-step so it also writes a row to a new lightweight table `autopsy_pipeline_events`:

```sql
create table public.autopsy_pipeline_events (
  id bigserial primary key,
  candidate_id uuid not null,
  phase text not null,           -- 'mesh-hydrate'
  step text not null,            -- 'harvest-token-socials'
  status text not null,          -- 'running' | 'ok' | 'fail' | 'skipped'
  detail text,
  reason text,
  created_at timestamptz not null default now()
);
create index on public.autopsy_pipeline_events (candidate_id, created_at desc);
-- realtime: alter publication supabase_realtime add table public.autopsy_pipeline_events;
```

Server inserts a `running` row when it starts a sub-step and updates/inserts an `ok`/`fail` row when it finishes. Wrapped through `assertDbWrite` per the zero-tolerance rule.

**b. Client side** — `usePipelineProgress` subscribes to `autopsy_pipeline_events` filtered by `candidate_id` via Supabase Realtime, and merges incoming rows into the active phase's `subSteps[]` and `log[]` immediately. The user sees each sub-step flip from ⋯ to ⟳ to ✓/✗ live.

Same pattern applied to `autopsy-tx-timeline` and `autopsy-community-sweep` (they also have internal phases that take 30–60s).

### 4. Empty-vs-unknown badge (per the standing rule)

When a sub-step finishes, the server records `outcome: 'confirmed_empty' | 'value_present' | 'fetch_failed'`. The dialog renders:
- ✓ green for `value_present`
- ◌ grey "no data (confirmed empty)" for `confirmed_empty`
- ✗ red "fetch failed — retrying" for `fetch_failed`

This makes the empty-vs-unknown distinction we agreed on visible to you in real time, not just enforced silently in the gate.

### 5. Elapsed-time ticker

Replace the static `dur` (only shown after `endedAt` is set) with a `useEffect` interval that updates every 500ms while `status` is `running` or `retrying`, so you always see a live counter (e.g. "⏱ 17.4s").

## Files Touched

**Edited**
- `src/components/admin/autopsies/PipelineProgressDialog.tsx` — render purpose, log tail, live elapsed timer, outcome colours
- `src/components/admin/autopsies/usePipelineProgress.ts` — Realtime subscription, log merge
- `src/components/admin/autopsies/runFullAutopsyPipeline.ts` — purpose strings, log entries on every attempt/retry/backoff
- `supabase/functions/token-mesh-hydrate/index.ts` — emit `autopsy_pipeline_events` rows around each sub-step
- `supabase/functions/autopsy-tx-timeline/index.ts` — same
- `supabase/functions/autopsy-community-sweep/index.ts` — same

**Created**
- DB migration: `autopsy_pipeline_events` table + realtime publication
- `supabase/functions/_shared/pipeline-events.ts` — `emitEvent(candidateId, phase, step, status, …)` helper using `assertDbWrite`

## Out of scope

- No change to retry counts, timeouts, or the writer-gate logic — those stay as-is.
- No change to the AI writer or to the rugcheck/GoPlus path.
