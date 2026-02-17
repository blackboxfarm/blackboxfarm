
# Stop-Loss Recovery Rehabilitation

## Problem

When the Fantasy sell monitor closes a position via stop-loss or drawdown, the loss feedback loop immediately:
- Increments `fantasy_loss_count` on the dev's `dev_wallet_reputation`
- May increment `tokens_rugged`
- Auto-blacklists the dev wallet if thresholds are met (2+ rugs, 3+ losses with 0 wins, or 5+ total losses)
- Inserts `created_loss_token` or `created_rug_token` into `reputation_mesh`

The `backcheck-stop-loss-exits` cron (every 4 hours) already discovers that **130 tokens graduated** after we exited and 1 did a 19.6x. But it only writes `post_exit_recovered` and `post_exit_graduated` -- it does NOT trigger any rehabilitation review or adjust the dev's reputation.

## Solution

Reuse the same manual review rehabilitation pattern from the rejected tokens backcheck:

### 1. Update `backcheck-stop-loss-exits` Edge Function

When the backcheck finds `post_exit_recovered = true` OR `post_exit_graduated = true`:
- Set `rehabilitation_status = 'pending_review'` on the position (column already exists)
- Insert a `rehabilitation_candidate` entry into `reputation_mesh` linking the dev wallet to the token, with evidence like "Token graduated after stop-loss exit, 19.6x from entry"
- This mirrors exactly what `backcheck-rejected-tokens` does

### 2. Add Recovery Review UI to the Loss Tab

In the existing Loss/Retrace area of the Pump.fun Monitor (the stop-loss backcheck section), add:
- A filter/view for positions where `rehabilitation_status = 'pending_review'`
- Per-row Rehabilitate / Confirm Bad buttons (same pattern as `RejectedTokensBackcheck.tsx`)
- **Rehabilitate**: Decrements `fantasy_loss_count` (and `tokens_rugged` if applicable) on `dev_wallet_reputation`, adds `false_positive_rehabilitated` mesh entry, removes auto-blacklist if counts drop below thresholds
- **Confirm Bad**: Sets `rehabilitation_status = 'confirmed_bad'`, adds `confirmed_bad_actor` mesh entry, no reputation changes
- Summary stats: "X positions pending review", "Y rehabilitated", "Z confirmed bad"

### 3. Files Changed

1. **Edit** `supabase/functions/backcheck-stop-loss-exits/index.ts` -- add rehabilitation flagging logic when recovered/graduated tokens are found
2. **New** `src/components/admin/StopLossRehabReview.tsx` -- manual review component with approve/deny buttons and dev reputation adjustment (mirrors `RejectedTokensBackcheck.tsx` pattern)
3. **Edit** `src/components/admin/tabs/PumpfunMonitorTab.tsx` or `TokenCandidatesDashboard.tsx` -- integrate the review component into the existing Loss/Retrace tab area

### 4. No Migration Needed

The `rehabilitation_status`, `rehabilitated_at`, and `rehabilitated_by` columns already exist on `pumpfun_fantasy_positions`. The `reputation_mesh` and `dev_wallet_reputation` tables already have all required columns.

## Technical Details

### Rehabilitation Logic (on Approve)

```text
1. Fetch dev_wallet_reputation for position.creator_wallet
2. Decrement fantasy_loss_count by 1 (min 0)
3. If exit_reason was 'rug' related, decrement tokens_rugged by 1 (min 0)
4. Recalculate trust_level based on new counts
5. If new loss/rug counts drop below blacklist thresholds:
   - Remove from pumpfun_blacklist (or deactivate)
   - Set auto_blacklisted = false on dev_wallet_reputation
6. Add reputation_mesh entry: relationship = 'false_positive_rehabilitated'
7. Set rehabilitation_status = 'rehabilitated' on the position
```

### Confirm Bad Logic (on Deny)

```text
1. Set rehabilitation_status = 'confirmed_bad' on the position
2. Add reputation_mesh entry: relationship = 'confirmed_bad_actor'
3. No changes to dev_wallet_reputation (penalty stands)
```
