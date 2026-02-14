

## Fantasy Trade Red Flag Analysis and Filter Enhancement

### Problem
85% of fantasy positions (335 of 394) never hit the 1.5x target and remain "open" as stalled/dead tokens. Analysis of the data reveals clear statistical patterns separating winners from losers that can be used to reject bad tokens before entry.

### Data-Driven Red Flags Identified

1. **RugCheck Score > 5000**: The single biggest predictor of failure. 184 of 335 losers (55%) had scores above 5000, versus only 18 of 59 winners (30%). Tightening from current threshold to 5000 max would dramatically improve win rate.

2. **Low Holder Count at Entry (< 100)**: Winners averaged 374 holders; losers averaged 182. Tokens entering with fewer than ~100 holders rarely succeed.

3. **Low Volume (< 50 SOL)**: Winners averaged 242 SOL volume; losers averaged 135 SOL. Requiring minimum volume filters out low-conviction tokens.

4. **Micro Market Cap (< $5k)**: The under-$10k bucket had the worst win rate by far (23 winners vs 254 losers). Many of these are pump-and-dump or test tokens.

5. **Zero Socials**: Both groups show 0 socials, meaning this data isn't being captured well -- improving social detection could add another filter.

### Implementation Plan

#### Step 1: Build a "Post-Mortem Analysis" Dashboard Tab
Add a new **"Analysis"** sub-tab in the Fantasy section that shows:
- Side-by-side comparison table of winners vs losers entry metrics
- RugCheck score distribution chart
- Market cap bucket win rates
- Recommended filter thresholds with projected impact (e.g., "Rejecting rugcheck > 5000 would have avoided 184 losses, missed 18 wins")

#### Step 2: Add Tighter Qualification Gates in Watchlist Monitor
Update `pumpfun-watchlist-monitor` qualification criteria:
- **RugCheck max score**: Lower from current soft threshold to **5000** (configurable in `pumpfun_monitor_config`)
- **Minimum holder count at qualification**: Raise from 20 to **100**
- **Minimum volume**: Raise from 0.5 SOL to **5 SOL**
- **Minimum market cap**: Add new gate of **$5,000 minimum**
- All thresholds stored in `pumpfun_monitor_config` so they can be tuned without code changes

#### Step 3: Close Stale Open Positions
Add a mechanism (either manual button or automated) to bulk-close open fantasy positions that are clearly dead (e.g., current price dropped > 90% from entry, or token age > 48 hours with no recovery). This cleans up the dashboard and locks in the loss numbers for accurate reporting.

#### Step 4: Add New Config Columns
Add to `pumpfun_monitor_config`:
- `min_market_cap_usd` (default: 5000)
- `min_holder_count_fantasy` (default: 100)  
- `max_rugcheck_score_fantasy` (default: 5000)
- `min_volume_sol_fantasy` (default: 5)

### Technical Details

**Files to modify:**
- `supabase/functions/pumpfun-watchlist-monitor/index.ts` -- tighten qualification gates with new thresholds
- `src/components/admin/TokenCandidatesDashboard.tsx` -- add Analysis sub-tab with win/loss comparison
- New SQL migration -- add config columns and bulk-close stale positions

**Projected Impact (based on historical data):**
- With rugcheck <= 5000 + holders >= 100 + volume >= 5 SOL + mcap >= $5k:
  - Would keep ~41 of 59 winners (70% retention)
  - Would reject ~220 of 335 losers (66% elimination)  
  - Estimated new win rate: ~26% (up from 15%)
  - Net effect on $10 buys over 2 weeks: roughly $350+ gain instead of $233

