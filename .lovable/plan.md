
# Oracle System - Unified Developer Reputation Engine

## Overview

Create a new top-level **ORACLE** tab in Super Admin that serves as the public-facing developer reputation system. This tab will consolidate all existing reputation intelligence (Token Genealogy, Dev Alerts, Rug Investigator, Blacklist/Whitelist, Dev Teams, X Communities) into a single unified lookup system with:

1. **Real-time ingestion** - Hourly scans of DEX top 100 trending tokens
2. **Historical backfill** - Day-by-day backward crawl of DexScreener archives
3. **Unified lookup** - Enter token/wallet/X handle, get instant developer intelligence
4. **Auto-classification** - Automatic blacklist/whitelist based on pattern detection
5. **Mesh network** - Every query expands the reputation graph

---

## Architecture - Leveraging Existing Infrastructure

### What Already Exists (Will Be Reused)

| Component | Location | Purpose |
|-----------|----------|---------|
| `dexscreener-top-200-scraper` | Edge function | Fetches trending tokens, stores to `token_lifecycle` |
| `token-creator-linker` | Edge function | Links tokens to dev wallets via Helius |
| `offspring-mint-scanner` | Edge function | Traces 3-level wallet genealogy |
| `developer-reputation` | Edge function | Returns risk score for a wallet |
| `blacklist-enricher` | Edge function | CEX tracing, cross-linking, team detection |
| `x-community-enricher` | Edge function | Scrapes X community admins/mods |
| `developer_profiles` | Table | Stores dev reputation, rug counts, trust levels |
| `pumpfun_blacklist/whitelist` | Tables | Stores classified entities with cross-links |
| `x_communities` | Table | Stores X community data with linked wallets/tokens |
| `token_lifecycle` | Table | Stores token discovery and lifecycle data |

### What Will Be Built

| New Component | Purpose |
|---------------|---------|
| `oracle-unified-lookup` | Hub edge function - accepts token/wallet/X handle, orchestrates all existing functions |
| `oracle-x-reverse-lookup` | Finds all entities linked to an X account |
| `oracle-historical-backfill` | Fetches past DexScreener data via Wayback Machine or Apify |
| `oracle-auto-classifier` | Runs classification on new tokens, auto-blacklist/whitelist |
| `reputation_mesh` | New table - stores all discovered entity relationships |
| `oracle_backfill_jobs` | New table - tracks backfill progress day-by-day |
| `OracleTab.tsx` | New main tab component |
| `OracleDashboard.tsx` | Dashboard with lookup, classification feed, backfill status |

---

## System Flow

```text
INPUT (any of):
  - Token address
  - Wallet address  
  - @X handle

        │
        ▼
┌─────────────────────────────────────────────────────┐
│         oracle-unified-lookup (Hub)                 │
├─────────────────────────────────────────────────────┤
│  1. Detect input type (token/wallet/X handle)      │
│  2. If token → Call token-creator-linker           │
│  3. If X handle → Call oracle-x-reverse-lookup     │
│  4. Query ALL existing tables in parallel:         │
│     - developer_profiles                           │
│     - dev_wallet_reputation                        │
│     - pumpfun_blacklist / pumpfun_whitelist        │
│     - x_communities                                │
│     - dev_teams                                    │
│     - rug_investigations                           │
│  5. Aggregate into unified profile                 │
│  6. Generate recommendation text                   │
│  7. Store query to expand reputation_mesh          │
└─────────────────────────────────────────────────────┘
        │
        ▼
OUTPUT:
  - Risk score (0-100)
  - Traffic light (GREEN/YELLOW/RED)
  - Stats: rugs, slow bleeds, successes
  - Network associations (shared mods, funding sources)
  - Actionable recommendation text
```

---

## Historical Backfill Strategy

### Data Source Options

1. **Wayback Machine** - Archive.org may have snapshots of DexScreener trending pages
2. **Apify Historical Scraper** - Paid service ($3.99/1000 results) that can fetch Wayback Machine content
3. **Internal Data Growth** - Start fresh from today, build history organically

### Recommended Approach: Hybrid

Since DexScreener's trending page changes constantly and may not have deep Wayback coverage, the backfill will:

1. **Attempt Wayback fetch** for each past day (going back 1 day at a time)
2. **If no data available**, mark day as "no_archive" and continue
3. **For any tokens found**, run full genealogy scan
4. **Track progress** in `oracle_backfill_jobs` table

### Backfill Job Flow

```text
Every 30 minutes (background cron):
  1. Get current backfill cursor (e.g., "2026-02-06")
  2. Attempt to fetch DexScreener snapshot for that date:
     - Try Wayback Machine API first
     - Fall back to Apify if needed
  3. For each token found:
     - Check if already in token_lifecycle
     - If new: Run token-creator-linker → offspring-mint-scanner
     - Run oracle-auto-classifier
  4. Mark day complete, move cursor back 1 day
  5. Stop when reaching a configurable limit (e.g., 365 days back)
```

### Hourly Real-Time Scan

```text
Every hour (0 * * * *):
  1. Call dexscreener-top-200-scraper (already exists)
  2. For each NEW token not previously scanned:
     - Trigger full genealogy: token-creator-linker + offspring-mint-scanner
     - Run oracle-auto-classifier
     - If score < 20: Auto-add to pumpfun_blacklist
     - If score > 70 + 3 successes: Auto-add to pumpfun_whitelist
  3. Store relationships in reputation_mesh
```

---

## Database Schema

### New Table: `reputation_mesh`

Stores all discovered entity relationships for graph queries:

```sql
CREATE TABLE reputation_mesh (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,  -- 'wallet', 'x_account', 'token', 'x_community'
  source_id TEXT NOT NULL,
  linked_type TEXT NOT NULL,
  linked_id TEXT NOT NULL,
  relationship TEXT NOT NULL, -- 'created', 'modded', 'funded', 'co_mod', 'promoted', 'same_team'
  confidence INTEGER DEFAULT 100,
  evidence JSONB,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  discovered_via TEXT, -- 'public_query', 'hourly_scan', 'backfill', 'manual'
  UNIQUE(source_type, source_id, linked_type, linked_id, relationship)
);

CREATE INDEX idx_mesh_source ON reputation_mesh(source_type, source_id);
CREATE INDEX idx_mesh_linked ON reputation_mesh(linked_type, linked_id);
CREATE INDEX idx_mesh_relationship ON reputation_mesh(relationship);
```

### New Table: `oracle_backfill_jobs`

Tracks historical backfill progress:

```sql
CREATE TABLE oracle_backfill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_date DATE NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'no_archive', 'failed'
  tokens_found INTEGER DEFAULT 0,
  tokens_scanned INTEGER DEFAULT 0,
  new_devs_discovered INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backfill_status ON oracle_backfill_jobs(status);
CREATE INDEX idx_backfill_date ON oracle_backfill_jobs(target_date DESC);
```

### Modify Existing Tables

```sql
-- Add auto-classification columns to blacklist/whitelist
ALTER TABLE pumpfun_blacklist ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN DEFAULT FALSE;
ALTER TABLE pumpfun_blacklist ADD COLUMN IF NOT EXISTS classification_score NUMERIC;
ALTER TABLE pumpfun_blacklist ADD COLUMN IF NOT EXISTS recommendation_text TEXT;

ALTER TABLE pumpfun_whitelist ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN DEFAULT FALSE;
ALTER TABLE pumpfun_whitelist ADD COLUMN IF NOT EXISTS classification_score NUMERIC;
ALTER TABLE pumpfun_whitelist ADD COLUMN IF NOT EXISTS recommendation_text TEXT;

-- Track when tokens were fully analyzed
ALTER TABLE token_lifecycle ADD COLUMN IF NOT EXISTS oracle_analyzed BOOLEAN DEFAULT FALSE;
ALTER TABLE token_lifecycle ADD COLUMN IF NOT EXISTS oracle_analyzed_at TIMESTAMPTZ;
ALTER TABLE token_lifecycle ADD COLUMN IF NOT EXISTS oracle_score NUMERIC;
```

---

## Edge Functions

### 1. `oracle-unified-lookup` (Hub Function)

Accepts any identifier type, orchestrates all lookups:

```typescript
// Input handling
if (input.startsWith('@')) → X account lookup
else if (isBase58(input, 32-44)) → Could be wallet OR token
else → Search all tables

// Parallel queries to existing tables
const [
  developerProfile,
  devWalletRep,
  blacklistEntry,
  whitelistEntry,
  xCommunities,
  devTeams,
  rugInvestigations
] = await Promise.all([...]);

// Aggregate and generate recommendation
const score = calculateAggregateScore(...);
const recommendation = generateRecommendation(score, stats);

// Store mesh links for graph growth
await storeMeshLinks(discoveredRelationships);

return { score, recommendation, stats, network };
```

### 2. `oracle-x-reverse-lookup`

Finds all entities linked to an X account:

```typescript
// Search all tables for X handle
const results = await Promise.all([
  supabase.from('x_communities').select('*')
    .or(`admin_usernames.cs.{${handle}},moderator_usernames.cs.{${handle}}`),
  supabase.from('dev_teams').select('*')
    .contains('member_twitter_accounts', [handle]),
  supabase.from('pumpfun_blacklist').select('*')
    .contains('linked_twitter', [handle]),
  supabase.from('pumpfun_whitelist').select('*')
    .contains('linked_twitter', [handle]),
  supabase.from('developer_profiles').select('*')
    .eq('twitter_handle', handle)
]);

// Return all linked wallets, tokens, communities
```

### 3. `oracle-historical-backfill`

Fetches and processes historical data:

```typescript
// Get next pending backfill date
const { data: job } = await supabase.from('oracle_backfill_jobs')
  .select('*')
  .eq('status', 'pending')
  .order('target_date', { ascending: false })
  .limit(1);

// Try Wayback Machine first
const waybackUrl = `https://web.archive.org/web/${formatDate(job.target_date)}/https://dexscreener.com/solana`;
const snapshot = await fetchWaybackSnapshot(waybackUrl);

// Extract tokens from snapshot (or use Apify)
const tokens = parseTokensFromSnapshot(snapshot);

// Process each new token
for (const token of tokens) {
  if (!await tokenExists(token)) {
    await supabase.functions.invoke('token-creator-linker', { body: { tokenMints: [token] }});
    await supabase.functions.invoke('oracle-auto-classifier', { body: { tokenMint: token }});
  }
}
```

### 4. `oracle-auto-classifier`

Runs classification algorithm on a token/developer:

```typescript
// Get developer stats from developer_profiles
const stats = await getDeveloperStats(developerId);

// Calculate score
let score = 50; // Base

// Negative signals
score -= stats.rug_pull_count * 30;
score -= stats.slow_drain_count * 20;
score -= stats.failed_tokens * 5;
if (stats.avg_token_lifespan_hours < 24) score -= 15;

// Positive signals
score += stats.successful_tokens * 15;
if (stats.reputation_score > 70) score += 10;
if (stats.total_tokens_created > 5 && stats.successful_tokens / stats.total_tokens_created > 0.5) score += 15;

// Clamp to 0-100
score = Math.max(0, Math.min(100, score));

// Auto-classify
if (score < 20 || stats.rug_pull_count > 0) {
  await addToBlacklist(developerId, score, generateReason(stats));
} else if (score > 70 && stats.successful_tokens >= 3) {
  await addToWhitelist(developerId, score, generateReason(stats));
}

return { score, classification, recommendation: generateRecommendation(score, stats) };
```

---

## Recommendation Text Templates

Based on classification score and stats:

```typescript
const templates = {
  // RED (0-19) - Serial Rugger
  serialRugger: (stats) => 
    `🔴 SERIAL RUGGER - ${stats.rug_pull_count} confirmed rugs, ${stats.slow_drain_count} slow bleeds. ` +
    `AVOID at all costs. This developer has a 0% success rate.`,

  // RED (20-39) - High Risk
  highRisk: (stats) =>
    `🔴 HIGH RISK - ${stats.failed_tokens} failed tokens, avg lifespan ${stats.avg_lifespan}hrs. ` +
    `If you enter, treat as a flip only. Set sell at 2x max, exit within 30 mins.`,

  // YELLOW (40-59) - Caution
  caution: (stats) =>
    `🟡 CAUTION - Mixed history (${stats.successful_tokens}/${stats.total_tokens} success rate). ` +
    `Previous tokens: ${stats.recent_tokens.join(', ')}. Reasonable for small positions with quick exit plan.`,

  // GREEN (60-79) - Moderate Trust
  moderateTrust: (stats) =>
    `🟢 MODERATE TRUST - ${stats.successful_tokens} successful tokens. ` +
    `Similar projects: ${stats.top_projects.join(', ')}. Standard due diligence applies.`,

  // BLUE (80-100) - Verified Builder
  verifiedBuilder: (stats) =>
    `🔵 VERIFIED BUILDER - Consistent track record with ${stats.successful_tokens} active tokens. ` +
    `Known projects: ${stats.top_projects.join(', ')}. Lower risk for longer-term positions.`
};
```

---

## UI Components

### New Tab Structure in SuperAdmin.tsx

Add ORACLE as a new top-level tab beside BLACKBOX:

```typescript
// In SuperAdmin.tsx TabsList
<TabsTrigger value="oracle" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/30 data-[state=active]:to-purple-500/20">
  🔮 Oracle
</TabsTrigger>

// New lazy-loaded tab
const OracleTab = lazy(() => import("@/components/admin/tabs/OracleTab"));

<TabsContent value="oracle">
  {activeTab === "oracle" && (
    <Suspense fallback={<TabLoader />}>
      <OracleTab />
    </Suspense>
  )}
</TabsContent>
```

### OracleTab.tsx - Sub-tabs

```typescript
const OracleTab = () => {
  const [activeSubTab, setActiveSubTab] = useState("lookup");
  
  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
      <TabsList>
        <TabsTrigger value="lookup">🔍 Intel Lookup</TabsTrigger>
        <TabsTrigger value="classifications">📊 Auto-Classifications</TabsTrigger>
        <TabsTrigger value="backfill">📅 Historical Backfill</TabsTrigger>
        <TabsTrigger value="mesh">🕸️ Reputation Mesh</TabsTrigger>
      </TabsList>
      
      <TabsContent value="lookup">
        <OracleIntelLookup />
      </TabsContent>
      <TabsContent value="classifications">
        <OracleClassificationsFeed />
      </TabsContent>
      <TabsContent value="backfill">
        <OracleBackfillStatus />
      </TabsContent>
      <TabsContent value="mesh">
        <OracleMeshViewer />
      </TabsContent>
    </Tabs>
  );
};
```

### OracleIntelLookup.tsx - Main Lookup Interface

```typescript
// Input field accepting token/wallet/@handle
<Input 
  placeholder="Enter token address, wallet, or @X handle..."
  value={query}
  onChange={(e) => setQuery(e.target.value)}
/>
<Button onClick={handleLookup}>Check Intel</Button>

// Result card
{result && (
  <Card className={`border-2 ${getColorClass(result.score)}`}>
    <CardHeader>
      <Badge>{result.trafficLight}</Badge>
      <CardTitle>{result.displayName}</CardTitle>
    </CardHeader>
    <CardContent>
      <div>Score: {result.score}/100</div>
      <div>Rugs: {result.stats.rugs} | Slow Bleeds: {result.stats.slowBleeds} | Successes: {result.stats.successes}</div>
      <div className="recommendation">{result.recommendation}</div>
      
      {/* Network associations */}
      <div>Shared Mods: {result.network.sharedMods.join(', ')}</div>
      <div>Related Tokens: {result.network.relatedTokens.join(', ')}</div>
    </CardContent>
  </Card>
)}
```

---

## Cron Jobs

### 1. Hourly Real-Time Scan

```sql
SELECT cron.schedule(
  'oracle-hourly-scan',
  '0 * * * *',  -- Every hour at :00
  $$
  SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/dexscreener-top-200-scraper',
    headers := '{"Authorization": "Bearer [SERVICE_KEY]"}'::jsonb
  );
  -- Followed by auto-classifier for new tokens
  SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/oracle-auto-classifier',
    headers := '{"Authorization": "Bearer [SERVICE_KEY]"}'::jsonb,
    body := '{"processNewTokens": true}'::jsonb
  );
  $$
);
```

### 2. Background Historical Backfill

```sql
SELECT cron.schedule(
  'oracle-historical-backfill',
  '*/30 * * * *',  -- Every 30 minutes
  $$
  SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/oracle-historical-backfill',
    headers := '{"Authorization": "Bearer [SERVICE_KEY]"}'::jsonb,
    body := '{"maxDaysPerRun": 1}'::jsonb
  );
  $$
);
```

---

## Implementation Phases

### Phase 1: Database & Core Functions (Days 1-2)
1. Create `reputation_mesh` table with indexes
2. Create `oracle_backfill_jobs` table
3. Add new columns to `pumpfun_blacklist`, `pumpfun_whitelist`, `token_lifecycle`
4. Create `oracle-unified-lookup` edge function (orchestrates existing functions)
5. Create `oracle-x-reverse-lookup` edge function

### Phase 2: Auto-Classification (Days 2-3)
6. Create `oracle-auto-classifier` edge function with scoring algorithm
7. Modify `dexscreener-top-200-scraper` to trigger auto-classifier for new tokens
8. Add recommendation text generation

### Phase 3: Historical Backfill (Days 3-4)
9. Create `oracle-historical-backfill` edge function
10. Implement Wayback Machine API integration
11. Add fallback to Apify if Wayback fails
12. Set up cron job for background backfill

### Phase 4: UI Components (Days 4-5)
13. Create `OracleTab.tsx` with sub-tabs
14. Create `OracleIntelLookup.tsx` - main lookup interface
15. Create `OracleClassificationsFeed.tsx` - live feed of auto-classifications
16. Create `OracleBackfillStatus.tsx` - progress tracker
17. Create `OracleMeshViewer.tsx` - entity relationship graph

### Phase 5: Integration & Polish (Days 5-6)
18. Add Oracle tab to SuperAdmin.tsx
19. Set up hourly cron job for real-time scans
20. Set up 30-minute cron job for backfill
21. Test end-to-end flow
22. Add public-facing lookup on /holders page

---

## Files to Create

| File | Type | Purpose |
|------|------|---------|
| `supabase/functions/oracle-unified-lookup/index.ts` | Edge function | Hub that orchestrates all lookups |
| `supabase/functions/oracle-x-reverse-lookup/index.ts` | Edge function | X handle → all linked entities |
| `supabase/functions/oracle-auto-classifier/index.ts` | Edge function | Scoring + auto-blacklist/whitelist |
| `supabase/functions/oracle-historical-backfill/index.ts` | Edge function | Wayback/Apify historical data fetch |
| `src/components/admin/tabs/OracleTab.tsx` | React component | Main Oracle tab container |
| `src/components/admin/oracle/OracleIntelLookup.tsx` | React component | Unified lookup interface |
| `src/components/admin/oracle/OracleClassificationsFeed.tsx` | React component | Live classification feed |
| `src/components/admin/oracle/OracleBackfillStatus.tsx` | React component | Backfill progress tracker |
| `src/components/admin/oracle/OracleMeshViewer.tsx` | React component | Entity relationship visualization |
| `src/hooks/useOracleLookup.ts` | React hook | Lookup query hook |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SuperAdmin.tsx` | Add ORACLE tab trigger + content |
| `supabase/functions/dexscreener-top-200-scraper/index.ts` | Trigger oracle-auto-classifier for new tokens |

---

## Technical Notes

### Historical Data Availability
- DexScreener doesn't provide a historical API
- Wayback Machine may have snapshots but coverage is unpredictable
- The system will start building history from today and attempt backfill where possible
- Each backfill attempt is tracked so we don't retry days with no archive

### Rate Limiting
- Helius API: 200ms delay between calls (already implemented)
- Wayback Machine: 1 request per second
- Apify: Based on plan limits
- Public queries: 10 per minute per IP

### Mesh Growth
- Every query adds relationships to `reputation_mesh`
- Graph expands organically with usage
- Cross-references are discovered and stored automatically
