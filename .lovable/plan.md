

# Telegram Bot OTP Auth — Sign Up, Sign In, Link via Inline Buttons

## What This Does

Adds a `/signup` command and revamps `/start` to show **three inline keyboard buttons** in the bot's welcome message — Padre.gg style. Users tap a button, get taken to a secure OTP URL on blackbox.farm that creates or logs into their account and auto-links their Telegram. The old `/register CODE` flow remains as a fallback.

## How It Works

```text
User taps /start or /signup in bot DM
         │
         ▼
┌──────────────────────────────────┐
│  Bot Welcome Message             │
│                                  │
│  [🆕 Create Account]            │  ← inline_keyboard button
│  [🔑 Log In]                    │  ← inline_keyboard button  
│  [🔗 Link Existing (/register)] │  ← inline_keyboard button
└──────────────────────────────────┘
         │
    User taps "Create Account" or "Log In"
         │
         ▼
  Bot generates OTP token (2-min expiry)
  stored in one_time_action_tokens table
  with action_type = 'tg_signup' or 'tg_signin'
  payload = { telegram_user_id, telegram_username }
         │
         ▼
  Bot sends inline button:
  "Open BlackBox Farm" → blackbox.farm/auth/tg?t=TOKEN
         │
         ▼
┌──────────────────────────────────┐
│  /auth/tg page on website        │
│                                  │
│  action_type = tg_signup:        │
│    → Show signup form (email +   │
│      password), on submit:       │
│      create account via Supabase │
│      auth, auto-link Telegram    │
│                                  │
│  action_type = tg_signin:        │
│    → Show login form, on submit: │
│      sign in, auto-link Telegram │
│      if not already linked       │
└──────────────────────────────────┘
```

## Detailed Changes

### 1. Bot webhook: `holdersintel-bot-webhook/index.ts`

**Add `sendMessageWithButtons` helper** — wraps `sendMessage` but includes `reply_markup.inline_keyboard` for Telegram inline buttons.

**Revamp `handleStart`** — For unlinked users, send a welcome message with 3 inline buttons:
- "🆕 Create Account" → callback_data: `auth_signup`
- "🔑 Log In & Link" → callback_data: `auth_signin`  
- "🔗 Link with Code" → callback_data: `auth_link_code`

For already-linked users, keep existing "Welcome back" behavior.

**Add `/signup` command** — Alias that calls the same handler as `/start` for unlinked users.

**Handle callback_query** — When user taps a button:
- `auth_signup` / `auth_signin`: Generate a 2-minute OTP token in `one_time_action_tokens` with `action_type: 'tg_signup'` or `'tg_signin'`, payload contains `telegram_user_id` and `telegram_username`. Send a new inline button: "🌐 Open BlackBox Farm" → URL button pointing to `blackbox.farm/auth/tg?t=TOKEN`.
- `auth_link_code`: Send instructions for the existing `/register CODE` flow.

### 2. New page: `src/pages/TelegramAuth.tsx`

A dedicated page at `/auth/tg` that:
- Reads `?t=TOKEN` from URL
- Calls `resolve-action-token` to validate (checks expiry, not-used)
- Based on `action_type`:
  - **`tg_signup`**: Shows a signup form (email + password). On submit, creates account via `supabase.auth.signUp()`, then calls a new edge function to auto-link Telegram using the payload's `telegram_user_id`.
  - **`tg_signin`**: Shows a login form (email + password). On submit, signs in via `supabase.auth.signInWithPassword()`, then auto-links if not already linked.
- Shows success state with "Return to Telegram" button.
- Branded with BlackBox styling, mobile-friendly (users are coming from Telegram's in-app browser).

### 3. Edge function: `resolve-action-token/index.ts`

Add two new `action_type` cases:
- **`tg_signup`**: Returns the token payload (telegram_user_id, telegram_username) so the frontend can use it after account creation. Does NOT create the account server-side (that's done client-side via Supabase auth).
- **`tg_signin`**: Same — returns payload for the frontend to auto-link after login.

### 4. New edge function: `tg-link-after-auth/index.ts`

Called by the frontend after successful signup/signin:
- Accepts `{ user_id, telegram_user_id, telegram_username, otp_token }`
- Validates the OTP token is valid and matches
- Creates/updates the `telegram_link_codes` entry to link the accounts
- Marks the OTP token as used
- Returns success

This is a separate function because the account linking requires `service_role` access.

### 5. Router: `src/App.tsx`

Add route: `<Route path="/auth/tg" element={<TelegramAuth />} />`

### 6. Bot command router

In the main command dispatcher, add:
- `/signup` → calls `handleStart` (same flow)
- `callback_query` handling in the webhook's main handler

## Database Changes

**None** — reuses existing `one_time_action_tokens` table with new `action_type` values (`tg_signup`, `tg_signin`). Reuses existing `telegram_link_codes` table for linking.

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/holdersintel-bot-webhook/index.ts` | MODIFY — add buttons, callback_query handler, /signup |
| `supabase/functions/resolve-action-token/index.ts` | MODIFY — add tg_signup/tg_signin cases |
| `supabase/functions/tg-link-after-auth/index.ts` | CREATE — auto-link after auth |
| `src/pages/TelegramAuth.tsx` | CREATE — /auth/tg page |
| `src/App.tsx` | MODIFY — add /auth/tg route |

## Security Notes

- OTP tokens expire in 2 minutes (short window)
- Tokens are single-use (marked used after resolution)
- `tg-link-after-auth` validates the OTP token server-side before linking
- Telegram user uniqueness constraint prevents multi-account farming (existing)
- No secrets needed — all functions use existing `SUPABASE_SERVICE_ROLE_KEY` and `TELEGRAM_HOLDERSINTEL_BOT_TOKEN`

