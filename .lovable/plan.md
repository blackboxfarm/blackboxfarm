

## Diagnosis

The monitor is NOT running. Two compounding issues:

**1. No cron job is scheduled.**
The `telegram-channel-monitor-1min` cron was unscheduled on 2026-03-11 (migration `20260311162034`) and never re-added. Verified against `cron.job` — zero entries match `%telegram%channel%monitor%`. So the function only runs when something else manually invokes it. Edge logs query for `telegram-channel-monitor` returned zero hits.

**2. The only recent inserts are seed data, not live messages.**
All 109 rows inserted in the last 6 hours come from migration `20260418172714` (the historical backfill you ran when you said "make it our baseline of prev tokens"). Every one has `status='baseline_historical'`, `skip_reason='historical_backfill_seed'`, and `message_timestamp=NULL`. No real Telegram message has been processed since the cron was unscheduled.

So the system is correctly armed (channel `-1003694579312` insiders, enabled, wallet attached, 0.1 SOL, first-time-only) — it's just never being woken up to check for new messages, and the baseline seed already contains every recent token symbol the channel has posted, so even if it DID wake up, anything in that seed list would skip as "already seen".

## Fix (two steps)

### Step 1 — Re-schedule the monitor cron (every 1 minute)

Add a migration that schedules `telegram-channel-monitor-1min` via `pg_cron` + `pg_net`, hitting the function with `{"source":"cron"}`. This is what was working before March 11 and what got accidentally torn out.

### Step 2 — Verify the live-message path writes `message_timestamp`

Quick read-only check inside `telegram-channel-monitor/index.ts` to confirm that when a real MTProto message comes in, the insert into `telegram_channel_calls` sets `message_timestamp` (so the dashboard can distinguish live calls from baseline seeds). If missing, patch the insert. No logic change beyond that — first-seen rule already strips all guards.

## Out of scope
- Touching the buy logic (it's already as permissive as you requested)
- Re-seeding the baseline (the existing seed is fine; new mints will buy, repeats will skip)
- UI changes to `ChannelAutoBuyRules.tsx`

## Files touched
- `supabase/migrations/<new>.sql` — re-add the 1-minute cron schedule
- `supabase/functions/telegram-channel-monitor/index.ts` — only if message_timestamp is missing on the live insert path

## Expected result
Within 60 seconds of the next channel post of a CA we've never seen, a buy fires. You'll see a new row in `telegram_channel_calls` with `status='processed'` (not `baseline_historical`), `message_timestamp` populated, and `position_id` linked to a fresh FlipIt position.

