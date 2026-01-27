
# Granular Token Search Tracking System

## Overview

This plan creates a comprehensive historical database that captures every public token search, the complete results displayed to users, and enables time-series analysis for features like "Diamond Hands" and other metrics that require tracking changes over time.

## Current State

### What Exists Today

| Component | Status | Data Captured |
|-----------|--------|---------------|
| `holders_page_visits` | Active | Session, fingerprint, tokens_analyzed array, referrer, UTMs |
| `holder_snapshots` | Active | 122K records - per-wallet balances, tiers, price |
| `holder_movements` | Active | 3.4M records - wallet entries/exits between snapshots |
| `api_usage_log` | New (empty) | Will track all external API calls with credits |
| `token_analysis_costs` | New (empty) | Daily aggregate costs per token |

### What's Missing

1. **Token Search Results Archive** - No storage of complete report data (socials, DEX status, health scores, tier breakdowns)
2. **IP Address Tracking** - Not captured separately from user agent
3. **DEX Status History** - No tracking of paid profile, CTO, boost changes over time
4. **Price History** - No dedicated time-series for token prices
5. **Socials Changes** - No tracking of when Twitter/Telegram/Website links change

---

## Proposed Solution

### New Database Tables

#### 1. `token_search_log` - Master Search Record

Captures every search request with session context:

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| created_at | TIMESTAMPTZ | Search timestamp |
| token_mint | TEXT | Token address searched |
| session_id | TEXT | Link to visitor session |
| visitor_fingerprint | TEXT | Device fingerprint |
| ip_address | TEXT | Visitor IP (from edge function headers) |
| response_time_ms | INTEGER | How long report took |
| holder_count | INTEGER | Total holders at search time |
| success | BOOLEAN | Whether search succeeded |
| error_message | TEXT | Error details if failed |

#### 2. `token_search_results` - Complete Report Snapshot

Stores the full report data for each search:

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| search_id | UUID | FK to token_search_log |
| token_mint | TEXT | Token address |
| symbol | TEXT | Token symbol |
| name | TEXT | Token name |
| market_cap_usd | NUMERIC | Market cap at search time |
| price_usd | NUMERIC | Price at search time |
| price_source | TEXT | Where price came from |
| total_supply | NUMERIC | Total token supply |
| circulating_supply | NUMERIC | Circulating supply (excl. LP) |
| health_score | INTEGER | Stability score (0-100) |
| health_grade | TEXT | Grade (A-F) |
| tier_dust | INTEGER | Dust wallet count |
| tier_retail | INTEGER | Retail wallet count |
| tier_serious | INTEGER | Serious wallet count |
| tier_whale | INTEGER | Whale wallet count |
| lp_count | INTEGER | Liquidity pool count |
| lp_percentage | NUMERIC | LP percentage of supply |
| top5_concentration | NUMERIC | Top 5 holder percentage |
| top10_concentration | NUMERIC | Top 10 holder percentage |
| risk_flags | JSONB | Array of detected risks |
| bundled_percentage | NUMERIC | Insider/bundled wallet % |
| launchpad | TEXT | Detected launchpad |
| creator_wallet | TEXT | Token creator address |
| created_at | TIMESTAMPTZ | Record timestamp |

#### 3. `token_socials_history` - Social Links Over Time

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| token_mint | TEXT | Token address |
| captured_at | TIMESTAMPTZ | When captured |
| twitter | TEXT | Twitter URL |
| telegram | TEXT | Telegram URL |
| website | TEXT | Website URL |
| discord | TEXT | Discord URL |
| source | TEXT | Where socials came from |

#### 4. `token_dex_status_history` - DEX Paid Status Over Time

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| token_mint | TEXT | Token address |
| captured_at | TIMESTAMPTZ | When captured |
| has_paid_profile | BOOLEAN | DexScreener paid profile |
| has_cto | BOOLEAN | Community takeover |
| active_boosts | INTEGER | Number of active boosts |
| boost_amount_total | INTEGER | Total boost amount |
| has_active_ads | BOOLEAN | Running DexScreener ads |
| orders | JSONB | Full orders response |

#### 5. `token_price_history` - Price Time Series

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| token_mint | TEXT | Token address |
| captured_at | TIMESTAMPTZ | Timestamp |
| price_usd | NUMERIC | Price in USD |
| market_cap_usd | NUMERIC | Market cap |
| source | TEXT | Price source |

---

## Implementation Architecture

```text
User Searches Token on /holders
         |
         v
+---------------------+
| bagless-holders-    |
| report edge fn      |
+---------------------+
         |
         +---> Fetch data from APIs (DexScreener, Solscan, Helius, etc.)
         |
         +---> Log API calls to api_usage_log (ALREADY IMPLEMENTED)
         |
         +---> [NEW] Insert into token_search_log (with IP from headers)
         |
         +---> [NEW] Insert into token_search_results (complete report data)
         |
         +---> [NEW] Upsert into token_socials_history (if changed)
         |
         +---> [NEW] Upsert into token_dex_status_history (if changed)
         |
         +---> [NEW] Insert into token_price_history
         |
         v
Return Response to User
         |
         v
+---------------------+
| Client-side:        |
| useTokenDataCollection |
+---------------------+
         |
         +---> capture-holder-snapshot (ALREADY WORKING - 122K records)
         |
         +---> track-holder-movements (ALREADY WORKING - 3.4M records)
```

---

## Dashboard Components

### 1. Token Search Analytics Dashboard

Display for super admins:

- **Total Searches**: Daily/weekly/monthly counts
- **Unique Tokens**: How many different tokens searched
- **Search Volume by Token**: Most searched tokens
- **Search by IP**: Identify heavy users
- **Error Rate**: Failed searches
- **Avg Response Time**: Performance monitoring

### 2. Token History Viewer

For any token with historical data:

- **Price Chart**: Price over time from all searches
- **Market Cap Chart**: Market cap over time
- **Health Score Trend**: How stability changed
- **Tier Distribution Over Time**: How holder composition shifted
- **DEX Status Timeline**: When paid profile, CTO, boosts occurred
- **Socials Timeline**: When links were added/changed

### 3. Diamond Hands Analysis (Enhanced)

Using the existing holder_snapshots data plus new tracking:

- Wallets that held through price drops
- Retention curves over time
- Average hold duration by tier
- Entry/exit patterns

---

## Data Retention Strategy

| Table | Retention | Notes |
|-------|-----------|-------|
| token_search_log | 90 days | Session-level granularity |
| token_search_results | 30 days | Full detail snapshots |
| token_socials_history | 1 year | Only on changes |
| token_dex_status_history | 1 year | Only on changes |
| token_price_history | 1 year | Hourly granularity after 7 days |
| holder_snapshots | Indefinite | Core historical data |
| holder_movements | 6 months | High volume, can purge older |

---

## Implementation Steps

### Phase 1: Database Schema

Create the 5 new tables with:
- Proper indexes for token_mint, captured_at queries
- RLS policies (super_admin read, edge functions write)
- Unique constraints to prevent duplicates on socials/dex_status

### Phase 2: Edge Function Updates

Modify `bagless-holders-report` to:
1. Extract IP address from request headers
2. Insert search log record at start of request
3. Insert complete results at end of request
4. Conditionally upsert socials (only if changed from last record)
5. Conditionally upsert dex_status (only if changed from last record)
6. Insert price history record

### Phase 3: Dashboard UI

Create new components:
- `TokenSearchAnalytics.tsx` - Search volume and patterns
- `TokenHistoryViewer.tsx` - Per-token historical charts
- `DiamondHandsEnhanced.tsx` - Advanced retention analysis

Add to SuperAdmin page as new tabs.

### Phase 4: Data Cleanup Jobs

Create scheduled edge functions:
- Daily: Aggregate old price_history to hourly
- Weekly: Purge token_search_log older than 90 days
- Monthly: Purge token_search_results older than 30 days

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| SQL Migration | CREATE | 5 new tables with indexes and RLS |
| `supabase/functions/bagless-holders-report/index.ts` | MODIFY | Add logging to new tables |
| `src/components/admin/TokenSearchAnalytics.tsx` | CREATE | Search volume dashboard |
| `src/components/admin/TokenHistoryViewer.tsx` | CREATE | Per-token history viewer |
| `src/pages/SuperAdmin.tsx` | MODIFY | Add new dashboard tabs |

---

## Estimated Storage Impact

Based on current usage (110 unique tokens, ~1000 searches/day estimated):

| Table | Est. Records/Month | Est. Size/Month |
|-------|-------------------|-----------------|
| token_search_log | 30,000 | ~5 MB |
| token_search_results | 30,000 | ~15 MB |
| token_socials_history | 500 | <1 MB |
| token_dex_status_history | 2,000 | ~2 MB |
| token_price_history | 50,000 | ~5 MB |

**Total: ~30 MB/month** - very manageable

---

## API Cost Considerations

This implementation adds **zero additional API calls** - it simply captures and stores data that's already being fetched. The only overhead is:
- Database inserts (free with Supabase)
- Slightly larger edge function response time (~10-20ms for inserts)

This will actually help **reduce** future API costs by enabling caching and avoiding re-fetching data for recently-searched tokens.
