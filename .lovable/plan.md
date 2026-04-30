
## Reframing — what we actually have

Before fixing anything, here is the truth about the data the system already collects (verified live in the DB just now):

```text
token_health_snapshots    13,189 rows   342 distinct mints in last 24h   <- the 12 hourly bars
token_price_history       32,257 rows   333 distinct mints in last 24h   <- price + mcap timeline
pumpfun_watchlist         25,377 rows   18,627 already have price_ath_usd
token_lifecycle            4,379 rows   has ath_24h_usd, price_usd, market_cap, liquidity_usd
                                       BUT death_cause = 0 rows (autopsy never wrote back!)
autopsy_candidates             6 rows   (funnel-feeder barely runs)
autopsy_reports                0 rows
```

So the data is **not** missing. The Token Funnel Pool spreadsheet looked empty because:
1. It joined the wrong columns (read `pumpfun_watchlist.price_usd` but ATH lives in `price_ath_usd` / `token_lifecycle.ath_24h_usd`).
2. `token_lifecycle.death_cause` is empty for all 4,379 rows — `token-autopsy` never wrote back, so nothing flags as "dead".
3. The 12-bar Litmus strip only fills 5–6 bars because `feed-health-scanner` does not snapshot every token every hour — it only snapshots top-200 + on-demand.

That spreadsheet is the wrong tool. We're killing it and building the two lists you actually want.

---

## Goal — two purpose-built lists for the Autopsy section

### List 1 — Live Death Watch (auto-Tier-A / Tier-B)
Active tokens being monitored in real time for signs of death. As deaths occur, candidates are auto-queued for an autopsy report.

### List 2 — Cool Deaths Backlog (one-time, Tier-B only)
A frozen historical snapshot of already-dead tokens that look interesting (good ATH, bad/sad dev). Built **once**, then we cherry-pick reports from it. Never re-scanned.

---

## What we'll build

### A. Fix the data gaps (one-time backend fixes)

1. **ATH backfill from external sources**
   - Add `supabase/functions/ath-backfill/index.ts` — for any token in `token_lifecycle` or `pumpfun_watchlist` missing `ath_24h_usd` / `price_ath_usd`, query in this order:
     - GeckoTerminal `/networks/solana/tokens/{mint}` → returns `attributes.fdv_usd`, plus we compute ATH from `/ohlcv/hour?aggregate=1&limit=1000` (best free source for full lifetime ATH).
     - DexScreener `pairs/solana/{pair}` fallback → uses `priceChange` + current price.
     - Solscan Pro `/v2.0/token/meta` → only gives current snapshot, not ATH (so it does NOT solve ATH; we still use it for holder count + supply confirmation).
   - Writes back to both `token_lifecycle.ath_24h_usd` (renamed conceptually to "lifetime ATH") and `pumpfun_watchlist.price_ath_usd` via `assertDbWrite`.
   - Cron: nightly, 500 mints/run.

2. **Run `token-autopsy` against `token_lifecycle`**
   - It already exists and works — it just isn't on a schedule. Add a 6-hour cron so `death_cause`, `death_confidence`, `autopsy_at` actually populate. This unblocks every "dead" filter.

3. **Stop relying on hourly snapshots for the 12-bar strip**
   - `feed-health-scanner` only writes snapshots when a token enters top-200 or is hovered. The 12-bar grid will always look sparse for most tokens — that's by design (we don't want 65k tokens × 24 snapshots/day).
   - Fix: change `LitmusStrip` to render N bars for the N most recent hours that **have data**, with the gap-fill logic only for top-200 tokens. For non-top-200 we show "On-demand only — click refresh".

### B. Replace the messy spreadsheet with two clean tabs

Remove `Token Funnel Pool` table from the Autopsy admin page. Replace with two tabs in `src/pages/admin/AutopsyQueue.tsx`:

#### Tab 1 — "Live Death Watch"
Source: `token_lifecycle` joined with `pumpfun_watchlist` and latest `token_health_snapshots`.

Filter logic (server-side view `v_live_death_watch`):
```text
WHERE current_status = 'active'
  AND (
    market_cap < 1000                              -- functional death
    OR liquidity_usd < 500
    OR (ath_24h_usd >= 50000 AND price_usd < ath_24h_usd * 0.05)  -- 95% collapse from $50k+ ATH
    OR death_cause IS NOT NULL                     -- autopsy already flagged it
  )
ORDER BY (ath_24h_usd * (1 - price_usd/ath_24h_usd)) DESC  -- biggest dollar wipeout first
```

Columns shown (all hydrated, no empties):
- Ticker / Mint / Launchpad
- ATH MCap (with timestamp)
- Current MCap (with % from ATH)
- Liquidity USD
- Holder count (latest)
- Health grade (latest snapshot)
- Dev wallet + reputation tier
- Death cause (if autopsied) + confidence
- Action: **[ Send to Tier-A ]** / **[ Send to Tier-B ]** / **[ Skip ]**

Auto-tier rules (matches existing `autopsy-funnel-feeder` taxonomy):
- ATH ≥ $100k AND collapse ≥ 95% AND dev dump_velocity > 80 → **Tier A** (auto-publish)
- ATH ≥ $50k AND any malicious signal → **Tier B** (admin approves)
- Everything else → stays in watch list

Refreshes every 5 min. New death candidates flow in automatically.

#### Tab 2 — "Cool Deaths Backlog" (one-shot)
A new table `autopsy_backlog` populated **once** by a new edge function `autopsy-backlog-builder`:

```text
INSERT INTO autopsy_backlog
SELECT FROM token_lifecycle
WHERE first_seen_at < now() - interval '7 days'    -- already historical
  AND (market_cap < 1000 OR liquidity_usd < 500)   -- already dead
  AND ath_24h_usd >= 25000                         -- had a real life
  AND death_cause IN ('rug_pull','slow_drain','liquidity_pulled','abandoned')  -- bad/sad dev only
ORDER BY ath_24h_usd DESC
LIMIT 500
```

UI shows the same columns as Tab 1, plus a `[ Draft autopsy ]` button that triggers `autopsy-writer` for that mint.

The backlog table is **frozen after build** — a flag `autopsy_backlog.is_frozen = true` blocks re-runs. We can manually unfreeze if needed.

### C. Kill the old spreadsheet
Delete `src/components/admin/autopsies/PumpfunWatchlistSpreadsheet.tsx`. The funnel pool was a dev peek tool; the two new tabs replace it cleanly.

---

## Technical summary

| Change | File |
|---|---|
| New ATH backfill function | `supabase/functions/ath-backfill/index.ts` |
| Schedule existing `token-autopsy` every 6h | `supabase/config.toml` cron block |
| New view | migration: `v_live_death_watch` |
| New table | migration: `autopsy_backlog` (token_mint PK, is_frozen bool, captured_at) |
| New backlog builder | `supabase/functions/autopsy-backlog-builder/index.ts` (one-shot, idempotent) |
| New admin tabs | `src/pages/admin/AutopsyQueue.tsx` — replace current body with `<Tabs>` (Live / Backlog / Drafts / Published) |
| Tabs components | `src/components/admin/autopsies/LiveDeathWatch.tsx`, `CoolDeathsBacklog.tsx` |
| Litmus strip fix | `src/components/feed/LitmusStrip.tsx` — adaptive bar count for non-top-200 |
| Delete | `src/components/admin/autopsies/PumpfunWatchlistSpreadsheet.tsx` |

External APIs used (no new keys needed beyond what we have):
- **GeckoTerminal** (free, no key) — primary ATH source via OHLCV.
- **DexScreener** (already integrated) — fallback.
- **Solscan Pro** (only if you confirm we have the key) — supply + holder confirmation, not ATH.
- CoinGecko has ATH on `/coins/{id}` but most pump.fun tokens are not listed, so it's an opportunistic third fallback.

---

## What you get when this lands

- Two clean lists, both with **real ATH, real MCap, real holder count, real death cause** in every row.
- The Live Death Watch automatically promotes new deaths to Tier-A or Tier-B as they happen.
- The Cool Deaths Backlog gives you ~500 historical "interesting deaths" to cherry-pick reports from, built once.
- The empty/messy spreadsheet is gone.
- The 12-bar strip stops lying about missing data and shows what actually exists.

Approve and I'll implement in this order: (1) ATH backfill + autopsy cron, (2) view + backlog table migration, (3) two new admin tabs, (4) delete old spreadsheet, (5) Litmus strip honesty fix.
