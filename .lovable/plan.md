

## Plan: SMS Alerts, Subscription Notifications, and Announcement UI Upgrade

### 1. SMS Alert on assertDbWrite Failure

**What:** When any Edge Function DB write fails via `assertDbWrite`, immediately send an SMS to 1-226-583-5975 with maximum detail about the failure.

**How:**
- Modify `supabase/functions/_shared/db-assert.ts` to add an `sendFailureSms` function that calls the Twilio gateway (using existing `LOVABLE_API_KEY` + `TWILIO_API_KEY` secrets and `TWILIO_FROM = +16624814161`)
- In `assertDbWrite`, before throwing, call `sendFailureSms` with table name, operation, error message, error code, and details — packed into the max SMS character limit (1600 chars)
- The SMS is fire-and-forget (wrapped in try/catch so it never blocks/breaks the throw chain)
- Hardcode the phone number `+12265835975` in the utility

### 2. SMS Notification on New Subscription Purchase

**What:** Send an SMS to the same number whenever a new subscription is purchased via Stripe or Solana wallet.

**How:**
- **Stripe:** In `supabase/functions/stripe-webhook/index.ts`, after the admin notification insert (around line 176), add a Twilio SMS call when `event.type === "customer.subscription.created"`. Message includes customer name/email, tier, amount.
- **Solana:** In `supabase/functions/tg-subscription-payment/index.ts`, after a payment is confirmed/activated, add a similar Twilio SMS call. Message includes telegram user ID, amount SOL, subscription details.
- Both use the same Twilio gateway pattern already established in `security-sms-alert`.

### 3. Announcement UI: Multi-select Checkboxes + History Tab

**What:** Replace the tab-based audience selector with checkboxes so you can select multiple groups (or "ALL") and send one message to all of them. Add a History tab showing past broadcasts.

**How:**

**UI Changes** (`src/components/admin/telegram/TelegramAnnouncementBox.tsx`):
- Replace `Tabs` with a checkbox grid: "ALL" checkbox + individual checkboxes for All Registered, Subscribers, Free Users, Unregistered
- "ALL" toggles all on/off
- Single message textarea, single send button
- When sending, pass `audiences: string[]` (array of selected groups) instead of single `audience`

**Backend** (`supabase/functions/telegram-announcement-broadcast/index.ts`):
- Accept `audiences` as an array (backward-compat: also accept `audience` as string)
- Loop through each selected audience, collect targets (deduplicated), broadcast once
- After broadcast, log to a new `telegram_announcement_log` table

**Database Migration:**
- Create `telegram_announcement_log` table: `id`, `message_text`, `audiences` (text[]), `sent_count`, `failed_count`, `sent_by` (uuid), `created_at`

**History Tab:**
- Add a Tabs wrapper in the component: "Compose" | "History"
- History tab queries `telegram_announcement_log` ordered by `created_at desc`, displays message preview, audiences badges, sent/failed counts, and date

### Technical Details

- All SMS calls use the Twilio connector gateway (`https://connector-gateway.lovable.dev/twilio/Messages.json`) with `LOVABLE_API_KEY` and `TWILIO_API_KEY` headers
- Phone number for admin SMS: `+12265835975`
- Twilio FROM: `+16624814161` (already used across the project)
- New table `telegram_announcement_log` with RLS policy for super admins only
- Deploy: `db-assert` changes propagate to all functions on next deploy; explicitly deploy `stripe-webhook` and `tg-subscription-payment`

