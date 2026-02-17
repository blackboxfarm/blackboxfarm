

# Rejected Tokens Backcheck & Dashboard

## Overview

Build a system to backcheck all rejected tokens (excluding mayhem) to determine if any were actually good -- tracking their ATH, bonding curve progress, graduation status, and current price. This creates a feedback loop to identify false-positive rejections and improve filtering criteria.

Currently there are ~17,300 rejected/dead/bombed tokens in the watchlist (0 mayhem). The top rejection reasons are `dev_full_exit` (3,100+), `known_abused_ticker` (1,367), `ticker_too_long` (~1,063), `ticker_bad_emoji` (368+), `name_bad_emoji` (209), `bump_bot_detected` (~227), `non_standard_supply` (72), and various `duplicate_ticker` entries.

---

## What Gets Built

### 1. New Database Table: `pumpfun_rejected_backcheck`

Stores the backcheck results for each rejected token:

- `token_mint`, `token_symbol`, `token_name`, `image_url`
- `rejection_reason`, `rejection_type`, `rejected_at` (from watchlist)
- `creator_wallet`
- `ath_price_usd`, `ath_bonding_curve_pct` (how far it got on the bonding curve at peak)
- `current_price_usd`, `current_market_cap_usd`
- `is_graduated` (did it graduate to Raydium?)
- `graduated_at`
- `current_holders`, `current_volume_24h_usd`
- `peak_market_cap_usd`
- `was_false_positive` (boolean -- true if the token graduated or hit significant ATH)
- `false_positive_score` (0-100, weighted score of how "good" the token actually was)
- `checked_at`, `check_count`

### 2. New Edge Function: `backcheck-rejected-tokens`

- Fetches rejected tokens from `pumpfun_watchlist` (excluding mayhem reasons)
- For each token, calls Solana Tracker / DexScreener to get current metrics, ATH, graduation status
- Calculates `ath_bonding_curve_pct` using the bonding curve formula
- Marks tokens as `was_false_positive = true` if they graduated or reached significant milestones
- Processes in batches of 25 with rate limiting (300ms delays)
- Supports `batch_size`, `offset`, and `max_batches` params for bulk backfill
- Cron-scheduled every 6 hours to continuously recheck

### 3. New UI Tab: "Rejected" in Pump.fun Monitor

Added as a third sub-tab alongside "Candidates" and "Retrace":

```
[Candidates] [Retrace] [Rejected]
```

The Rejected tab shows:
- Table of all rejected tokens (no mayhem) with columns:
  - Token (symbol + name + image)
  - Rejection Reason
  - Rejected At
  - Holders (at rejection vs current)
  - Market Cap (at rejection vs current)
  - ATH % Bonding Curve (color-coded: green if > 50%, gold if graduated)
  - Current Price
  - Graduated? (checkmark/x badge)
  - False Positive Score (0-100 bar)
- Filters: rejection reason dropdown, false-positive-only toggle, graduated-only toggle
- Sort by: false positive score, ATH bonding curve %, rejection date
- Summary stats cards at top: Total Rejected, False Positives Found, Graduated Count, Avg ATH %
- "Backcheck All" button to trigger the edge function manually
- Auto-refresh every 60 seconds

### 4. Cron Schedule

Add a cron job via migration to run `backcheck-rejected-tokens` every 6 hours, processing up to 500 tokens per run with appropriate rate limiting.

---

## Technical Details

### False Positive Scoring (0-100)

Weighted formula:
- Graduated to Raydium: +40 points
- ATH bonding curve > 80%: +20 points
- ATH bonding curve > 50%: +10 points
- Current holders > 100: +15 points
- Current holders > 50: +8 points
- Peak market cap > $50k: +15 points
- Peak market cap > $10k: +8 points
- Still trading (price > 0): +10 points

### Exclusion Filters (not backchecked)

Tokens with these rejection reasons are skipped:
- Any containing "mayhem"
- `was_spiked_and_killed = true`

### Files Changed

1. **New migration SQL** -- creates `pumpfun_rejected_backcheck` table + cron job
2. **New edge function** -- `supabase/functions/backcheck-rejected-tokens/index.ts`
3. **New UI component** -- `src/components/admin/RejectedTokensBackcheck.tsx`
4. **Edit** `src/components/admin/tabs/PumpfunMonitorTab.tsx` -- add "Rejected" sub-tab

