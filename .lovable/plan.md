

## Add Unread DM Indicator and Improve Chat Modal Icons

### What This Does
1. Adds a green "new messages" dot indicator on the "View DMs" button when there are unread DM messages since the admin last opened that chat
2. Uses distinct icons for the DM modal (speech bubble) vs group chat modal (message square) so they're visually distinguishable at a glance

### How It Works

**Tracking "last viewed"**: Store a `localStorage` key per installer (e.g., `dm_last_viewed_{telegramUserId}`) with a timestamp. When the DM modal opens, update that timestamp. On load, query the DB for the most recent DM message per installer and compare — if newer than stored timestamp, show a green dot.

**Unread check query**: On `loadData`, run a single query to get the latest `created_at` per `telegram_user_id` where `chat_type='private'`. Compare each against the localStorage timestamps to build an `unreadDmSet`.

**UI changes**:
- "View DMs" button gets a relative-positioned green pulsing dot when unread
- DM modal header uses a `MessageCircle` icon instead of `MessageSquare`  
- Group chat modal keeps `MessageSquare`
- "View Chat" button also gets a distinct icon treatment

### Files to Change

| File | Change |
|------|--------|
| `src/components/admin/telegram/TelegramHostedBots.tsx` | Add unread state tracking via localStorage, query latest DM timestamps, render green dot on View DMs button, use `MessageCircle` for DM modal title |

### Technical Details
- `useEffect` on mount: query `telegram_group_messages` for `SELECT telegram_user_id, MAX(created_at) as last_msg FROM ... WHERE chat_type='private' GROUP BY telegram_user_id`
- Compare each against `localStorage.getItem(`dm_last_viewed_${tgUserId}`)` 
- On `openChatModal` with `isDm=true`, call `localStorage.setItem(...)` with current ISO timestamp and remove from unread set
- Green dot: `<span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />`

