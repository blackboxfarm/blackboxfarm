
# Plan: DEX Status Trigger System for Intel XBot

## Concept
Create a parallel posting stream that monitors DexScreener for token milestone events (DEX paid, CTO, boosts, ads) and uses these as triggers to post wallet analysis with contextual comments. This augments the existing top 50 trending cycle.

## How @dexsignals Works (Our Reference)
They poll the **Top Boosted API** (`/token-boosts/top/v1`) which returns all recently boosted Solana tokens, then cross-reference with the **Orders API** (`/orders/v1/solana/{token}`) to detect specific paid statuses. We'll do the same but use the triggers for our wallet analysis posts.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    EXISTING SYSTEM                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Cloudflare   │───▶│  Scheduler   │───▶│   Queue      │       │
│  │ KV Worker    │    │ (4x daily)   │    │              │       │
│  │ Top 50       │    │              │    │              │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                               │                  │
│                                               ▼                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    POSTER                                 │   │
│  │  {comment1} = "First call out!" / "Still on Chart!" etc  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────────┐
│                    NEW DEX TRIGGER SYSTEM                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ DexScreener  │───▶│ DEX Scanner  │───▶│   Same       │       │
│  │ Top Boosts + │    │ (every 5min) │    │   Queue      │       │
│  │ Orders API   │    │              │    │              │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                    │                                   │
│         │                    ▼                                   │
│         │           ┌──────────────────────┐                    │
│         │           │ Trigger Tracking DB  │                    │
│         └──────────▶│ (dedup announced)    │                    │
│                     └──────────────────────┘                    │
│                                                                  │
│  {comment1} = "Just Paid Dex!" / "CTO Paid!" / "Boost 50x!" etc │
└─────────────────────────────────────────────────────────────────┘
```

## Trigger Types & Comments

| Event Detected | {comment1} Value | Description |
|----------------|------------------|-------------|
| New tokenProfile | " : Just Paid Dex!" | Token profile was just approved |
| New communityTakeover | " : CTO Paid!" | Community takeover approved |
| Boosts ≥50 | " : Boost 50x!" | High boost count detected |
| Boosts ≥100 | " : Boost 100x!" | Very high boost count |
| New tokenAd/trendingBarAd | " : Ads Started!" | Marketing ads approved |

## Database Changes

### New Table: `holders_intel_dex_triggers`
Tracks which tokens have been announced for each trigger type to prevent duplicates.

```sql
CREATE TABLE holders_intel_dex_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  trigger_type TEXT NOT NULL, -- 'dex_paid', 'cto', 'boost_50', 'boost_100', 'ads'
  detected_at TIMESTAMPTZ DEFAULT now(),
  posted_at TIMESTAMPTZ,
  queue_id UUID REFERENCES holders_intel_post_queue(id),
  boost_count INTEGER,
  UNIQUE(token_mint, trigger_type)
);
```

## New Edge Function: `holders-intel-dex-scanner`

Runs every 5 minutes via cron:

1. **Fetch Top Boosted Tokens**
   - Call `https://api.dexscreener.com/token-boosts/top/v1`
   - Filter for Solana chain

2. **For Each Token, Check Orders API**
   - Call `https://api.dexscreener.com/orders/v1/solana/{tokenMint}`
   - Detect approved orders: `tokenProfile`, `communityTakeover`, `tokenAd`, `trendingBarAd`
   - Check boost count thresholds (50, 100)

3. **Compare Against Tracking Table**
   - For each detected trigger, check if `(token_mint, trigger_type)` already exists
   - If new, it's a trigger event

4. **Queue New Triggers**
   - Insert into `holders_intel_post_queue` with custom `trigger_comment` column
   - Insert into `holders_intel_dex_triggers` to mark as announced
   - Random delays between posts (2-5 min apart)

## Poster Modifications

Update `holders-intel-poster` to:
1. Check for `trigger_comment` field on queue item
2. If present, use it for `{comment1}` instead of the milestone logic
3. Fallback to existing milestone logic if not present

## Cron Schedule

Add new cron job: `holdersintel-dex-scanner` running every 5 minutes
- Schedule: `*/5 * * * *`
- Calls the new scanner function

## Files to Create/Modify

### New Files
1. `supabase/functions/holders-intel-dex-scanner/index.ts` - Main scanner logic

### Modified Files
1. `supabase/functions/holders-intel-poster/index.ts` - Support custom trigger_comment
2. `supabase/functions/intel-xbot-start/index.ts` - Add new cron job
3. `supabase/functions/intel-xbot-kill/index.ts` - Include in kill switch

### Database Migration
1. Create `holders_intel_dex_triggers` table
2. Add `trigger_comment` column to `holders_intel_post_queue`

## Rate Limiting Considerations

- DexScreener Top Boosts API: No auth needed, reasonable rate limits
- Orders API: One call per token, batch with delays
- Limit to processing top 20-30 boosted tokens per scan to stay within limits

## Technical Notes

- The Orders API returns `paymentTimestamp` which helps us detect truly new vs old orders
- We filter for orders with `paymentTimestamp` within last 24 hours to ensure freshness
- Boost thresholds (50, 100) can be tuned based on what's meaningful
- The scanner will naturally catch tokens that are boosted AND trending, but posts will have different comments distinguishing the trigger
