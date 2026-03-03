

# Holders Intel Tiered Access System

## Overview

Build a multi-tier subscription and content gating system for the Holders Intel platform. Content is progressively revealed based on user tier, from anonymous visitors up to paid subscribers.

## Tier Structure

| Tier | Who | Price | AI Content Level | Data Access |
|------|-----|-------|-------------------|-------------|
| **Free (Anon)** | Non-logged-in visitors | Free | `{ai_summary}` snippet in a teaser DIV | Basic report, holder table, health grade |
| **Free (Auth)** | Logged-in users | Free | Current AI panel (summary + lifecycle badge) | + Extended analysis, whale warnings |
| **X Subscriber** | Linked X subscription handle | Included w/ X sub | `{ai_overview}` on web (matches community posts) | + Wallet clustering, first-buyer intel |
| **Tier 3 - Pro** | $9.99/mo ($7.99 for X subs) | $9.99 | Full AI analysis + key drivers + reasoning trace | Complete data, charts, comparisons, CSV export |
| **Tier 4 - Dev/API** | $29.99/mo ($22.99 for X subs) | $29.99 | Everything in Pro + API access | REST API endpoints for programmatic access |
| **Tier 5 - Enterprise** | $49.99/mo ($39.99 for X subs) | $49.99 | Everything + 4 team seats | Multi-user, white-label reports |

Tier 4 and 5 will be stubbed/planned but not fully built now. **Tier 3 is the priority.**

## Technical Plan

### 1. Database: New Web Subscription Tiers Table

Create a `web_subscription_tiers` table (separate from existing `pricing_tiers` which is for BlackBox trading). Fields: `id`, `tier_key` (enum: `free`, `auth`, `x_subscriber`, `pro`, `dev`, `enterprise`), `display_name`, `price_usd`, `x_subscriber_price_usd`, `features` (JSONB), `ai_access_level` (enum: `summary`, `analysis`, `overview`, `full`, `api`), `is_active`.

Create a `web_user_subscriptions` table: `id`, `user_id`, `tier_key`, `x_handle_linked` (text, nullable), `x_subscription_verified` (bool), `starts_at`, `expires_at`, `is_active`, `stripe_subscription_id` (nullable, for future Stripe).

### 2. Hook: `useUserTier`

New hook that returns the current user's effective tier by checking:
1. Not logged in → `free`
2. Logged in, no subscription → `auth`
3. Linked X handle verified as subscriber → `x_subscriber`
4. Active `web_user_subscriptions` record → `pro` / `dev` / `enterprise`

### 3. Content Gating Component: `TierGate`

Replace/augment `PremiumFeatureGate` with a `TierGate` component that accepts a `requiredTier` prop and renders:
- The content if user meets tier
- A teaser card with upgrade CTA if not

### 4. Holders Page Changes

**Anonymous visitors (Tier Free):**
- Show basic report as-is
- Add a new `AISummaryTeaser` DIV mid-page showing `{ai_summary}` text with a blurred/locked section below teasing deeper analysis
- Keep `AIInterpretationLocked` for the full panel

**Logged-in free users (Tier Auth):**
- Show current `AIInterpretationPanel` (summary + lifecycle)
- Gate: key drivers, reasoning trace, extended wallet analysis behind Pro upgrade CTA

**X Subscribers (Tier X-Sub):**
- Show `{ai_overview}` level content on the web report
- Unlock wallet clustering and first-buyer intel sections

**Pro ($9.99):**
- Full AI analysis with all sections expanded
- Comparison charts, full CSV export, all wallet data
- This is the conversion target -- CTAs throughout lower tiers point here

### 5. X Handle Linking (for X Subscriber verification)

Add to User Settings a field to link their X handle. Store in `web_user_subscriptions.x_handle_linked`. Verification logic (edge function) checks if the handle appears in the X subscription community member list.

### 6. Pricing/Upgrade Page

New `/pricing` route showing the tier comparison table with:
- Feature matrix
- Price columns (regular vs X subscriber discount)
- CTA buttons
- Accessible from upgrade prompts throughout the Holders page

### 7. Files to Create/Modify

**New files:**
- `src/hooks/useUserTier.ts` - tier resolution hook
- `src/components/premium/TierGate.tsx` - tier-aware content gate
- `src/components/premium/AISummaryTeaser.tsx` - anon AI summary DIV
- `src/components/premium/PricingTable.tsx` - tier comparison UI
- `src/pages/Pricing.tsx` - pricing page
- Migration SQL for `web_subscription_tiers` + `web_user_subscriptions`

**Modified files:**
- `src/components/BaglessHoldersReport.tsx` - wrap sections in `TierGate`, add `AISummaryTeaser` for anon
- `src/components/holders/AIInterpretationPanel.tsx` - accept tier prop, conditionally show sections
- `src/components/settings/UserSettingsDropdown.tsx` - add X handle linking
- `src/App.tsx` - add `/pricing` route

### 8. Migration SQL Summary

```sql
CREATE TYPE web_tier_key AS ENUM ('free','auth','x_subscriber','pro','dev','enterprise');
CREATE TYPE ai_access_level AS ENUM ('summary','analysis','overview','full','api');

CREATE TABLE web_subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key web_tier_key UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  price_usd DECIMAL(6,2) DEFAULT 0,
  x_subscriber_price_usd DECIMAL(6,2) DEFAULT 0,
  features JSONB DEFAULT '{}',
  ai_access_level ai_access_level NOT NULL,
  max_reports_per_day INT DEFAULT 5,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE web_user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tier_key web_tier_key NOT NULL DEFAULT 'auth',
  x_handle_linked TEXT,
  x_subscription_verified BOOLEAN DEFAULT false,
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tier_key)
);

-- Seed tiers
INSERT INTO web_subscription_tiers VALUES
  (gen_random_uuid(), 'free', 'Free', 0, 0, '{"basic_report":true}', 'summary', 3, true),
  (gen_random_uuid(), 'auth', 'Free Account', 0, 0, '{"basic_report":true,"health_dashboard":true}', 'analysis', 10, true),
  (gen_random_uuid(), 'x_subscriber', 'X Subscriber', 0, 0, '{"ai_overview":true,"wallet_clustering":true}', 'overview', 20, true),
  (gen_random_uuid(), 'pro', 'Pro', 9.99, 7.99, '{"full_ai":true,"charts":true,"csv_export":true,"comparisons":true}', 'full', 50, true),
  (gen_random_uuid(), 'dev', 'Developer', 29.99, 22.99, '{"api_access":true}', 'api', 200, true),
  (gen_random_uuid(), 'enterprise', 'Enterprise', 49.99, 39.99, '{"team_seats":4,"white_label":true}', 'api', 500, true);
```

### Implementation Priority

1. **Database + `useUserTier` hook** -- foundation
2. **`TierGate` component + `AISummaryTeaser`** -- gating infrastructure
3. **Holders page integration** -- wire up content sections to tiers
4. **Pricing page** -- conversion funnel
5. **X handle linking** -- subscriber verification (can be phase 2)
6. **Stripe integration** -- payment processing (phase 2)

Tier 4 (Dev/API) and Tier 5 (Enterprise) will be seeded in the DB and shown on the pricing page as "Coming Soon" but won't have functional gating yet.

