
# Phanes Deep-Links + Auto-Capture Plan

## The capture problem (read this first)

There are two separate things and they can't share one mechanism:

1. **Deep-link buttons** (`https://t.me/Phanes_bot?start=x_handle`) — these open Telegram on **your phone/desktop**. The reply lands in **your** Phanes DM. There is no way for our server (or Browserless) to read that reply — it's end-to-end on your account.

2. **Server-side capture** — already built: `supabase/functions/phanes-x-query` DMs `@Phanes_bot` from our **MTProto user session**, waits 8s, fetches the reply, parses it, and writes to `x_account_registry.phanes_data / phanes_recycled_accounts / phanes_username_history`.

So "Browserless clicks the buttons" doesn't work for capture. Browserless drives a headless Chrome — it can't log into your Telegram account and read DMs. **The only auto-capture path is the existing MTProto function.** What we'll build is an admin UI that fires that function in bulk over a list of devs, plus the manual deep-link buttons everywhere else for free user-driven lookups.

## What gets built

### 1. `<PhanesDeepLink>` button component
- Props: `handle?`, `wallet?`, `mint?`
- Renders a small Telegram-blue chip: "🔍 Phanes" → opens `https://t.me/Phanes_bot?start=...` in a new tab
- Maps to the right Phanes command:
  - X handle → `?start=x_<handle>` (or fallback to copy `/x @handle` to clipboard + open bot)
  - Wallet → `?start=w_<addr>`
  - Mint → `?start=ca_<mint>`
- Phanes' actual deep-link param scheme needs verifying via their docs; if `?start=` doesn't auto-run the command, the button copies the command text to clipboard and opens the bot DM, with a toast: "Command copied — paste in Phanes DM"

Drop the button into:
- `src/pages/Developer.tsx` (next to wallet + twitter handle)
- `src/components/token/DeveloperRiskBadge.tsx`
- `src/components/bubble-map/HackerTerminal.tsx` (next to X handles & wallets)
- `src/components/holders/Top25HoldersCard.tsx` (next to wallets)
- Holder/wallet popovers in the bubble map

### 2. New admin page: `/super-admin/phanes-batch`
A queue console that uses **the existing `phanes-x-query` MTProto function** to capture data.

Layout:
- **Source picker**: "Devs from `developer_profiles` (filter: has twitter_handle, no `phanes_queried_at` in last 30d)" / "Handles from `x_account_registry` un-queried" / "Paste list"
- **Table**: handle | wallet | last queried | last result (recycled? Y/N, # history) | "Run now" button
- **Bulk run**: "Run next N" with a throttle slider (default: 1 every 90s — Phanes rate-limits + we don't want to look like a bot to them)
- **Live log panel**: tails `edge_function_runs` rows for `phanes-x-query`
- **Per-row "Run now"** invokes `supabase.functions.invoke('phanes-x-query', { body: { action: 'single', handle } })` and shows the parsed result inline

This is the "page of buttons you click manually" — except clicking the button triggers our MTProto capture (so the data DOES land in our DB), not a deep-link to your phone.

### 3. Optional: re-enable the cron
`phanes-x-query` already supports `action: 'backfill'` (picks the next un-queried handle from `x_account_registry`). Add a toggle on the admin page: "Auto-backfill: ON/OFF" that schedules a `pg_cron` job calling `backfill` every 90s. Off by default.

### 4. Display the captured data
On `src/pages/Developer.tsx` (and dev cards in bubble map), when `x_account_registry.phanes_recycled_accounts` or `phanes_username_history` has rows, render a "Phanes Intel" panel:
- "🔄 Recycled handle — also seen as: @oldname1, @oldname2"
- "📜 Past usernames: @x, @y (since 2024-03-15)"
- Linked CAs from `recycledAccounts[].contractAddress` as clickable token chips

## Why no Browserless

Browserless headless Chrome cannot:
- Log into your Telegram account (no session, no MTProto)
- Read DMs from `@Phanes_bot`
- Bypass Telegram's web client auth

The MTProto user session we already have IS the only "automated browser" that works for Phanes. The admin page just gives it a friendly bulk UI.

## ToS reminder
Phanes ToS forbids "automated queries." The existing `phanes-x-query` already does automated queries from our MTProto account — risk of ban exists. Throttle to ≥90s between calls and cap at ~50/day to stay below their radar. Manual deep-link buttons (item 1) are zero risk because the user runs them on their own account.

## Files touched

**New:**
- `src/components/phanes/PhanesDeepLink.tsx`
- `src/pages/admin/PhanesBatch.tsx` + route
- `src/components/admin/PhanesQueueTable.tsx`

**Edited (insert button):**
- `src/pages/Developer.tsx`
- `src/components/token/DeveloperRiskBadge.tsx`
- `src/components/bubble-map/HackerTerminal.tsx`
- `src/components/holders/Top25HoldersCard.tsx`

**Edge functions:** no new ones — reuse `phanes-x-query` and `telegram-mtproto-auth`. Optionally add a tiny `phanes-batch-orchestrator` function if we want server-side queue management instead of doing it from the admin page (recommend: skip it, drive from the admin page so you watch it live).

## Open questions before I build

1. Phanes deep-link param scheme — do you know if `t.me/Phanes_bot?start=x_handle` auto-runs `/x handle`? If not, button falls back to "open bot + copy command to clipboard." (I can verify by clicking one in your Telegram and reporting back, but cleaner if you confirm.)
2. Throttle default — 90s/call OK? That's ~40 devs/hour, ~950/day max but I'd cap at 50/day for ToS safety.
3. Should the admin page be `/super-admin/phanes-batch` (new) or a tab inside the existing super-admin dashboard?
