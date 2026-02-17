

# Post-Exit Win Analysis + Dev Reputation for Profit Trades

## What This Solves

Two critical gaps in the current system:

**Gap 1 -- No post-exit tracking for wins.** When we sell at 1.5x or 2x, we have no idea what happened next. Did the token go to $150K (EMCC)? Did it die 6 minutes later after the dev rugged (POLYCLAW)? This data is essential for developing smarter exit strategies (moonbags, hold-to-graduate, etc.).

**Gap 2 -- Winning trades never update dev reputation.** The `target_hit` code path never calls `feedbackLossToReputation` (which also handles wins). More critically, a dev whose token gave us 1.5x but then rugged 6 minutes later currently gets zero negative marks. They should still be flagged as a rugger -- getting lucky on timing does not redeem a bad actor.

Additionally, **none of the 179 winning positions have `creator_wallet` populated**, so we need to backfill that first.

---

## The Build

### 1. New Edge Function: `backcheck-profit-exits`

A cron-based function (runs every 4 hours, same pattern as `backcheck-stop-loss-exits`) that:

- Fetches closed positions where `total_pnl_percent > 0` and `post_exit_checked_at IS NULL`
- For each, fetches current price from Pump.fun API (primary) and DexScreener (fallback)
- Backfills `creator_wallet` from `pumpfun_watchlist` if missing
- Writes to the position:
  - `post_exit_price_usd`, `post_exit_mcap`, `post_exit_graduated`
  - `post_exit_multiplier_vs_entry` (current price vs our entry)
  - `post_exit_checked_at`
  - `creator_wallet` (backfilled)
- Classifies each into a post-exit outcome category:
  - "Continued Runner" -- went 3x+ beyond our exit
  - "Graduated" -- completed bonding curve to Raydium
  - "Stable" -- stayed roughly where we sold (0.8x-1.5x of exit)
  - "Died" -- dropped below 50% of our exit price
  - "Dev Rugged Post-Exit" -- died AND dev wallet shows exit pattern

### 2. Dev Reputation Feedback for Wins

The backcheck function also handles Step 2 of your request -- dev accountability on wins:

- If a token **died or dev rugged after our profitable exit**, the dev still gets negative reputation marks:
  - Insert `created_rug_token` or `created_loss_token` into `reputation_mesh`
  - Increment `tokens_rugged` on `dev_wallet_reputation`
  - Can trigger auto-blacklisting if thresholds are met
  - The fact that we profited is irrelevant to the dev's character

- If a token **continued running or graduated**, the dev gets positive marks:
  - Increment `fantasy_win_count` and `tokens_successful`
  - Insert `created_successful_token` into `reputation_mesh`
  - Reputation score boost proportional to post-exit performance

### 3. Win Backcheck Review UI

A new component `ProfitExitBackcheck.tsx` integrated as a new "Profit Exits" tab in the Pump.fun Monitor, showing:

- Summary stats: Total checked, Continued Runners, Graduated, Died Post-Exit, Dev Rugged
- Table with: Token, Exit Price, Exit Multiplier, Current Price, Post-Exit Multiplier, MCap Now, Graduated, Post-Exit Outcome, Dev Status
- Filter by post-exit outcome category
- Manual "Flag Dev" button for cases where the system didn't auto-detect a post-exit rug
- Links to Pump.fun for each token

### 4. Cron Schedule

Add a new cron job `backcheck-profit-exits-4h` running every 4 hours (matching the stop-loss backcheck cadence).

### 5. Backfill `creator_wallet` on Existing Wins

The first run of the backcheck will automatically backfill `creator_wallet` from `pumpfun_watchlist` for all 179 existing winning positions that are missing it. Also patch the sell monitor's `target_hit` code path to call `feedbackLossToReputation` going forward so wins get reputation feedback in real-time.

---

## Technical Details

### Files to Create
1. `supabase/functions/backcheck-profit-exits/index.ts` -- New edge function
2. `src/components/admin/ProfitExitBackcheck.tsx` -- New review UI component
3. `supabase/migrations/[timestamp]_add_profit_backcheck_cron.sql` -- Cron job setup

### Files to Edit
1. `supabase/functions/pumpfun-fantasy-sell-monitor/index.ts` -- Add `feedbackLossToReputation` call at line ~1076 (after target_hit close) and save `creator_wallet` to the position
2. `src/components/admin/tabs/PumpfunMonitorTab.tsx` -- Add "Profit Exits" tab
3. `src/integrations/supabase/types.ts` -- Update types if needed

### Post-Exit Outcome Classification Logic

```text
Given: exit_price, post_exit_price, post_exit_graduated, dev_exited

IF dev sold out post-exit AND price crashed > 80%:
  -> "dev_rugged_post_exit" (dev gets blacklisted)
  
IF post_exit_price < exit_price * 0.5:
  -> "died_after_profit" (dev gets negative marks)

IF post_exit_graduated:
  -> "graduated" (dev gets positive marks, moonbag opportunity)

IF post_exit_price > exit_price * 3:
  -> "continued_runner" (dev gets positive marks, missed gains data)

ELSE:
  -> "stable" (no reputation change)
```

### Dev Rug Detection Post-Exit

For tokens that died after our profitable exit, the function checks:
- Pump.fun API: Did `complete` stay false and mcap crash?
- Dev wallet: Did creator's token balance go to 0? (via existing watchlist `dev_sold` flag)
- This ensures a dev who gave us a quick 1.5x then pulled the rug still gets flagged

