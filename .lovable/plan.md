

## Harden AI Chat: Injection Prevention, Compute Tracking, and "Helpful Not Annoying" UX

### Current Gaps Found

1. **No input sanitization on web-chat**: The Telegram bot uses `telegram-input-sanitizer.ts` (strips control chars, detects shell/SQL/XSS injection patterns). The web-chat edge function accepts raw user input with zero validation — direct injection surface.

2. **No AI compute/cost tracking**: Neither web-chat nor TG bot logs token usage, model costs, or compute time. The `web_chat_messages` table stores content but not token counts. No way to track AI spend in the morning report or dashboard.

3. **TG bot already has feature parity**: Both platforms share the same memory system (`ai_user_memory`), intent detection, live data lookups, knowledge bins, and guardrails. The TG bot has its own rate limiter (5/min) and input sanitizer. Web-chat only has rate limits.

4. **Clippy problem**: The FAB is always visible on every page from first load. No contextual awareness of when to appear or when to stay quiet.

---

### Plan

#### 1. Web Chat Input Sanitization

Create a shared `sanitizeWebChatInput()` function in the `web-chat` edge function that:
- Strips control characters and null bytes (reuse patterns from `telegram-input-sanitizer.ts`)
- Detects script injection (`<script>`, `javascript:`, etc.) and marks as suspicious
- Truncates messages to 2000 characters max
- Rejects messages that trigger 3+ injection patterns (return a friendly "I didn't understand that" response)
- Does NOT block valid password characters or special symbols needed in normal conversation (unlike the TG sanitizer which blocks `$`, `()`, etc.)

Applied to every user message before it reaches the AI prompt.

#### 2. AI Compute Tracking Table + Logging

New table: `ai_compute_log`
| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| platform | text | 'web' or 'telegram' |
| user_id | uuid nullable | |
| session_id | text | |
| model | text | 'gemini-3-flash-preview' |
| prompt_tokens | int | Estimated from char count / 4 |
| completion_tokens | int | Counted from streamed response |
| total_tokens | int | Sum |
| response_time_ms | int | End-to-end AI call duration |
| cost_estimate_usd | numeric | Based on model pricing |
| created_at | timestamptz | |

Both `web-chat` and `handleAiFreeChat` will:
- Record start time before AI gateway call
- Count completion tokens from streamed chunks
- Estimate prompt tokens from system prompt + conversation length
- Insert a row into `ai_compute_log` after each completion
- Morning report gets a new "AI Compute" section: total tokens, cost estimate, per-platform breakdown

#### 3. "Helpful Not Annoying" Widget Behavior

Transform the always-visible FAB into a context-aware, Clippy-proof assistant:

- **Delayed appearance**: FAB does not appear until user has been on the site for 30 seconds OR has visited 2+ pages (whichever comes first)
- **Page-aware visibility**: Hidden on checkout/payment pages. Always available on `/holders`, `/oracle`, `/bubblemaps` (feature pages where help is most useful)
- **Minimized memory**: If user closes the widget, it stays closed for 24 hours (localStorage timestamp) — no nagging reopens
- **No auto-popup**: The widget never opens itself. No "Hey! Need help?" toast. The FAB just appears quietly
- **Gentle pulse once**: On first appearance, the FAB pulses gently for 3 seconds, then stops. Never pulses again unless there's an actual unread AI response
- **Collapse on scroll**: On mobile, FAB shrinks to a smaller size when user is actively scrolling (to not block content)

#### 4. Confirm TG Parity

No code changes needed — TG bot already has:
- Input sanitization via `telegram-input-sanitizer.ts`
- Rate limiting (5/min)
- Same memory, intent detection, live lookups, knowledge bins, guardrails
- The compute tracking from step 2 will be added to `handleAiFreeChat` as well

---

### Files to Create/Change

| File | Change |
|------|--------|
| Migration | Create `ai_compute_log` table |
| `supabase/functions/web-chat/index.ts` | Add input sanitizer, compute logging |
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Add compute logging to `handleAiFreeChat` |
| `src/components/chat/ChatWidget.tsx` | Smart appearance logic (delay, dismiss memory, no auto-popup) |
| `src/components/chat/useChatStream.ts` | Track page visits for appearance trigger |
| `supabase/functions/morning-report/index.ts` | Add AI compute summary section |

