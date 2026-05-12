## Problem

The Dev Track Record card on the Autopsy page shows "New dev · 0 prior tokens" because it only counts tokens where `creator_wallet = 12ysZt…fbTs`. That is literally true (this wallet launched only $1SHOT), but the Mesh Bubble Map has *already* identified 4+ sibling wallets sharing the same Binance KYC root and funder cluster — and those siblings have collectively launched $MONKE, $100, $GRIMACE, $bumer, $Rudy, $CHUTTI, $uncel, $ASTROID, $PSILO, $DJT, $SHELDON, etc.

The autopsy never aggregates the family. Result: a dev with a clearly-traced multi-wallet history reads as a "New dev."

## Fix — Family-Aware Dev Track Record

Add a second, broader rollup that the autopsy and reputation panels can show alongside (not replacing) the direct-wallet card.

### 1. New rollup: `dev-family-track-record-rollup` edge function

Inputs: `dev_wallet`.

Steps:
1. Resolve the family:
   - Read `reputation_mesh` (or `cluster_member_wallets` / `shared_funders` view we already populate) for siblings with relationship in (`shared_funder`, `same_kyc_root`, `likely_dev_family`, `tight_cluster`).
   - Confidence floor 60. Cap at ~25 sibling wallets to keep cost bounded.
   - Always include the original wallet itself.
2. Aggregate launches across the family from `developer_tokens` + `token_lifecycle_scorecard` + `dev_token_history` (whichever rows exist per wallet).
3. Re-run the same scoring math used by `dev-track-record-rollup` (skill / intent / luck / outcome breakdown), but weighted by per-sibling confidence so a high-confidence sibling counts fully and a confidence-60 sibling counts ~0.6.
4. Persist into a new table `dev_family_track_record_summary` (`dev_wallet` PK, family_size, family_wallets jsonb, total_tokens, by_outcome, by_cause, indices, verdict_label, ai_interpretation, best_token, last_recomputed_at).
5. Generate AI interpretation paragraph the same way as the per-wallet rollup, but the prompt explicitly names the family lens ("This dev operates a cluster of N wallets sharing Binance KYC root…").

### 2. Backfill missing direct data first

Before family rollup runs, make sure each sibling has its own data populated. Add a cheap pre-step that for each sibling wallet missing from `dev_token_history`/`developer_tokens`:
- calls existing `dev-profile-full-scrape` (Helius DAS + Pump.fun) to populate `developer_tokens`
- then `dev-token-outcome-classifier` to populate `dev_token_history`
- 24h cooldown column to avoid re-scraping same sibling repeatedly.

### 3. Orchestrator wiring

Extend `dev-track-record-run-all` to chain a 4th step:
```
dev-profile-full-scrape → dev-token-outcome-classifier → dev-track-record-rollup → dev-family-track-record-rollup
```
Trigger the family step from the SuperAdmin "Build Dev Track Record" button and from the existing 3-hourly `insiders-pipeline-orchestrator` cron.

### 4. UI — `DevTrackRecordCard.tsx`

When `dev_family_track_record_summary` exists for the wallet, render a second stacked panel directly below the existing direct-wallet card:

```text
DEV TRACK RECORD                  ← existing (this wallet only)
New dev · 0 prior tokens

EXTENDED DEV-FAMILY TRACK RECORD  ← new (mesh-aggregated)
Likely operator of 5 wallets · 23 prior tokens
Skill 42 · Intent -18 · Luck 67
Verdict: Meme-spammer with one hit ($1SHOT)
AI: "This operator runs a cluster of 5 wallets all funded from the same
Binance hot wallet. Across the cluster: 23 launches, 1 sustained hit,
3 viral memes, 8 inexperience-fails, 0 hard rugs."
[Show family wallets ▾]   [Show all 23 tokens ▾]
```

Family wallets list uses the same sibling rendering already on the bubble map (clickable, opens that wallet's autopsy).

### 5. Hook update

`useDevTrackRecord` (or equivalent) fetches both summaries in one query and exposes `{ direct, family }`. Card hides the family panel cleanly when `family.total_tokens === 0` so true new devs still read as "New dev."

## What this fixes

- $1SHOT autopsy will read as "Operator of a 5-wallet cluster sharing Binance KYC, 23 prior launches, mostly low-effort memes, 1 sustained hit" instead of "New dev."
- Every future autopsy where the mesh has already found a dev-family will automatically inherit a real reputation instead of a blank one.
- No regression for genuinely-new wallets — family panel just doesn't render.

## Out of scope

- Changing the Mesh Bubble Map itself.
- Re-defining what counts as "family" (we use the existing `reputation_mesh` confidence + relationship labels already produced by the Surveillance Engine).
- Touching the banner-decorator function.