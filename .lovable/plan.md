## Goal

Build a per-profile-bot CRM table: every Telegram user who has ever DM'd one of our subscription bots, with full attribution + lifecycle + referral history. This becomes the audience pool for future broadcast/marketing posts.

## Why a new table

`telegram_bot_interactions` is the main HoldersIntel bot's command log (event stream, no per-user state). The subscription bots (`profile-subscription-bot-webhook`) are a separate system per profile. We need a **per-profile contact list** that rolls up everything we know into one row per `(profile_key, telegram_user_id)`.

## Schema

One new table `profile_bot_contacts` plus an append-only `profile_bot_contact_events` for the timeline.

```text
profile_bot_contacts                       -- one row per (profile, tg user)
  id, profile_key, telegram_user_id (UNIQUE with profile_key)
  telegram_username, first_name, last_name, language_code
  first_seen_at, last_seen_at, total_dms

  -- attribution
  acquisition_source        -- 'organic' | 'referral' | 'unknown'
  first_referrer_code       -- code they originally arrived with (if any)
  first_referrer_tg_id      -- referrer's telegram user id (if any)
  last_referrer_code        -- most recent code they tapped
  utm_payload               -- raw /start payload (for future deeplink params)

  -- subscription lifecycle (denormalized rollup)
  ever_paid               BOOLEAN
  is_currently_paid       BOOLEAN
  total_subscriptions     INT
  total_months_paid       INT
  total_sol_paid          NUMERIC
  current_expires_at      TIMESTAMPTZ
  last_paid_at            TIMESTAMPTZ
  first_paid_at           TIMESTAMPTZ

  -- referrer activity (this user as a referrer)
  has_referral_code       BOOLEAN
  referral_code           TEXT
  referral_code_status    TEXT          -- 'active'|'inactive'|null
  referrals_attributed    INT           -- friends who tapped their link
  referrals_converted     INT           -- friends who paid
  referrals_pending       INT
  referral_months_earned  INT

  -- comms preferences
  opted_out_broadcasts    BOOLEAN DEFAULT false
  last_broadcast_at       TIMESTAMPTZ

  created_at, updated_at

profile_bot_contact_events                 -- append-only timeline
  id, profile_key, telegram_user_id
  event_type   -- 'first_dm' | 'command' | 'ref_link_tapped' | 'quote_issued'
               -- | 'paid' | 'expired' | 'renewed' | 'referred_friend_paid'
               -- | 'broadcast_sent' | 'opted_out'
  payload      JSONB    -- command name, ref code, sub_id, msg_id, etc.
  created_at
```

Both tables RLS-locked to service_role + super_admin select.

## Wiring (3 touch points)

**1. `profile-subscription-bot-webhook`** — on every incoming `message` or `callback_query`:
   - upsert the contact row (insert if new with `acquisition_source='organic'`, update `last_seen_at`, increment `total_dms`, refresh username/first_name/last_name)
   - if `/start ref_XXXXXX`: set `last_referrer_code`, set `first_referrer_code` only if null, set `acquisition_source='referral'` if it was 'organic' AND this is the very first interaction; log `ref_link_tapped` event
   - log `command` event for `/start /buy /renew /status /help`
   - log `quote_issued` event when a buy button is tapped

**2. `profile-subscription-poll`** — when a subscription flips to `paid`:
   - update contact: `ever_paid=true`, `is_currently_paid=true`, increment `total_subscriptions`, add `tier_months` to `total_months_paid`, add `quoted_sol` to `total_sol_paid`, set `first_paid_at`/`last_paid_at`/`current_expires_at`
   - log `paid` event with sub_id
   - if attribution was applied → on the **referrer's** contact row, increment `referrals_converted` + `referral_months_earned`, log `referred_friend_paid` event

**3. `profile-affiliate-tick` (existing hourly cron)** — extend to also recompute rollups:
   - `is_currently_paid` based on `now() < current_expires_at`
   - `referral_code` / `referral_code_status` / `referrals_attributed` / `referrals_pending` from the referral tables
   - covers self-healing for any drift

## Backfill (one-shot)

A new edge function `profile-bot-contacts-backfill` runs once to populate from existing data:
- Seed contacts from `profile_subscriptions` (every distinct `telegram_user_id` per profile) → these are guaranteed paid users
- Seed contacts from `referral_codes` (every referrer)
- Seed contacts from `referral_attributions` (every referred user)
- Roll up totals from `profile_subscriptions` and `referral_credits`
- This will NOT recover historical lurkers who DM'd before the table existed (Telegram doesn't expose that retroactively); the table grows organically from this point forward for those.

## Super-admin surface

Extend `profile-subscription-admin` with two new actions:
- `contacts_list` → paginated, filterable (paid/unpaid, referrer-only, source, search by username) — feeds a table UI
- `contacts_broadcast` → send a message to a filtered segment via the profile's bot, with per-recipient rate limiting (Telegram caps ~30 msgs/sec to different users), records `broadcast_sent` events + bumps `last_broadcast_at`, honors `opted_out_broadcasts`

A new `/stop` command on the bot flips `opted_out_broadcasts=true` and logs the event (CAN-SPAM-style hygiene).

## Out of scope (this round)

- Frontend super-admin UI for browsing/broadcasting — can ship after the data layer is verified. I'll add the JSON endpoints now; we wire a panel in a follow-up.
- Cross-profile dedupe — contacts are scoped per `profile_key` on purpose (each bot is its own audience).
- Drip campaigns / scheduling — single-shot broadcasts only for v1.

## Open question

For the broadcast action: do you want a **dry-run first** (returns recipient count + sample message, requires a second call with `confirm: true` to actually send), or send immediately? I'd recommend dry-run-by-default so we don't fat-finger a 5000-user blast.
