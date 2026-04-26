## Goal
Give you (1) a live view of what the X-Community resolution queue is costing in Apify spend, (2) an honest ETA for when the backlog will be drained, and (3) immediate SMS alerts to **+1-226-583-5975** when Apify returns a payment/credit/rate-limit failure — plus auto-pause so a stuck account doesn't waste cron runs.

---

## What's already in place (no rebuild needed)
- **`api_usage_log`** already records every Apify call: `service_name='apify'`, `endpoint`, `response_status`, `credits_used`, `response_time_ms`, `timestamp`, `function_name`. Source of truth for spend & ETA.
- **`sendAdminSms()`** (`_shared/sms-notify.ts`) is already wired to **+12265835975** via Twilio gateway.
- **`api-failure-alerts.ts`** already fires Telegram alerts on 401/403/429 with 3-tier escalation (10min → 30min → hourly).
- **`x_community_resolution_queue`** has `attempts`, `last_error`, `resolved_at` — enough to compute backlog.

So this is 4 small additions, not a new system.

---

## 1. Apify Spend Tracker (DB view + admin widget)

### a) Add a SQL view `apify_spend_rollup`
Aggregates `api_usage_log` for `service_name='apify'` into:
- `last_hour` — calls, credits, est. USD ($0.50/run), failures
- `last_24h` — same fields
- `last_7d` — same fields
- `month_to_date` — same fields
- `failures_24h` by status code (402, 429, 5xx, etc.)

Stored as a Postgres view so it's always live, no cron rollup needed.

### b) Add `ApifySpendCard` to Super Admin → Funnel/Health panel
Small card showing:
- Today's spend (USD est.) + call count
- 7-day spend
- Month-to-date spend
- Last failure timestamp + reason (if any)
- Mini sparkline of last 24h hourly spend

Reads from `apify_spend_rollup` view via the admin client.

---

## 2. Backlog ETA Widget

### Add `XCommunityQueueEtaCard` to the same admin panel
Computes:
- **Pending** = `x_communities` rows where `moderator_usernames IS NULL` AND `community_id` is numeric, plus rows in `x_community_resolution_queue` where `resolved_at IS NULL AND attempts < 3`.
- **Throughput** = average successful Apify resolutions per hour over the last 6 hours (read from `api_usage_log`).
- **ETA** = `pending / throughput` → "~14 hours remaining" or "~2.3 days".
- **Stalled flag** — if throughput drops to 0 for >15 min while pending > 0, show red "STALLED" banner.

Refreshes every 60s.

---

## 3. SMS Alerts on Apify Credit/Funds Failures

### a) Extend `api-failure-alerts.ts` — add a new `alertOnApifyCreditFailure()` path
Detects credit/funds-specific failures separately from generic 401/403/429:
- HTTP **402 Payment Required**
- HTTP **403** with body containing `insufficient credits`, `monthly usage`, `usage limit`, `payment`, or `quota exceeded`
- HTTP **429** with body containing `monthly` or `quota` (vs. plain rate-limit which is transient)

When matched:
1. Call `sendAdminSms()` with a tight message:
   ```
   🚨 APIFY FUNDS BLOCKED
   Status: 402
   Function: x-community-resolver
   Msg: insufficient credits
   Pending queue: 6,847
   Action: top up Apify account
   ```
2. Also fire the existing TG escalation alert (no change there).
3. Cooldown: 30 min between SMS for the same failure type (prevents flood; TG keeps the per-10-min cadence).

### b) Wire it into `_shared/api-logger.ts`
In the `complete()` function, after the existing `alertOnApiAuthFailure` call, add a parallel call for `serviceName === 'apify'` to the new credit-failure detector. Zero impact on other services.

---

## 4. Auto-Pause on Sustained Credit Failure

### Add a `system_kill_switches` row: `apify_paused_until TIMESTAMPTZ`
When the credit-failure alert fires:
- Set `apify_paused_until = now() + interval '60 minutes'`.
- `backfill-x-community-members` checks this before each batch and short-circuits with a log line if paused.
- Auto-clears when timestamp passes OR when a successful Apify call lands (success → clear escalation + clear pause).
- Manual override: super-admin button "Resume Apify Now" calls a tiny edge function to set `apify_paused_until = NULL`.

This prevents the cron from burning through 30 retries × 12 runs/hour = 360 wasted attempts/hour while you're topping up.

---

## ETA answer for current backlog (with current settings)

Based on the math you already saw:
- **30 communities/run × 12 runs/hour = 360/hour**
- ~7,000 communities backlog (rough — actual will appear in widget once shipped)
- Realistic success rate ~85% (some return 0 mods, some 400)
- **ETA: ~24 hours of continuous draining**

The new ETA widget will replace this estimate with the real, live number based on observed throughput.

---

## Files touched
**New:**
- `supabase/migrations/<ts>_apify_spend_rollup.sql` — view + `system_kill_switches` row
- `src/components/admin/ApifySpendCard.tsx`
- `src/components/admin/XCommunityQueueEtaCard.tsx`
- `supabase/functions/admin-resume-apify/index.ts` — manual override endpoint

**Modified:**
- `supabase/functions/_shared/api-failure-alerts.ts` — add `alertOnApifyCreditFailure()`
- `supabase/functions/_shared/api-logger.ts` — call the new detector for apify
- `supabase/functions/backfill-x-community-members/index.ts` — check `apify_paused_until` before batch
- `src/pages/SuperAdmin.tsx` (or wherever the funnel panel lives) — mount the two cards

## What this does NOT do
- Does not change the Apify scrape logic itself — same actor, same cost per call.
- Does not change the cron cadence — still every 5 min, 30/run.
- Does not add per-community spend allocation (overkill for now).

Once approved, I'll ship in this order: (1) migration + view, (2) credit-failure detector + SMS, (3) auto-pause, (4) the two admin widgets.