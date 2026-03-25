

# Telegram Bot & Channel Interaction Tracking

## Current State

**What exists:**
- `telegram_bot_usage` — logs command + telegram_user_id + token_mint (rate limiting only, no user details like username/first_name)
- `channel_installations` — tracks when bot is added/removed from groups (via `my_chat_member`)
- `telegram_link_codes` — maps telegram_user_id to website user_id
- Webhook `allowed_updates` = `["message", "my_chat_member"]` — does NOT include `chat_member` (channel join/leave events)

**What's missing:**
1. No rich interaction log (username, first/last name, chat context, response status)
2. No channel member join/leave tracking at all
3. No admin UI to view bot conversations or channel membership activity
4. Bot usage table lacks user metadata (username, first_name)

## Architecture Decision: Channel Joins/Leaves

**Channel member join/leave events require the bot** — not MTProto. Here's why:
- Telegram's `chat_member` update type fires when ANY user joins/leaves a group where the bot is admin
- MTProto could poll `getParticipants` but that's expensive, rate-limited, and not real-time
- The bot is already installed in these channels — we just need to add `"chat_member"` to `allowed_updates` in the webhook registration

## Plan

### Step 1: New database tables

**`telegram_bot_interactions`** — rich log of every bot conversation:
- `id`, `telegram_user_id`, `telegram_username`, `first_name`, `last_name`
- `chat_id`, `chat_type` (private/group/supergroup)
- `command`, `args_preview` (first 100 chars), `token_mint`
- `linked_user_id` (nullable FK to auth.users — filled if account is linked)
- `response_status` (success/error/rate_limited/unauthorized)
- `is_new_user` (boolean — first time seeing this telegram_user_id)
- `created_at`
- RLS: service_role only insert, super_admin select

**`telegram_channel_members`** — join/leave activity log:
- `id`, `chat_id`, `chat_title`
- `telegram_user_id`, `telegram_username`, `first_name`, `last_name`
- `event_type` (joined/left/kicked/banned/restricted)
- `invited_by_user_id` (nullable — who added them)
- `old_status`, `new_status`
- `created_at`
- RLS: service_role only

### Step 2: Update webhook to capture `chat_member` events

Modify `holdersintel-bot-webhook/index.ts`:
- Add `"chat_member"` to `allowed_updates` in webhook setup (alongside existing `message` and `my_chat_member`)
- Add `handleChatMember(update)` handler for `update.chat_member` events — logs join/leave/kick to `telegram_channel_members`
- Enhance the existing message handler to insert into `telegram_bot_interactions` with full user metadata on every command
- Detect `is_new_user` by checking if telegram_user_id has any prior rows

### Step 3: Update `telegram-bot-health` repair_webhook

Add `"chat_member"` to the `allowed_updates` array in the repair webhook action so it stays in sync.

### Step 4: Admin UI — "Telegram Accounts" tab content

Create `src/components/admin/telegram/TelegramInteractionsPanel.tsx` with two sub-tabs:

**Bot Interactions sub-tab:**
- Table: timestamp, username, command, token, chat_type, response_status, linked account (yes/no)
- Filters: command type, linked/unlinked, date range
- Stats cards: total interactions today, unique users, new users, top commands
- Highlight new registrations (`/register` commands)

**Channel Members sub-tab:**
- Table: timestamp, channel name, username, event (joined/left), invited_by
- Filters: channel, event_type, date range
- Stats: net joins today, most active channels, churn rate

Wire this into the existing Telegram tab in `SuperAdmin.tsx` or as a new sub-section within `TelegramChannelMonitor`.

### Step 5: Re-register webhook

After deploying, the webhook needs to be re-registered with the new `allowed_updates`. The existing "Repair Webhook" button on the Bot Health panel will handle this automatically (once Step 3 is deployed).

## Technical Notes

- The `chat_member` update type requires the bot to be an **admin** in the group/channel — it already is for installed channels
- `chat_member` fires for every user join/leave; `my_chat_member` only fires when the bot itself is added/removed
- We keep the existing `telegram_bot_usage` table untouched (it's used for rate limiting) — the new `telegram_bot_interactions` table is a richer parallel log
- Channel join/leave volume could be high — we'll add an index on `(chat_id, created_at)` and auto-purge rows older than 90 days via a scheduled cleanup

