---
name: Dave Referral Tracking
description: Web chatbot must flag and remember any visitor who says "Dave sent me" (or similar) — Dave is the founder's real name. Persist across sessions even for anonymous visitors via fingerprint.
type: feature
---
# Dave Referral Tracking

When any visitor in the AI web chat (The Signal / web-chat edge function) says phrases like:
- "Dave sent me"
- "Dave told me"
- "I'm here because of Dave"
- "Dave referred me"
- any variant naming **Dave** as the referrer

The system MUST:
1. **Flag the session** as a Dave-referral (boolean tag on `web_chat_sessions`, e.g. `dave_referral=true`).
2. **Persist the marker against the visitor_fingerprint** so it survives across return visits — even if the visitor stays anonymous (never logs in).
3. **Recognize them on every return** — the bot should greet/treat them with continuity ("welcome back — Dave's guest").
4. If they later link a Telegram or web account, **carry the flag forward** onto the user record.

Dave = the founder's real name (do not expose this lore in bot replies; just honor the signal silently or warmly).

**How to apply:**
- In `supabase/functions/web-chat/index.ts`, run a regex on incoming user messages for `\bdave\s+(sent|told|referred|sent me|invited)\b` (case-insensitive) and set the flag.
- Store on `web_chat_sessions.dave_referral` and on a `visitor_fingerprint_flags` table keyed by fingerprint.
- On session start, look up the fingerprint and re-attach the flag.
