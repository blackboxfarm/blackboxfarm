
# Pump.fun Fantasy Trading -- Loss Reduction Audit and Improvement Plan

## Executive Summary

After a deep audit of the entire pipeline (enricher, watchlist-monitor, fantasy-executor, sell-monitor, rug-event-processor), I've identified **5 critical gaps** causing unnecessary losses. Your current 56% loss rate (166/295 in 48h) can be significantly improved.

---

## Current Pipeline Flow (What's Working)

```text
New Tokens (Solana Tracker API, 200/poll)
    |
    v
[pumpfun-token-enricher] -- "pending_triage"
    | Checks: mint/freeze authority, supply, rugcheck critical risks,
    | bundle score, holder concentration, gini, linked wallets,
    | bump bot, stagnation, mcap ceiling, dev_sold/graduated
    | Result: REJECTED or promoted to "watching"
    |
    v
[pumpfun-watchlist-monitor] -- "watching"
    | Checks: dev behavior, mcap gates, mayhem mode, LARP check,
    | rugcheck re-verify, dust holders, dev reputation,
    | MOMENTUM SCORING ENGINE (H/V/S/M out of 100)
    | Must score >= 50 + pass mcap $6,500-$12,000 range
    | Result: stay watching, REJECTED, or promoted to "qualified" -> "buy_now"
    |
    v
[pumpfun-fantasy-executor] -- "buy_now"
    | Checks: 24h duplicate, freshness (30min), price available,
    | mcap re-verify $6,500-$12,000, graduated check,
    | volume check, soft flags (ATH, downtrend)
    | Result: Fantasy BUY -> "holding"
    |
    v
[pumpfun-fantasy-sell-monitor] -- "open"/"moonbag"
    | Monitors: price, target hit, stop-loss (-35%),
    | rug detection (dev_sold from watchlist),
    | stale auto-close (12h dump, 24h max)
    | Creates pumpfun_trade_learnings on close
    | Result: "closed"
```

---

## 5 Critical Gaps Found

### GAP 1: Losses Never Feed Back Into the System
**This is the biggest problem.**

- **255 loss trades** in the last 7 days have creator wallets. **ZERO** of those wallets appear in `dev_wallet_reputation`.
- `rug-event-processor` is only triggered from `watchlist-monitor` when a dev *exits while being watched*. It is **never triggered** when a fantasy position closes as a loss.
- `pumpfun_blacklist` has only 6 entries, all manual. Zero auto-classified.
- The `pumpfun_trade_learnings` table has 125 records, but **nothing reads from it** -- it's write-only data. No function uses these learnings to adjust scoring or filter future tokens.

**Impact**: You keep buying tokens from the same bad devs and patterns because losses are recorded but never used as input to any filter.

### GAP 2: ATH Soft Flag Is Blind (ath_price_usd is always NULL)
The ATH check in the fantasy-executor compares entry price to `token.ath_price_usd`. But examining the entry_flags data from the last 24 hours:
- **Every single trade** has `ath_price_usd: null` and `below_ath: false`
- The watchlist-monitor does store `price_ath_usd` but the executor reads `ath_price_usd` -- a field name mismatch, or the watchlist field never propagates to the token object used by the executor.

**Impact**: The ATH check you approved 11 hours ago is doing nothing. Every token passes because ATH is null.

### GAP 3: Entry Snapshot Metrics Are Nearly Identical for Winners and Losers
From the 48-hour data:
- Winners: avg MCap $7,914, avg holders 67, avg volume 69 SOL
- Losers: avg MCap $7,999, avg holders 63, avg volume 63 SOL
- The scoring engine's dimensions (H/V/S/M) are too coarse to differentiate at these tight ranges.

The only meaningful difference: **rugcheck score** -- winners avg 40, losers avg 182. This signal is being collected but under-weighted in the scoring engine.

### GAP 4: No "Price Trajectory" Check Between Qualification and Buy
Between qualification and execution (1-5 min gap), the token's chart could be on a downtrend. The downtrend soft flag checks `price_at_qualified_usd` vs current entry price, but:
- It's a soft flag only (doesn't block)
- Only 12 trades in 24h had `downtrend: true` -- too small a sample to be meaningful
- There's no check of the bonding curve *shape* (how fast the curve moved)

### GAP 5: The Scoring Engine Doesn't Differentiate "Organic" vs "Artificial" Growth
Holder count and volume can both be gamed with bump bots and wash trading. While the enricher detects bump bots, this detection happens at intake only (pending_triage). By the time the token reaches the monitor for scoring, the bump bot detection result is **not re-checked** and not factored into the momentum score.

---

## Implementation Plan

### Phase 1: Close the Feedback Loop (Highest Impact)

**1a. Auto-flag loss-trade devs in `dev_wallet_reputation`**
When `pumpfun-fantasy-sell-monitor` closes a position as `loss` or `rug`:
- Look up the creator_wallet from the linked watchlist entry
- Upsert into `dev_wallet_reputation` with incremented loss/rug counters
- If dev has 2+ losses across different tokens, auto-set `trust_level = 'repeat_loser'`
- If dev has 3+ rugs, auto-set `trust_level = 'serial_rugger'`

**1b. Auto-blacklist repeat offenders**
When a dev hits 3+ losses or 2+ rugs, auto-insert into `pumpfun_blacklist` with reason and evidence.

**1c. Feed loss devs into `reputation_mesh`**
Create mesh links: `dev_wallet -> token_mint` with relationship `'created_loss_token'` so the Oracle can surface these connections.

**1d. Cross-check incoming tokens against loss-dev database**
In `pumpfun-watchlist-monitor`, before scoring, query `dev_wallet_reputation` for any dev with `trust_level IN ('repeat_loser', 'serial_rugger')` and instant-reject or heavy score penalty.

### Phase 2: Fix the ATH Check

**2a. Fix field name mismatch**
In `pumpfun-fantasy-executor`, change `token.ath_price_usd` to `token.price_ath_usd` (the actual field stored by watchlist-monitor).

**2b. Upgrade from soft flag to configurable gate**
Add `block_below_ath_pct` config field (default 10%). If entry price is more than X% below ATH, block the buy. This catches tokens that already peaked and are on the way down.

### Phase 3: Leverage Trade Learnings as Active Filter

**3a. Build a "bad profile" aggregator**
Create a new function or add logic to the executor that queries `pumpfun_trade_learnings` for the last 7 days and computes:
- Losing token profile: avg mcap, avg holders, avg rugcheck, avg age at entry, avg volume
- Winning token profile: same metrics

**3b. Score adjustment from learnings**
If a candidate token's metrics match the "losing profile" more than the "winning profile", apply a score penalty (e.g., -10 points). This makes the system self-tuning.

### Phase 4: Strengthen Rugcheck Weighting

**4a. Increase rugcheck influence in safety score**
Current: rugcheck 2001-4000 gets +7 points (sweet spot).
Data shows winners avg 40, losers avg 182. Adjust the curve:
- Score 0-100: +10 points (very safe)
- Score 101-500: +5 points
- Score 501-2000: +2 points  
- Score 2001-5000: 0 points
- Score 5001+: -10 points (death zone)

### Phase 5: Convert Soft Flags to Hard Gates (Configurable)

**5a. Add config toggles**
Add to `pumpfun_monitor_config`:
- `block_below_ath_enabled` (boolean, default false)
- `block_below_ath_pct` (number, default 10)
- `block_downtrend_enabled` (boolean, default false)
- `block_downtrend_pct` (number, default 5)

This lets you toggle between soft (learn) and hard (block) mode from the dashboard without code changes.

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/pumpfun-fantasy-sell-monitor/index.ts` | Add loss feedback to `dev_wallet_reputation`, `pumpfun_blacklist`, `reputation_mesh` on position close |
| `supabase/functions/pumpfun-fantasy-executor/index.ts` | Fix `ath_price_usd` -> `price_ath_usd`, add configurable hard gates for ATH/downtrend, add learnings-based score check |
| `supabase/functions/pumpfun-watchlist-monitor/index.ts` | Add repeat-loss-dev check before scoring, adjust rugcheck weight curve |
| `supabase/migrations/` | Add config columns: `block_below_ath_enabled`, `block_below_ath_pct`, `block_downtrend_enabled`, `block_downtrend_pct` |

### Database Changes
- Add columns to `pumpfun_monitor_config` for ATH/downtrend gate toggles
- Add `loss_token_count` and `last_loss_at` columns to `dev_wallet_reputation` (or use existing fields)

### Expected Impact
Based on the 48-hour data analysis:
- **Phase 1** (feedback loop): Could eliminate ~15-20% of losses by blocking known bad devs on repeat entries
- **Phase 2** (ATH fix): Could eliminate ~10-15% of losses by avoiding tokens already past their peak  
- **Phase 3** (learnings filter): Could eliminate ~5-10% of losses via self-tuning profile matching
- **Phase 4** (rugcheck reweight): Could improve win selection by ~5% based on the strong signal difference

Combined estimated loss rate reduction: **56% down to ~35-40%** (conservative estimate)
