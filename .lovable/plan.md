## Goal
The current `backfill-creator-wallets-solscan` function is a silent no-op for almost every token because Solscan `/v2.0/token/meta` does **not** return a `creator` field. Replace its API logic with the proven 3-step Helius chain so it actually resolves missing creator/dev wallets across the 26 tables.

## What changes

### 1. Rebuild the resolver inside `backfill-creator-wallets-solscan`
Swap the broken `fetchCreatorFromSolscan(mint)` for a new `resolveCreator(mint)` that runs this chain per mint, stopping at the first success:

```text
1. Pump.fun API (only if mint ends in "pump") → data.creator                conf 100
2. Helius DAS getAsset → result.creators[0].address (verified || share===100) conf  90
   (fallback: result.authorities[0].address when creators[] is empty)
3. Helius RPC getSignaturesForAddress(mint) → take oldest sig
   → getTransaction(sig) → feePayer = creator                                conf  85
```

This is the exact chain already battle-tested in `_shared/creator-resolver.ts` — we just inline a slimmer version that returns the raw provider JSON so we can keep logging it to `creator_backfill_events`.

### 2. Keep newest-first ordering and the raw event log
- Per-table `ORDER_COLUMN` stays as-is (newest mints first).
- `creator_backfill_events` table stays. Each event now records:
  - `solscan_url` → renamed semantically but keep column for compatibility; store the actual provider URL (`https://mainnet.helius-rpc.com/...` or `https://frontend-api.pump.fun/coins/{mint}`).
  - `response_preview` → raw JSON from whichever provider answered.
  - new field in JSON body: `provider` (`pumpfun` | `helius_das` | `helius_rpc`).
- The super-admin **"Creator Wallet Backfill — Raw Event Stream"** panel keeps working unchanged.

### 3. Rename the function for accuracy
Rename `backfill-creator-wallets-solscan` → `backfill-creator-wallets`. This requires:
- Create new edge function `backfill-creator-wallets/index.ts` with the new logic.
- Update `supabase/config.toml` (add new function, remove old, keep `verify_jwt = false`).
- Update the cron job that currently invokes the Solscan version to invoke the new name (search `pg_cron` jobs + any UI buttons in `CronStatusPanel`/Oracle tab).
- Delete the old function directory.

### 4. Cost & throughput
- Pump.fun tokens (95% of our backlog) → 1 free API call, no Helius credits burned.
- Non-Pump tokens → 1 Helius DAS call (~1 credit). Worst case adds 2 RPC calls.
- At batchSize=100, expected ~100-200 Helius credits per run. Well within the 10M monthly budget.
- Reuse existing `helius-rate-limiter` wrapper for DAS calls (already imported elsewhere).

### 5. What we do NOT touch
- The `creator-resolver.ts` shared module stays as-is — production traffic still uses it.
- The Solscan rate limiter and `creator_backfill_events` table stay.
- The admin UI panel `CreatorBackfillRawLogPanel.tsx` stays unchanged.
- All other crons keep their schedules.

## Verification
1. Deploy new function.
2. Hit it once via curl with `{ batchSize: 20, includeResults: true }`.
3. Confirm the JSON response shows `resolved > 0` and `byTable` populated.
4. Open the Super-Admin → Oracle tab → watch the raw event stream show `provider: pumpfun` and `provider: helius_das` events with valid creator addresses.
5. SQL check:
   ```sql
   SELECT COUNT(*) FILTER (WHERE creator_wallet IS NULL) AS still_null,
          COUNT(*) FILTER (WHERE creator_wallet IS NOT NULL) AS resolved
   FROM scraped_tokens
   WHERE created_at > NOW() - INTERVAL '1 day';
   ```
   Run before/after to confirm the gap is closing.

## Files touched
- `supabase/functions/backfill-creator-wallets/index.ts` (new)
- `supabase/functions/backfill-creator-wallets-solscan/` (deleted)
- `supabase/config.toml` (function registration)
- Any cron entry pointing to the old name (migration)
- `src/components/admin/oracle/CreatorBackfillRawLogPanel.tsx` (cosmetic header rename only — "Helius/Pump.fun" instead of "Solscan")
