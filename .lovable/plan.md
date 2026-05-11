
## Current state

| Table | Missing | Filled |
|---|---|---|
| `holders_intel_seen_tokens` | 6,013 | 374 |
| `pumpfun_watchlist` | 10,453 | 16,857 |
| `scraped_tokens` | 459 | 1,878 |

Two functions exist that both resolve creator wallets via the same chain (Pump.fun → Helius DAS → Helius RPC on-chain):

1. **`creator-wallet-resolver`** — driven by the `creator-wallet-resolver-2m` cron every 2 min, `batchSize=50`. Reads `master_token_directory` matview only, writes back to `pumpfun_watchlist` / `scraped_tokens`. **Does NOT log to `creator_backfill_events`**, so you can't see it work.
2. **`backfill-creator-wallets`** — the new function. Sweeps **all 26 tables** directly (incl. `holders_intel_seen_tokens`), logs every attempt to `creator_backfill_events` (visible in Oracle Tab). `batchSize` up to 400.

The 2-min cron is doing some work but invisible, and it's blind to the 6k `holders_intel_seen_tokens` backlog (only sees what's in the matview, which lags). That's why the Oracle log panel looks dead.

## Recommended approach

### 1. Repoint the 2-min cron at `backfill-creator-wallets`
- One function = one observable pipeline.
- Every resolution shows up live in the Oracle Raw Event Stream panel.
- It already drains all 26 tables newest-first, including `holders_intel_seen_tokens`.
- Keep `batchSize: 100` for the 2-min cadence (~3,000/hr theoretical, realistically ~1,500–2,000/hr after Helius rate limits).

### 2. Add a high-volume catch-up sweep (every 10 min)
- Same function, `batchSize: 300`, runs every 10 min.
- Purpose: drain the legacy 17k backlog in 1–2 days, then naturally tapers off (it only picks rows with NULL creator).
- After backlog clears it will mostly idle since the 2-min cron handles fresh inflow.

### 3. Retire `creator-wallet-resolver` (or leave dormant)
- No longer scheduled. Keep the file for now in case anything calls it ad-hoc; remove next pass.

### 4. Estimated drain time
- ~17k missing across all tables.
- New cadence: ~100 every 2 min + ~300 every 10 min = ~4,800/hr ceiling.
- Helius/Pump.fun realistic throughput: ~1,500–2,500 resolved/hr.
- Full drain: **~7–10 hours**, fully visible in the Oracle log panel.

## Technical changes

```sql
-- Unschedule old cron
SELECT cron.unschedule('creator-wallet-resolver-2m');

-- New: every 2 min, modest batch, all tables, logged
SELECT cron.schedule(
  'backfill-creator-wallets-2m',
  '*/2 * * * *',
  $$ SELECT net.http_post(
       url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/backfill-creator-wallets',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb,
       body := '{"batchSize":100,"requestDelayMs":50}'::jsonb
     ); $$
);

-- New: every 10 min, big batch, drains backlog
SELECT cron.schedule(
  'backfill-creator-wallets-catchup-10m',
  '*/10 * * * *',
  $$ SELECT net.http_post(
       url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/backfill-creator-wallets',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb,
       body := '{"batchSize":300,"requestDelayMs":30}'::jsonb
     ); $$
);
```

No code changes required — `backfill-creator-wallets` already handles everything. Only DB cron config changes.

## Verification after deploy

1. Wait 2 min, then check Oracle Tab → Creator Wallet Backfill log panel: resolutions should appear live.
2. Run:
   ```sql
   SELECT COUNT(*) FILTER (WHERE creator_wallet IS NULL) FROM holders_intel_seen_tokens;
   ```
   Should decrease by ~100–200 per 10 min interval.
3. Check `creator_backfill_events` for sustained inflow + low `error_message` rate.

## Why not just bump `creator-wallet-resolver`?

- It's blind to `holders_intel_seen_tokens` (matview lag).
- It doesn't log, so we can't see what it's actually doing or failing on.
- Two parallel pipelines competing for the same Helius credits = waste.

One pipeline, observable, drains everything. That's the move.
