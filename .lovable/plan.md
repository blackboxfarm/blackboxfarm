

## Smooth Email Verification Recovery — Full User Journey Fix

### Current Situation (The Gaps)

**What happens today when a user fails to verify within 48 hours:**

1. **Website**: The cron job `auto_suspend_unverified_users` bans them (`banned_until = 2099`). When they try to sign in, Supabase auth rejects the login silently. There is NO explanation, NO banner, NO notification on the dashboard about verifying email — the user just can't log in and has no idea why.

2. **Telegram Bot**: The bot doesn't check if the linked web account is banned. `getLinkedUser()` just queries `telegram_link_codes` — it never checks `auth.users.banned_until`. So the bot keeps working normally for a banned user. The disconnect is confusing.

3. **No reminders**: No 24-hour reminder email, no bot DM nudge, no dashboard alert. The user goes from "everything works" to "suddenly banned" with zero warning.

4. **Reactivation**: The cron creates a `reactivation` token but never sends a reactivation email (the cron function only creates the token row — it doesn't invoke `send-verification-email`).

### The Fix — 5 Changes

#### 1. Dashboard Email Verification Banner
**File: `src/pages/Dashboard.tsx`**

Add a persistent banner at the top of the dashboard for unverified users. Query `email_verifications` for the current user — if no `verified_at` record exists, show a warning banner:
- Before 24h: gentle blue info banner — "📧 Please verify your email within 48 hours"
- After 24h: orange warning banner — "⚠️ Less than 24 hours left to verify your email!"
- Include a "Resend Verification Email" button that calls `send-verification-email`
- If already verified, show nothing

#### 2. Bot Checks Account Status Before Responding
**File: `supabase/functions/holdersintel-bot-webhook/index.ts`**

Add a helper `isUserSuspended(userId)` that checks `auth.users.banned_until` via service role. Wire it into the main handler flow — after `getLinkedUser()` resolves, if the user is suspended:

- Send a friendly DM: "⚠️ Your BlackBox Farm account was suspended because your email wasn't verified in time. But don't worry — click the link below to reactivate instantly! 🔗 [Reactivate Account](https://blackbox.farm/verify-email?token=...)"
- Look up the existing `reactivation` token from `email_verifications`, and if expired or missing, create a fresh one
- Also trigger `send-verification-email` with `type: reactivation` so they get a fresh email too
- Return early — don't process the command

This way the bot doesn't ghost them. It explains what happened and gives them a direct fix.

#### 3. 24-Hour Reminder — Bot DM + Email
**File: `supabase/functions/holdersintel-bot-webhook/index.ts`** (inline check) + **cron enhancement**

Two reminder mechanisms:
- **Passive bot reminder**: When an unverified user (not yet banned, but past 24h since signup) sends any DM, the bot prepends a gentle nudge: "📧 *Quick reminder:* verify your email soon to keep your account active! Check your inbox." Then processes the command normally.
- **Email reminder at ~24h mark**: Add a small addition to the `auto_suspend_unverified_users` function (or a new lightweight cron) that, at the 24-hour mark, re-sends the verification email as a reminder (checking rate limits). This gives them one more email nudge before the 48h deadline.

#### 4. Fix Reactivation Email Actually Getting Sent
**File: `supabase/migrations/` (new migration)**

Update `auto_suspend_unverified_users()` to invoke the `send-verification-email` edge function (or directly insert + send via the email notification function) when banning a user, so they actually receive the reactivation email with the token. Currently the token is created but never emailed.

Alternatively, since calling edge functions from PL/pgSQL is complex, add a `pending_reactivation_emails` flag/table that a lightweight cron-triggered edge function processes.

#### 5. Smooth Reactivation Flow
**File: `supabase/functions/verify-email-token/index.ts`** (already handles reactivation)

Verify this already calls `unban_user()` — it should. Also ensure after reactivation, the user can immediately sign in without confusion. The existing `VerifyEmail.tsx` page already shows a "Go to Dashboard" button for reactivated users, which is good.

### Files to Change

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Add verification status banner with resend button |
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Add `isUserSuspended()` check, bot DM nudge for unverified users past 24h, block-and-help for suspended users |
| New migration | Update `auto_suspend_unverified_users()` to flag users needing reactivation emails |
| New edge function or cron tweak | Send 24h reminder emails + reactivation emails for newly banned users |
| `supabase/functions/verify-email-token/index.ts` | Verify reactivation unban flow works end-to-end |

### User Experience After Fix

**Before 24h**: User sees gentle blue banner on dashboard. Bot works normally.
**At 24h**: Banner turns orange/urgent. Bot adds a one-line reminder to replies. Reminder email sent.
**At 48h (banned)**: User can't sign in — but gets a reactivation email. If they message the bot, bot explains what happened and sends them a reactivation link directly in chat. One click to fix it.
**After reactivation**: Account unbanned, email marked verified, everything back to normal.

