

# Lifecycle-Aware Token Health Score

## The Problem

The current health score in `bagless-holders-report` is **structure-only** — it checks whale concentration, LP%, bundling, holder count, and dust. A dead token with perfect distribution scores 100/100. Meanwhile, `pumpfun-curve-analyzer` has a separate scoring system for on-curve tokens, and `token-momentum-analyzer` has volume/price/txn data that's never fed into health. These three systems don't talk to each other.

## The Solution: Phase-Detected Scoring

Detect which lifecycle phase a token is in, then apply phase-appropriate weighted metrics.

### Phase Detection Logic

```text
Phase 1: ON CURVE (bonding)
  → pairCreatedAt is null OR no Raydium pair OR liquidity < $50k
  → Age: typically 0-6 hours

Phase 2: FRESHLY BONDED
  → Has Raydium pair with liquidity > $50k
  → Age since pair creation: < 48 hours

Phase 3: ESTABLISHED
  → Bonded > 48 hours, < 14 days
  → Has trading history across multiple timeframes

Phase 4: MATURE
  → Bonded > 14 days
  → Full historical data available
```

### Metrics Per Phase

```text
                        Phase 1    Phase 2    Phase 3    Phase 4
                        ON CURVE   FRESH      ESTABLISHED MATURE
────────────────────────────────────────────────────────────────
Unique buyers/holders    25%        15%        10%         10%
Whale concentration      10%        20%        20%         20%
Dev behavior/holding     20%        15%        10%          5%
Buy/sell ratio           15%        15%        10%         10%
Curve smoothness         20%         —          —           —
LP locked %               —         15%        15%         15%
Bundled/insider %         5%        10%        15%         15%
Volume trend              —         10%        10%         10%
Price trend (1h/6h/24h)   5%         —         10%         15%
────────────────────────────────────────────────────────────────
TOTAL                   100%       100%       100%        100%
```

**Key design choices:**
- **Phase 1**: Curve shape and buyer quality matter most — borrowed from existing `pumpfun-curve-analyzer` logic. LP doesn't exist yet. Volume windows are too short for trends.
- **Phase 2**: LP just appeared — is it locked? Whales forming? Dev dumping? Buy pressure sustaining post-bond? Volume trend starts mattering.
- **Phase 3**: Distribution patterns solidify. Bundling/insiders become more detectable. Price trend across 6h/24h becomes meaningful.
- **Phase 4**: Full picture. Price trend over 24h heavily weighted. Holder count growth/decline matters. Dust ratio indicates abandonment.

### Additional Vitality Penalties (All Phases Post-Bond)

Applied as flat deductions after weighted score:

- **Volume collapse**: 24h volume < $500 AND holder count > 100 → -15
- **Price crash**: 24h price change < -60% → -10
- **Zero transactions**: No txns in last 1h → -10
- **Holder exodus**: If trackable, declining holder count → -5

These prevent "structurally healthy but dead" tokens from scoring high.

## Data Flow

```text
bagless-holders-report
  ├── Already has: holders, tiers, LP%, bundling, whales
  ├── Already fetches: DexScreener pairs (has volume/price/txns — not extracted)
  │
  ├── NEW: Extract from dexPair0:
  │     pair.volume.m5/h1/h6/h24
  │     pair.priceChange.m5/h1/h6/h24  
  │     pair.txns.m5/h1/h6/h24
  │     pair.pairCreatedAt
  │     pair.liquidity.usd
  │
  └── NEW: Phase detection → weighted score calculation
```

No new API calls needed — DexScreener pair data already contains volume, price change, and transaction counts. We just need to extract and use them.

## Implementation Changes

### 1. `supabase/functions/_shared/dexscreener-api.ts`
Extend `DexScreenerResult` to include vitality metrics from the first pair:
- `volume` (m5, h1, h6, h24)
- `priceChange` (m5, h1, h6, h24)  
- `txns` (m5, h1, h6, h24 with buys/sells)
- `pairCreatedAt` (timestamp)
- `liquidityUsd`

### 2. `supabase/functions/bagless-holders-report/index.ts`
Replace the current flat deduction health score (lines 402-435) with:
1. Phase detection based on `pairCreatedAt` + liquidity
2. Phase-appropriate weighted scoring using the matrix above
3. Vitality penalty deductions for dead/dying signals
4. Return `phase` label alongside score so consumers know context

### 3. Response shape additions
Add to the result object:
- `healthPhase`: `'on_curve' | 'fresh' | 'established' | 'mature'`
- `healthBreakdown`: object with each metric's contribution (for debugging/display)
- `vitalityPenalties`: array of applied penalties

### 4. Frontend `TokenHealthDashboard.tsx`
Update to show the detected phase and breakdown. Minor UI change.

### 5. Bot handlers in `holdersintel-bot-webhook/index.ts`
Update `/ca`, `/holders`, `/quick` to display phase-aware health label (e.g., "Health: 72/100 (Fresh Bond)").

## What This Fixes

- A dead token with 0 volume, -90% price, no recent txns will get vitality penalties → score drops from 100 to ~60-65
- A fresh pump.fun token won't be penalized for "low holder count" as harshly since Phase 1 expects fewer holders
- A 4-day-old token will be evaluated on price sustainability and volume trends, not just distribution
- Each phase uses metrics that actually make sense for that stage

