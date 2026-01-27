
# Holders Dashboard: API Resource Tracking & Historical Data System

## Current State Analysis

### Phase 1: Initial Page Load (`/holders` - blank state)
**Resources Used:**
| Resource | API/Endpoint | Credits/Cost | Frequency |
|----------|-------------|--------------|-----------|
| Page Visit Tracking | Supabase Insert | Free | 1x per visit |
| Banner Ads Fetch | Supabase Query | Free | 1x per load |
| KOL Wallets Cache | Supabase Query | Free | 1x per load |
| SOL Price | sol-price edge function | Free | 1x per load |

### Phase 2: Token Report Generation
When a user enters a token address, the `bagless-holders-report` edge function orchestrates multiple parallel API calls:

```text
+------------------+     +-------------------+     +------------------+
|   DexScreener    |     |     Solscan       |     |    RugCheck      |
|   (2 calls)      |     |   (2-3 calls)     |     |   (1 call)       |
+------------------+     +-------------------+     +------------------+
         |                        |                        |
         v                        v                        v
+------------------------------------------------------------------------+
|                    bagless-holders-report                               |
|                    (orchestrator function)                              |
+------------------------------------------------------------------------+
         |                        |                        |
         v                        v                        v
+------------------+     +-------------------+     +------------------+
|  Helius RPC      |     |   Pump.fun API    |     |  Jupiter/Gecko   |
| (1-2 calls)      |     |   (0-1 calls)     |     | (0-2 fallback)   |
+------------------+     +-------------------+     +------------------+
```

**Detailed API Breakdown:**

| Service | Endpoint | Purpose | Est. Credits | Rate Limit |
|---------|----------|---------|--------------|------------|
| **DexScreener** | `/latest/dex/tokens/{mint}` | Pairs, price, socials | FREE | 300/min |
| **DexScreener** | `/orders/v1/solana/{mint}` | Paid status, CTO, boosts | FREE | 300/min |
| **Solscan Pro** | `/v2.0/token/markets` | Pool addresses | 1 credit | 100/min |
| **Solscan Pro** | `/v2.0/token/holders` | LP verification | 1 credit | 100/min |
| **RugCheck** | `/v1/tokens/{mint}/insiders/graph` | Bundled wallets | FREE | Unknown |
| **Helius RPC** | `getProgramAccounts` | All token holders | 100 credits | 50/min |
| **Pump.fun** | `/coins/{mint}` | Creator info, curve | FREE | Unknown |
| **BonkFun/BagsFM** | Various | Creator info | FREE | Unknown |
| **Jupiter** | `/v4/price` | Price fallback | FREE | 600/min |
| **CoinGecko** | `/simple/token_price` | Price fallback | FREE | 50/min |

**Post-Report Processing:**

| Service | Endpoint | Purpose | Credits |
|---------|----------|---------|---------|
| **wallet-sns-lookup** | Helius + SNS Registry | Twitter handles | 1-200 Helius |
| **capture-holder-snapshot** | Supabase Insert | Historical data | Free |
| **track-holder-movements** | Supabase Query/Insert | Movement detection | Free |

### Phase 3: Current Tracking Gaps

**What IS Tracked:**
- Helius API calls via `helius_api_usage` table
- Page visits via `holders_page_visits` table
- Holder snapshots via `holder_snapshots` table
- Holder movements via `holder_movements` table

**What is NOT Tracked:**
- DexScreener API calls (no logging)
- Solscan Pro API calls (no credit tracking)
- RugCheck API calls (no logging)
- Pump.fun/BonkFun/BagsFM API calls (no logging)
- Jupiter/CoinGecko price API calls (no logging)
- Aggregate token report costs per request
- User-level vs system-level API consumption

---

## Proposed Solution: Unified API Tracking System

### 1. New Database Table: `api_usage_log`

```sql
CREATE TABLE api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT now(),
  service_name TEXT NOT NULL, -- 'helius', 'dexscreener', 'solscan', 'rugcheck', 'pumpfun', 'jupiter', 'coingecko'
  endpoint TEXT NOT NULL,
  method TEXT,
  token_mint TEXT, -- link to specific token analysis
  function_name TEXT, -- which edge function made the call
  request_type TEXT, -- 'holders_report', 'price_discovery', 'sns_lookup', etc.
  response_status INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  credits_used NUMERIC DEFAULT 0, -- for paid services
  is_cached BOOLEAN DEFAULT false, -- was result served from cache?
  user_id UUID, -- if authenticated
  session_id TEXT, -- for anonymous tracking
  metadata JSONB -- flexible storage for service-specific data
);
```

### 2. New Database Table: `token_analysis_costs`

Track aggregate cost per token analysis:

```sql
CREATE TABLE token_analysis_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  analysis_date DATE DEFAULT CURRENT_DATE,
  total_api_calls INTEGER DEFAULT 0,
  helius_credits INTEGER DEFAULT 0,
  solscan_credits INTEGER DEFAULT 0,
  dexscreener_calls INTEGER DEFAULT 0,
  rugcheck_calls INTEGER DEFAULT 0,
  pumpfun_calls INTEGER DEFAULT 0,
  jupiter_calls INTEGER DEFAULT 0,
  total_response_time_ms INTEGER DEFAULT 0,
  holder_count INTEGER,
  user_id UUID,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token_mint, analysis_date, session_id)
);
```

### 3. Shared API Logger Module

Create `supabase/functions/_shared/api-logger.ts`:

```typescript
interface ApiLogParams {
  serviceName: 'helius' | 'dexscreener' | 'solscan' | 'rugcheck' | 'pumpfun' | 'jupiter' | 'coingecko';
  endpoint: string;
  method?: string;
  tokenMint?: string;
  functionName: string;
  requestType?: string;
  credits?: number;
  isCached?: boolean;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export async function logApiCall(params: ApiLogParams): Promise<ApiLogger> {
  // Returns complete() function to finalize with status/timing
}
```

### 4. Holders Dashboard Components

**New Dashboard Tab: "Resource Usage"**

```text
+------------------------------------------------------------------+
|  RESOURCE USAGE DASHBOARD                              [Refresh] |
+------------------------------------------------------------------+
|  Time Range: [Today] [7 Days] [30 Days] [Custom]                 |
+------------------------------------------------------------------+

+------------------+  +------------------+  +------------------+
| Total API Calls  |  | Est. Monthly Cost|  | Avg Response Time|
|     12,847       |  |    $45.20        |  |     342ms        |
+------------------+  +------------------+  +------------------+

+------------------------------------------------------------------+
|  API USAGE BY SERVICE                                             |
+------------------------------------------------------------------+
|  [Bar Chart: Helius | Solscan | DexScreener | RugCheck | Other]  |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|  CREDIT CONSUMPTION TREND                                         |
+------------------------------------------------------------------+
|  [Line Chart: Daily usage with service breakdown]                 |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|  TOP TOKENS BY RESOURCE COST                                      |
+------------------------------------------------------------------+
|  1. $BONK - 847 API calls, 234 Helius credits                    |
|  2. $WIF  - 623 API calls, 189 Helius credits                    |
|  3. $PEPE - 412 API calls, 156 Helius credits                    |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|  SERVICE HEALTH STATUS                                            |
+------------------------------------------------------------------+
|  Helius:      [====] 42/50 calls/min remaining                   |
|  Solscan Pro: [==  ] 23/100 calls/min remaining                  |
|  DexScreener: [====] 287/300 calls/min remaining                 |
+------------------------------------------------------------------+
```

**New Dashboard Tab: "Historical Token Data"**

```text
+------------------------------------------------------------------+
|  HISTORICAL TOKEN DATA                                  [Export] |
+------------------------------------------------------------------+
|  Search Token: [________________________] [Search]               |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|  TOKENS WITH HISTORICAL DATA                                      |
+------------------------------------------------------------------+
|  Token          | Snapshots | Days Tracked | Last Update         |
|  $BONK          | 156       | 32 days      | 2 hours ago         |
|  $WIF           | 89        | 18 days      | 5 hours ago         |
|  $PEPE          | 234       | 45 days      | 1 hour ago          |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|  DIAMOND HANDS ANALYSIS AVAILABLE                                 |
+------------------------------------------------------------------+
|  Tokens with 7+ days of data: 47                                 |
|  Tokens with 30+ days of data: 12                                |
|  Total unique wallets tracked: 892,456                           |
+------------------------------------------------------------------+
```

---

## Implementation Steps

### Step 1: Database Schema (Migration)
1. Create `api_usage_log` table with indexes on timestamp, service_name, token_mint
2. Create `token_analysis_costs` aggregate table
3. Create RPC function `get_api_usage_stats()` for dashboard queries
4. Add RLS policies for super_admin access

### Step 2: Shared API Logger
1. Create `supabase/functions/_shared/api-logger.ts`
2. Update `bagless-holders-report` to use the logger
3. Update `dexscreener-api.ts` to log calls
4. Update `solscan-markets.ts` to log calls
5. Update `rugcheck-insiders.ts` to log calls
6. Update `creator-api.ts` to log calls

### Step 3: Dashboard Components
1. Create `src/components/admin/HoldersResourceDashboard.tsx`
2. Create `src/components/admin/HistoricalTokenDataDashboard.tsx`
3. Add new tabs to SuperAdmin page
4. Implement charts using recharts (already installed)

### Step 4: Cost Estimation Logic
1. Define credit costs per service:
   - Helius: Variable by method (1-100 credits)
   - Solscan Pro: 1 credit per call
   - Others: Free (but track for rate limiting)
2. Create monthly projection calculations
3. Add alerting thresholds for budget limits

---

## Technical Considerations

### Rate Limiting Awareness
The new logging system will help identify:
- Which tokens are most expensive to analyze
- Peak usage hours for rate limit planning
- Which services are bottlenecks

### Caching Opportunities
With visibility into API usage, you can:
- Cache DexScreener pair data (changes slowly)
- Cache RugCheck insiders data (15-30 min TTL)
- Cache Solscan markets data (1 hour TTL)
- Pre-warm popular tokens to reduce real-time load

### Cost Optimization
Projected savings from tracking:
- Identify unnecessary repeated calls
- Batch similar requests
- Prioritize cached data for high-traffic tokens

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/_shared/api-logger.ts` | CREATE | Unified API logging |
| `supabase/functions/bagless-holders-report/index.ts` | MODIFY | Add logging calls |
| `supabase/functions/_shared/dexscreener-api.ts` | MODIFY | Add logging |
| `supabase/functions/_shared/solscan-markets.ts` | MODIFY | Add logging |
| `supabase/functions/_shared/rugcheck-insiders.ts` | MODIFY | Add logging |
| `supabase/functions/_shared/creator-api.ts` | MODIFY | Add logging |
| `src/components/admin/HoldersResourceDashboard.tsx` | CREATE | Usage dashboard |
| `src/components/admin/HistoricalTokenDataDashboard.tsx` | CREATE | Token history view |
| `src/pages/SuperAdmin.tsx` | MODIFY | Add new tabs |

### Database Migration Required
A SQL migration will create the new tables and RPC functions.
