## Goal

Turn `/insiders-recaps` from a live regex-parse of the raw Telegram log into a **persistent accumulative list**: every daily / weekly / monthly recap that PREMIUM INSIDERS pins gets scraped, parsed, dev-wallet + KYC resolved, grouped, and stored — so the page loads instantly and the list only grows over time.

## What exists today

- Recap messages already land in `telegram_channel_calls` (channel_name `insiders`) via the live MTProto listener — no extra scraping needed.
- The page parses those rows in the browser every visit, and resolves dev wallets / KYC on the fly with no persistence.
- `alpha-lists-rebuild` already does the parse + dev/KYC resolution server-side, but only runs when a human clicks "Rebuild" and writes into the alpha tables, not a general recap table.

## Plan

### 1. New table: `insiders_recap_entries` (accumulative store)

One row per unique `(recap_type, token_mint, recap_date)`:
- `recap_type` — `daily` | `weekly` | `monthly`
- `recap_date` — the date the pin covers (parsed from message header, e.g. "April 17")
- `rank` — position in the top 10 / 20 / whatever
- `ticker`, `token_mint`
- `entry_mcap`, `peak_mcap`, `multiplier`
- `dev_wallet`, `dev_resolution_source`
- `kyc_root_wallet`, `kyc_root_label`, `kyc_source_type`
- `source_message_id`, `source_message_ts`
- `first_seen_at`, `last_refreshed_at`

Unique index on `(recap_type, token_mint, recap_date)` so re-runs are idempotent.

### 2. New edge function: `insiders-recaps-ingest`

Steps each run:
1. Read `telegram_channel_calls` rows for channel `insiders` where `raw_message ILIKE '%INSIDERS%RECAP%'` in the last N days (default 3 for daily catch-up, 45 for weekly/monthly).
2. Classify daily / weekly / monthly and extract `recap_date` from the header (`- April 17`, `- Week of ...`, `- April`).
3. Parse the top-N block (existing 3-line regex from the page: `Nx $TICKER`, `$entry => $peak`, base58 CA).
4. For each entry: resolve dev wallet using the same waterfall the page uses (pumpfun_watchlist → scraped_tokens → token_lifecycle → developer_tokens → `creator-wallet-resolver`).
5. Resolve KYC: `developer_profiles` → `dev_wallet_reputation` → label from `known_cex_wallets`.
6. Upsert into `insiders_recap_entries` on `(recap_type, token_mint, recap_date)` — accumulative, never deletes.
7. Return counts (new / updated / unresolved).

Also accepts `?mode=backfill&days=60` for one-time historical rebuild.

### 3. Cron schedule (times sorted out)

PREMIUM INSIDERS posts pins right after each period closes; exact minute drifts, so we poll around the boundary rather than guess:

- **Daily**: every 15 min from **23:45 → 01:30 UTC** (covers late-night pin), plus a safety sweep at **12:00 UTC**.
- **Weekly**: every 30 min **Mon 00:00 → 04:00 UTC**.
- **Monthly**: hourly on **day 1, 00:00 → 06:00 UTC**.
- **Global safety net**: full function once every 3 h so any missed pin still gets picked up within hours.

All schedules point at the same `insiders-recaps-ingest` function — it's idempotent, so extra runs are cheap.

### 4. Page rewrite (`src/pages/InsidersRecaps.tsx`)

- **Tokens / Dev Groupings / KYC Groupings** tabs now read directly from `insiders_recap_entries` (single query, indexed, fast).
- Filters `all / daily / weekly / monthly` map straight to `recap_type`.
- "Rebuild" button becomes "Refresh now" → invokes `insiders-recaps-ingest` with `mode=incremental`.
- New "Backfill 60d" admin button → invokes with `mode=backfill&days=60`.
- **Alpha Watch** tab untouched (still reads `alpha_paper_trades`).

### 5. One-time backfill

Right after deploy: run `insiders-recaps-ingest?mode=backfill&days=60` once to populate the table with everything already in `telegram_channel_calls`.

## Technical notes

- Idempotency: unique constraint `(recap_type, token_mint, recap_date)` + `ON CONFLICT DO UPDATE` refreshes `dev_wallet` / `kyc_root_wallet` when previously null but never overwrites a good value with null.
- Unresolved devs get retried on every cron pass (cheap: only rows where `dev_wallet IS NULL`).
- RLS: readable by `authenticated`, write-only via service role from the edge function.
- Grants included in the `CREATE TABLE` migration.
- No changes to `alpha-lists-rebuild` or the alpha pipeline — Alpha Watch keeps working as-is.

Reply "Plan Approved" and I'll ship it.