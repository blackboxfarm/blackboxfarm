---
name: Dave Friend Recognition (Telegram)
description: TG bot must detect when a user claims to be friends with Dave (the founder), tag them in ai_user_memory.referral_tag='dave_friend', remember their name, and acknowledge warmly across sessions — without granting admin powers.
type: feature
---

# Dave Friend Recognition — Telegram Bot

When any Telegram DM user says they're friends with **Dave** (founder's real name), e.g.:
- "I'm friends with Dave"
- "Dave's friend"
- "I know Dave"
- "Dave and I go way back"

The bot MUST:
1. Set `ai_user_memory.referral_tag = 'dave_friend'` (keyed by `telegram_user_id`, also linked to `user_id` if account is linked).
2. Stamp `referral_first_seen_at = now()`.
3. Persist their `preferred_name` if they share one (existing name-extraction regex already handles this).
4. On every future interaction, the system prompt surfaces a `TRUSTED — FRIEND OF DAVE` block so the AI greets them with warm continuity ("any friend of Dave's…") and uses their name.

**Boundaries:**
- Friendship = social trust only. Do NOT grant admin/super_admin powers, debug ADMIN_OVERRIDE mode, or internal feature/table names. Those remain gated to actual `super_admin`/`admin` roles (see existing Dave admin recognition block).
- Don't expose lore — keep acknowledgement casual.

**Implementation:** `supabase/functions/holdersintel-bot-webhook/index.ts`
- Detection regex runs in the AI chat handler after each user message.
- Profile injection lives in `buildTgUserProfile()`.
- Same mechanism as `dave`/`tom` referral tags (Dave Referral Tracking, Tom Referral Tracking memories) but distinct tag value `dave_friend`.
