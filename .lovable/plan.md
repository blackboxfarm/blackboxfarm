
# Twitter Token Mention Scanner

## Overview
Build an automated system that monitors public Twitter/X posts for Solana token mentions, extracts contract addresses, and queues them for Holders Intel analysis. This creates a new discovery channel alongside the existing DEX scanner and search surge detector.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     TWITTER TOKEN MENTION SCANNER                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│   │   Twitter    │     │  twitter-token-  │     │  twitter_token_  │   │
│   │   API v2     │────▶│  mention-scanner │────▶│    mentions      │   │
│   │  /search     │     │  (Edge Function) │     │   (DB Table)     │   │
│   └──────────────┘     └────────┬─────────┘     └──────────────────┘   │
│                                 │                                       │
│                                 ▼                                       │
│                    ┌────────────────────────┐                          │
│                    │ holders_intel_post_queue│                          │
│                    │   (Existing Queue)      │                          │
│                    └────────────┬───────────┘                          │
│                                 │                                       │
│                                 ▼                                       │
│                    ┌────────────────────────┐                          │
│                    │  holders-intel-poster  │                          │
│                    │  (Posts Analysis)      │                          │
│                    └────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Database Schema
Create a `twitter_token_mentions` table to store discovered mentions:
- `id` (uuid) - Primary key
- `tweet_id` (text, unique) - Twitter post ID
- `tweet_text` (text) - Full tweet content
- `tweet_url` (text) - Direct link to tweet
- `author_username` (text) - Who posted
- `author_followers` (int) - Follower count (influence metric)
- `detected_contracts` (text[]) - Extracted Solana addresses
- `detected_tickers` (text[]) - Extracted $TICKER mentions
- `engagement_score` (int) - likes + retweets + replies
- `posted_at` (timestamptz) - When the tweet was posted
- `scanned_at` (timestamptz) - When we discovered it
- `queued_for_analysis` (bool) - Whether we queued it
- `queue_id` (uuid) - Reference to post_queue if queued

### Step 2: Edge Function - `twitter-token-mention-scanner`
Core functionality:
1. **Search queries** - Multiple parallel searches:
   - `pump.fun -is:retweet` - Pump.fun URL mentions
   - `$SOL OR solana token -is:retweet` - General Solana token chatter
   - Contract address patterns (32-44 char base58)

2. **Token extraction** - Reuse existing patterns from KOL scanner:
   - `pump.fun/coin/{address}` URLs
   - Standalone Solana addresses (base58, 32-44 chars)
   - $TICKER cashtag patterns

3. **Filtering logic**:
   - Skip tweets from accounts with <500 followers (noise filter)
   - Skip tweets older than 2 hours (fresh mentions only)
   - Skip already-seen tweet IDs (deduplication)
   - Skip tokens already in queue or recently posted

4. **Queueing**:
   - High-engagement tweets (>50 likes/RTs) get priority scheduling
   - Use existing `holders_intel_post_queue` with `trigger_source: 'twitter_mention'`
   - Add special `trigger_comment` like ` : Twitter Buzz!`

### Step 3: Cron Scheduling
Add to `intel-xbot-start`:
```
holdersintel-twitter-scanner-10min
Schedule: */10 * * * * (every 10 minutes)
Function: twitter-token-mention-scanner
```

Conservative 10-minute interval to stay within Twitter API rate limits (100-300 requests/15min on Basic tier).

### Step 4: Admin Dashboard Integration
Add to the Intel XBot Activity Log panel:
- New "Twitter Mentions" stats card showing:
  - Total mentions scanned
  - Unique tokens discovered
  - Tokens queued for analysis
- Filter option in the queue history: `trigger_source = 'twitter_mention'`

## API Considerations

### Twitter API Tier
You have `TWITTER_BEARER_TOKEN` configured. The search endpoint availability:
- **Basic ($100/mo)**: 100 requests/15min, 7-day lookback
- **Pro ($5000/mo)**: 300 requests/15min, 30-day lookback, full-archive optional

With 10-minute intervals and 1-2 queries per scan, Basic tier is sufficient.

### Search Query Examples
```
# Find pump.fun mentions with engagement
pump.fun -is:retweet -is:reply lang:en

# Find Solana cashtags
($SOL OR $BONK OR $WIF) pump -is:retweet

# Broader crypto meme token chatter
(solana OR $SOL) (gem OR alpha OR ape OR moon) -is:retweet
```

### Rate Limit Safety
- Track `x-rate-limit-remaining` header
- Pause scanning if remaining < 10
- Log rate limit status for monitoring

## Database Migrations

```sql
-- New table for Twitter mentions
CREATE TABLE twitter_token_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id TEXT UNIQUE NOT NULL,
  tweet_text TEXT NOT NULL,
  tweet_url TEXT,
  author_username TEXT,
  author_id TEXT,
  author_followers INT DEFAULT 0,
  detected_contracts TEXT[] DEFAULT '{}',
  detected_tickers TEXT[] DEFAULT '{}',
  engagement_score INT DEFAULT 0,
  likes_count INT DEFAULT 0,
  retweets_count INT DEFAULT 0,
  replies_count INT DEFAULT 0,
  posted_at TIMESTAMPTZ,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  queued_for_analysis BOOLEAN DEFAULT FALSE,
  queue_id UUID REFERENCES holders_intel_post_queue(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_twitter_mentions_contracts ON twitter_token_mentions USING GIN(detected_contracts);
CREATE INDEX idx_twitter_mentions_posted ON twitter_token_mentions(posted_at DESC);
CREATE INDEX idx_twitter_mentions_engagement ON twitter_token_mentions(engagement_score DESC);
```

## Technical Notes

### Reusable Code
The `pumpfun-kol-twitter-scanner` already has:
- `extractTickers()` - Regex patterns for $TICKER mentions
- `extractContracts()` - Solana address + pump.fun URL extraction
- `classifyTweet()` - Sentiment and type classification

These can be imported or duplicated in the new scanner.

### Fallback: Apify
If Twitter API rate limits become problematic, you already have `APIFY_API_KEY` configured. Apify's Twitter search actor can be used as a fallback with different rate dynamics.

## Deliverables
1. `twitter_token_mentions` database table
2. `twitter-token-mention-scanner` edge function
3. Updated `intel-xbot-start` with new cron job
4. Updated `intel-xbot-kill` to stop the new scanner
5. Admin dashboard stats for Twitter mentions

## Risk Mitigation
- **No auto-replying** - Only scan and queue for analysis (avoids spam flags)
- **Rate limit awareness** - Conservative 10-min intervals, header monitoring
- **Deduplication** - Tweet ID uniqueness prevents duplicate processing
- **Quality filtering** - Follower count and engagement thresholds reduce noise
