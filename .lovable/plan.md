

## AI Conversational Assistant for Admin DMs

### What This Does
When an admin (someone who has installed the bot in their channel/group) sends a free-text message in DMs — not a recognized command, not a Solana CA, not a registration code — the bot will route it to the Lovable AI Gateway and reply conversationally. The AI acts as a knowledgeable, enthusiastic product ambassador: answering questions about bot usage, features, tiers, troubleshooting, and marketing the project's value.

### How It Works

**1. New handler: `handleAdminFreeChat(chatId, telegramUserId, messageText)`**
- Checks if the user has any `channel_installations` (i.e., is an admin with the bot installed). If not, sends a short "use /help to see commands" nudge instead.
- Builds a system prompt that includes:
  - Full command reference (from `COMMAND_GROUPS` style data)
  - Product positioning / marketing tone instructions
  - Instructions to answer usage questions, troubleshooting, feature explanations
  - Guardrails: no financial advice, stay on-topic, redirect to /help for unknown commands
- Sends the user's message + system prompt to `https://ai.gateway.lovable.dev/v1/chat/completions` using `LOVABLE_API_KEY` (already available)
- Parses the response and sends it back via `sendMessage`

**2. Wire it into the `default` case for DM context (line ~2951)**
Currently the `default` branch only handles registration codes and group auto-scans. For private chats (non-group), after checking for registration codes and Solana CAs, route unmatched text to `handleAdminFreeChat`.

```
default:
  if (registration code) { ... }
  else if (isGroupChat && solana CA) { ... }
  else if (!isGroupChat && message.text) {
    await handleAdminFreeChat(chatId, telegramUserId, sanitized.rawTruncated);
  }
```

**3. Rate limiting**
- Simple in-memory rate limit: max 5 AI chat messages per user per minute to prevent abuse and control AI costs.

**4. System prompt content (key points)**
- "You are the BlackBox Farm / HoldersIntel bot assistant"
- Full feature list with descriptions
- Encourage admins to explore commands, explain benefits
- Warm, enthusiastic, emoji-rich marketing tone
- Answer questions about what the bot can do for their community
- If asked about pricing: "All features are FREE"
- If asked technical questions outside scope: redirect politely

### Files to Edit

| File | Change |
|------|--------|
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Add `handleAdminFreeChat` function (~60 lines), wire into default case, add rate limiter |

### Technical Notes
- Uses existing `LOVABLE_API_KEY` env var (already in use by `social-predictor-ai`)
- Model: `google/gemini-3-flash-preview` (fast, cheap, good enough for chat)
- No database changes needed
- No new edge functions needed — stays within the webhook handler
- Auth.tsx runtime error is unrelated (transient dynamic import issue)

