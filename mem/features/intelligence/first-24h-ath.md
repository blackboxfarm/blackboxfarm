---
name: First 24h ATH Capture
description: Immutable first-24h ATH market cap sealed at ~23h45m of token age via GeckoTerminal hourly OHLCV; newest-first backfill loop for older tokens
type: feature
---
`token_lifecycle.first_24h_ath_usd` is a permanent historical fingerprint — the peak USD market cap during a token's first 24 hours of life. It is **immutable** once `first_24h_ath_captured_at` is set; never overwrite.

## Sealer (`first-24h-ath-sealer`, every 5min)
Picks tokens aged 23h45m–25h with `first_24h_ath_usd IS NULL`, oldest-first (urgent — 1h25m window). Calls GeckoTerminal `/networks/solana/tokens/{mint}/pools` then `/pools/{pool}/ohlcv/hour?aggregate=1&limit=24&before_timestamp={firstSeen+24h}` and converts max-high price to mcap via `(maxHigh / currentPrice) * currentFdv`. The 15-min pre-buffer guarantees GT's hour-23 candle is closed and indexed.

## Backfill (`first-24h-ath-backfill`, every 10min, batch 15)
Picks tokens older than 25h with `first_24h_ath_usd IS NULL`, **newest-first** (so freshly added historical entries are filled before deep history; loops back to newest after draining).

## Sources
- `geckoterminal_live` — sealed in the 23h45m window
- `geckoterminal_backfill` — sealed retroactively
- `no_pool` — token never had a tradeable Solana pool (dead on bonding curve); written as `0` to drain queue

## Why it matters
First-24h ATH is the cleanest proxy for launch-strength independent of long-tail noise. Used (or planned) for: pump-and-dump detection (`current_mcap / first_24h_ath_usd`), dev-reputation `peak_first_24h` aggregate, autopsy narrative ("hit $X in first 24h, died at $Y"), Bubble Map / Holders frontend "First 24h Peak" badge.

## How to apply
Never write to the column outside the two cron functions. Read it freely. Treat `0` with `source='no_pool'` as "no pool ever existed" — distinct from missing data.