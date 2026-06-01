
# Per-Profile Subscription Bot — No Lube (and future profiles)

A reusable subscription engine attached to **profiles** (No Lube today, more later). Each profile owns its own Telegram bot, private channel, pricing tiers, multi-currency display, per-user one-time payment wallets, auto add/remove from the private channel, and renewal reminders.

## What we're building

1. A new **💳 Subscriptions** sub-tab inside the No Lube profile UI (and pluggable into any future profile tab) for:
   - Bot identity (token + private channel chat_id + greeting copy)
   - Pricing tiers (1m / 3m / 6m / 12m) — each with descending per-month price
   - Base currency (USD or LIRA or BRL etc.) — display-only fiat shown alongside live SOL
   - Display fiat list (UK GBP, TR TRY, BR BRL, MX MXN, EUR …) auto-converted from base
   - Central sweep wallet (admin-generated or pasted), with one-click reveal of private key for fund-moving / burning
2. A **subscriber DM flow** the bot drives (`/buy`, `/renew`, `/status`):
   - User picks a tier → system generates a brand-new SOL wallet, encrypts the secret in DB, shows: SOL amount (copy-only), fiat equivalent in user's language/country, Solscan link to the wallet, and a 30-min countdown.
   - On-chain poller detects payment → grants access → invites user to the private channel → records `paid_at` + computes `expires_at` per tier.
3. A **renewal cadence**: T-3d, T-24h, T-3h positive nudges; on expiry → remove from private channel → send "Renew now" prompt that restarts the buy flow.
4. A **Subscribers tab** with: TG handle, tier, paid_at, expires_at, next-renewal forecast, lifetime SOL, status (active / grace / expired), quick actions (kick, comp +Xd, ban).
5. A **Treasury tab** showing per-profile sweep wallet, balance, sweep history, and one-click sweep-to-sink.

## UX flow (subscriber side, in Telegram DM)

```text
User → /buy
Bot  → Pick your plan:
       [1 mo  — $10 / ≈0.040 SOL / ₺345]
       [3 mo  — $27 / ≈0.108 SOL / ₺931]   save 10%
       [6 mo  — $48 / ≈0.192 SOL / ₺1,656]  save 20%
       [12 mo — $84 / ≈0.336 SOL / ₺2,898]  save 30%
User → taps 3 mo
Bot  → Send exactly ◆ 0.108 SOL  (copy)
       to wallet: 7xK…q9R          (copy)
       Solscan:   solscan.io/account/7xK…q9R
       USD: $27   TRY: ₺931   EUR: €25   BRL: R$135
       I'll auto-add you to the channel once it lands.
       Window: 30:00 ⏳
[payment lands]
Bot  → ✅ Payment received. You're in until 1 Sep 2026.
       Invite: t.me/+abc…
       (saved your renewal date; I'll ping you 3 days before)
```

## Admin UI (No Lube → 💳 Subscriptions sub-tab)

Four mini-tabs inside:
- **Bot & Channel** — bot token, channel chat_id, welcome copy, "Test send"
- **Pricing** — base currency, per-tier price + discount auto-calc, display currencies (multi-select), live SOL preview using current rate
- **Subscribers** — table (search by @handle / TG ID), per-row actions
- **Treasury** — central sweep wallet, balance, "Generate", "Reveal key", sweep history

## Renewal cadence

Edge function `subscription-renewal-tick` (cron every 10 min):
- Finds subs where `expires_at` ∈ (now+2.9d…now+3.1d), (now+23h…now+25h), (now+2.9h…now+3.1h) → sends positive nudge via the profile's bot.
- Finds subs where `expires_at < now` and `removed_at IS NULL` → kicks from channel, marks `status='expired'`, DMs "Renew now" button.
- Deduped by `subscription_reminder_log(subscription_id, kind)` so each nudge fires once.

## Pricing math

- Admin sets `price_fiat` + `base_currency` per tier.
- Display fiats convert at request time from a daily ECB/Frankfurter rate cache (`fx_rates_daily`).
- SOL amount = `price_fiat_usd / sol_price_usd_now` (uses existing 5-min SOL price guard — never stale > 5m, per project rule).
- Only SOL is the payment unit; all fiat is display-only.

## Technical Section

### Database (new tables, all under `public`, RLS = super-admin manage + owner-self-read)

- `profile_subscription_configs` — one row per profile (`profile_key text PK` e.g. `no_lube`), columns: `bot_telegram_api_key_secret_name`, `private_chat_id`, `welcome_copy`, `base_currency`, `display_currencies text[]`, `central_wallet_pubkey`, `central_wallet_secret_encrypted`, `is_active`.
- `profile_subscription_tiers` — `(profile_key, tier_months int)` PK, `price_fiat numeric`, `discount_pct numeric`, `sort_order`, `is_active`.
- `profile_subscriptions` — extends/replaces `tg_sol_subscriptions` with `profile_key`, `telegram_user_id`, `telegram_username`, `language`, `country`, `tier_months`, `price_fiat`, `base_currency`, `quoted_sol`, `sol_price_at_order`, `payment_wallet_pubkey`, `payment_wallet_secret_encrypted`, `status` (`pending|paid|expired|kicked|swept`), `paid_at`, `expires_at`, `sweep_tx_signature`, `swept_at`, `tx_signature` (incoming).
- `subscription_reminder_log` — `(subscription_id, kind text)` PK, `sent_at`. Kinds: `t_3d`, `t_24h`, `t_3h`, `expired`.
- `fx_rates_daily` — `(date, base, quote)` PK, `rate numeric` — fetched daily from Frankfurter.
- All wallet secrets encrypted with the same server-side AES-256-GCM helper already in use; never stored raw and never sent to client.

### Edge functions (new)

- `profile-subscription-quote` — given `{profile_key, tier_months, user_lang}` returns SOL amount, all display fiats, generated payment wallet (created on demand), Solscan URL, expiry of the 30-min window.
- `profile-subscription-poll` — every 1 min cron, scans `status='pending'` wallets via Helius RPC for incoming SOL ≥ `quoted_sol`. On match → set `paid_at`, compute `expires_at = paid_at + tier_months`, call profile bot to invite user to private channel, set `status='paid'`, queue welcome DM.
- `profile-subscription-renewal-tick` — every 10 min cron, fires reminders + kicks expired members + sends "Renew now" DMs.
- `profile-subscription-sweep` — admin-triggered, sweeps a paid wallet into the profile's central wallet, records `sweep_tx_signature`.
- `profile-subscription-bot-webhook` — per-profile Telegram webhook; handles `/buy`, `/renew`, `/status`, tier inline buttons. Uses the Telegram connector gateway pattern, derives `secret_token = SHA-256("subscription-webhook:" + TELEGRAM_API_KEY)` per profile.

### Currency conversion

- Daily cron `fx-rates-refresh` hits `https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,TRY,BRL,MXN,…` and upserts `fx_rates_daily`. No external paid keys needed.
- SOL price comes from the existing SOL price hook/edge function — must respect the 5-min staleness guard already in project memory.

### Frontend (admin)

- New component `src/components/social/subscriptions/SubscriptionAdminPanel.tsx` mounted inside `NoLubeChannelPanel` (or new sibling tab) under a `💳 Subscriptions` `TabsTrigger`.
- Reusable: takes `profile_key` prop so the same panel powers future profiles.
- Sub-components: `BotChannelSettings`, `PricingTierEditor`, `SubscribersTable`, `TreasuryPanel`.
- All writes go through edge functions or `supabase.from(...).update(...)` guarded by super-admin RLS.

### Telegram bot

- One bot per profile. The bot token is stored as a per-profile secret (e.g. `NO_LUBE_BOT_TELEGRAM_API_KEY`) — admin pastes it once; we never expose it to the client.
- Channel add/remove uses `inviteLink` (single-use, member-limit 1) for adds and `banChatMember` + `unbanChatMember` for soft-kick on expiry.
- All bot calls go through the existing Telegram connector gateway pattern.
- Telegram formatting follows the project's Thin Formatting Protocol (no `$` next to tickers, etc.).

### Security & invariants

- Wallet private keys: AES-256-GCM, server-only; reveal only via super-admin edge function returning a short-lived blob.
- Every DB write goes through `assertDbWrite` from `_shared/db-assert.ts` (zero-tolerance silent-fail rule).
- SOL price never hard-coded; always live + 5-min guard.
- Fail-open on bot errors: a Telegram API hiccup must not block a paid invite — we retry, but never void a confirmed on-chain payment.
- Solscan link format: `https://solscan.io/account/<pubkey>` for wallets, `https://solscan.io/tx/<sig>` for payment confirmations in DMs.
- Account-linking integrity: enforce UNIQUE `(profile_key, telegram_user_id)` on active subs so one TG account = one active sub per profile.

## Out of scope (this plan)

- Stripe / card payments — SOL-only as requested.
- Auto-burn of swept funds (we keep keys + a manual sweep button; burn UI comes later).
- Public landing page for the bot — admin/DM-driven for v1.
