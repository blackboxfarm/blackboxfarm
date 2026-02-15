
# Fantasy Dashboard Improvements Plan

## Issues Identified

### 1. "Exit" Column is Misleading for Open Positions
The "Exit" column currently shows `current_price_usd` for open positions (the live price). This is confusing because nothing has been "exited." For closed positions it correctly shows `main_sold_price_usd`.

**Fix**: Rename the column to "Current" when viewing open positions, or split it into two columns: "Current" (live price) and "Exit" (only populated for closed trades).

---

### 2. Pipeline Price Tracking (3 New Columns)
You want to see prices at each stage: Discovery, Watchlist Qualification, and Fantasy Entry. Currently the watchlist has `price_at_mint` and `price_start_usd` columns but they are never populated (all NULL). Timestamps exist (`first_seen_at`, `qualified_at`, `promoted_to_buy_now_at`) but no corresponding price snapshots.

**What needs to happen**:

- **Database**: Add 3 new columns to `pumpfun_watchlist`: `price_at_discovery_usd`, `price_at_qualified_usd`, `price_at_buy_now_usd`
- **Edge Functions**: Update `pumpfun-token-enricher` to store `price_at_discovery_usd` when a token first gets enriched. Update `pumpfun-watchlist-monitor` to store `price_at_qualified_usd` when status changes to `qualified` and `price_at_buy_now_usd` when promoted to `buy_now`.
- **UI**: Add 3 new compact columns to the Fantasy table showing: "Disc $" (discovery price from watchlist), "Qual $" (qualified price), and keep "Entry" as the fantasy buy price. This lets you see price drift through the pipeline.

---

### 3. Maximum Market Cap + Bonding Curve Gate

Currently there is only a `min_market_cap_usd` filter. No max cap and no check that the token is still on the bonding curve.

**What needs to happen**:

- **Database**: Add `max_market_cap_usd` column to `pumpfun_monitor_config` (default: 12000)
- **UI**: Add "MC <= $" input next to the existing "MC >= $" in the Red Flags section
- **Edge Function** (`pumpfun-watchlist-monitor`): Add a hard gate that rejects tokens with mcap above the max threshold AND requires `is_graduated = false` (still on bonding curve). Tokens that have already graduated to Raydium will be blocked from reaching `buy_now` status.
- **Edge Function** (`pumpfun-fantasy-executor`): Double-check at entry time that the token's mcap is within the min/max range and `is_graduated` is false.

This ensures entries stay in the safe zone of the bonding curve (roughly $5k-$12k), giving room for a 1.5x target to ~$18k before hitting the volatile top of the curve.

---

### 4. Stop-Loss for Fantasy Positions

Currently the `pumpfun-fantasy-sell-monitor` only checks upside (target hit). There is zero downside protection -- if a token dumps 90%, the position just sits there as "open" until you manually bulk-close stale ones.

**What needs to happen**:

- **Database**: Add `fantasy_stop_loss_pct` column to `pumpfun_monitor_config` (default: 35, meaning -35% from entry)
- **UI**: Add "SL%" input in the Red Flags / Fantasy config section
- **Edge Function** (`pumpfun-fantasy-sell-monitor`): In the open position monitoring loop, after updating the price, add a check:
  - If `multiplier <= (1 - stop_loss_pct/100)` (e.g., price drops 35% from entry), immediately close the position with `exit_reason: 'stop_loss'`
  - Record `main_sold_price_usd` at the current dump price so P&L is accurately captured
  - This protects the $25 position from becoming a total loss

---

### 5. Dynamic Target Multiplier Based on Entry MCap

Instead of a flat 1.5x for all positions, adjust the target based on where on the curve you entered:

- Entry MCap $5k-$7k: target = 2.0x (more room to grow early)
- Entry MCap $7k-$10k: target = 1.5x (standard)  
- Entry MCap $10k+: target = 1.25x (less room, take profits faster)

**What needs to happen**:

- **Edge Function** (`pumpfun-fantasy-executor`): At position creation time, calculate the dynamic target based on `entry_market_cap_usd` instead of using the flat config value. Store the calculated multiplier in `target_multiplier` on the position row.
- **UI**: No change needed -- the Target column already reads from `pos.target_multiplier` per position.
- **Config UI**: Add a note or toggle "Dynamic Target" with the 3 tier thresholds configurable.

---

## Technical Summary

| Change | Files Affected |
|--------|---------------|
| Fix "Exit" column label for open view | `TokenCandidatesDashboard.tsx` |
| Add 3 pipeline price columns to DB | New migration |
| Store prices at each pipeline stage | `pumpfun-token-enricher`, `pumpfun-watchlist-monitor` |
| Show pipeline prices in Fantasy table | `TokenCandidatesDashboard.tsx` |
| Add max mcap + bonding curve gate | Migration, `TokenCandidatesDashboard.tsx`, `pumpfun-watchlist-monitor`, `pumpfun-fantasy-executor` |
| Add stop-loss logic | Migration, `TokenCandidatesDashboard.tsx`, `pumpfun-fantasy-sell-monitor` |
| Dynamic target multiplier | `pumpfun-fantasy-executor` |
| Regenerate Supabase types | `types.ts` |

## Execution Order

1. Database migration (new columns on `pumpfun_watchlist` and `pumpfun_monitor_config`)
2. Update edge functions (enricher, watchlist-monitor, fantasy-executor, fantasy-sell-monitor)
3. Update UI (column labels, new columns, new config inputs)
4. Regenerate types
