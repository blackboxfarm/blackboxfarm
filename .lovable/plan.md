

# Reputation Backfill + Pipeline Fix

## The Problem

- `dev_wallet_reputation` has **55,795 wallets** with real data (17,649 flagged ruggers, 5 successful)
- `developer_profiles` has only **1,703 entries**, and only **29** have a non-default score
- The `oracle-auto-classifier` only *updates* existing profiles (line 202: `if (profile)`) -- never creates new ones
- It reads `rug_pull_count` from `developer_profiles` (which is 0) instead of `dev_wallet_reputation.tokens_rugged` (which has real data)

## Plan

### Phase 1: New Edge Function `reputation-backfill`

Creates a new edge function that batch-syncs `dev_wallet_reputation` → `developer_profiles`:

- Reads wallets from `dev_wallet_reputation` in batches of 200
- For each wallet, upserts into `developer_profiles` mapping:
  - `tokens_rugged` → `rug_pull_count`
  - `tokens_successful` → `successful_tokens`
  - `total_tokens_launched` → `total_tokens_created`
  - `avg_peak_mcap_usd`, `avg_time_before_dump_mins` → metadata
  - Social arrays (`twitter_accounts`, `telegram_groups`) → profile handles
- Runs `calculateScore()` using the real stats to compute `reputation_score` and `trust_level`
- Enriches with `reputation_mesh` connection count as a bonus/penalty signal
- Returns progress (processed count, batch position) for UI polling
- **No external APIs** -- purely internal DB operations

### Phase 2: Fix `oracle-auto-classifier`

Two targeted fixes to the existing function:

1. **Upsert instead of update-only**: When `profile` is null (line 202), create a new `developer_profiles` entry instead of skipping
2. **Use `dev_wallet_reputation` as primary source**: Currently line 137 reads `profile?.rug_pull_count` (always 0). Change to prefer `rep?.tokens_rugged` from the `dev_wallet_reputation` row which has real data
3. **Add mesh enrichment**: Query `reputation_mesh` for connection count and factor into score (wallets linked to known scammers get penalties)

### Phase 3: Admin UI Button

- Add a "Run Reputation Backfill" card to the Utilities tab
- Shows progress (X/55,795 processed), start/stop controls
- Calls the `reputation-backfill` function in batches via polling

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/reputation-backfill/index.ts` | **New** -- batch sync engine |
| `supabase/functions/oracle-auto-classifier/index.ts` | Fix upsert + data source |
| `src/components/admin/ReputationBackfillPanel.tsx` | **New** -- admin UI |
| `src/components/admin/tabs/UtilitiesTab.tsx` | Add backfill panel tab |

## API Cost

**Zero.** All three phases use only internal Supabase queries. No Helius, no Solscan, no external calls.

