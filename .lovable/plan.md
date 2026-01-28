

# Twitter Scanner Quality Filtering & Deduplication

## Problem
Currently the scanner processes all 20+ tweets individually, potentially queueing multiple copycat posts about the same token. This creates spam risk and dilutes impact.

## Solution
Add three layers of intelligent filtering:

### 1. Verified Account Priority
Request the `verified_type` user field from Twitter API to identify premium/verified accounts:
- **Blue subscribers** (`verified_type: 'blue'`)
- **Business accounts** (`verified_type: 'business'`)
- **Government** (`verified_type: 'government'`)

Add `is_verified` and `verified_type` columns to track this.

### 2. Enhanced Engagement Scoring
Twitter API also provides `impression_count` (views). Update scoring to weight:
```
quality_score = (likes * 3) + (retweets * 5) + (replies * 2) + (views / 1000)
               + (is_verified ? 500 : 0)
               + (followers > 10000 ? 200 : 0)
```

### 3. Token-Level Deduplication
Before queueing, group all mentions by contract address, then pick only the BEST source:

```
For each token_mint found in this scan:
  1. Get all tweets mentioning this token
  2. Sort by quality_score DESC
  3. Only queue the #1 ranked tweet
  4. Mark others as "duplicate_of: best_tweet_id"
```

---

## Technical Implementation

### Database Changes
Add columns to `twitter_token_mentions`:
```sql
ALTER TABLE twitter_token_mentions ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE twitter_token_mentions ADD COLUMN verified_type TEXT;
ALTER TABLE twitter_token_mentions ADD COLUMN impression_count INT DEFAULT 0;
ALTER TABLE twitter_token_mentions ADD COLUMN quality_score INT DEFAULT 0;
ALTER TABLE twitter_token_mentions ADD COLUMN is_best_source BOOLEAN DEFAULT NULL;
ALTER TABLE twitter_token_mentions ADD COLUMN duplicate_of TEXT;
```

### Edge Function Changes

**1. Update Twitter API request** to include verification and impression fields:
```typescript
const params = new URLSearchParams({
  query,
  max_results: maxResults.toString(),
  'tweet.fields': 'created_at,public_metrics,author_id,impression_count', // Add impression_count
  'user.fields': 'username,public_metrics,verified_type', // Add verified_type
  expansions: 'author_id',
});
```

**2. Calculate quality score**:
```typescript
function calculateQualityScore(
  likes: number, 
  retweets: number, 
  replies: number, 
  impressions: number,
  followers: number,
  isVerified: boolean
): number {
  let score = (likes * 3) + (retweets * 5) + (replies * 2);
  score += Math.floor(impressions / 1000); // Views contribute less
  if (isVerified) score += 500; // Verified bonus
  if (followers > 10000) score += 200; // Influencer bonus
  if (followers > 50000) score += 300; // Major influencer bonus
  return score;
}
```

**3. Two-pass processing**:
- **Pass 1**: Collect all tweets mentioning tokens, save to DB with quality scores
- **Pass 2**: For each unique contract, find the highest-scoring tweet and only queue that one

```typescript
// After saving all mentions, deduplicate before queueing
const contractToTweets = new Map<string, Array<{tweet_id: string, quality_score: number}>>();

for (const mention of savedMentions) {
  for (const contract of mention.detected_contracts) {
    if (!contractToTweets.has(contract)) {
      contractToTweets.set(contract, []);
    }
    contractToTweets.get(contract)!.push({
      tweet_id: mention.tweet_id,
      quality_score: mention.quality_score,
    });
  }
}

// For each contract, pick the best tweet
for (const [contract, tweets] of contractToTweets) {
  tweets.sort((a, b) => b.quality_score - a.quality_score);
  const bestTweet = tweets[0];
  
  // Mark as best source
  await supabase
    .from('twitter_token_mentions')
    .update({ is_best_source: true })
    .eq('tweet_id', bestTweet.tweet_id);
  
  // Mark others as duplicates
  for (let i = 1; i < tweets.length; i++) {
    await supabase
      .from('twitter_token_mentions')
      .update({ 
        is_best_source: false,
        duplicate_of: bestTweet.tweet_id 
      })
      .eq('tweet_id', tweets[i].tweet_id);
  }
  
  // Only queue the best tweet
  if (bestTweet.quality_score >= MIN_QUALITY_THRESHOLD) {
    // Queue for analysis...
  }
}
```

### Configuration Thresholds
```typescript
const MIN_FOLLOWERS = 500;          // Keep existing
const MIN_QUALITY_SCORE = 50;       // New: minimum score to queue
const VERIFIED_BONUS = 500;         // Verified accounts get priority
const INFLUENCER_THRESHOLD = 10000; // Followers for influencer bonus
```

---

## Dashboard Updates
Add to Activity Log:
- Show `quality_score` in the mentions list
- Show verified badge (✓) for verified accounts
- Show "Best Source" vs "Duplicate" status
- Filter to show only "Best Sources"

---

## Summary of Changes

| File | Change |
|------|--------|
| `twitter_token_mentions` table | Add 6 new columns for quality tracking |
| `twitter-token-mention-scanner/index.ts` | Add verified/impressions API fields, quality scoring, two-pass deduplication |
| `IntelXBotActivityLog.tsx` | Show quality scores and verified badges |

## Expected Outcome
- From 20 tweets about the same token → Only the 1 best source gets queued
- Verified accounts with high engagement always win
- Copycat community shares get marked as duplicates but still logged for analytics

