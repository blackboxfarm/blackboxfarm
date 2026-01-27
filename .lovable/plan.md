
# Search Surge Alert System

## Overview

This feature creates an automated alert system that monitors the `token_search_log` table for tokens experiencing unusual search activity (spikes/surges), then automatically triggers the Intel XBot to post about these popular tokens with special milestone comments like "Search Surge!" or "Interest Spike!"

## How It Works

```text
token_search_log (already logging searches)
         |
         v
+------------------------------------+
|  search-surge-scanner (NEW)        |
|  - Runs every 5 minutes via cron   |
|  - Queries for surge patterns      |
+------------------------------------+
         |
   Detected surge?
         |
         v
+------------------------------------+
|  holders_intel_surge_alerts (NEW)  |
|  - Tracks detected surges          |
|  - Prevents duplicate posts        |
+------------------------------------+
         |
         v
+------------------------------------+
|  holders_intel_post_queue          |
|  - trigger_comment = " : Search    |
|    Surge!" or " : Interest Spike!" |
|  - trigger_source = "surge_scanner"|
+------------------------------------+
         |
         v
+------------------------------------+
|  holders-intel-poster              |
|  - Already uses trigger_comment    |
|    for {comment1} variable         |
|  - Posts to @HoldersIntel          |
+------------------------------------+
```

## Surge Detection Thresholds

The scanner will look for these patterns in `token_search_log`:

| Alert Type | Threshold | Comment Text | Priority |
|------------|-----------|--------------|----------|
| **Search Surge** | 5+ searches in 10 minutes | " : Search Surge!" | 1 |
| **Interest Spike** | 15+ searches in 1 hour | " : Interest Spike!" | 2 |
| **Trending Search** | 30+ searches in 24 hours | " : Trending Token!" | 3 |

The scanner will use the **highest priority trigger** for each token (e.g., if 5 in 10min AND 30 in 24hr, use "Search Surge!").

## Database Changes

### New Table: `holders_intel_surge_alerts`

```sql
CREATE TABLE holders_intel_surge_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  alert_type TEXT NOT NULL, -- 'surge_10min', 'spike_1hr', 'trending_24hr'
  search_count INTEGER NOT NULL,
  time_window_minutes INTEGER NOT NULL,
  unique_ips INTEGER,
  detected_at TIMESTAMPTZ DEFAULT now(),
  queue_id UUID, -- FK to post_queue if queued
  posted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups and prevent duplicates
CREATE UNIQUE INDEX idx_surge_alerts_token_type_24hr 
ON holders_intel_surge_alerts(token_mint, alert_type, (detected_at::date));
```

This table tracks:
- Which tokens triggered surge alerts
- The type and magnitude of the surge
- Whether it was posted
- One surge alert per token per type per day (prevent spam)

## Edge Function: `search-surge-scanner`

### Logic Flow

```typescript
// 1. Query for surge patterns
const surgePatterns = [
  { type: 'surge_10min', minutes: 10, threshold: 5, comment: ' : Search Surge!' },
  { type: 'spike_1hr', minutes: 60, threshold: 15, comment: ' : Interest Spike!' },
  { type: 'trending_24hr', minutes: 1440, threshold: 30, comment: ' : Trending Token!' },
];

// 2. For each pattern, find tokens that exceed threshold
for (const pattern of surgePatterns) {
  const { data: surges } = await supabase
    .from('token_search_log')
    .select('token_mint, COUNT(*) as search_count')
    .gte('created_at', new Date(Date.now() - pattern.minutes * 60 * 1000).toISOString())
    .groupBy('token_mint')
    .gte('search_count', pattern.threshold);
  
  // 3. For each surge, check if already alerted today
  for (const surge of surges) {
    const { data: existing } = await supabase
      .from('holders_intel_surge_alerts')
      .select('id')
      .eq('token_mint', surge.token_mint)
      .eq('alert_type', pattern.type)
      .gte('detected_at', todayStart)
      .maybeSingle();
    
    if (!existing) {
      // 4. Queue for posting with special trigger_comment
      await supabase.from('holders_intel_post_queue').insert({
        token_mint: surge.token_mint,
        symbol: await getSymbol(surge.token_mint),
        status: 'pending',
        scheduled_at: new Date(Date.now() + 60000).toISOString(), // 1 min from now
        trigger_comment: pattern.comment,
        trigger_source: 'surge_scanner',
      });
      
      // 5. Record the alert
      await supabase.from('holders_intel_surge_alerts').insert({
        token_mint: surge.token_mint,
        alert_type: pattern.type,
        search_count: surge.search_count,
        time_window_minutes: pattern.minutes,
      });
    }
  }
}
```

### SQL Query for Surge Detection

```sql
-- Find tokens with 5+ searches in last 10 minutes
SELECT 
  token_mint,
  COUNT(*) as search_count,
  COUNT(DISTINCT ip_address) as unique_ips
FROM token_search_log
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY token_mint
HAVING COUNT(*) >= 5;
```

## Cron Job Integration

Add to `intel-xbot-start` jobs array:

```typescript
{
  name: 'holdersintel-surge-scanner-5min',
  schedule: '*/5 * * * *',  // Every 5 minutes
  function: 'search-surge-scanner'
}
```

This will run alongside the existing `holders-intel-dex-scanner` and feed into the same post queue.

## Admin Dashboard Component

New component showing surge alerts in the Activity Log:

```text
+------------------------------------------------------------------+
|  SURGE ALERTS                                        [Last 24hr] |
+------------------------------------------------------------------+
|  Token     | Type          | Searches | Unique IPs | Status      |
+------------------------------------------------------------------+
|  $BONK     | Search Surge  | 12       | 8          | Posted ✓    |
|  $WIF      | Interest Spike| 23       | 15         | Pending...  |
|  $PEPE     | Trending      | 47       | 32         | Posted ✓    |
+------------------------------------------------------------------+
```

## Safety Mechanisms

1. **One alert per type per token per day** - Prevents spam if a token stays trending
2. **Quality checks still apply** - The `holders-intel-poster` will still check:
   - Minimum 50 holders
   - Health grade not F
3. **Cooldown integration** - Respects existing seen_tokens cooldown logic
4. **IP diversity check** - Could optionally require 3+ unique IPs to trigger (prevent self-farming)

## Configuration Options (Future)

Could add a config table for admin control:

| Setting | Default | Description |
|---------|---------|-------------|
| surge_10min_threshold | 5 | Searches needed in 10 min |
| spike_1hr_threshold | 15 | Searches needed in 1 hour |
| trending_24hr_threshold | 30 | Searches needed in 24 hours |
| require_unique_ips | 3 | Minimum unique IPs for alert |
| enabled | true | Master on/off switch |

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| SQL Migration | CREATE | `holders_intel_surge_alerts` table |
| `supabase/functions/search-surge-scanner/index.ts` | CREATE | Surge detection edge function |
| `supabase/functions/intel-xbot-start/index.ts` | MODIFY | Add surge scanner cron job |
| `src/components/admin/SurgeAlertsPanel.tsx` | CREATE | Admin view of surge alerts |
| `src/pages/SuperAdmin.tsx` or ShareCardDemo | MODIFY | Add surge alerts panel |

## Implementation Sequence

1. **Database Migration** - Create `holders_intel_surge_alerts` table
2. **Edge Function** - Create `search-surge-scanner` with detection logic
3. **Cron Integration** - Add to `intel-xbot-start` for 5-minute polling
4. **Admin Panel** - Add visibility to surge alerts in Activity Log
5. **Testing** - Manually insert test searches to verify detection

## Expected Behavior

When a token gets searched 5+ times in 10 minutes:
1. Surge scanner detects the pattern
2. Creates alert record in `holders_intel_surge_alerts`
3. Queues token in `holders_intel_post_queue` with `trigger_comment = " : Search Surge!"`
4. Poster runs within 3 minutes, fetches fresh holder data
5. Posts tweet like: `$TOKEN : Search Surge! 📊 1,234 Total | ✅ 456 Real...`

This leverages the existing `{comment1}` template variable system already built into the poster!
