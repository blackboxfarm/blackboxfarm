## Goal

Upgrade the No Lube / Insiders leaderboard recaps to include rich text captions (so Telegram pin previews convey the point), smart Top 10 vs Top 20 sizing, plus weekly and monthly recap cadences. All three cadences auto-pin in their channels.

## Current state (so we don't rebuild what exists)

- `leaderboard-daily-builder` runs hourly, fires per `leaderboard_profiles` at `post_hour`, builds Top 20 from `telegram_insider_token_lifecycle`, inserts a `leaderboard_daily_runs` row, then calls `leaderboard-render` + `leaderboard-post`.
- `leaderboard-post` posts the rendered image to public/private channels via `no-lube-push` with a short caption ("Daily Top 20 · 6am→6am Toronto · N qualifying calls · PUBLIC").
- No pin step, no weekly/monthly, fixed Top 20, caption is thin (preview shows almost nothing).

## What changes

### 1. Smart sizing (Top 10 default, Top 20 on busy days)

In `leaderboard-daily-builder`:
- After scoring, count entries with `multiplier >= 4`.
- If `count(>=4x) > 10` → keep Top 20.
- Else → trim to Top 10.
- Persist `size_chosen` ('top10' | 'top20') and `qualifying_4x_count` on `leaderboard_daily_runs` so the renderer and poster know.

`leaderboard-render` already renders whatever entries it gets — pass the trimmed list. No visual change needed beyond the count.

### 2. Weekly Top 20 (Mondays)

New cron-driven flow inside the same `leaderboard-daily-builder` (or a new sibling `leaderboard-weekly-builder` — see Technical):
- Trigger: Monday at `post_hour` local for each profile.
- Window: previous Monday day_start → this Monday day_start (7 days).
- Always Top 20 (no smart sizing — weekly always has volume).
- New table row: `leaderboard_weekly_runs` (mirrors daily run shape + `week_start_date`, `week_end_date`).
- Renders via `leaderboard-render` with a `variant: 'weekly'` flag → header reads "NO LUBE — WEEKLY TOP 20" and shows the date range.

### 3. Monthly Top 25 (1st of month)

- Trigger: day 1 at `post_hour` local.
- Window: previous calendar month, local timezone.
- Top 25.
- New table: `leaderboard_monthly_runs` (+ `month_label` like "May 2026").
- Renders with `variant: 'monthly'` → header "NO LUBE — MONTHLY TOP 25" + month label.

### 4. Information-heavy caption (so the pin preview tells the story)

Rewrite the caption builder in `leaderboard-post` (and new weekly/monthly posters, or one shared helper). The first line of the caption is what Telegram shows in the pin banner, so it must be self-explanatory.

Daily template:

```
🏆 NO LUBE DAILY RECAP — Top {N} · {local_date}
🥇 #1 ${TICKER1} {mult1}x · $→  $entry → $peak
🥈 #2 ${TICKER2} {mult2}x · $entry → $peak
🥉 #3 ${TICKER3} {mult3}x · $entry → $peak
🔥 {count_4x_plus} calls at 4x+ · {count_10x_plus} at 10x+
📊 Window: 6am→6am Toronto · {entry_count} qualifying calls
👀 Full table in the image below.
```

Weekly template (first line drives the pin preview):

```
📅 NO LUBE WEEKLY TOP 20 — {week_start} → {week_end}
🥇 ${T1} {m}x · 🥈 ${T2} {m}x · 🥉 ${T3} {m}x
🔥 {N_4x_plus} calls at 4x+ this week · biggest call: ${TOP} {topMult}x
📊 7-day window · {entry_count} qualifying calls
```

Monthly template:

```
🗓️ NO LUBE MONTHLY TOP 25 — {month_label}
🥇 ${T1} {m}x · 🥈 ${T2} {m}x · 🥉 ${T3} {m}x
🔥 {N_10x_plus} at 10x+ · biggest: ${TOP} {topMult}x
📊 Full month · {entry_count} qualifying calls
```

All captions HTML-safe (escape ticker names). Tickers are obfuscated per existing thin-formatting protocol when posted to channels that pipe to other bots (No Lube channels are end-destinations, so plain `$TICKER` is fine here — same as today's `leaderboard-post`).

### 5. Auto-pin

After a successful `sendPhoto` in `leaderboard-post` / weekly / monthly, call Telegram `pinChatMessage` with:
- `chat_id`, `message_id` from the just-sent post
- `disable_notification: true` (avoid double-notify; the photo post already pinged subscribers)

Store `pinned_at` and `pinned_message_id` on the run row. If a previous recap of the same cadence (daily/weekly/monthly) is still pinned for that chat, call `unpinChatMessage` for the old `message_id` first so only the latest is pinned per cadence.

Optional per-profile toggles on `leaderboard_profiles`:
- `auto_pin_daily BOOLEAN DEFAULT true`
- `auto_pin_weekly BOOLEAN DEFAULT true`
- `auto_pin_monthly BOOLEAN DEFAULT true`
- `auto_unpin_previous BOOLEAN DEFAULT true`

### 6. Insiders profile parity

Confirm a second row exists in `leaderboard_profiles` for **Insiders** (channel_name_filter = 'insiders', `post_to_tg_*` pointed at the Insiders public + premium chats). If not, seed it. Same builder code services it — different `channel_name_filter` and chat IDs.

## Technical details

**Schema migration (one file):**
- `leaderboard_daily_runs`: add `size_chosen TEXT`, `qualifying_4x_count INT`, `pinned_message_id BIGINT`, `pinned_at TIMESTAMPTZ`, `caption_text TEXT`.
- New table `leaderboard_weekly_runs` (id, profile_id, week_start_date, week_end_date, window_start_utc, window_end_utc, entries jsonb, entry_count, status, image_public_url, image_private_url, tg_public_message_id, tg_private_message_id, posted_at, pinned_message_id, pinned_at, caption_text, timestamps). GRANT + RLS to match daily.
- New table `leaderboard_monthly_runs` (same shape + `month_start_date`, `month_label`).
- `leaderboard_profiles`: add `auto_pin_daily/weekly/monthly` and `auto_unpin_previous` booleans.

**Edge functions:**
- Modify `leaderboard-daily-builder`: smart sizing + persist new fields.
- New `leaderboard-weekly-builder` (runs hourly, fires Monday at `post_hour`).
- New `leaderboard-monthly-builder` (runs hourly, fires on day 1 at `post_hour`).
- Modify `leaderboard-post`: rich caption + pin/unpin logic (accept `cadence: 'daily'|'weekly'|'monthly'` and `run_table`).
- Modify `leaderboard-render`: accept `variant: 'daily'|'weekly'|'monthly'` to swap header text + Top 10/20/25 layout.

**Cron:**
- Existing hourly cron already triggers `leaderboard-daily-builder`. Add two more `cron.schedule` calls for the weekly and monthly builders (also hourly — each one self-gates on day-of-week / day-of-month + `post_hour`).

**Telegram pin/unpin:**
- `pinChatMessage` via the same `TELEGRAM_HOLDERSINTEL_BOT_TOKEN` already used by `no-lube-push`. The bot must already be admin in the channels (it is, since it posts there).

## Out of scope

- No UI changes to the super-admin leaderboard panel (it'll show new columns automatically through the existing list view; deeper UI iteration can come after).
- No change to the rendered image style beyond header text + row count.
- No change to thin-formatting / obfuscation rules for other bot integrations.

## Open question for approval

The smart sizing threshold is currently "more than 10 calls at 4x+ → Top 20, else Top 10". Confirm `>= 4x` is the cutoff (vs `>= 5x`), and confirm the trigger count of "more than 10" (vs e.g. ">= 8"). Easy to tune in one place.
