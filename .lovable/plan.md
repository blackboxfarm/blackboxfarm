

# Plan: Replace Pump.fun API Status with Account Snapshot Widget

## What Changes

### 1. Move PumpFunApiStatus into PumpfunMonitorTab
- Add `PumpFunApiStatus` as a header element inside `src/components/admin/tabs/PumpfunMonitorTab.tsx` (above the sub-tabs)
- It stays visible whenever the Pump.fun tab is active

### 2. Create new `AccountSnapshotWidget` component
A compact card replacing the Pump.fun widget in the Super Admin header. It queries live counts from the database and displays badges like:

```text
┌─────────────────────────────────────┐
│  📊 Account Snapshot                │
│                                     │
│  👤 245 Web Accounts                │
│     5 email auth · 16 with 2FA      │
│  🤖 165 TG Linked                   │
│     123 registered via bot           │
│  💳 1 Stripe Monthly                │
│  💎 1 SOL Yearly                    │
│  📡 45 Channel Installs             │
└─────────────────────────────────────┘
```

**Data sources (all existing tables):**
- `profiles` — total web accounts, count where `two_factor_enabled = true`, count where `email_verified = true`
- `telegram_link_codes` — count where `telegram_user_id IS NOT NULL` (linked), total rows
- `stripe_customers` — active Stripe subscribers, grouped by interval from metadata
- `tg_sol_subscriptions` — SOL-paid subscriptions where `status = 'active'`
- `user_subscriptions` — active subscriptions joined with `pricing_tiers`
- `telegram_channel_configs` (or equivalent channel installs table) — count of installed channels

### 3. Update SuperAdmin.tsx
- Remove `PumpFunApiStatus` import and usage from the header
- Import and render `AccountSnapshotWidget` in its place

## Files Modified
- `src/components/admin/AccountSnapshotWidget.tsx` — **new**
- `src/pages/SuperAdmin.tsx` — swap widget
- `src/components/admin/tabs/PumpfunMonitorTab.tsx` — add PumpFunApiStatus at top

