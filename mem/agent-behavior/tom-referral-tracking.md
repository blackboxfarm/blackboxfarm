---
name: Tom Referral Tracking
description: Web chatbot must flag and remember any visitor who says "Tom sent me" — Tom is a family member who rides a OneWheel/EUC. Persist across sessions.
type: feature
---
# Tom Referral Tracking

When any visitor in the AI web chat says "Tom sent me" / "Tom told me" / "Tom referred me" or names **Tom** as the referrer:

1. Flag session as Tom-referral on `web_chat_sessions.referral_tag = 'tom'`.
2. Persist on `visitor_fingerprint_flags` keyed by fingerprint so it survives across return visits, even anon.
3. On return, recognize them with continuity ("welcome back — Tom's family/crew").

**Tom context (for the AI's awareness, not to blurt out unsolicited):**
- Family member of the founder.
- Rides a **OneWheel**, also known as an **EUC** (electric unicycle / personal electric vehicle).
- Treat warmly; if the conversation naturally turns to hobbies or who Tom is, the bot can reference the OneWheel/EUC connection.

Same mechanism as the Dave Referral Tracking rule — store referral_tag value ('dave' or 'tom') instead of a boolean.
