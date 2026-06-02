## Goal
Eliminate the manual setup steps for per-profile subscription bots. Make the Bot & Channel tab fully self-serve: set the bot-token secret, schedule/pause the two crons, and register the Telegram webhook — all from the UI, reusable for any future profile.

## 1. Bot token secret input (with status)

In `SubscriptionAdminPanel.tsx` (Bot & Channel sub-tab), upgrade the existing "Bot token secret name" field into a managed secret control:

- Shows current secret name (editable text, e.g. `NO_LUBE_BOT_TELEGRAM_API_KEY`)
- Status pill next to it:
  - ✅ green check "Stored" if secret exists
  - ⚠️ amber "Not set" if missing
- Two buttons: **Set / Update token** (opens a password input + Save) and **Test** (calls Telegram `getMe` to verify the token actually works)
- Saves token via a new edge function `profile-subscription-set-bot-secret` that uses the Supabase Management API to write the secret under the chosen name
- Re-checks status after save

A small edge function `profile-subscription-secret-status` returns `{ exists: boolean, valid?: boolean, bot_username?: string }` so the UI can render the green check + bot identity confirmation.

## 2. Cron management (no SQL editor needed)

New "Automation" card in the Bot & Channel sub-tab with two rows:

| Cron | Schedule | Status | Toggle |
|---|---|---|---|
| Payment poller | every 1 min | active/paused | switch |
| Renewal nudger | every 10 min | active/paused | switch |

Backed by a new edge function `profile-subscription-cron-admin` with actions:
- `status` — `SELECT jobname, active FROM cron.job WHERE jobname IN (...)`
- `install` — runs `cron.schedule(...)` with the correct project URL + anon key for both jobs (idempotent: `cron.unschedule` first if exists)
- `pause` / `resume` — `UPDATE cron.job SET active = false/true WHERE jobname = ...`

On first load, if jobs don't exist the UI shows a single **"Install crons"** button that runs `install` for both. After that, two toggles control pause/resume. No SQL editor instructions remain in the panel.

(Requires `pg_cron` + `pg_net` extensions — migration enables them if not already on.)

## 3. Telegram webhook registration

New edge function `profile-subscription-register-webhook`:
- Loads the bot token from the configured secret name
- Computes the SHA-256 `secret_token` the existing `profile-subscription-bot-webhook` already validates
- Calls Telegram `setWebhook` with the deployed function URL + `secret_token` + `allowed_updates`
- Returns `getWebhookInfo` for confirmation

UI: a "Webhook" row showing current status (URL, last error, pending updates) and a **Register / Re-register webhook** button.

## 4. "Setup wizard" for new profiles

Add a **"⚡ Run setup"** button at the top of the Bot & Channel sub-tab that runs, in order:
1. Verify config saved (bot username, channel chat_id, secret name)
2. Check bot token secret → prompt to set if missing
3. Test token via `getMe`
4. Install both crons (idempotent)
5. Register webhook
6. Send a self-test DM to the configured admin Telegram ID (optional field) confirming "Bot is live"

Each step shows ✅/❌ inline so creating a new profile becomes a 1-click bring-up after the basic fields are filled in.

## Files

**New edge functions**
- `supabase/functions/profile-subscription-secret-status/index.ts`
- `supabase/functions/profile-subscription-set-bot-secret/index.ts`
- `supabase/functions/profile-subscription-cron-admin/index.ts`
- `supabase/functions/profile-subscription-register-webhook/index.ts`

**Modified**
- `src/components/social/subscriptions/SubscriptionAdminPanel.tsx` — new Secret control, Automation card, Webhook card, Run setup button
- `supabase/config.toml` — register the 4 new functions (with `verify_jwt = true`, admin-only)

**Migration**
- Enable `pg_cron` + `pg_net` extensions if not enabled
- Optional: add `admin_telegram_id` column to `profile_subscription_configs` for the setup self-test DM

## Required from you (one-time only)
- Approve a **Supabase Management API token** secret (`SUPABASE_MANAGEMENT_API_TOKEN`) so the edge function can write project secrets on your behalf. Without it, the "Set token" button can't store secrets server-side and you'd still have to paste tokens in the Lovable secrets UI. If you'd rather skip this, I'll fall back to the current flow (prompt opens the Lovable Add Secret modal) but still automate crons + webhook.

## Open questions
1. OK to add the Supabase Management API token secret so the "Set token" button works end-to-end? (Yes = fully automated; No = secret still set via Lovable modal, everything else automated.)
2. Want the optional `admin_telegram_id` for the setup self-test DM, or skip the self-test?
