

# Follower Audit Tool — Handle Input, Bot Detection Scoring

## Purpose
You enter an X/Twitter handle, press "Audit", and get back a bot/fake follower breakdown so you can vet accounts before paying them for marketing posts. No point paying someone with 140K followers if 90% are Nigerian click farms.

## How It Works

```text
[Enter Handle] [@142C_] [🔍 Audit Followers]
         │
         ▼
   Edge Function: follower-audit
         │
         ├── 1. Apify: apidojo/twitter-followers-scraper
         │      Sample 500 followers (cost: ~$0.50-1.00)
         │
         ├── 2. Score each sampled follower:
         │      • Default/egg avatar?        +20 bot pts
         │      • Username is random alphanum? +15
         │      • Account < 30 days old?      +15
         │      • 0 tweets, follows 1000+?    +25
         │      • Bio empty?                  +10
         │      • Location in known bot farms? +10
         │      • Following/Follower ratio >50? +15
         │
         └── 3. Return aggregate scores
```

## UI — New Sub-Tab "Follower Audit" Under Twitter Scrapes

Simple single-page tool:
- **Input**: Handle text field + "Audit" button
- **Results card** once complete:
  - Overall score: "Estimated Real Followers: ~38%" with color badge (green >70%, yellow 40-70%, red <40%)
  - Pie/donut chart: Real vs Suspicious vs Likely Bot
  - Geographic breakdown (top 5 locations from bios/locations)
  - Sample table: 20 most suspicious followers with their signals
  - Quick verdict: "⚠️ High bot ratio — not recommended for paid promotion" or "✅ Mostly organic — good candidate"

## Database

**New table: `follower_audits`**
- `id`, `handle` (text), `follower_count` (int), `sample_size` (int)
- `real_pct` (numeric), `suspicious_pct`, `bot_pct`
- `geo_breakdown` (jsonb), `signals_summary` (jsonb)
- `raw_sample` (jsonb — stores the 500 sampled profiles)
- `created_at`, `cost_credits` (numeric)
- RLS: super_admin read only

## Edge Function: `follower-audit`

1. Accepts `{ handle: string, sampleSize?: number }` (default 500)
2. Calls Apify `apidojo/twitter-followers-scraper` with the handle
3. Runs bot-scoring algorithm on each returned follower profile
4. Computes percentages and geo breakdown
5. Upserts into `follower_audits` table
6. Logs to `api_usage_log` for credit tracking
7. Returns full results to UI

## Files

- **Create**: `src/components/admin/twitter/FollowerAuditTab.tsx` — handle input, audit button, results display with donut chart and suspect table
- **Create**: `supabase/functions/follower-audit/index.ts` — Apify call + scoring
- **Edit**: `src/components/admin/TwitterScrapesView.tsx` — add "Follower Audit" sub-tab with `Search` icon
- **Migration**: Create `follower_audits` table with RLS

## Cost
Each audit samples ~500 followers via Apify at roughly $0.50–$1.50 per run. Results are cached in the table so you won't re-audit the same handle accidentally — the UI will show "Last audited X hours ago" with a re-run option.

