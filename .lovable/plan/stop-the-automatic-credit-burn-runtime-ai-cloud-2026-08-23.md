# Stop the automatic credit burn (runtime AI + Cloud)

Goal: find every scheduled/background job that calls the AI Gateway or keeps Cloud compute busy, and gate it — so credits only move when you actually ask for something.

Confirmed from the billing ledger (Aug 5 – Sep 5): 2,871.79 credits used, of which ~773 are unattributed runtime spend (AI Gateway tokens + Cloud compute) and ~622 of that is Gemini token usage. Top-spending projects are Food Orders AI (909), Meme Launchpad (611), BestBaliSpas (313), Done dot Money (288), SystemReset2 (267), Starchild Ubud Spa (235). blackboxfarm itself is only 9.70.

## Step 1 — Audit (read-only, no changes)

For each of the six top projects, in order of spend:

1. List all `cron.job` entries and their schedules.
2. List every edge function that calls `ai.gateway.lovable.dev` (or an AI SDK) and trace which cron/trigger invokes it.
3. Pull AI Gateway request logs to see call volume, model, and token counts per function.
4. Check Cloud compute: instance size and whether anything holds it awake (frequent crons, realtime subscriptions, polling loops).

Output: one table per project — job, schedule, function, model, runs/day, estimated credits/day.

## Step 2 — Report before touching anything

You get the audit table plus a recommended action per job:

- Unschedule — pure background enrichment with no user waiting on it.
- Slow down — hourly/daily instead of minutes.
- Downgrade model — flash-lite where quality does not matter.
- Keep — genuinely user-facing.

Nothing gets changed until you say which lines to apply.

## Step 3 — Apply the approved cuts

For each approved item:

- `cron.unschedule(<id>)` or reschedule via migration.
- Add a kill-switch flag row so a job can be turned off from an admin toggle instead of needing a code change.
- Add usage logging on every AI Gateway call path that currently logs nothing, so the next surprise is visible before it becomes a bill.

## Step 4 — Guardrails

- A shared helper that refuses AI Gateway calls when a global "AI paused" flag is on.
- A daily spend ceiling per project: once crossed, background AI calls no-op and log instead of spending.

## Technical notes

- Each project is a separate codebase and separate Supabase project, so this runs project by project; work in blackboxfarm cannot change Food Orders AI or Meme Launchpad.
- I can read other projects in this session, but writing fixes to them has to happen in those projects' own chats. This plan's Step 1/2 audit covers all six; Step 3/4 edits land here for blackboxfarm and I hand you a ready-to-paste instruction per other project.
- Cron changes are migrations against `cron.job`; no table schema changes are expected beyond a small feature-flag table where a project lacks one.
