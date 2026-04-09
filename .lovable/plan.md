

# Buyer Intent Tracking & "Curious But Reserved" Funnel

## What This Solves
Users who visit pricing pages and/or click checkout buttons but don't subscribe are high-intent prospects. Right now this data exists across `user_journey_events` and `checkout_intents` but isn't surfaced or actionable.

## Architecture

```text
user_journey_events (existing)         checkout_intents (existing)
  visited_subscriptions: 161             pending (abandoned): 16
  visited_onboarding: 15                 completed: some
  visited_pricing: 8
        │                                       │
        └───────────┬───────────────────────────┘
                    ▼
         buyer_intent_signals (new table)
         ┌──────────────────────────────┐
         │ user_id                      │
         │ pricing_page_views     (int) │
         │ checkout_attempts      (int) │
         │ last_pricing_visit     (ts)  │
         │ last_checkout_attempt  (ts)  │
         │ intent_level (browsing/      │
         │   considering/almost_bought) │
         │ funnel_tag                   │
         │ nurture_email_sent     (bool)│
         └──────────────────────────────┘
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
   Account Mgmt  Morning Report  AI Chat Context
   (new badge     (new section)   (memory injection)
    + column)
```

## Implementation Steps

### 1. New DB table: `buyer_intent_signals`
- Materialized from journey events + checkout intents
- Computed fields: `intent_level` (browsing / considering / almost_bought)
  - **browsing**: 1-2 pricing page views, no checkout attempt
  - **considering**: 3+ pricing page views, no checkout attempt
  - **almost_bought**: at least 1 abandoned checkout intent
- DB function to refresh/recompute on demand or via cron
- `funnel_tag` field for email segmentation (e.g., "curious_reserved", "abandoned_cart")

### 2. Account Management Dashboard Updates
- New **"🛒" shopping cart badge** on accounts with buyer intent signals
  - Tooltip shows intent level and last activity date
- New **"Intent" column** (sortable) showing: browsing / considering / almost_bought
- Click to expand shows timeline: pricing page visits, checkout attempts, dates
- Filter accounts by intent level

### 3. Morning Report: "Window Shoppers" Section
- Count of users who viewed pricing overnight but didn't convert
- Count of new abandoned checkouts
- Top 5 highest-intent non-subscribers with their visit counts

### 4. AI Chat Memory Integration
- When loading chat context for a user, query `buyer_intent_signals`
- Inject into system prompt: "This user has viewed pricing X times and abandoned checkout Y times"
- Enables the AI to naturally mention relevant plan benefits without being pushy

### 5. Email Nurture Tagging (foundation)
- Flag users with `intent_level = 'almost_bought'` or `considering` for future email sequences
- Track if nurture email was sent to avoid spam
- This sets the foundation; actual email drip content/automation is a follow-up task

## Files to Create/Edit
- **New migration**: `buyer_intent_signals` table + refresh function
- **Edit**: `src/components/admin/AccountManagementDashboard.tsx` -- add intent badge, column, filter
- **Edit**: `src/components/admin/morning-report/` -- add window shoppers section
- **Edit**: AI chat context loader (wherever system prompt is built) -- inject intent data
- **New**: `src/components/admin/BuyerIntentDetail.tsx` -- expandable timeline modal

## Technical Notes
- The refresh function queries `user_journey_events` for pricing/subscription/onboarding page views and `checkout_intents` for abandoned checkouts, then upserts into `buyer_intent_signals`
- Intent levels are computed: `almost_bought` if any pending checkout_intent exists; `considering` if 3+ pricing views; `browsing` otherwise
- RLS: read-only for super_admins only
- No new edge functions needed -- this is all computed from existing data

