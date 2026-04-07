

## Extend AI Chat to All Registered Users + Easter Egg + Future Marketing Vision

### What Changes

1. **Open AI chat to all registered users** (not just channel admins)
2. **"Send nudes" easter egg** — reply with the sphynx cat photo
3. **Update AI system prompt** to handle email verification questions, feature guidance, and soft marketing
4. **Make verification reminders conversational** — sent as AI-style casual messages, not formal notices
5. **Lay groundwork for future marketing knowledge base** (discussion only — no dashboard yet)

### Implementation Details

#### 1. Remove Admin-Only Gate in `handleAdminFreeChat`
**File: `supabase/functions/holdersintel-bot-webhook/index.ts`**

Currently lines 2570-2586 check for active `channel_installations` and block non-admins. Change this to:
- If user has a linked account (`linked.user_id` exists) → allow AI chat
- If user has NO linked account → keep the existing "please /register first" message
- Rename function from `handleAdminFreeChat` to `handleAiFreeChat` for clarity

#### 2. "Send Nudes" Easter Egg
**File: `supabase/functions/holdersintel-bot-webhook/index.ts`**

Before the AI call, check if the message matches "send nudes" (case-insensitive). If so, use Telegram's `sendPhoto` API to reply with the sphynx cat image. The image will be hosted as a public URL (uploaded to `public/images/nudes-cat.jpg` and served from the published site URL).

Detection: `messageText.toLowerCase().includes('send nudes')` or similar regex.

Response: Send the cat photo via `sendPhoto` with caption: `"😏 As requested... here are the nudes! 🐱"`

#### 3. Expanded System Prompt
**File: `supabase/functions/holdersintel-bot-webhook/index.ts`**

Add to the system prompt:
- **Email verification context**: "If a user asks about email verification, explain it warmly — they have 48 hours to click the link in their inbox, they can resend from the dashboard, and if they miss it their account gets paused but they can reactivate easily."
- **Feature discovery**: Mention website features like Bubblemaps, /holders page, social sharing, the Oracle
- **Payment/subscription guidance**: Explain that everything is free right now, future premium tiers TBA
- **Conversational tone for ALL users**, not just admins
- **Social sharing encouragement**: Suggest sharing interesting token findings on Twitter/X

#### 4. Conversational Verification Reminders
**File: `supabase/functions/holdersintel-bot-webhook/index.ts`**

Update the 24h verification nudge (line ~3018) to be more casual and AI-chat-like:
- Current: formal notice style
- New: `"Hey quick thing 💬 — your email isn't verified yet! Just check your inbox and click the link. Need help? Just ask me anything here! 🤖"`
- Add a note that they can chat with the bot about any questions

#### 5. Copy Cat Image to Project
Copy `user-uploads://nudes.jpg` to `public/images/nudes-cat.jpg` so it's served at a stable public URL the bot can send via Telegram's `sendPhoto`.

### Future Marketing Knowledge Base (Feedback)

Your vision for a marketing knowledge base is solid. Here's how it could work later:

- **Knowledge Bins**: Categorized response templates stored in a DB table (`bot_knowledge_bins`) — topics like "what is holder analysis", "how do alerts work", "affiliate program", "security practices"
- **Dashboard**: Super admin UI to manage bins — add/edit/delete knowledge entries, set guardrails, review conversation logs for gaps
- **Gap Detection**: AI flags questions it couldn't answer well → surfaces them in dashboard as "knowledge gaps" for you to fill
- **Guardrails**: Strict rules about never recommending competitors, never giving financial advice, always redirecting to your services
- **Analytics**: Track what users ask most, what converts them, what confuses them

This is a full feature set that would be best built as a separate phase. The current changes lay the foundation by opening AI chat to all users and logging all conversations.

### Files to Change

| File | Change |
|------|--------|
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Remove admin gate, add easter egg, expand prompt, rename function, update nudge tone |
| `public/images/nudes-cat.jpg` | Copy cat image for easter egg |

