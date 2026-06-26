## Diagnosis

**Insiders feed has been DEAD since 2026-06-14 09:04 UTC** (~12 days).

Evidence:
- `telegram_channel_calls WHERE channel_name='insiders'`: last row 2026-06-14, 0 rows in last 24h.
- `insiders-lifecycle-builder-2min` (jobid 255) is active and running — but has no new input rows to chew on, so no lifecycle entries → no No Lube posts → nothing fired to your TG channels.
- `telegram-mtproto-auth` IS polling every 5 min, but only for chat `-1003282110418` (fetches 100 msgs each run). Those messages are NOT landing as `channel_name='insiders'` rows.
- No cron job is named anything like `telegram-monitor` / `insiders-scraper` — the writer that used to persist Insiders messages into `telegram_channel_calls` has either been removed, renamed, or is silently failing.

So: **the No Lube pipeline (sweeper, poster, milestone) is healthy, but its source-of-truth scraper for the Insiders channel stopped writing 12 days ago.**

## Plan to fix

1. **Identify the Insiders ingest path.** Locate the edge function that previously wrote `channel_name='insiders'` rows into `telegram_channel_calls` (search `supabase/functions/` for `'insiders'` writes + check `cron.job` for any disabled/missing schedule that used to call it).
2. **Confirm which chat_id is the current Insiders channel.** The 5-min MTProto poll is targeting `-1003282110418` — verify that's still the Insiders channel and that its messages parse into mints. If wrong chat_id, repoint it.
3. **Check for silent write failure.** Run the ingest function manually with debug logging; look for parser rejections (`insiders_parse_failures` table) or `assertDbWrite` errors.
4. **Re-enable / re-schedule** the Insiders scraper cron at its original cadence (likely every 1–2 min) once the writer works.
5. **Backfill** the 12-day gap by replaying recent Insiders history via MTProto `fetch_recent_messages` (limit 200) so any still-live tokens get No Lube coverage.
6. **Add a watchdog**: alert SMS/TG if `telegram_channel_calls WHERE channel_name='insiders'` has no rows for >30 min, so this doesn't silently rot again.

## Answer to your question
We **are** connected to Telegram and MTProto polling is alive, but the Insiders-channel ingest writer is broken — no Insiders rows since June 14 — so the pipeline has nothing to post.

Reply **"Plan Approved"** to proceed with the investigation + fix.