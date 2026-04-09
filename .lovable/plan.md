

# Tokenized One-Time Action Links (Replace Dead `/dashboard` URLs)

## The Problem

The TG bot sends users to `/dashboard` and `/reset-password` via plain URLs. When users click these in Telegram, they land in a browser with no active session — the page either shows nothing, redirects to login, or says "invalid reset link." These are dead endpoints for TG users.

## The Solution

Generate **one-time tokenized links** from the bot that lead to purpose-specific action pages. No login required — the token IS the authentication for that single action.

```text
TG Bot DM: "Verify your email → https://blackbox.farm/action?t=abc123"
                                          │
                                          ▼
                                  /action?t=abc123
                                          │
                              Look up token in DB
                              ├── type: "resend_verification"
                              │     → Show "Resend Verification Email" button
                              ├── type: "password_reset"  
                              │     → Show "Send Password Reset Email" button
                              ├── type: "view_reg_code"
                              │     → Show registration code + copy button
                              └── expired/used → Show "Link expired" message
```

## What Changes

### Database — New table: `one_time_action_tokens`
- `id` (uuid), `token` (text, unique, indexed)
- `user_id` (uuid, references auth.users)
- `action_type` (text — `resend_verification`, `password_reset`, `view_reg_code`)
- `payload` (jsonb — optional data like email address)
- `expires_at` (timestamptz — 1 hour default)
- `used_at` (timestamptz, nullable)
- `created_at` (timestamptz)
- RLS: service_role only (tokens accessed via edge function, not client)

### Edge Function — `generate-action-token`
- Called by the TG bot webhook internally
- Accepts `{ user_id, action_type }`, generates a random token, inserts into DB
- Returns the full URL: `https://blackbox.farm/action?t={token}`

### Edge Function — `resolve-action-token`
- Called by the `/action` page on load
- Accepts `{ token }`, looks it up, checks expiry/used status
- For `resend_verification`: triggers the verification email send, marks token used
- For `password_reset`: calls `supabase.auth.admin.generateLink('recovery', email)` to send the reset email, marks token used
- For `view_reg_code`: returns the user's registration code from `telegram_link_codes`
- Returns `{ action_type, success, message }` to the UI

### New Page — `/action` (`src/pages/TokenAction.tsx`)
- Reads `?t=` param, calls `resolve-action-token`
- Shows a branded card with the action result:
  - **resend_verification**: "✅ Verification email sent to your inbox!"
  - **password_reset**: "✅ Password reset email sent! Check your inbox."
  - **view_reg_code**: Shows the code with a copy button
  - **expired**: "⏰ This link has expired. Ask the bot for a new one."
- No login required — single-purpose, self-contained

### TG Bot Webhook Updates
- Replace all `https://blackbox.farm/dashboard` links with dynamically generated tokenized URLs
- When bot says "check your dashboard for registration code" → generate `view_reg_code` token link
- When bot says "resend verification" → generate `resend_verification` token link  
- When bot mentions password reset → generate `password_reset` token link
- Helper function `generateActionLink(supabase, userId, actionType)` used throughout

## Files

- **Create**: `supabase/functions/generate-action-token/index.ts`
- **Create**: `supabase/functions/resolve-action-token/index.ts`
- **Create**: `src/pages/TokenAction.tsx`
- **Edit**: `src/App.tsx` — add `/action` route
- **Edit**: `supabase/functions/holdersintel-bot-webhook/index.ts` — replace all static `/dashboard` and `/reset-password` links with tokenized link generation
- **Migration**: `one_time_action_tokens` table

## Security
- Tokens are single-use (marked `used_at` on consumption)
- 1-hour expiry by default
- No session or login needed — the token itself is the auth
- Tokens are UUIDs + random bytes, not guessable
- RLS blocks direct client access — only edge functions touch the table

