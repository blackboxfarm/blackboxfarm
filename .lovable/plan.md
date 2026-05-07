# Harm Score for Token Autopsies

Replace the misleading "Risk X/10" badge on dead tokens with a backward-looking **Harm Score (0–100)** that quantifies the damage a dead token caused its holders. Then backfill the score for all 22 existing autopsy reports.

## 1. Database — add Harm fields

Migration on `autopsy_reports`:
- `harm_score` `int` (0–100, nullable)
- `harm_breakdown` `jsonb` (component scores + display strings)
- `harm_scored_at` `timestamptz`
- `harm_headline` `text` (e.g. `"$412k vaporized · 1,847 bagholders"`)

No data migration in this step — values populated by the scorer in step 3.

## 2. Harm Score formula

Composite 0–100, weighted:

| Component | Weight | Source |
|---|---|---|
| Realized USD losses to holders | 35% | sum of `holder_movements.usd_value` where `action='sell'` after ATH, minus buys after ATH; floor at 0 |
| Bagholder count | 20% | distinct wallets in `holder_movements` with net positive token balance at death |
| Peak-to-floor drawdown | 15% | `1 - (token_lifecycle.market_cap / ath_24h_usd)` |
| Dev extraction (USD) | 15% | `dev_behavior_scores.dump_velocity_score` × creator_wallet net SOL out × live SOL price |
| Speed of death | 10% | inverse of hours from ATH → `autopsy_at` (faster = worse) |
| **Intent multiplier** | ×1.0–1.5 | `intent_classification`: `rug_pull`=1.5, `soft_rug`=1.35, `abandoned`=1.2, `accidental_failure`=1.05, `unknown`=1.0 |

Each component normalized to 0–100 via log scale (USD/holders) or linear (drawdown/speed). Final = `min(100, round(weighted_sum × intent_multiplier))`.

Stored breakdown JSON shape:
```json
{
  "loss_usd": 412300, "bagholders": 1847, "drawdown_pct": 99.2,
  "dev_extracted_usd": 14200, "death_hours": 6,
  "intent": "rug_pull", "multiplier": 1.5,
  "components": {"loss":34, "bag":18, "draw":15, "dev":12, "speed":9}
}
```

## 3. New edge function — `autopsy-harm-scorer`

`supabase/functions/autopsy-harm-scorer/index.ts`:
- Input: `{ slug?: string, token_mint?: string, all?: boolean, limit?: number }`
- Loads `autopsy_reports` row(s) + joins `token_lifecycle`, `dev_behavior_scores` (via `pumpfun_watchlist.creator_wallet`), `holder_movements`
- Fetches live SOL/USD (per `mem://constraints/autopsy-live-sol-price`)
- Computes Harm Score per formula above
- Uses `assertUpdate` (per zero-tolerance memory) to write `harm_score`, `harm_breakdown`, `harm_headline`, `harm_scored_at`
- Wrapped with `withRunLog`

## 4. Hook into pipeline

In `autopsy-writer` (after the `autopsy_reports` insert, alongside the banner overlay best-effort call):
- Fire-and-forget call to `autopsy-harm-scorer` with the new slug.

## 5. UI — replace Risk badge

**`src/pages/Autopsies.tsx`**
- Add `harm_score`, `harm_headline`, `harm_breakdown` to the select.
- Replace `Risk {a.riskScore}` badge with `☠ HARM {harmScore}/100` badge.
- Color: green ≤25, amber ≤60, red ≤85, black ≥86.
- Subtitle line shows `harm_headline` ("$412k vaporized · 1,847 bagholders").
- Fallback to existing Risk badge only when `harm_score` is null (legacy/unscored).

**`src/pages/AutopsyArticle.tsx`**
- Same replacement in header.
- Add a small "Harm breakdown" tooltip/popover listing the 5 components from `harm_breakdown.components`.

**`src/components/admin/autopsies/AutopsyCandidateRow.tsx`** + `AllDrafts.tsx`
- Show Harm badge next to existing status pills when present.

Risk field is left in the DB (not deleted) for any legacy reads, but no longer rendered when Harm exists.

## 6. Backfill all 22 existing autopsies

After deploy:
- Invoke `autopsy-harm-scorer` with `{ all: true }` once. The function iterates every row in `autopsy_reports` (currently 22) sequentially with a small delay to respect SOL price/Helius rate limits, and writes Harm fields to each.
- Confirm via a `SELECT slug, harm_score, harm_headline FROM autopsy_reports ORDER BY harm_score DESC` readout.

## Technical notes

- All DB writes use `assertUpdate`/`assertUpsert` from `_shared/db-assert.ts`.
- Live SOL price fetched fresh per run (CoinGecko → Helius → DexScreener fallback chain).
- No hardcoded USD or SOL constants.
- Harm Score is deterministic given the same inputs — safe to re-run.
- Existing `risk_score` column untouched (no breakage if anything else reads it).
