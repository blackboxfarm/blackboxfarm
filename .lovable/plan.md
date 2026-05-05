## Goals

Address each of the 6 items raised, then wire a checkout telemetry view inside the existing **👥 Accounts** admin tab.

---

### 1. Stripe opening in a new tab → switch to same-tab redirect

`src/components/premium/PricingTable.tsx` (lines 119 + 171) currently does `window.open(data.url, '_blank')`. Mobile Safari + popup blockers kill this silently and the user never reaches Stripe.

**Fix:** replace with `window.location.assign(data.url)` for the checkout flow (same tab — Stripe handles return URL). Keep `_blank` only for `customer-portal` (manage subscription) since the user is already logged in mid-session and shouldn't lose state.

### 2. Success URL mismatch

`create-checkout` redirects to `/onboarding?success=true`, but `Pricing.tsx` also has a `success=true` toast handler that never fires (user lands on /onboarding, not /pricing). `Onboarding.tsx` already handles success correctly (toast + checkSubscription + navigate to /dashboard).

**Fix:** Remove the redundant success/canceled handler from `Pricing.tsx` (it's dead code). Onboarding.tsx remains the single source of truth for post-checkout handling. No behavior change for users — just removes a misleading code path.

### 3. AuthModal default tab — anon vs signed-in

In `PricingTable.tsx`, `AuthModal` is hard-coded to `defaultTab="signup"`. That's right for anon (they need an account), but if a user is *signed out mid-session* and clicks Subscribe, signup-first is wrong.

**Fix:** Track whether the email entered exists. Simpler approach: keep `signup` as default for the checkout flow (since !user means they need an account anyway), but add a clear "Already have an account? Sign in" link inside the modal. The modal already has tabs — just verify the user can switch freely. The actual asymmetry is in `AuthButton.tsx` which already passes `signin`/`signup` correctly. So the only fix needed is: when AuthModal is opened from PricingTable for an anon user, default tab should be **`signin`** if they've recently used the app (has a `bbx_last_email` localStorage), otherwise `signup`. Default to `signup` is fine for true anon.

### 4. Make referral source dropdown optional

`AuthModal.tsx` line 119 + 384 + `SecureAuthModal.tsx` lines 161-ish enforce `!referralSource` as a blocker.

**Fix:** Remove `referralSource` from the validation in both files. Update `ReferralSourceSelect.tsx` label to `"How did you hear about us? (optional)"`. Profile update only runs when `refValue` is set, which is already the case.

### 5. Email casing — Stripe customer dedup

`supabase/functions/create-checkout/index.ts` lookups Stripe by raw email. `User@x.com` and `user@x.com` create duplicate Stripe customers.

**Fix:** Normalize with `const normalizedEmail = user.email.toLowerCase().trim();` and use that for both `customers.list({ email })` and `customer_email`. Also normalize in `check-subscription` and `customer-portal` for consistency.

### 6. Email verification — confirm grace period (no signup-time friction)

Per memory `mem://constraints/email-verification-policy`: 7-day grace period, paid/telegram users exempt. Current `Onboarding.tsx` shows a banner saying **"48 hours"** which contradicts memory and adds psychological pressure.

**Fix:**
- Update Onboarding banner copy to **"Verify within 7 days"** (matches policy).
- Confirm `signUp` does NOT block on email confirmation (`AuthContext.signUp` doesn't — Supabase project setting controls auto-confirm; we don't gate UI on it).
- Confirm post-signup the user is dropped straight into the app (current flow already does — `onClose()` after toast). No code change needed to skip verification at signup.
- Add a comment in `AuthContext.signUp` documenting "verification is deferred — do NOT block UX on email_confirmed_at".

I'll also spot-check the `RequireAuth` and `useAuth` hook to make sure nothing currently blocks unverified users from paying. If something does, surface it in implementation.

---

### 7. Checkout telemetry — under Accounts admin tab

Build a sub-section inside `AccountsTab.tsx` (since you said "stick that TAB under Accounts somewhere"). Use existing `checkout_intents` table — `create-checkout` already records `user_id`, `email`, `stripe_session_id`, `price_id`, `status` on every attempt.

**New component:** `src/components/admin/accounts/CheckoutTelemetryPanel.tsx`
- Table view of last 100 `checkout_intents` (newest first)
- Columns: timestamp, email, tier (resolved from price_id via `STRIPE_TIERS`), status (pending/completed/abandoned), session_id (truncated, click to open Stripe dashboard)
- Top-line stats: 24h attempt count, 24h completion rate, 24h abandoned count
- Filter by status

**Integration:** Add it as a section inside `AccountsTab.tsx` (collapsible card or a sub-tab within Accounts).

No DB migration needed — `checkout_intents` already exists. RLS: confirm super-admin SELECT policy exists; if not, add one.

---

## Files to Change

| File | Change |
|---|---|
| `src/components/premium/PricingTable.tsx` | `window.location.assign` instead of `window.open`; smarter default AuthModal tab |
| `src/pages/Pricing.tsx` | Remove dead success/canceled handler |
| `src/components/auth/AuthModal.tsx` | Drop required referral validation |
| `src/components/auth/SecureAuthModal.tsx` | Same |
| `src/components/auth/ReferralSourceSelect.tsx` | Label "(optional)" |
| `supabase/functions/create-checkout/index.ts` | Lowercase email for Stripe lookup |
| `supabase/functions/check-subscription/index.ts` | Same |
| `supabase/functions/customer-portal/index.ts` | Same |
| `src/pages/Onboarding.tsx` | Banner copy: 48h → 7 days |
| `src/contexts/AuthContext.tsx` | Comment documenting deferred verification |
| `src/components/admin/accounts/CheckoutTelemetryPanel.tsx` | NEW — telemetry view |
| `src/components/admin/tabs/AccountsTab.tsx` | Mount the new panel |

Possible migration: super-admin SELECT policy on `checkout_intents` if missing.

OK to proceed?