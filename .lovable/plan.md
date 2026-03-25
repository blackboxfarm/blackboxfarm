

# Telegram Public Channel Broadcasting for HoldersIntel

## Answers

### 1. Deploy Status
The `check-2fa-requirement` fix from earlier is in place — it uses `Deno.serve` with the helper function above the serve block. The `dex-top-200` auto-queue changes are also deployed. Both should be live.

### 2. Current TG Broadcast Architecture
The TG broadcasting is **partially configurable but hardwired to BLACKBOX only**:
- The `holders-intel-poster` posts to X, then sends a TG notification via `admin-notify` → which broadcasts to all `telegram_message_targets` rows with `label = "BLACKBOX"`
- The TG message template (`tg_posted`) IS managed in the `holders_intel_templates` table — so that part is editable from the DB/admin UI
- But the **target channel** is hardcoded to `BLACKBOX` label, and the template is specific to the private admin group format — not a public-facing promotional format

---

## Plan: Public Channel Broadcast with Manageable Templates

### What we're building
Every time the Intel XBot posts to X, it will also send a **separate, public-facing message** to your new Telegram channel (`-1003659015482`) using a dedicated template you can edit from the admin UI. This template will be designed for conversion — teasing the data and driving users to subscribe.

### Step 1: Add the new channel as a broadcast target (DB migration)
- Insert a new row into `telegram_message_targets` with:
  - `chat_id`: `-1003659015482`
  - `label`: `INTEL_PUBLIC`
  - `resolved_name`: `HoldersIntel Public`

### Step 2: Add a new template `tg_public_post` (DB migration)
- Expand the `holders_intel_templates` check constraint to allow `tg_public_post`
- Insert a default conversion-focused template, e.g.:
```
🔎 ${ticker} Holder Analysis

📊 {totalWallets} Wallets → ✅ {realHolders} Real
Health: {healthGrade} | {dustPct}% Dust

🐋 {whales} Whales | 😎 {serious} Serious

🐦 {tweetUrl}

💎 Want full reports, AI summaries & whale alerts?
👉 Subscribe for $9.99/mo: blackbox.farm/pricing
```

### Step 3: Update `holders-intel-poster` to dual-broadcast
After posting to X, the poster currently sends to `admin-notify` (BLACKBOX only). We'll add a second broadcast specifically for `INTEL_PUBLIC`:
- Fetch the `tg_public_post` template from `holders_intel_templates`
- Process it with the same variable substitution system
- Send directly via `telegram-mtproto-auth` to the `INTEL_PUBLIC` target
- Independent of the BLACKBOX broadcast (different template, different channel)
- Respects the existing suspension toggle

### Step 4: Admin UI for the public channel template
- Add a new template editor entry in the existing templates management UI for `tg_public_post`
- Label it "TG Public Channel Post" so you can edit the conversion copy anytime without code changes

### Technical Details

**Files changed:**
- `supabase/functions/holders-intel-poster/index.ts` — add public channel broadcast after X post (lines ~806-837 area, parallel to existing BLACKBOX send)
- 2 SQL migrations: (1) insert target row, (2) expand template constraint + insert default template

**No new edge functions needed** — reuses existing `telegram-mtproto-auth` for sending and `holders_intel_templates` for template management.

