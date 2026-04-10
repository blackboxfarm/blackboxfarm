

# Tiered /ca Response + Toggle Control

## What's Changing

The `/ca` command currently shows the full rich report (dev reputation score, rug counts, social links, risk flags) to all authenticated users. This undermines the upgrade incentive.

## Design

### 1. Tiered /ca Response (in `handleCA`)

The `gateCheck` already returns the user's tier. Use it to control response depth:

| Data Point | Free/Auth | X Subscriber+ |
|---|---|---|
| Holders, Health, Phase, Top10% | ✅ Full | ✅ Full |
| Dust %, Whale count | ✅ Full | ✅ Full |
| Dev Reputation Score | `🏗 Dev: 🔒 ██/100 (upgrade to reveal)` | ✅ Full (`🏗 Dev: 🟢 78/100`) |
| Rug Pull Count | `⚠️ X prior rug(s) — 🔒 details locked` | ✅ Full |
| Social Links Count | `🔗 Socials: 🔒 locked` | ✅ Full |
| Risk Flags | `⚠️ X flags detected — 🔒 upgrade to see` | ✅ Full |

Free users see that data *exists* (counts/indicators) but not the actual values. This creates urgency — "there ARE risk flags, but you can't see them."

### 2. /ca Toggle (on/off per chat)

Add `/ca on` and `/ca off` subcommands so users can disable the bot's `/ca` response in chats where another bot already handles `/ca`:

- Store toggle state in a new column or lightweight table (e.g., `bot_chat_settings` with `chat_id` + `ca_enabled` boolean, default `true`)
- When `/ca` fires, check if `ca_enabled` is false for that chat — if so, silently ignore
- `/ca on` and `/ca off` only work in group chats (DMs always respond)

### 3. Group vs DM behavior

- **DMs**: `/ca` always active (no toggle check), full behavior
- **Groups/Channels**: `/ca` respects the toggle, abbreviated response (same as current group behavior for other commands)

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Modify `handleCA` to check tier and show placeholders for free users; add `/ca on`/`/ca off` toggle logic; add chat settings check |
| Migration | Create `bot_chat_settings` table (`chat_id bigint PK, ca_enabled boolean default true, updated_at timestamptz`) |

## Implementation Detail

In `handleCA` (line 1922), after `gateCheck` returns `{ tier, userId }`:

```
const isPaid = hasTier(tier, 'x_subscriber');
```

Then conditionally build `devLine`, `socialLine`, `riskLine`:
- If `!isPaid`: show placeholder text with lock emoji and upgrade CTA
- If `isPaid`: show full data (current behavior)

For the toggle, parse `args` before `extractCA`:
- If args is `"on"` or `"off"` → update `bot_chat_settings` for that chatId, send confirmation, return
- Otherwise proceed with normal CA logic

