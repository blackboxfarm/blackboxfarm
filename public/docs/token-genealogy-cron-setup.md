# Token Genealogy System - Cron Job Setup

## Overview
The Token Genealogy system tracks the top 200 trending tokens on Solana, links them to developers, and calculates integrity scores based on token performance.

## System Components

### Phase 1: Real-Time Top 200 Tracker
- **Edge Function**: `dexscreener-top-200-scraper`
  - Fetches top 200 trending Solana tokens from DexScreener API every 5 minutes
  - Updates `token_rankings` table with current rank, price, volume, market cap
  - Updates `token_lifecycle` table to track token journey over time
  - Triggers creator linking for new tokens

### Phase 2: Creator Linkage
- **Edge Function**: `token-creator-linker`
  - Links newly discovered tokens to developer profiles
  - Uses Helius API to find token creator wallets
  - Creates new developer profiles if needed
  - Updates `developer_tokens` table

### Phase 3: Integrity Scoring
- **Edge Function**: `calculate-developer-integrity`
  - Calculates developer integrity scores (0-100) based on:
    - Tokens reaching top 10/50/200
    - Average time in rankings
    - Rug pulls and failed tokens
    - Success rate
  - Updates `developer_profiles` with scores and trust levels

## Database Tables

### token_rankings
Stores historical ranking snapshots every 5 minutes
- `token_mint`, `rank`, `price_usd`, `volume_24h`, `market_cap`
- `captured_at` - timestamp of snapshot
- `is_in_top_200` - boolean flag

### token_lifecycle
Tracks each token's journey through the rankings
- `token_mint`, `first_seen_at`, `last_seen_at`
- `highest_rank`, `lowest_rank`
- `total_hours_in_top_200`
- `creator_wallet`, `developer_id`
- `current_status` - 'active', 'exited', 'archived'

### developer_profiles (enhanced)
Developer reputation and integrity data
- `integrity_score` (0-100)
- `trust_level` - 'trusted', 'verified', 'neutral', 'suspicious', 'scammer'
- `tokens_in_top_10_count`, `tokens_in_top_50_count`, `tokens_in_top_200_count`
- `avg_token_rank_achieved`, `avg_time_in_rankings_hours`

## Setting Up the Cron Job

### Prerequisites
1. Enable `pg_cron` extension in your Supabase project
2. Enable `pg_net` extension in your Supabase project

### SQL Setup
Run this SQL in your Supabase SQL Editor:

\`\`\`sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the top 200 scraper to run every 5 minutes
SELECT cron.schedule(
  'top-200-tracker',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/dexscreener-top-200-scraper',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Schedule integrity calculation to run hourly
SELECT cron.schedule(
  'developer-integrity-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/calculate-developer-integrity',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb,
    body := '{"recalculateAll": true}'::jsonb
  ) as request_id;
  $$
);
\`\`\`

**IMPORTANT**: Replace `SERVICE_ROLE_KEY` with your actual Supabase service role key

### Verify Cron Jobs
Check that jobs are scheduled:

\`\`\`sql
SELECT * FROM cron.job;
\`\`\`

### Monitor Cron Job Execution
Check execution history:

\`\`\`sql
SELECT * FROM cron.job_run_details 
WHERE jobid IN (
  SELECT jobid FROM cron.job 
  WHERE jobname IN ('top-200-tracker', 'developer-integrity-hourly')
)
ORDER BY start_time DESC
LIMIT 20;
\`\`\`

## Manual Triggering

You can manually trigger the functions for testing:

### Trigger Top 200 Scraper
\`\`\`sql
SELECT net.http_post(
  url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/dexscreener-top-200-scraper',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
);
\`\`\`

### Trigger Integrity Calculation
\`\`\`sql
SELECT net.http_post(
  url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/calculate-developer-integrity',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb,
  body := '{"recalculateAll": true}'::jsonb
);
\`\`\`

## UI Dashboard

Access the Token Genealogy Dashboard at:
**Super Admin Panel → Token Genealogy tab**

### Features:
- Real-time view of current top 200 tokens
- Top developers ranked by integrity score
- Token lifecycle tracking
- Developer reputation scores
- Risk indicators and red flags

## Data Collection Timeline

- **Day 1**: System starts tracking current top 200
- **Week 1**: 2,016 snapshots captured (every 5 mins for 7 days)
- **Month 1**: ~8,640 snapshots, rich movement data
- **3 Months**: Historical patterns emerge, creator reputations solidify

## Integrity Score Calculation

\`\`\`
Base Score: 50 (neutral)

Positive Signals:
+ Top 10 token: +15 points each
+ Top 50 token: +8 points each
+ Top 200 token: +3 points each
+ Longevity: Up to +20 points (based on hours in rankings)
+ Success rate >50%: +15 points
+ Success rate >75%: +10 points additional

Negative Signals:
- Rug pull: -30 points each
- Failed token: -5 points each

Final Score: Clamped to 0-100
\`\`\`

## Trust Levels

- **Trusted** (80-100): Proven track record
- **Verified** (60-79): Mostly successful launches
- **Neutral** (40-59): New or mixed record
- **Suspicious** (<40): Poor performance
- **Scammer** (<20 or any rug pulls): Avoid

## Best Practices

1. Monitor cron job execution logs regularly
2. Check for API rate limits (DexScreener)
3. Ensure Helius API key is valid and has sufficient credits
4. Review developer profiles manually for accuracy
5. Back up historical ranking data periodically

## Troubleshooting

### Cron job not running
- Check `cron.job_run_details` for errors
- Verify `pg_net` extension is enabled
- Confirm service role key is correct

### DexScreener API errors
- Check rate limiting
- Verify API endpoint is accessible
- Review error logs in edge function logs

### Creator linking failures
- Check Helius API credits
- Verify Helius API key is set in edge function secrets
- Review error logs for specific token mints

## Future Enhancements

- Historical backfill using Web Archive
- Pattern detection for coordinated pumps
- Predictive scoring for new tokens
- Community-driven reputation flags
- Integration with other data sources (Birdeye, CoinGecko)
