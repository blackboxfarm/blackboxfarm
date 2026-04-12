

# Pump.fun Watchlist Noise Reduction

## Problem
Not a duplicate bug — pump.fun allows unlimited tokens with the same ticker. The watchlist has 108K rows, 85K of which share repeated symbols. Most are dead/rejected noise that wastes storage and slows queries.

## Solution: Two-part cleanup

### Part 1: Prune dead noise (migration)
Delete rows from `pumpfun_watchlist` where:
- `status` is `dead` or `rejected`
- `market_cap_usd` is NULL or < $100
- `created_at` is older than 7 days
- No associated buy attempt (`buy_attempted_at IS NULL`)

This should remove 70-80K rows of garbage.

### Part 2: Auto-prune on insert (edge function update)
In `pumpfun-token-fetcher` and the websocket listener, before inserting a new token:
- Skip tokens where the same `token_mint` already exists (already done via upsert)
- Add a periodic cleanup: after each batch insert, delete rows older than 7 days that are `dead`/`rejected` with no buy history

### Part 3: UI clarity
In the Super Admin watchlist table, group or badge tokens with repeated symbols so it's visually obvious these are copycats, not duplicates. Add the mint address preview more prominently.

### Files to modify
1. **New migration**: DELETE pruning query for historical dead rows
2. `supabase/functions/pumpfun-token-fetcher/index.ts` — add post-batch prune call
3. `supabase/functions/pumpfun-websocket-listener/index.ts` — same
4. Super Admin watchlist UI component — add copycat badge/indicator

