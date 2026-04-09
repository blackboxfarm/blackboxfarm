

# Audit & Feature Plan: Link Hardening, Email System, Profile Recovery, and 2FA

## 1. Registration Code / TG Account Hard-Linking — Audit & Fix

**Current state:**
- `telegram_link_codes` has a UNIQUE constraint on `user_id` (1 web account = 1 link code). Good.
- `telegram_user_id` has an index but **NO unique constraint** — meaning technically the same TG account could be linked to multiple web accounts. This is a gap.
- No current duplicates exist (checked — 0 dupes), but nothing prevents it.

**Fix needed:**
- Add a `UNIQUE` constraint on `telegram_user_id` (where not null) via migration.
- Add a check in both bot webhooks (`holdersintel-bot-webhook`, `telegram-bot-webhook`) to reject `/link` if the TG user is already linked to another account — return a clear error message.

---

## 2. Wiring Check — Today's Features

All features from today are wired and present:
- **Unified Chat History** table exists in DB, types generated, referenced in `AIComputeTab`.
- **Buyer Intent Signals** table exists, `refresh_buyer_intent_signals()` RPC works, integrated into Account Management (badge + column + filter) and Morning Report (`WindowShoppersSection`).
- **AI Compute tab** exists under AI Config.
- **Stripe yearly prices** created and mapped in `stripeTiers.ts`, toggle in `TierCards.tsx`.

No gaps detected in today's work.

---

## 3. Email Templates & Marketing Funnel System

**Current state:**
- No `auth-email-hook` or email templates scaffolded yet.
- Email Tracking Dashboard exists (open/click tracking) under Holders Intel tab.
- No marketing funnel system or unsubscribe management exists.
- `buyer_intent_signals` has `nurture_email_sent` flag (foundation laid but no email system behind it).

**Plan:**

### 3a. Email Template System
- Scaffold auth email templates using Lovable's built-in system (branded password reset, verification, magic link emails).
- This requires setting up an email domain first via the Cloud email setup dialog.

### 3b. Marketing Funnel & Drip System
- New DB table: `marketing_email_campaigns` — stores campaign templates (curious_reserved, abandoned_cart, win-back, etc.)
- New DB table: `marketing_email_queue` — scheduled sends with `sent_at`, `opened_at`, `clicked_at` tracking
- Categories: "Marketing" (opt-out-able) vs "Transactional/Support" (always delivered)
- Admin UI: "Email Campaigns" tab to create/manage/preview drip sequences

### 3c. Unsubscribe System
- New DB table: `email_preferences` — per-user opt-in/opt-out by category (marketing, product_updates, weekly_digest)
- Unsubscribe link in all marketing emails → hits `handle-email-unsubscribe` edge function
- Unsubscribe page at `/unsubscribe?token=...` — lets users toggle categories
- Support/auth emails are never opt-out-able
- Admin dashboard shows unsubscribe rates

---

## 4. Secondary Email + OAuth Unlinking + Profile Recovery

**Current state:**
- No `secondary_email` column on profiles.
- No OAuth unlinking UI or logic.
- The profile modal (screenshot) only shows display name + sign out.

**Plan:**

### 4a. Secondary Email Address
- Add `secondary_email` and `secondary_email_verified` columns to `profiles`.
- In the profile popover/settings: field to add secondary email, triggers verification email.
- New edge function `verify-secondary-email` to confirm the secondary address.
- Account Management dashboard updated to show secondary email.

### 4b. OAuth Provider Unlinking
- Add UI in profile settings showing linked providers (X, Google, Discord, GitHub).
- "Unlink" button per provider — but only if the user has at least one other auth method (email+password or another provider).
- Uses Supabase's `unlinkIdentity()` API.
- For suspended X accounts: user can unlink X, then set a password or link another provider to maintain access.

### 4c. Login Method Flexibility
- If a user signed up via OAuth only (no password), allow them to "Set Password" via the profile modal — this calls `supabase.auth.updateUser({ password })`.
- Once password is set, they can unlink OAuth providers if desired.
- Both primary and verified secondary email can be used for password login.

---

## 5. Two-Factor Authentication (2FA) Assessment

**Current state:**
- `TwoFactorSetup.tsx` and `TwoFactorSettings.tsx` exist with a phone verification + TOTP flow.
- Edge functions exist: `setup-totp`, `verify-2fa-login`, `enable-2fa`, `check-2fa-requirement`, `verify-phone`, `get-trusted-devices`, `remove-trusted-device`, `remove-all-trusted-devices`.
- `profiles` has `two_factor_enabled` and `two_factor_secret` columns.
- The TOTP flow (Google Authenticator style) is already scaffolded.

### Google Authenticator-style TOTP 2FA
**Complexity: Medium — mostly already built.** The edge functions and UI components exist. What's needed:
- Verify the `setup-totp` function actually generates valid TOTP secrets (using a library like `otpauth`).
- Wire the `verify-2fa-login` function into the auth flow so it intercepts login and requires the TOTP code.
- Add 2FA settings section to the profile modal or a dedicated security settings page.
- No special external service needed — TOTP is pure cryptographic, runs server-side.

### SMS-based 2FA
**Complexity: Higher — requires external service.**
- Supabase Auth has built-in phone auth support, BUT it requires a Twilio account (or MessageBird/Vonage).
- You'd need: Twilio account → configure in Supabase Dashboard (Auth → Phone Provider) → set Twilio SID, Auth Token, Messaging Service SID.
- Cost: ~$0.0075/SMS in US, varies by country.
- Alternative: Use the existing TOTP approach (free, no external service) and offer SMS as a premium option later.

### Recommendation
- **Phase 1 (now):** Finish wiring the existing TOTP/Google Authenticator 2FA — it's 80% built, no external services needed.
- **Phase 2 (later):** Add SMS 2FA via Twilio if user demand warrants it. Requires Twilio account setup and ongoing per-SMS costs.

---

## Implementation Priority

1. **Link hardening** — unique constraint on `telegram_user_id` (quick migration)
2. **Secondary email + OAuth unlinking** — profile modal enhancements
3. **TOTP 2FA completion** — wire existing components into auth flow
4. **Email domain setup** — prerequisite for templates
5. **Marketing funnel + unsubscribe system** — new tables, admin UI, edge functions

## Files to Create/Edit

- New migration: unique constraint on `telegram_link_codes.telegram_user_id`
- New migration: `secondary_email`, `secondary_email_verified` on `profiles`; `email_preferences` table; `marketing_email_campaigns` + `marketing_email_queue` tables
- Edit: `supabase/functions/holdersintel-bot-webhook/index.ts` — reject duplicate TG links
- Edit: `supabase/functions/telegram-bot-webhook/index.ts` — reject duplicate TG links
- Edit: `src/components/layout/UserIdentityBadge.tsx` — expand profile modal with secondary email, linked providers, 2FA toggle, unlink buttons
- New: `src/components/auth/UnlinkProvider.tsx`
- New: `src/components/profile/SecondaryEmailSetup.tsx`
- New: `src/pages/Unsubscribe.tsx`
- New: `src/components/admin/EmailCampaignsManager.tsx`
- New: `supabase/functions/verify-secondary-email/index.ts`
- New: `supabase/functions/handle-email-unsubscribe/index.ts`
- Edit: `src/components/admin/AccountManagementDashboard.tsx` — show secondary email column
- Edit: Auth flow to intercept for 2FA verification

