

## Yes — and we already track exactly what's needed

Every send writes a row per recipient into `telegram_announcement_recipients` with `announcement_id`, `telegram_user_id`, `linked_user_id`, and `delivery_status` ('sent' / 'failed'). So for any past message, we can compute who **should** get it now but hasn't yet — and resend only to them.

## What gets added

### 1. History tab → new "Resend to new users" button (per past announcement)

In `TelegramAnnouncementBox.tsx`, next to "Show recipients" on each history entry, add a small **"Resend to new only"** button. Clicking it:
- Shows a confirm dialog with a **preview count** ("12 new users match the original audience and haven't received this yet — send?")
- On confirm, calls the broadcast function in **resend mode** referencing the original `announcement_id`

### 2. Backend: extend `telegram-announcement-broadcast` with a resend mode

New optional body params:
- `resendOfAnnouncementId: string` — the original log entry to resend
- `dryRun: boolean` — if true, return the target count without sending (used for the preview)

Logic when `resendOfAnnouncementId` is provided:
1. Load the original log row → reuse its `message_text` and `audiences`
2. Build the eligible target list using the **same audience logic that already exists** in the function
3. Pull every `telegram_user_id` from `telegram_announcement_recipients` where `announcement_id = original` AND `delivery_status = 'sent'` — these are the "already got it" set
4. Filter the eligible list: `eligible MINUS already_sent` = the new-only target list
5. If `dryRun` → return `{ newRecipients: N }` and exit without sending
6. Otherwise → create a **new** `telegram_announcement_log` entry with:
   - `message_text` copied from original
   - `audiences` copied from original
   - new column `resend_of_id` (FK to original log entry) so the history shows the lineage
   - Send + log per-recipient rows exactly like a normal broadcast

### 3. One small DB change

Add a column to `telegram_announcement_log`:
- `resend_of_id uuid REFERENCES telegram_announcement_log(id)` — nullable, marks resends

### 4. History UI: show resend lineage

When an entry has `resend_of_id`, render a small badge **"↻ Resend of earlier message"** so it's clear it isn't a new draft. Original message stays in history with its own count; the resend is its own row with its own count — clean audit trail.

## How "who hasn't received it yet" is computed

```text
eligible_now      = users matching original audiences (live query, same as a fresh send)
already_received  = SELECT telegram_user_id FROM telegram_announcement_recipients
                    WHERE announcement_id = <original> AND delivery_status = 'sent'
to_send_now       = eligible_now − already_received
```

This means:
- New signups since the original send → **included**
- Users who failed last time (e.g. blocked the bot temporarily) → **included** (they didn't actually receive it)
- Users who already got it successfully → **skipped**
- Users who left the audience (e.g. unsubscribed/deleted account) → naturally **excluded** because they no longer match

No "delivered to everyone, ever" tracking needed — the per-announcement recipient log is the source of truth.

## Files changed
- `supabase/functions/telegram-announcement-broadcast/index.ts` — add resend + dryRun modes
- `src/components/admin/telegram/TelegramAnnouncementBox.tsx` — add "Resend to new only" button and lineage badge
- One migration: add `resend_of_id` column to `telegram_announcement_log`

No new secrets. No breaking changes to existing send flow.

