
## Email Verification + Pixel Tracking System

### Feature 1: Secondary Email Verification (48h Auto-Suspend)

**Flow:**
1. User signs up → autoconfirm stays ON → they enter the site seamlessly
2. During onboarding, remind them: "Check your email and click the verification link"
3. A **new edge function** (`send-verification-email`) sends a branded email with a unique verification token/link
4. Link points to something like `https://blackbox.farm/verify-email?token=xxx`
5. Clicking the link marks the user as "email verified" in a new `email_verifications` table
6. A **pg_cron job** runs every hour: any user who signed up > 48 hours ago AND hasn't clicked the verification link gets auto-suspended (banned_until = 2099)
7. When suspended, a "reactivation email" is automatically sent with a unique unsuspend link
8. Clicking the unsuspend link → unbans the user AND marks them as email-verified

**New table: `email_verifications`**
- `user_id` (uuid, FK auth.users)
- `verification_token` (text, unique)
- `sent_at` (timestamptz)
- `verified_at` (timestamptz, nullable — NULL = not yet clicked)
- `verification_type` ('signup' | 'reactivation')

**New edge functions:**
- `send-verification-email` — generates token, stores in table, sends branded email with verification link
- `verify-email-token` — validates token, marks verified, unbans if needed

**Onboarding change:**
- Add a reminder step/banner: "Check your email to verify your account within 48 hours"

**pg_cron job:**
- Every hour, find users where `created_at < now() - interval '48 hours'` AND no `verified_at` in `email_verifications` AND not already banned
- Ban them and trigger reactivation email

---

### Feature 2: Email Pixel Tracking (All Emails)

**How it works:**
- Every outgoing email (auth, transactional, verification) includes a 1x1 transparent tracking pixel: `<img src="https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/track-email-open?id=xxx" />`
- The pixel URL hits a new edge function that logs the open event

**New table: `email_tracking_events`**
- `id` (uuid)
- `tracking_id` (text, unique — embedded in the pixel URL)
- `user_id` (uuid, nullable)
- `email_type` (text — 'auth_signup', 'verification', 'reactivation', 'notification', etc.)
- `recipient_email` (text)
- `sent_at` (timestamptz)
- `opened_at` (timestamptz, nullable — set on first pixel load)
- `open_count` (integer — increments on each pixel load)
- `clicked_at` (timestamptz, nullable — set when CTA link is clicked)
- `metadata` (jsonb)

**New edge function: `track-email-open`**
- Receives `?id=tracking_id` query param
- Updates `opened_at` (if first open) and increments `open_count`
- Returns a 1x1 transparent GIF
- No auth required (must work from email clients)

**Click tracking:**
- CTA links in emails go through a redirect edge function: `track-email-click?id=xxx&redirect=https://...`
- Logs the click, then 302 redirects to the actual destination

**New edge function: `track-email-click`**
- Logs click event, redirects user to actual URL

**Admin visibility:**
- New sub-tab or section in Super Admin showing email open rates, click rates, per-user verification status

---

### Files to create/edit

| File | Action |
|------|--------|
| Migration | `email_verifications` + `email_tracking_events` tables |
| `supabase/functions/send-verification-email/index.ts` | New — sends verification email with token + pixel |
| `supabase/functions/verify-email-token/index.ts` | New — handles verification link clicks + unsuspend |
| `supabase/functions/track-email-open/index.ts` | New — pixel tracking endpoint |
| `supabase/functions/track-email-click/index.ts` | New — click tracking redirect |
| `src/pages/VerifyEmail.tsx` | New — landing page for verification link |
| Onboarding component | Add verification reminder |
| Auth email templates (if scaffolded) | Inject pixel into all templates |
| pg_cron SQL | 48h auto-suspend job |

### What this achieves
- Seamless signup (autoconfirm stays)
- Real email verification with teeth (48h deadline)
- Self-service reactivation (no admin intervention needed)
- Full email analytics: who opened, who clicked, who ignored
- Admin dashboard visibility into verification + engagement rates
