

# Scaling Optimizations & Developer Wallet Rescan System

## Overview

This plan addresses two critical needs:
1. **Immediate scaling fixes** to prevent system degradation as data grows
2. **Recurring developer wallet monitoring** with pre-buy alerts for tracked developers

Your current `mint-monitor-scanner` runs every 5 minutes on user-added wallets, but there's no automated rescan of **known developer wallets** from `developer_wallets` to detect new mints and alert based on blacklist/whitelist status.

---

## Part 1: Scaling Optimizations (Implement Now)

### 1.1 Database Indexes for `reputation_mesh`

The mesh table will grow rapidly with community scraping. Adding composite indexes prevents query timeouts:

```text
CREATE INDEX idx_mesh_source_rel 
  ON reputation_mesh(source_type, relationship);

CREATE INDEX idx_mesh_linked_rel 
  ON reputation_mesh(linked_type, relationship);

CREATE INDEX idx_mesh_source_id_rel 
  ON reputation_mesh(source_id, relationship) 
  WHERE source_type = 'x_account';
```

### 1.2 Server-Side Rotation Detection

Move the client-side JavaScript loop in `TeamIntelDashboard.tsx` (lines 110-162) to a Postgres function:

```text
CREATE FUNCTION get_rotation_patterns(min_communities INT DEFAULT 2)
RETURNS TABLE (
  account TEXT,
  admin_communities TEXT[],
  mod_communities TEXT[],
  co_mod_count INT,
  risk_score INT
) AS $$
  -- Aggregates by source_id, counts relationships
  -- Returns pre-sorted by risk_score DESC
$$;
```

Benefits:
- Single query instead of 2 separate queries + JS loops
- Returns paginated results (LIMIT 50 by default)
- Risk score calculated in SQL

### 1.3 Materialized View for Mesh Stats

Replace real-time stat calculation with a cached view:

```text
CREATE MATERIALIZED VIEW mesh_summary AS
SELECT 
  COUNT(*) as total_links,
  COUNT(*) FILTER (WHERE relationship = 'admin_of') as admin_links,
  COUNT(*) FILTER (WHERE relationship = 'mod_of') as mod_links,
  COUNT(*) FILTER (WHERE relationship = 'co_mod') as co_mod_links,
  COUNT(DISTINCT source_id) FILTER (WHERE source_type = 'x_account') as unique_accounts,
  COUNT(DISTINCT linked_id) FILTER (WHERE linked_type = 'x_community') as unique_communities
FROM reputation_mesh;

-- Refresh every hour via cron
```

### 1.4 Co-Mod Link Limit

In `x-community-enricher`, cap `co_mod` relationships at 10 staff per community to prevent quadratic explosion:

```text
Current: Creates n*(n-1)/2 links for n staff
Fixed: Only first 10 staff → max 45 co_mod links per community
```

### 1.5 Add Pagination to TeamIntelDashboard

The current `.limit(100)` on dev_teams will cause problems at scale. Add cursor-based pagination with "Load More" button.

---

## Part 2: Developer Wallet Multi-Mint Support

### 2.1 Data Model Clarification

Your `developer_wallets` table already supports multiple wallets per developer:

```text
developer_profiles (1)  →  developer_wallets (many)
         ↓
Each wallet can be: 'token_creator', 'funding', 'master'
```

**The Gap**: No column tracks which **launchpad** each wallet uses (pump.fun, bags.fm, bonk.fun).

Add a `launchpad_detected` column to `developer_wallets`:

```text
ALTER TABLE developer_wallets 
ADD COLUMN launchpad_detected TEXT;  -- 'pump.fun', 'bags.fm', etc.
```

---

## Part 3: Recurring Developer Wallet Rescan (The Loopback)

### 3.1 New Edge Function: `developer-wallet-rescan`

Purpose: Daily scan of all known developer wallets for NEW token mints

```text
Flow:
1. Query all wallets from developer_wallets
2. For each wallet, check for new token creations (last 24h)
3. If new mint found:
   a. Add to developer_tokens table
   b. Check if developer is blacklisted or whitelisted
   c. Generate appropriate alert
```

### 3.2 Cron Schedule

```text
SELECT cron.schedule(
  'developer-rescan-daily',
  '0 6 * * *',   -- 6 AM UTC daily
  -- Calls developer-wallet-rescan function
);
```

### 3.3 Pre-Buy Alert System

When a new mint is detected from a tracked developer:

| Developer Status | Alert Level | Message |
|------------------|-------------|---------|
| Blacklisted (pumpfun_blacklist) | CRITICAL (Red) | "BLACKLISTED dev just launched: $TOKEN" |
| Whitelisted (pumpfun_whitelist) | POSITIVE (Green) | "TRUSTED dev launched: $TOKEN" |
| Unknown | NEUTRAL (Yellow) | "Known dev launched new token" |

Alerts sent to:
- Super admins via `notifications` table
- Telegram channel via existing `telegram-bot-webhook`
- Email via `send-notification` for whitelisted devs (opportunity alert)

### 3.4 New Table: `developer_mint_alerts`

Track all alerts generated for audit trail:

```text
CREATE TABLE developer_mint_alerts (
  id UUID PRIMARY KEY,
  developer_id UUID REFERENCES developer_profiles(id),
  token_mint TEXT NOT NULL,
  creator_wallet TEXT,
  alert_type TEXT,  -- 'blacklist_launch', 'whitelist_launch', 'neutral'
  alert_sent_at TIMESTAMP,
  notified_users UUID[],
  metadata JSONB
);
```

---

## Part 4: Integration with Existing Systems

### 4.1 Connect to `token-mint-watchdog-monitor`

When a new developer mint is detected, automatically trigger the watchdog analyzer:

```text
developer-wallet-rescan
    ↓ (new mint found)
token-mint-watchdog-monitor (bundle analysis)
    ↓
alert-high-risk-token (if blacklisted/bundled)
```

### 4.2 Update `oracle-unified-lookup`

Add "recent activity" section showing last N tokens from queried developer.

### 4.3 Dashboard Additions

Add a "Recent Developer Activity" panel to `TeamIntelDashboard` showing:
- Last 24h new mints from tracked developers
- Color-coded by blacklist/whitelist status
- Quick action buttons: "Investigate", "Add to Watchlist"

---

## Implementation Sequence

| Priority | Task | Effort |
|----------|------|--------|
| 1 | Add `reputation_mesh` indexes | Low |
| 2 | Create `get_rotation_patterns` Postgres function | Medium |
| 3 | Create `mesh_summary` materialized view | Low |
| 4 | Update `x-community-enricher` with co_mod limit | Low |
| 5 | Add pagination to `TeamIntelDashboard` | Medium |
| 6 | Create `developer-wallet-rescan` edge function | High |
| 7 | Create `developer_mint_alerts` table | Low |
| 8 | Add daily cron for developer rescan | Low |
| 9 | Update `TeamIntelDashboard` with recent activity panel | Medium |

---

## Technical Details

### `developer-wallet-rescan` Function Structure

```text
1. Fetch wallets from developer_wallets (batch of 50)
2. For each wallet:
   - Call Helius API: /addresses/{wallet}/transactions?type=TOKEN_MINT
   - Filter to last 24 hours
   - Check if mint already exists in developer_tokens
   - If new:
     a. Insert into developer_tokens
     b. Lookup developer in blacklist/whitelist
     c. Insert alert into developer_mint_alerts
     d. Send notifications
3. Log scan completion
4. Process next batch (rate-limited)
```

### Alert Message Templates

**Blacklisted Developer Launch**:
```text
BLACKLISTED DEV ALERT
Developer: {developer_name or wallet}
New Token: ${symbol} ({mint})
History: {rug_count} rugs, {token_count} tokens
Launchpad: {pump.fun/bags.fm}
Action: AVOID - High probability of rug
```

**Whitelisted Developer Launch**:
```text
TRUSTED DEV ALERT
Developer: {developer_name}
New Token: ${symbol} ({mint})
Track Record: {success_count} successful, {integrity_score}/100
Launchpad: {pump.fun/bags.fm}
Action: Consider early entry opportunity
```

---

## Summary

This plan delivers:
1. **Immediate stability** via indexes and server-side processing
2. **Multi-wallet support** per developer with launchpad tracking
3. **Daily rescan loop** that monitors known developers for new mints
4. **Smart alerting** that differentiates blacklisted from whitelisted developers
5. **Pre-buy notifications** for both danger (avoid) and opportunity (enter)

