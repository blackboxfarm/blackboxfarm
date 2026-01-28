
# Twitter Scanner: Single Token per 16-Minute Cycle

## Overview
Redesign the Twitter Token Mention Scanner to work within Twitter's free tier limit (1 request per 15 minutes) by searching for **one token at a time**, rotating through tokens every 16 minutes.

## New Logic Flow

```text
Every 16 minutes:
┌────────────────────────────────────────────────────────────────┐
│  1. SELECT strongest token not searched in last 2 hours       │
│     → Score by: times_seen, health_grade, boost_count, recency │
│                                                                │
│  2. Search Twitter for ONLY that one token                    │
│                                                                │
│  3. Store all results, sorted by quality                       │
│                                                                │
│  4. Mark token as "last_twitter_scanned_at = now()"           │
│                                                                │
│  5. Wait for next cron trigger (16 mins)                       │
│     → Pick next strongest token (different from before)        │
└────────────────────────────────────────────────────────────────┘

After 1 hour = 4 different tokens, each with their own tweet results
```

## Database Changes

### New Table: `twitter_scanner_state`
Track which tokens have been scanned and when:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `token_mint` | text | Token address (unique) |
| `symbol` | text | Token symbol |
| `last_scanned_at` | timestamptz | When we last searched Twitter for this token |
| `scan_count` | int | How many times we've scanned this token |
| `virality_score` | int | Calculated score for prioritization |
| `source` | text | Where token came from (dex_trigger, queue, seen) |

### Token Selection Query
Pick the strongest token that hasn't been scanned in the last 2 hours:

```sql
SELECT token_mint, symbol, virality_score
FROM twitter_scanner_state
WHERE last_scanned_at IS NULL 
   OR last_scanned_at < NOW() - INTERVAL '2 hours'
ORDER BY virality_score DESC, last_scanned_at ASC NULLS FIRST
LIMIT 1
```

### Virality Score Calculation
Combines multiple signals:

| Source | Score Boost |
|--------|-------------|
| DEX trigger (boost_100+) | +1000 |
| DEX trigger (dex_paid) | +500 |
| From post queue | +300 |
| Health grade A | +200 |
| Health grade B | +100 |
| Each time_seen | +50 |

## Edge Function Changes

### `twitter-token-mention-scanner/index.ts`

**Remove:**
- `MAX_TOKENS_PER_RUN` (was 10)
- `API_DELAY_MS` (was 10000ms)
- Loop through multiple tokens

**Add:**
1. Query `twitter_scanner_state` for single best token
2. If no token available, populate state table from sources:
   - `holders_intel_dex_triggers` (boost/paid tokens)
   - `holders_intel_post_queue` (recent queue items)
   - `holders_intel_seen_tokens` (seen with good grades)
3. Make **ONE** Twitter search request
4. Update `last_scanned_at` on the token

### Simplified Flow
```text
START
  ↓
Check twitter_scanner_state for best unscanned token
  ↓
If empty → Populate from dex_triggers, queue, seen_tokens
  ↓
Pick TOP 1 by virality_score where last_scanned_at > 2h ago
  ↓
Search Twitter for $SYMBOL OR contract_prefix
  ↓
Store all results in twitter_token_mentions
  ↓
Update token's last_scanned_at = NOW()
  ↓
END (wait for next cron in 16 mins)
```

## Cron Schedule Change

Current: Unknown/manual
New: Every 16 minutes

```sql
SELECT cron.schedule(
  'twitter-scanner-16min',
  '*/16 * * * *',  -- Every 16 minutes
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/twitter-token-mention-scanner',
    headers := '{"Authorization": "Bearer <anon_key>"}'::jsonb
  );
  $$
);
```

## Result: After 1 Hour

| Time | Token Searched | Results |
|------|----------------|---------|
| :00 | $COPPEGG (boost 100) | 15 tweets |
| :16 | $HOPE (dex_paid) | 8 tweets |
| :32 | $CLICK (boost 500) | 12 tweets |
| :48 | $CHICKEN (grade A) | 6 tweets |

**4 sets of sorted tweet results ready for review in admin panel**

## Admin UI Enhancement

Update `TwitterScrapesView.tsx` to show:
- **Current token being tracked** (next up for scan)
- **Last scanned token** with timestamp
- **Tokens in queue** with their virality scores
- Group results by token for easy review

## Technical Implementation Summary

1. **Create migration**: Add `twitter_scanner_state` table
2. **Update edge function**: Single-token logic with state tracking
3. **Schedule cron**: 16-minute interval
4. **Update admin UI**: Show scanner state and grouped results
