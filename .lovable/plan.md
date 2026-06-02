# Affiliate / Referral System for the Subscription Bot

## Goal

Let any paid subscriber earn free months by referring friends. Each paid friend = +1 month banked, which auto-extends their `expires_at`. Code only works while the referrer is "live" (paid time OR banked affiliate time remaining). Wire it into the existing `profile-subscription-*` flow and seed marketing copy in welcome DMs + channel preamble posts.

## How a user experiences it

1. User pays → already gets the VIP welcome DM (existing). We append:
   - Their personal referral link: `https://t.me/<bot_username>?start=ref_AB12CD`
   - Their code: `AB12CD`
   - One-liner: "Every friend who pays = +1 month free, stacked on top of your current expiry."
2. They share the link on X / TikTok / DM.
3. Friend taps it → Telegram opens the bot with `/start ref_AB12CD`. The bot webhook captures the code, stores a pending attribution for that `telegram_user_id`, and proceeds with the normal quote flow.
4. When that friend pays (`profile-subscription-poll` flips them to `paid`):
   - Look up the pending attribution.
   - Validate referrer code is currently `active`.
   - Insert a `referral_credits` row (+1 month, `status='applied'`).
   - Extend referrer's active subscription `expires_at` by 1 month (or create a `bonus`-source subscription row covering the next month if they're currently expired-but-still-live-via-bank).
   - DM the referrer: "🎉 {friend_handle} just subscribed — +1 month added. New expiry: …"
5. Referral code lifecycle:
   - `active` while `now() < expires_at` OR a future-dated banked credit keeps them live
   - `inactive` once both run out → friend tapping link still works but bot replies "Referral code expired — ask {handle} to renew." and attribution is NOT stored
   - Re-subscribing flips the same code back to `active` (codes are permanent per user)

## Schema changes (one migration)

```text
referral_codes
  id, profile_key, telegram_user_id, code (6-char A-Z0-9, UNIQUE per profile),
  status ('active' | 'inactive'), created_at, last_activated_at, last_deactivated_at
  UNIQUE (profile_key, telegram_user_id)

referral_attributions
  id, profile_key, referrer_code, referrer_telegram_user_id,
  referred_telegram_user_id, status ('pending' | 'converted' | 'expired' | 'rejected'),
  rejection_reason, created_at, converted_at, subscription_id (FK to profile_subscriptions)
  UNIQUE (profile_key, referred_telegram_user_id)  -- one attribution per friend, first wins

referral_credits
  id, profile_key, referrer_telegram_user_id, attribution_id,
  months_granted (int, default 1), applied_to_subscription_id,
  new_expires_at, created_at
```

Add columns to `profile_subscription_configs`:
- `affiliate_enabled BOOLEAN DEFAULT true`
- `affiliate_marketing_copy TEXT` (block appended to paid welcome DM)
- `affiliate_public_preamble TEXT` (rotated into public channel preambles)
- `affiliate_private_preamble TEXT` (rotated into private channel preambles)
- `affiliate_months_per_referral INT DEFAULT 1`

GRANT + RLS to match the rest of `profile_*` tables (service_role only; bot reads via service key).

## Edge function changes

### `profile-subscription-bot-webhook`
- On `/start ref_XXXXXX`:
  - Look up `referral_codes` where `code = upper(XXXXXX)` and `profile_key` matches and `status='active'`.
  - If valid + not the same `telegram_user_id` + no prior attribution for this referred user → upsert `referral_attributions` (`status='pending'`).
  - If self-referral or already-attributed-elsewhere → store `status='rejected'` with reason.
  - If code inactive → DM the friend the "ask them to renew" copy, no attribution.
- Continue normal welcome flow.

### `profile-subscription-poll` (where status flips to `paid`)
- After the existing `paid` update block:
  - Generate / ensure a `referral_codes` row for the new paid user (6-char random A-Z0-9, retry on collision). Mark `active`.
  - Check for a `pending` attribution for `referred_telegram_user_id = sub.telegram_user_id`.
  - If found and referrer code still `active`:
    - Find referrer's currently-live subscription (highest `expires_at`).
    - Bump `expires_at += 1 month`.
    - Insert `referral_credits` row + flip attribution to `converted`.
    - DM referrer (use existing `tgSendDM`).
  - Append affiliate marketing block to the VIP welcome DM (pulled from `affiliate_marketing_copy`, with `{ref_link}` / `{ref_code}` placeholders).

### New `profile-affiliate-tick` (hourly cron)
- For each profile:
  - Recompute "live" status per referrer: `active` if `now() < max(expires_at)` across their paid + bonus subs, else `inactive`.
  - Flip `referral_codes.status` accordingly, stamp `last_activated_at` / `last_deactivated_at`.
  - Expire `pending` attributions older than 14 days.

### New `profile-affiliate-stats` (admin read-only)
- Returns per-user totals: code, status, total_referrals, converted, months_earned, current_expiry — feeds the super-admin panel.

### Marketing preamble rotator
- Lightweight: add an `affiliate` rotation slot to whatever preamble system already drives the No Lube / Insiders channels (or new `profile-affiliate-preamble-post` hourly cron that randomly posts one of N variants from `affiliate_public_preamble` / `affiliate_private_preamble` once every X hours per profile, with last-posted-at gating).

## Copy seeds (admin-editable, defaults shipped in migration)

Paid welcome DM append:
```
🎁 You're in. Want free months?
Share your personal link — every friend who subscribes gets you +1 month, stacked on top of your current expiry.
🔗 {ref_link}
🔑 Code: {ref_code}
Post it on X, TikTok, group chats — no cap on how many months you can stack.
```

Public channel preamble (rotated):
```
👀 Members earn free months by inviting friends.
Subscribe once → get a referral link → +1 month per paid friend, forever stackable.
```

Private channel preamble (rotated):
```
💎 Insider perk: your referral link is in your DMs.
Drop it on X or TikTok — every paid friend = +1 month on your subscription, auto-applied.
```

## Out of scope

- No payouts in SOL/cash — months only.
- No multi-level (no commission on a referee's later referrals).
- No public leaderboard UI yet (data is captured; UI can come later).
- No fraud heuristics beyond same-user / duplicate-attribution guards.

## Open questions

1. Confirm **1 month** per paid referral regardless of the tier the friend bought (1mo / 3mo / 12mo), vs scaling (e.g. friend buys 3mo → referrer gets 3mo)? Plan above = flat 1 month always.
2. Confirm **14-day** pending-attribution window (friend taps link but delays paying).
3. Should the referrer's code be shown on every monthly renewal reminder too, or only in the initial welcome DM?
