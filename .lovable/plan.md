

# Profile Dashboard Upgrade, Registration Code Display, SOL Payment Polish & Email Template System

## What You Identified (and You're Right)

1. **Registration code is missing from the profile modal** -- `TelegramLinkCode.tsx` exists as a standalone component but is NOT included in the `UserIdentityBadge` popover. Users only see it on the Telegram Bot tab. No way to retrieve it from the profile.

2. **The popover is too small** for everything it now needs to hold: display name, secondary email, OAuth unlinking, 2FA, registration code, SOL wallet/payment history. It needs to become a proper profile page/dialog.

3. **SOL payment receipt email** is missing -- after `/payment verify` confirms payment, no confirmation email is sent.

4. **`/payment` not in all help menus** -- it's in the holdersintel bot help but needs to also be mentioned on the website pricing sections.

5. **TierCards missing SOL payment callout** -- the yearly toggle area has no mention of the Telegram SOL alternative.

6. **Email templates are hardcoded** across ~6 edge functions with inline HTML. No admin-editable template system exists.

## Plan

### 1. Profile Page (replace popover with full dialog/page)
- Convert `UserIdentityBadge` gear icon to open a **Sheet** (slide-out panel) or **Dialog** instead of a tiny popover
- Sections inside:
  - **Identity**: Display name, primary email, secondary email setup
  - **Registration Code**: Embed `TelegramLinkCode` (compact mode) so users can always find their code
  - **Linked Accounts**: OAuth providers (X, Google, Discord, GitHub) with unlink buttons
  - **Security**: 2FA (TOTP) status + setup link
  - **SOL Subscriptions**: Show active SOL subscription status, payment wallet, solscan.io link to transaction, expiry date (queried from `tg_sol_subscriptions`)
  - **Sign Out** button at bottom
- Files: Edit `src/components/layout/UserIdentityBadge.tsx`, create `src/components/profile/ProfilePanel.tsx`

### 2. SOL Payment Receipt Email
- After `/payment verify` confirms payment in `holdersintel-bot-webhook`, invoke `subscriber-welcome` (or a new email type `sol_payment_confirmed`) with amount, wallet address, solscan link, and expiry date
- Add a `sol_payment_confirmed` case to `subscriber-welcome/index.ts` with a branded receipt template
- Files: Edit `supabase/functions/holdersintel-bot-webhook/index.ts`, edit `supabase/functions/subscriber-welcome/index.ts`

### 3. SOL Payment Option on TierCards
- Below the yearly toggle (or within the Pro/X Pro card when yearly is selected), add a highlighted callout:
  "Pay with Solana via Telegram -- 1 SOL/year (~$84). Use `/payment` in @BlackBoxFarmBot DM"
- Small SOL icon + link to the bot
- Files: Edit `src/components/premium/TierCards.tsx`

### 4. Email Template Admin System (Email Campaigns Tab)
- The `EmailCampaignsManager.tsx` already exists for marketing campaigns. Add a **second sub-tab: "Email Templates"**
- Inventory all hardcoded email templates across edge functions:
  - `subscriber-welcome`: welcome, renewal, cancellation, new_user_welcome
  - `send-verification-email`: email verification
  - `send-notification`: general notifications
  - `send-email-notification`: trading alerts
  - `send-ai-analysis-email`: AI analysis delivery
  - `signup-notify`: admin new-user notification
- Create a new DB table `email_templates` with columns: `template_key` (e.g. 'subscriber_welcome'), `subject`, `html_body`, `is_active`, `updated_at`
- Seed with current hardcoded HTML extracted from each edge function
- Admin UI: dropdown to select template, edit subject + body (preserving HTML skin/wrapper), preview button
- Edge functions updated to check `email_templates` table first; fall back to hardcoded if no custom template exists
- Files: New migration, new `src/components/admin/EmailTemplateEditor.tsx`, edit `EmailCampaignsManager.tsx` to add sub-tabs, edit each email edge function to query templates table

### 5. /payment in Help & Website
- Verify `/payment` is in all bot help text (already in holdersintel help -- confirm telegram-bot-webhook too)
- Add `/payment` mention to website's Telegram Bot tab documentation section
- Files: Check/edit `supabase/functions/telegram-bot-webhook/index.ts`, edit relevant website components

## Files Summary
- **Edit**: `UserIdentityBadge.tsx`, `TierCards.tsx`, `holdersintel-bot-webhook/index.ts`, `subscriber-welcome/index.ts`, `EmailCampaignsManager.tsx`
- **Create**: `ProfilePanel.tsx`, `EmailTemplateEditor.tsx`
- **Migration**: `email_templates` table with seed data
- **Check/Edit**: `telegram-bot-webhook/index.ts` for `/payment` help text

