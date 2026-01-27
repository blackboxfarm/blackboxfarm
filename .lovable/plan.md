
# Dailies Tab - Daily Token Activity Dashboard

## Overview

This feature creates a new "Dailies" tab in the Super Admin dashboard that provides a consolidated daily view of all token activity across searches, surge alerts, and Twitter posts. Each token appears only once with status indicators showing which activities apply to it.

## Data Sources

The dashboard will aggregate data from these existing tables:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `token_search_log` | All public searches | token_mint, created_at, ip_address |
| `token_search_results` | Search result data | symbol, name, tier_dust, tier_retail, tier_serious, tier_whale |
| `holders_intel_surge_alerts` | Surge/spike detections | token_mint, alert_type, detected_at |
| `holders_intel_post_queue` | All Twitter posts | token_mint, trigger_source, status, tweet_id |
| `holders_intel_seen_tokens` | Seen tokens with metadata | symbol, name, health_grade |
| `token_socials_history` | Social links (Twitter/TG/Website) | twitter, telegram, website |

## UI Design

```text
+------------------------------------------------------------------+
| DAILIES                                    [<] Jan 27, 2026 [>]  |
|                                            [Today] [Calendar 📅] |
+------------------------------------------------------------------+
| Summary: 47 Tokens | 12 Posted | 3 Surges | 156 Searches         |
+------------------------------------------------------------------+
| [Token]     [Searched] [Surge] [Top50] [Dex] [Surge] [Actions]   |
|             [   ✓   ]  [  ✓ ] [Posted][Post][Post]  [Comments]   |
+------------------------------------------------------------------+
| $BONK       ✓ (23x)    🔥      ✓ 🔗    -     -      [Raw][Reply] |
| 4k7x...     ✓ (5x)     ⚡      -       ✓ 🔗  -      [_][_][_]    |
| $WIF        ✓ (12x)    -       ✓ 🔗    -     -      [✓][_][_]    |
| $PEPE       ✓ (8x)     📈      -       -     ✓ 🔗   [_][✓][_]    |
+------------------------------------------------------------------+
| Click token row to expand: Mint Link | Socials | Holder Counts   |
+------------------------------------------------------------------+
```

## Database Changes

### New Table: `dailies_manual_comments`

Tracks admin manual comment activity for each token per day:

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| token_mint | TEXT | Token address |
| comment_date | DATE | The day this applies to |
| raw_feed_comment | BOOLEAN | Raw feed comment made |
| reply_to_post | BOOLEAN | Reply to a post made |
| community_comment | BOOLEAN | X Community comment made |
| notes | TEXT | Optional admin notes |
| updated_at | TIMESTAMPTZ | Last update time |
| created_at | TIMESTAMPTZ | Creation time |

Unique constraint on (token_mint, comment_date) to ensure one record per token per day.

## Component Structure

### Main Component: `DailiesDashboard.tsx`

```typescript
// Key state
const [selectedDate, setSelectedDate] = useState<Date>(new Date());
const [tokens, setTokens] = useState<DailyToken[]>([]);
const [expandedToken, setExpandedToken] = useState<string | null>(null);
const [sortBy, setSortBy] = useState<'time' | 'searches' | 'posted'>('time');

// DailyToken interface
interface DailyToken {
  token_mint: string;
  symbol: string | null;
  name: string | null;
  
  // Activity flags
  wasSearched: boolean;
  searchCount: number;
  uniqueIps: number;
  
  wasSurge: boolean;
  surgeType: 'surge_10min' | 'spike_1hr' | 'trending_24hr' | null;
  
  postedTop50: boolean;
  top50TweetId: string | null;
  
  postedDexTrigger: boolean;
  dexTweetId: string | null;
  dexTriggerType: string | null;
  
  postedSurge: boolean;
  surgeTweetId: string | null;
  
  // Holder data (from latest search result)
  totalHolders: number | null;
  dustHolders: number | null;
  realHolders: number | null;
  healthGrade: string | null;
  
  // Socials
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  
  // Manual comment tracking
  rawFeedComment: boolean;
  replyToPost: boolean;
  communityComment: boolean;
  
  // Timestamps
  firstActivityAt: Date;
  lastActivityAt: Date;
}
```

### Data Fetching Strategy

The component will use a single aggregating query (via RPC function) to fetch all token activity for a given date:

```sql
-- get_dailies_for_date(p_date DATE)
WITH searches AS (
  SELECT 
    token_mint,
    COUNT(*) as search_count,
    COUNT(DISTINCT ip_address) as unique_ips,
    MIN(created_at) as first_search,
    MAX(created_at) as last_search
  FROM token_search_log
  WHERE created_at::date = p_date
  GROUP BY token_mint
),
surges AS (
  SELECT token_mint, alert_type, queue_id
  FROM holders_intel_surge_alerts
  WHERE detected_at::date = p_date
),
posts_top50 AS (
  SELECT token_mint, tweet_id, posted_at
  FROM holders_intel_post_queue
  WHERE created_at::date = p_date 
    AND trigger_source = 'scheduler'
    AND status = 'posted'
),
posts_dex AS (
  SELECT pq.token_mint, pq.tweet_id, pq.posted_at, dt.trigger_type
  FROM holders_intel_post_queue pq
  JOIN holders_intel_dex_triggers dt ON dt.queue_id = pq.id
  WHERE pq.created_at::date = p_date
    AND pq.trigger_source = 'dex_scanner'
    AND pq.status = 'posted'
),
posts_surge AS (
  SELECT pq.token_mint, pq.tweet_id, pq.posted_at
  FROM holders_intel_post_queue pq
  JOIN holders_intel_surge_alerts sa ON sa.queue_id = pq.id
  WHERE pq.created_at::date = p_date
    AND pq.status = 'posted'
),
all_tokens AS (
  SELECT DISTINCT token_mint FROM searches
  UNION
  SELECT DISTINCT token_mint FROM surges
  UNION
  SELECT DISTINCT token_mint FROM posts_top50
  UNION
  SELECT DISTINCT token_mint FROM posts_dex
  UNION
  SELECT DISTINCT token_mint FROM posts_surge
)
SELECT 
  at.token_mint,
  -- Join with seen_tokens for metadata
  st.symbol,
  st.name,
  st.health_grade,
  -- Search data
  s.search_count,
  s.unique_ips,
  -- Surge data
  su.alert_type,
  -- Post data
  p50.tweet_id as top50_tweet_id,
  pd.tweet_id as dex_tweet_id,
  pd.trigger_type as dex_trigger_type,
  ps.tweet_id as surge_tweet_id,
  -- Manual comments
  mc.raw_feed_comment,
  mc.reply_to_post,
  mc.community_comment
FROM all_tokens at
LEFT JOIN holders_intel_seen_tokens st ON st.token_mint = at.token_mint
LEFT JOIN searches s ON s.token_mint = at.token_mint
LEFT JOIN surges su ON su.token_mint = at.token_mint
LEFT JOIN posts_top50 p50 ON p50.token_mint = at.token_mint
LEFT JOIN posts_dex pd ON pd.token_mint = at.token_mint
LEFT JOIN posts_surge ps ON ps.token_mint = at.token_mint
LEFT JOIN dailies_manual_comments mc ON mc.token_mint = at.token_mint AND mc.comment_date = p_date
ORDER BY COALESCE(s.last_search, p50.posted_at, pd.posted_at, ps.posted_at) DESC;
```

## Features

### 1. Date Navigation
- Left/Right arrows to navigate days
- "Today" button to jump to current date
- Calendar popover for date picker
- Disabled future dates

### 2. Real-time Updates
- When viewing today, subscribe to realtime changes on:
  - `token_search_log`
  - `holders_intel_surge_alerts`
  - `holders_intel_post_queue`
  - `dailies_manual_comments`
- Automatic refresh when new activity detected

### 3. Activity Indicators

| Column | Icon When True | Meaning |
|--------|----------------|---------|
| Searched | ✓ (count) | Token was searched, shows count |
| Surge | ⚡/🔥/📈 | Surge/Spike/Trending detected |
| Top 50 | ✓ 🔗 | Posted via scheduler, link to tweet |
| Dex | ✓ 🔗 | Posted via dex_scanner, link to tweet |
| Surge Post | ✓ 🔗 | Posted via surge alert, link to tweet |

### 4. Expandable Row Details

Clicking a token row expands to show:
- **Mint**: Full address with copy button and Solscan link
- **Socials**: Twitter/Telegram/Website as clickable icons
- **Holder Counts**: Total / Dust / Real / Health Grade
- **Activity Timeline**: Chronological list of all activities

### 5. Manual Comment Tracking

Three checkbox columns that persist to `dailies_manual_comments`:
- **Raw**: Commented in raw X feed
- **Reply**: Replied to a post
- **Community**: Commented in X Community

Toggling any checkbox immediately upserts to database.

### 6. Sorting Options

- **Time**: Most recent activity first (default)
- **Searches**: Most searched tokens first
- **Posted**: Posted tokens first, then by post count

### 7. Summary Stats Bar

Shows at top of table:
- Total unique tokens for the day
- Total posted to Twitter
- Total surge/spike alerts
- Total search count

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| SQL Migration | CREATE | `dailies_manual_comments` table + RPC function |
| `src/components/admin/DailiesDashboard.tsx` | CREATE | Main dashboard component |
| `src/pages/SuperAdmin.tsx` | MODIFY | Add "Dailies" tab and lazy import |

## Implementation Details

### Component Layout

```tsx
<div className="space-y-4">
  {/* Header with date navigation */}
  <div className="flex items-center justify-between">
    <h2>Dailies</h2>
    <DateNavigation date={selectedDate} onDateChange={setSelectedDate} />
  </div>
  
  {/* Summary stats */}
  <SummaryStatsBar tokens={tokens} />
  
  {/* Sort controls */}
  <div className="flex gap-2">
    <Button onClick={() => setSortBy('time')}>By Time</Button>
    <Button onClick={() => setSortBy('searches')}>By Searches</Button>
    <Button onClick={() => setSortBy('posted')}>By Posted</Button>
  </div>
  
  {/* Token table */}
  <Table>
    <TableHeader>...</TableHeader>
    <TableBody>
      {sortedTokens.map(token => (
        <DailyTokenRow 
          key={token.token_mint}
          token={token}
          isExpanded={expandedToken === token.token_mint}
          onToggle={() => setExpandedToken(prev => prev === token.token_mint ? null : token.token_mint)}
          onCommentChange={handleCommentChange}
        />
      ))}
    </TableBody>
  </Table>
</div>
```

### Real-time Subscription (Today Only)

```typescript
useEffect(() => {
  if (!isToday(selectedDate)) return;
  
  const channel = supabase
    .channel('dailies-realtime')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'token_search_log' },
      () => refetch()
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'holders_intel_post_queue' },
      () => refetch()
    )
    .subscribe();
    
  return () => supabase.removeChannel(channel);
}, [selectedDate]);
```

## Technical Notes

1. **Performance**: The RPC function uses CTEs to minimize table scans
2. **Deduplication**: `UNION` in `all_tokens` CTE ensures unique mints
3. **Metadata Resolution**: Falls back to `holders_intel_seen_tokens` for symbol/name
4. **Social Links**: Joins `token_socials_history` for latest social URLs
5. **Comment Persistence**: Immediate upsert on checkbox toggle, optimistic UI update

## Expected Behavior

When you open the Dailies tab:
1. Shows today's date by default
2. Displays all tokens that had any activity today (searched, surged, or posted)
3. Each row shows at-a-glance status indicators
4. Click row to expand and see full details with links
5. Toggle checkboxes to track manual X engagement
6. Navigate to past days to review historical activity
7. Real-time updates as new searches/posts occur (today only)
