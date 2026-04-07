

## Sentient Web Assistant — Website Chat Widget

### What This Builds

A floating chat widget on every page of blackbox.farm that lets **any visitor** (anonymous, free account, paid subscriber) talk to the same AI personality already configured in your Super Admin → AI Config dashboard. The widget adapts its behavior and sales pitch based on who's chatting.

### How It Works

```text
┌─────────────────────────────────────┐
│  Website (SiteLayout)               │
│                                     │
│   ┌──────────────────────┐          │
│   │  Page Content         │          │
│   └──────────────────────┘          │
│                                     │
│                    ┌───────────┐    │
│                    │ 💬 Chat   │    │
│                    │  Widget   │    │
│                    │  (fab)    │    │
│                    └───────────┘    │
└─────────────────────────────────────┘
         │
         ▼
   Edge Function: web-chat
         │
         ▼
   Same DB config:
   bot_personality_config
   bot_knowledge_bins
   bot_guardrails
```

### User Tier Awareness

The widget detects the user's state and injects a **context block** into the system prompt:

| Visitor Type | Behavior |
|---|---|
| **Anonymous** | Greet warmly, explain what BlackBox does, encourage sign-up, limit to 3 messages then prompt registration |
| **Free account** | Full chat, guide through features, soft-sell Pro subscription, help with email verification |
| **Paid subscriber** | Priority treatment, help with advanced features, no upsell pressure |

### Components to Build

1. **`ChatWidget.tsx`** — Floating FAB button (bottom-right corner) that expands into a chat panel. Includes:
   - Message history (session-only for anon, persisted for logged-in users)
   - Markdown rendering for AI responses
   - Typing indicator during streaming
   - User tier badge in header
   - Minimized state shows unread dot

2. **`web-chat` Edge Function** — New function that:
   - Accepts `{ messages, user_context }` where user_context includes tier (anon/free/paid), current page path, and user ID if logged in
   - Fetches the same `bot_personality_config`, `bot_knowledge_bins`, `bot_guardrails` from DB
   - Appends a web-specific context block: "User is on page X, they are a [tier] user, adjust accordingly"
   - Streams response via Lovable AI Gateway (same as Telegram bot)
   - Logs conversations to a `web_chat_messages` table for morning report analysis

3. **`web_chat_messages` table** — Stores all web chat interactions:
   - `id`, `session_id`, `user_id` (nullable for anon), `role` (user/assistant), `content`, `page_path`, `user_tier`, `created_at`
   - RLS: users read own messages, service role for insert

4. **Admin Dashboard addition** — New sub-section in AI Config showing web chat analytics (message volume, popular pages, conversion indicators)

### Integration Points

- **SiteLayout.tsx**: Add `<ChatWidget />` at the bottom, visible on all pages
- **Shares AI Config**: Same personality, knowledge bins, and guardrails — one dashboard controls both Telegram and web
- **Morning Report**: Extended to include web chat stats alongside Telegram DM stats
- **Page-aware**: Widget sends current `location.pathname` so the AI knows what page the user is viewing and can offer contextual help

### Rate Limiting

| Tier | Limit |
|---|---|
| Anonymous | 3 messages per session, then "Sign up to keep chatting!" |
| Free | 20 messages per hour |
| Paid | 60 messages per hour |

### Files to Create/Change

| File | Change |
|---|---|
| `supabase/functions/web-chat/index.ts` | New edge function — streaming AI chat for website |
| Migration | Create `web_chat_messages` table |
| `src/components/chat/ChatWidget.tsx` | Floating chat widget component |
| `src/components/chat/ChatMessage.tsx` | Individual message renderer with markdown |
| `src/components/chat/useChatStream.ts` | Hook for SSE streaming + message state |
| `src/components/layout/SiteLayout.tsx` | Add `<ChatWidget />` |
| `supabase/functions/morning-report/index.ts` | Add web chat analytics section |

### Technical Details

- **Streaming**: Uses SSE via Lovable AI Gateway (`google/gemini-3-flash-preview`) with token-by-token rendering
- **Session management**: Anonymous users get a localStorage session ID; logged-in users use their auth token
- **Prompt assembly**: Identical logic to the Telegram bot's `handleAiFreeChat` but with an added web context block specifying user tier, current page, and whether they've verified email
- **No new secrets needed**: Uses existing `LOVABLE_API_KEY` for Lovable AI Gateway

