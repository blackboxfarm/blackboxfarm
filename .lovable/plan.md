

# Tester/Feedback Program — Promo Code System

## Overview

Build a promotional code system for the `/payment` command that grants time-limited trial subscriptions to invited testers, with a comprehensive feedback collection infrastructure on the website.

## What Gets Built

### A. Promo Code Engine (Telegram + Backend)

**New database tables:**
- `promo_codes` — stores codes like `ARAB10` with: max_uses, current_uses, trial_duration_days (30), tier_granted, label/source tag, active flag
- `promo_redemptions` — tracks who redeemed what: telegram_user_id, user_id, promo_code_id, redeemed_at, expires_at, source_label
- `tester_feedback` — stores quick feedback submissions: user_id, feedback_type (improvement/bug/confusion/removal/general), page_path, message, screenshot_url, created_at
- `tester_questionnaires` — admin-defined questionnaire templates: title, description, questions (JSONB array), target_group, active flag
- `tester_questionnaire_responses` — user responses: questionnaire_id, user_id, answers (JSONB), completed_at

**`/payment ARAB10` flow:**
1. User sends `/payment ARAB10`
2. Bot checks `promo_codes` table for `ARAB10` — validates it exists, is active, and `current_uses < max_uses`
3. If valid: skip SOL wallet generation entirely, immediately grant 30-day Pro, increment `current_uses`, record in `promo_redemptions`
4. If limit reached (e.g., 10/10 used): reply "This invitation code has reached its limit"
5. Bot confirms: "Welcome, tester! You have 30-day Pro access. Visit blackbox.farm to explore all features."

**Edge function changes:**
- `handlePayment()` in the bot webhook: intercept args that don't start with "verify" — check against `promo_codes` table before proceeding to SOL wallet flow
- `tg-subscription-payment`: add promo code handling in the `create` action path

### B. Tester Feedback Widget (Website)

**Floating feedback button** — visible only to users with an active promo redemption:
- Small icon (speech bubble or flag) pinned to screen edge
- Click opens a compact modal with:
  - Category selector: Improvement / Bug / Confusing / Remove This / General
  - Current page auto-detected
  - Free-text field (required)
  - Optional screenshot upload (to Supabase Storage)
  - Submit button
- Non-intrusive, always accessible while browsing

### C. Questionnaire System (Website)

**For testers:**
- A `/feedback` or `/tester` route (accessible only to users with active promo redemptions)
- Lists available questionnaires assigned to their group
- Each questionnaire renders dynamically from JSONB (supports: multiple choice, rating 1-5, free text, yes/no)
- Progress saved, completion tracked

**For admins (Super Admin):**
- New "Testers" tab in Super Admin dashboard
- Sub-sections:
  - **Active Testers**: list of all promo redemptions with user info, source label, days remaining, activity summary
  - **Promo Codes**: create/manage codes (name, max uses, duration, source label)
  - **Feedback Inbox**: all tester feedback with filtering by type, page, user
  - **Questionnaires**: create/edit questionnaires, view response summaries
  - **Activity Log**: aggregated view of tester journey events, TG commands, AI chats, holders lookups, bubblemap usage

### D. Tester Activity Tracking

Testers are already tracked by the existing `user_journey_events` system. Additional tracking:
- Tag tester sessions with `is_tester: true` metadata so they can be filtered in admin views
- Pull their `unified_chat_history` (AI chat), `telegram_bot_interactions` (TG commands), and journey events into a unified tester activity dashboard

## Database Migrations

```text
1. promo_codes table
   - id, code (unique, uppercase), max_uses, current_uses (default 0),
     trial_duration_days, tier_granted, source_label, is_active, created_at

2. promo_redemptions table
   - id, promo_code_id (FK), telegram_user_id, user_id, redeemed_at,
     expires_at, is_active

3. tester_feedback table
   - id, user_id (FK profiles), feedback_type, page_path, message,
     screenshot_url, created_at

4. tester_questionnaires table
   - id, title, description, questions (JSONB), target_promo_code,
     is_active, created_at

5. tester_questionnaire_responses table
   - id, questionnaire_id (FK), user_id (FK), answers (JSONB),
     completed_at

RLS: All tables service_role for writes, authenticated for reads
     (scoped to own user_id for feedback/responses)
```

## Implementation Order

1. Database migrations (5 tables + RLS)
2. Promo code logic in bot webhook `handlePayment()`
3. Promo code management UI in Super Admin
4. Floating feedback widget component (website)
5. Questionnaire renderer + `/tester` page
6. Tester dashboard in Super Admin (activity, feedback inbox, questionnaire results)
7. Seed initial `ARAB10` promo code (max_uses: 10, duration: 30 days, source: "Arabic Channel")

## Technical Notes

- The chat history export (Item 1) will be generated as a separate markdown artifact with diplomatic rewording
- Promo codes are case-insensitive (stored uppercase, input normalized)
- Expired tester subscriptions auto-downgrade via existing tier-check logic
- The feedback widget checks `promo_redemptions` for the current user to determine visibility

