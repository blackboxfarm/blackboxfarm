# Live Audit Feed → Allstar System Integration

Per your `Mandatory Approval` rule — reply **"Plan Approved"** to execute. Nothing changes until then.

## Goals
1. Live Audit Feed pulls from the **new** Allstar Registry (post-rebuild dataset), not the legacy 216-row source.
2. Realtime updates: when Registry rows change, Audit Feed re-fetches automatically.
3. Active cron-driven audits of every active allstar wallet (Solscan v2 Pro for tx history, Helius for mint detection).
4. A single **SMS toggle** that controls notifications for *both* Live Audit Feed findings *and* Mint Alerts.
5. Every new mint detected is recorded in **System Alerts → Transactions tab** with a deep link to **Mint Alerts**.
6. When SMS is toggled ON, that admin receives an SMS per new mint event.

---

## Implementation

### 1. Audit Feed data source (frontend)
- `AllstarAuditFeed.tsx`: query `allstar_devs` joined with `allstar_audit_log` ordered by `last_audited_at DESC`. Replace any legacy filter (e.g. `is_legacy=true` or fixed 216 set) with the unified registry filter currently used by `AllstarRegistry`.
- Add Supabase Realtime subscription on `allstar_devs` and `allstar_audit_log` → `refetch()` on INSERT/UPDATE so the feed reflects Registry edits and rebuild runs live.

### 2. Cron auditor (new edge function)
- New function `allstar-audit-cron` (runs every 30 min via `pg_cron`):
  - Pages through all `allstar_devs` where `is_active=true`, ordered by `last_audited_at ASC NULLS FIRST` (stalest first).
  - Wall-time guard 110s, chunked (100 wallets/run, continues on next tick).
  - For each wallet: call **Solscan Pro v2** `/account/transfer` filtered to `tokenCreate`/mint instructions since `last_audited_at`. Cross-check with Helius `getSignaturesForAddress` as fallback.
  - On new mint detected → INSERT into `allstar_mint_alerts` AND `allstar_audit_log` (status=`new_mint_found`).
  - Update `allstar_devs.last_audited_at` and `audit_count`.

### 3. System Alerts → Transactions tab
- New tab in **System Alerts** page: `Transactions`. Lists rows from `allstar_mint_alerts` (most recent first) with columns: time, dev wallet, new mint, tier, link icon → routes to `/super-admin?tab=allstars&sub=alerts&mint=<addr>`.
- Add a top-of-tab CTA "View full Mint Alerts →" linking to that sub-tab.

### 4. Unified SMS toggle
- New table `admin_alert_preferences` (one row per admin user_id):
  - `sms_enabled boolean default false`
  - `phone_e164 text`
  - `alert_types jsonb` (e.g. `{"new_mint": true, "audit_anomaly": true}`)
- UI: toggle lives in Allstars header (also mirrored on Mint Alerts tab) — a single switch covering both surfaces.
- In `allstar-audit-cron`, after inserting an alert, fetch all admins with `sms_enabled=true` and call `sendAdminSms()` (already in `_shared/sms-notify.ts`) per recipient, with body:
  `🚨 NEW MINT — {symbol} by {tier} dev {short_wallet} → pump.fun/coin/{mint}`

### 5. Realtime + idempotency
- Audit cron uses `ON CONFLICT (creator_wallet, token_mint) DO NOTHING` on `allstar_mint_alerts` so re-runs don't duplicate.
- Realtime publication added for `allstar_devs`, `allstar_audit_log`, `allstar_mint_alerts`.

---

## Files to touch
- **New:** `supabase/functions/allstar-audit-cron/index.ts`
- **New migration:** create `admin_alert_preferences` table + RLS, add cron schedule, enable realtime on the 3 tables
- **Edit:** `src/components/admin/allstar/AllstarAuditFeed.tsx` (data source + realtime sub)
- **Edit:** `src/components/admin/allstar/AllstarMintAlerts.tsx` (add SMS toggle UI + Transactions link)
- **Edit:** System Alerts page (add Transactions tab)
- **Reuse:** `supabase/functions/_shared/sms-notify.ts`

## Open questions
- **Solscan Pro v2 vs Helius primary?** Solscan v2 `/account/transfer` is cleanest for `tokenCreate` filtering but burns Pro credits. Helius `getSignaturesForAddress` + parse is free but noisier. Recommend **Solscan primary, Helius fallback**.
- **Cron frequency:** 30 min default. Want tighter (15 min) for T8/T9 dev wallets?
- **SMS rate cap:** Should I add a per-hour cap (e.g. max 10 SMS/hr) to prevent flood if a dev mints rapidly?

Reply **Plan Approved** (and answer the 3 questions if you have preferences) and I'll build it.
