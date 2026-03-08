

# Lifecycle-Aware Audit: Systems Needing Phase-Contextual Scoring

## The Problem

We fixed the **health score** to be lifecycle-aware, but five other systems still generate public-facing scores, verdicts, and classifications using flat thresholds that ignore where a token sits in its lifecycle. A 15-minute-old pump.fun token and a 2-week-old Raydium token get evaluated with identical logic.

## Systems That Need Rework

### 1. `token-momentum-analyzer` — Momentum Score (0-100)

**Current flaw**: Uses identical thresholds regardless of age. A 10-minute-old token gets +10 "freshness bonus" but otherwise the same volume/price/txn thresholds as a mature token. Problems:
- **Volume surge ratio** (5m vs 1h avg) is meaningless for tokens under 15 minutes — the 1h window barely exists
- **"Low activity" penalty** (-10 for <5 txns in 5m) penalizes newly bonded tokens that haven't had time to build volume
- A mature token with $500 volume in 5m is concerning; a fresh token with $500 in 5m is normal
- **Price change thresholds** are flat: +10% in 5m on a fresh token is organic; on a mature token it's a potential manipulation signal

**Fix**: Inject `healthPhase` from the caller (or detect internally via `pairCreatedAt`). Apply phase-weighted thresholds:
- **On-curve/Fresh**: Emphasize buy/sell ratio and buyer count over volume magnitude. Lower "surge" thresholds. Remove freshness bonus (redundant with phase).
- **Established**: Standard thresholds work fine.
- **Mature**: Raise the bar — volume surge needs to be higher to matter. Weight 1h/6h price trends more than 5m noise.

### 2. `token-ai-interpreter` — Lifecycle Stage + AI Commentary

**Current flaw**: `determineLifecycleStage()` uses ONLY holder count to pick lifecycle stage (Genesis <100, Discovery 100-500, Expansion >500). It has zero awareness of:
- Token age (pairCreatedAt)
- Volume/trading activity
- Whether the token is still on bonding curve
- Whether it just bonded 2 hours ago vs 2 weeks ago

A token with 50 holders that bonded 3 weeks ago is labeled "Genesis" — same as a 5-minute-old pump. A dead token with 2000 holders and zero volume is "Expansion."

It also doesn't receive vitality data from `bagless-holders-report`, so the AI prompt lacks volume, price, and transaction context entirely. The AI is interpreting structure in a vacuum.

**Fix**:
- Pass the `healthPhase` and vitality metrics (volume, price change, txn counts) from `bagless-holders-report` through to the interpreter via `reportData`
- Replace the holder-count-only lifecycle detection with the same phase-aware logic (using `pairCreatedAt` + liquidity + vitality)
- Add vitality context to the AI prompt so the model can distinguish "Expansion with collapsing volume" from "Expansion with healthy growth"
- Add "Dormant" detection: >500 holders but <$500 vol/24h and <10 txns/1h

### 3. `token-momentum-analyzer` → `/verdict` — Verdict Decision Logic

**Current flaw** (in `holdersintel-bot-webhook`): The verdict thresholds are flat:
```
momentum >= 70 && health >= 60 → BUY DEEP LONG
momentum >= 55 && health >= 40 → BUY MEDIUM SHORT
momentum >= 40 → BUY SMALL SHORT
else → HOLD/AVOID
```

No phase context. A "BUY DEEP LONG" on a 10-minute-old on-curve token is reckless — the meaning of "deep long" changes entirely by phase. A fresh token with momentum 75 and health 65 could bond and dump in 20 minutes.

**Fix**: Phase-adjusted verdict logic:
- **On-curve**: Never recommend "DEEP LONG." Max recommendation is "SMALL SHORT" (speculative). High momentum on curve = "WATCH CURVE" signal.
- **Fresh (<48h)**: "MEDIUM SHORT" max. Too early for conviction plays.
- **Established (2-14d)**: Full verdict range unlocked, but require higher thresholds for DEEP LONG (momentum >= 75, health >= 70).
- **Mature (>14d)**: Standard thresholds. These are the tokens where DEEP LONG makes sense.

### 4. `developer-reputation` — Reputation Score Context

**Current flaw**: The reputation score and risk level are context-free relative to the TOKEN being analyzed. A dev with 50 reputation and 3 prior tokens is "medium risk" whether the current token is 5 minutes old or 30 days old. But the *implication* changes:
- Dev with score 50 on a brand new token = high caution (unproven on this token)
- Dev with score 50 on a 30-day token that's still healthy = the token itself has proven resilience despite moderate dev rep

This doesn't need a full rewrite — just needs the **consumer** (`/verdict`, `/oracle` bot output) to contextualize the rep score against the token's phase.

**Fix**: In `/verdict` and `/oracle` bot handlers, append phase context to the reputation interpretation. E.g., "Dev rep 50/100 — *moderate risk on a fresh token; no track record on this launch yet*" vs "*moderate dev, but this token has survived 30 days suggesting independent community support*."

### 5. `wallet-behavior-analysis` — Smart Money Score

**Current flaw**: The `smartMoneyScore` calculation uses fixed thresholds (e.g., +10 if first tx was >30 days ago, +15 if no sells in 30 days). These are irrelevant for fresh tokens — nobody can have held for 30 days if the token is 2 hours old.

**Fix**: Normalize time-based metrics against token age. "Diamond hands" on a 2-hour token = held since near-launch. "Early entry" should mean within first 10% of the token's life, not a fixed 30-day window.

## Implementation Plan

### Step 1: Shared phase utility
Create `supabase/functions/_shared/token-phase.ts` — a single `detectTokenPhase()` function that all systems import. Takes `pairCreatedAt`, `liquidityUsd`, and optionally vitality metrics. Returns `{ phase, ageHours, label }`. Prevents each function from reimplementing phase detection.

### Step 2: `token-momentum-analyzer` — Phase-weighted scoring
- Import `detectTokenPhase`
- Detect phase from `pairCreatedAt`
- Apply phase-appropriate thresholds for volume, price change, and activity signals
- Return `phase` in the response

### Step 3: `token-ai-interpreter` — Vitality-enriched lifecycle detection
- Accept vitality fields in `reportData` (volume, priceChange, txns, pairCreatedAt)
- Replace holder-count-only `determineLifecycleStage()` with phase-aware version using `detectTokenPhase` + vitality
- Add vitality context to AI prompt so the model sees volume/price/txn data
- Detect "Dormant" and "Compression" states properly

### Step 4: `/verdict` in bot webhook — Phase-gated recommendations
- Read `healthPhase` from holders data
- Apply phase-appropriate verdict thresholds (cap recommendations for on-curve/fresh tokens)
- Add phase context label to verdict output

### Step 5: `/oracle` bot output — Contextualize dev rep
- Read token phase, append contextual interpretation to dev reputation display

### Step 6: `wallet-behavior-analysis` — Age-relative scoring
- Accept token age or `pairCreatedAt` 
- Normalize "diamond hands" and "early entry" thresholds relative to token age

### Files Changed
1. **NEW** `supabase/functions/_shared/token-phase.ts` — shared phase detection
2. **EDIT** `supabase/functions/token-momentum-analyzer/index.ts` — phase-weighted scoring
3. **EDIT** `supabase/functions/token-ai-interpreter/index.ts` — vitality-enriched lifecycle + AI prompt
4. **EDIT** `supabase/functions/holdersintel-bot-webhook/index.ts` — phase-gated verdicts + oracle context
5. **EDIT** `supabase/functions/wallet-behavior-analysis/index.ts` — age-relative smart money scoring

