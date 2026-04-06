

## Two New Features: Referral Source Dropdown + User Journey Tracking

---

### Feature 1: "How did you hear about us?" Dropdown

**What it does**: Adds a required dropdown to the sign-up form (in `AuthModal`) that captures how the user discovered BlackBox Farm. The answer is saved to the existing `referral_source` column on the `profiles` table (already exists, currently unused).

**Dropdown options**:
- Scrolling X / Twitter
- Friend or colleague
- Telegram group or channel
- Facebook
- Instagram
- Threads
- Reddit
- YouTube
- Discord server
- DexScreener / DexTools
- Google search
- Blog or news article
- Podcast
- TikTok
- Other (free-text input appears)

**Implementation**:
1. **`src/components/auth/AuthModal.tsx`** — Add a `<Select>` dropdown below the Confirm Password field in the signup tab. State: `referralSource` + `referralSourceOther`. When "Other" is selected, show a text input. Disable the Create Account button until a selection is made.
2. **`src/contexts/AuthContext.tsx`** — Extend `signUp()` to accept an optional `metadata` parameter. After successful signup, update the user's profile row with the `referral_source` value using `supabase.from('profiles').update({ referral_source }).eq('id', user.id)`.
3. **`src/components/auth/SecureAuthModal.tsx`** — Apply the same dropdown for consistency (this is the alternate auth modal).
4. **Super Admin visibility** — The `AccountManagementDashboard` already queries profiles; add `referral_source` to the displayed columns so you can see how each user found you.

**No migration needed** — the `referral_source` column already exists on `profiles`.

---

### Feature 2: User Journey Tracking System

**What it does**: Creates a lightweight event-stream table that logs every meaningful user action from signup through daily use. This gives you a per-user timeline: what pages they visited, what tokens they analyzed, what features they used, what errors they hit, and in what order.

**New table: `user_journey_events`**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| user_id | uuid FK | References auth.users |
| session_id | text | Browser session grouping |
| event_type | text | Category: `page_view`, `feature_use`, `error`, `action`, `bot_command` |
| event_name | text | Specific event: `visited_dashboard`, `ran_bubblemaps`, `registered_telegram_bot`, `used_bot_command` |
| page_path | text | URL path at time of event |
| metadata | jsonb | Flexible payload (token mint, error message, command name, etc.) |
| created_at | timestamptz | Auto timestamp |
| duration_seconds | integer | Time on page (for page_view events) |

**RLS**: Users can insert their own events. Only admin can read all events.

**Client-side tracking hook: `useJourneyTracker`**:
- Automatically logs `page_view` events on mount (replacing/augmenting the existing `usePageTracking` for authenticated users)
- Exposes `trackEvent(event_name, metadata)` for manual instrumentation
- Captures errors via a global error boundary wrapper
- Automatically includes session_id and user_id

**Instrumentation points** (where `trackEvent` gets called):
- **Signup completed** — event logged with referral_source
- **Onboarding plan selected** — which tier they clicked
- **Dashboard loaded** — first vs returning visit
- **Bubblemaps/Holders analysis run** — token mint, success/failure
- **Telegram bot registered** — from TelegramLinkCode component
- **Social share clicked** — which platform, which article
- **Subscription checkout started/completed** — tier info
- **Error encountered** — any caught error with stack context

**Super Admin "User Journeys" dashboard**:
- New sub-tab under Account Management or a dedicated tab
- Per-user timeline view: select a user, see their chronological event stream
- Summary stats: avg pages per session, most-used features, error rate per user
- Funnel view: signup → onboarding → first analysis → subscription
- Filter by date range, event type, specific user

**Retention policy**: 30-day rolling window (aligns with your 8GB storage constraint). A nightly prune removes events older than 30 days.

---

### Files to create/edit

| File | Action |
|------|--------|
| `src/components/auth/AuthModal.tsx` | Add referral dropdown to signup form |
| `src/components/auth/SecureAuthModal.tsx` | Same dropdown |
| `src/contexts/AuthContext.tsx` | Save referral_source after signup |
| `src/hooks/useJourneyTracker.ts` | New hook for event tracking |
| `src/components/admin/UserJourneyDashboard.tsx` | New admin dashboard component |
| Super Admin page | Add User Journeys tab |
| Migration | Create `user_journey_events` table + RLS + prune function |

### Technical notes

```text
Event flow:
  User action → useJourneyTracker.trackEvent() → INSERT into user_journey_events
  Page navigation → useJourneyTracker auto-logs page_view on mount
  Error caught → error boundary calls trackEvent('error', { message, stack })
  Bot command → telegram webhook already logs to telegram_bot_interactions
    → admin dashboard joins both tables for unified timeline

Existing infrastructure reuse:
  - holders_page_visits: keeps working for anonymous visitor tracking
  - user_journey_events: authenticated user tracking only (richer, per-action)
  - activity_logs: system-level logs (cron, edge functions) — unchanged
  - telegram_bot_interactions: already captured, joined in journey view
```

