

# /ticket Command for Telegram Bot (Pro-only)

## Overview
Add a `/ticket` command to the Telegram bot that lets paid subscribers create, update, and check status of support tickets — all from DMs. Also update the /help menu, website command list, and pricing table.

## Flow Design

```text
/ticket                    → Show usage + list user's open tickets
/ticket new <message>      → Create a new ticket (category: "telegram", priority: medium)
/ticket #123               → Show status + replies for ticket #123
/ticket #123 <message>     → Add a reply to ticket #123
```

- **Pro-only gate**: Check tier >= pro. Free/auth/x_subscriber get a "upgrade to Pro" nudge.
- **New ticket**: Inserts into `support_tickets` with user_id, email from profile, name from profile/TG username, category="telegram", subject auto-generated from first ~50 chars.
- **View ticket**: Queries `support_tickets` + `support_ticket_replies` (non-internal-note only) for that ticket number, shows status and reply thread.
- **Reply to ticket**: Inserts into `support_ticket_replies` with reply_type='user'. Also fires an `admin_notifications` insert so admins see it.
- **List open**: Shows all user's tickets (open/in_progress) with ticket numbers and subjects.

## Changes

### 1. Bot webhook — new `handleTicket` function
**File**: `supabase/functions/holdersintel-bot-webhook/index.ts`

- Add `handleTicket(chatId, telegramUserId, args)` function (~120 lines)
- Tier gate: requires `pro` tier
- Parse args to determine sub-action (new/view/reply/list)
- Uses service-role supabase client (already available) to read/write `support_tickets` and `support_ticket_replies`
- Add `/ticket` case to both switch blocks (DM main switch + group DM redirect)
- DM-only: group usage redirects to DM

### 2. /help menu update
Add `/ticket` under the Pro Intelligence section:
```
${check("pro")} /ticket — 🎫 Submit, track & reply to support tickets
```

### 3. Website TelegramCommandList
**File**: `src/components/telegram/TelegramCommandList.tsx`
- Add `{ cmd: "/ticket", desc: "Submit & track support tickets" }` to the Pro group

### 4. Pricing table
**File**: `src/components/premium/PricingTable.tsx`
- Add row: `🤖 TG Bot: /ticket` — false for free/auth/xSub, true for pro/dev/enterprise

### 5. Admin notification on new ticket from TG
When a ticket is created via `/ticket new`, insert into `admin_notifications` with type `new_ticket` so admins are alerted immediately.

## No DB changes needed
The existing `support_tickets` and `support_ticket_replies` tables already support everything: user_id, category, status, replies with reply_type='user'. Service role bypasses RLS.

