## Goal

Capture the **true first-24-hour ATH market cap** for every token as a permanent historical fingerprint, locked-in at the ~23h45m mark from GeckoTerminal hourly OHLCV — then backfill the same value for older tokens (newest → oldest) using GeckoTerminal's historical candles.

This is distinct from the existing `ath_24h_usd` column, which (despite its name) is currently used as **lifetime ATH** across the codebase (autopsies, dev reputation, lifecycle scoring). We do not touch that column.

## What gets added

### 1. New DB column on `token_lifecycle`
- `first_24h_ath_usd  numeric` — locked first-24h peak mcap (USD)
- `first_24h_ath_captured_at  timestamptz` — when we sealed it
- `first_24h_ath_source  text` — `'geckoterminal_live'` | `'geckoterminal_backfill'` | `'pumpfun'` | `'no_pool'`
- Index on `(first_24h_ath_usd IS NULL, first_seen_at DESC)` for backfill ordering.

Once `first_24h_ath_captured_at` is set, the value is **immutable** — no overwrites, ever. It becomes a permanent reputation primitive.

### 2. New live-capture edge function: `first-24h-ath-sealer`
Runs every 5 minutes (cron). Logic:

```text
SELECT token_mint, first_seen_at FROM token_lifecycle
WHERE first_24h_ath_usd IS NULL
  AND first_seen_at >= now() - interval '25 hours'
  AND first_seen_at <= now() - interval '23 hours 45 minutes'
ORDER BY first_seen_at ASC
LIMIT 25;
```

For each: fetch the top Solana pool from GeckoTerminal, pull `/ohlcv/hour?aggregate=1&limit=24` covering the token's first 24h window, take `max(high)` × supply if needed (or use the candle high as USD mcap when GT returns mcap), then UPSERT with `source='geckoterminal_live'`. The 15-minute pre-buffer guarantees the candle for hour 23 is closed and indexed by GT before we read it.

Pump.fun shortcut: if `mint.endsWith('pump')`, also call `fetchPumpFunCoin` — Pump.fun exposes a per-mint "ath_market_cap" snapshot we can corroborate with. Take the **max** of the two for accuracy.

### 3. New backfill edge function: `first-24h-ath-backfill`
Runs every 10 minutes (cron, batch 15 — GT 30 req/min limit). Logic:

```text
SELECT token_mint, first_seen_at FROM token_lifecycle
WHERE first_24h_ath_usd IS NULL
  AND first_seen_at < now() - interval '25 hours'
ORDER BY first_seen_at DESC   -- newest-missing first, then loop back
LIMIT 15;
```

Pulls hourly OHLCV restricted to `first_seen_at` → `first_seen_at + 24h` window (GT supports `before_timestamp`). Writes with `source='geckoterminal_backfill'`. If no pool exists (token died on bonding curve), writes `0` with `source='no_pool'` so we don't re-poll.

### 4. Wire into existing waterfalls
- `lifecycle-scorecard-builder`: add `first_24h_ath_usd` as a new factor input (pump-and-dump detection: `current_mcap / first_24h_ath_usd` ratio).
- `dev-reputation-rollup`: tracked alongside `peak_mcap_lifetime` as `peak_first_24h` — measures launch-strength vs sustain.
- `autopsy-writer`: include first-24h ATH in the death narrative ("hit $X in first 24h, died at $Y").
- Bubble Map / Holders frontend: display as "First 24h Peak" badge when present.

### 5. Cron registration
Two new pg_cron jobs in a single migration:
- `first-24h-ath-sealer-5m` — `*/5 * * * *`
- `first-24h-ath-backfill-10m` — `*/10 * * * *`

Plus a kill-switch row in `function_toggles`.

## Why 23h45m, not exactly 24h
GeckoTerminal hourly candles close on the wall-clock hour and take 1–3 minutes to publish. Sealing at 23h45m guarantees:
1. The hour-23 candle (covering minutes 22h00–23h00 of the token's life) is closed and indexed.
2. We still capture 23 of the 24 first-day hours — close enough to the canonical "first day" peak for ranking purposes; cleaner than waiting until h24+ where intraday backfill drift can sneak in.

## Files

**New**
- `supabase/migrations/<ts>_first_24h_ath.sql` — column + indexes + cron jobs + toggle rows
- `supabase/functions/first-24h-ath-sealer/index.ts`
- `supabase/functions/first-24h-ath-backfill/index.ts`

**Edited**
- `supabase/config.toml` — register both functions (`verify_jwt = false`)
- `supabase/functions/lifecycle-scorecard-builder/index.ts` — read new column into scoring inputs
- `supabase/functions/dev-reputation-rollup/index.ts` — aggregate `peak_first_24h`
- `supabase/functions/autopsy-writer/index.ts` — pull into autopsy narrative
- `mem/features/intelligence/first-24h-ath.md` (new memory) — documents the immutability rule + 23h45m timing
- `mem/index.md` — add reference

## Open questions

1. **Display on frontend now, or ship backend-only first?** Recommend backend-only first run (1–2 days) so we have data to display before users see empty badges.
2. **Backfill horizon** — backfill all tokens in `token_lifecycle`, or cap at last 90 days? GT only reliably serves OHLCV for actively-traded pools; very old dead tokens will mostly return `no_pool`. Recommend: no cap, but mark `no_pool` quickly to drain the queue.
3. **Use the existing `ath-24h-backfill` function instead of a new one?** That function is misnamed (it actually writes lifetime ATH). I recommend keeping it untouched and adding the two new dedicated functions to avoid breaking 14+ callers of `ath_24h_usd`.