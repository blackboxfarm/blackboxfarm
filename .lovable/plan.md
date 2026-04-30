## Scope

Autopsy section only. **Zero changes to any Solscan code, secrets, or modules.** No edits to `solscan-api.ts`, `solscan-intelligence.ts`, `solscan-markets.ts`, `solscan-free.ts`, or `provider-health.ts`.

## Why the page is empty right now (verified against the live DB)

The Autopsy UI is reading from sources that are effectively empty:

```text
v_live_death_watch                              0 rows
autopsy_backlog                                 0 rows
token_lifecycle.death_cause populated           0 rows
token_lifecycle.market_cap < 1000               0 rows
token_lifecycle.liquidity_usd < 500             0 rows
token_lifecycle.ath_24h_usd >= 50000            0 rows  (max value: $13,923 — clearly NOT market-cap ATH)
```

Meanwhile the real candidate pool already exists in `token_price_history`:

```text
Tokens with price history                       8,122
Mints with ATH market cap >= $50k               4,066
Live collapse candidates (latest <$1k or down 95%+ from $50k+ ATH)
                                                  458
Top examples: $LASTMAN ($154M -> $37k, 99.98%),
              A5maw... ($153M -> $87, 100%),
              $PENGUIN ($114M -> $2.97M, 97.41%),
              etc.
```

So `token_lifecycle.ath_24h_usd` is the wrong column. Real ATH market caps live in `token_price_history.market_cap_usd`. The view and the backlog builder both need to be re-pointed at that source.

## What I will change

### 1. Replace `v_live_death_watch` (migration — schema change only)

New definition uses `token_price_history` as the truth source:

```text
WITH ath AS (
  SELECT token_mint,
         max(market_cap_usd) AS ath_mcap_usd,
         (array_agg(captured_at ORDER BY market_cap_usd DESC, captured_at DESC))[1] AS ath_at
  FROM token_price_history
  WHERE market_cap_usd IS NOT NULL
  GROUP BY token_mint
),
latest AS (
  SELECT DISTINCT ON (token_mint)
         token_mint, market_cap_usd AS latest_mcap_usd, price_usd AS latest_price_usd, captured_at AS latest_at
  FROM token_price_history
  WHERE market_cap_usd IS NOT NULL
  ORDER BY token_mint, captured_at DESC
)
SELECT
  ath.token_mint,
  COALESCE(tl.symbol, pw.token_symbol)            AS symbol,
  tl.name, tl.launchpad, tl.creator_wallet,
  ath.ath_mcap_usd                                AS ath_usd,
  ath.ath_at,
  latest.latest_mcap_usd                          AS current_mcap_usd,
  latest.latest_price_usd                         AS current_price_usd,
  COALESCE(tl.liquidity_usd, pw.liquidity_usd)    AS liquidity_usd,
  COALESCE(snap.total_holders, pw.holder_count)   AS holder_count,
  snap.health_grade, snap.health_score, snap.risk_label,
  tl.death_cause, tl.death_confidence, tl.autopsy_at AS death_at,
  GREATEST(0, LEAST(1, 1 - latest.latest_mcap_usd / NULLIF(ath.ath_mcap_usd, 0))) AS collapse_pct,
  ath.ath_mcap_usd * GREATEST(0, LEAST(1, 1 - latest.latest_mcap_usd / NULLIF(ath.ath_mcap_usd, 0)))
                                                  AS dollar_wipeout,
  tl.current_status, latest.latest_at
FROM ath
JOIN latest USING (token_mint)
LEFT JOIN token_lifecycle tl ON tl.token_mint = ath.token_mint
LEFT JOIN pumpfun_watchlist pw ON pw.token_mint = ath.token_mint
LEFT JOIN LATERAL (
  SELECT total_holders, health_grade, health_score, risk_label
  FROM token_health_snapshots s
  WHERE s.token_mint = ath.token_mint
  ORDER BY snapshot_hour DESC LIMIT 1
) snap ON true
WHERE ath.ath_mcap_usd >= 50000
  AND (latest.latest_mcap_usd < 1000
       OR latest.latest_mcap_usd < ath.ath_mcap_usd * 0.05)
```

`security_invoker = on`. RLS continues to be enforced through underlying tables.

### 2. Rebuild `autopsy-backlog-builder` against the same source

Edge function update only — no schema change to `autopsy_backlog`:

- pull from the new view, restrict to rows where `latest_at < now() - interval '24 hours'` (already historical),
- order by `dollar_wipeout DESC`, cap at 500,
- upsert into `autopsy_backlog` with `is_frozen = true`,
- keep `assertDbWrite` on every insert,
- keep idempotency guard (skip if rows exist unless `force=true`).

### 3. Fix `LiveDeathWatch.tsx`

- Remove the on-mount auto-firing of `ath-backfill` and `token-autopsy` (this is what produced the 504 IDLE_TIMEOUT and contributed nothing because the underlying candidate query was already empty).
- Just load `v_live_death_watch` and refresh every 5 minutes.
- Replace the empty-state copy `"No active death candidates. Try Backfill ATH or Run Autopsy to populate signals."` with an honest message that, if it ever appears, says no tokens currently meet the death thresholds (>=$50k ATH and >=95% collapse / <$1k mcap). Given the DB has 458 such tokens right now, the realistic state is the list is full, not empty.
- Keep Tier A / Tier B queue buttons exactly as they are.

### 4. Fix `CoolDeathsBacklog.tsx`

- Keep auto-build on first mount when backlog is empty (one-shot).
- Remove the misleading "Building backlog… refresh in ~30s" empty message; replace with a short status that reflects whether the builder ran and how many rows it inserted.
- Otherwise unchanged: same row layout, same Draft Autopsy action.

### 5. Cron — keep `token-autopsy-30min` and `ath-24h-backfill-30min` exactly as they are

Both jobs are already scheduled and running. No cron changes.

### 6. Verification after deploy

- Confirm `v_live_death_watch` returns >0 rows (expecting ~458 based on current DB).
- Invoke `autopsy-backlog-builder` once with `{force:true}` to seed the historical backlog from real death evidence.
- Spot-check a few rows (LASTMAN, PENGUIN, SNIGGA) against `token_price_history` ATH/latest to make sure the math is right.
- Confirm UI loads rows on `/super-admin` Autopsy tabs.

## Files touched

- `supabase/migrations/<new>.sql` — replace `v_live_death_watch`.
- `supabase/functions/autopsy-backlog-builder/index.ts` — re-source from new view.
- `src/components/admin/autopsies/LiveDeathWatch.tsx` — drop on-mount blocking calls, fix empty-state copy.
- `src/components/admin/autopsies/CoolDeathsBacklog.tsx` — fix empty-state copy.

## Files explicitly NOT touched

- `supabase/functions/_shared/solscan-api.ts`
- `supabase/functions/_shared/solscan-intelligence.ts`
- `supabase/functions/_shared/solscan-markets.ts`
- `supabase/functions/_shared/solscan-free.ts`
- `supabase/functions/_shared/provider-health.ts`
- The `SOLSCAN_API_KEY` secret
- Any other Solscan reference anywhere in the codebase

## Expected outcome

- Live Death Watch displays the ~458 real collapse candidates, sorted by dollar wipeout (LASTMAN, PENGUIN, etc. at the top).
- Cool Deaths Backlog auto-seeds and freezes a historical pool drawn from the same evidence base.
- The 504 IDLE_TIMEOUT from the on-mount blocking calls goes away.
- The bogus "Try Backfill ATH or Run Autopsy" copy is gone.
- Solscan code remains exactly as it is today.