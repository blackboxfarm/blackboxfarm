

# Health Scoring Overhaul — Structural vs Activity Split

## Problem
The current system uses one waterfall score where unlimited penalty stacking destroys grades on mature, validated tokens. A $50M mcap token with 22K holders got an F because temporary sell pressure stacked -100+ points of penalties.

## What Changes

### 1. Split metrics into Structural and Activity scores (0-100 each)

**Structural Score** (long-term health):
- Holder Count (15%), Whale Distribution (18%), LP Quality (15%), Insider/Bundled (15%), Dust Quality (8%), Dev Allocation (8%), Longevity/Survival (12%), Holder Retention (9%)

**Activity Score** (short-term momentum):
- Transaction Activity (20%), Buy/Sell Ratio (20%), Volume/MCap (20%), 24h Price (20%), 6h/1h Stability (20%)

### 2. Blend by phase — mature tokens weight structural heavily

| Phase | Structural | Activity |
|-------|-----------|----------|
| on_curve | 40% | 60% |
| newborn | 45% | 55% |
| early | 50% | 50% |
| adolescent | 55% | 45% |
| established | 60% | 40% |
| growth | 65% | 35% |
| mature | 75% | 25% |
| blue_chip | 80% | 20% |

### 3. Replace unbounded penalty stacking with capped modifier buckets

- **Activity weakness bucket** (low vol, zero txns, sell pressure, price bleed): cap at **-12**
- **Structural weakness bucket** (extreme dust, concentration, dev hold, insiders): cap at **-15**
- **Catastrophic bucket** (rug, liquidity removed, -90% collapse, abandonment): cap at **-35**

No more death by a thousand cuts.

### 4. Mature token floors (broken only by catastrophic flags)

- **Blue chip** (90d+, $25M+, 10K+ holders, $250K+ liq, 100+ txns/24h): floor = 82 (B+)
- **Mature** (30d+, $10M+, 5K+ holders, $100K+ liq, 50+ txns/24h): floor = 76 (B)
- **Growth** (7d+, $1M+, 500+ holders, $50K+ liq): floor = 65 (C+)

Uses **total holder count** not realHolderCount.

### 5. New grade scale: A++ to F (14 tiers)

| Score | Grade |
|-------|-------|
| 97-100 | A++ |
| 93-96 | A+ |
| 89-92 | A |
| 85-88 | A- |
| 80-84 | B+ |
| 75-79 | B |
| 70-74 | B- |
| 65-69 | C+ |
| 60-64 | C |
| 55-59 | C- |
| 50-54 | D+ |
| 45-49 | D |
| 40-44 | D- |
| <40 | F |

### 6. F only for true failure

F requires at least one of: liquidity rugged, no trading activity for extended period, catastrophic collapse with abandonment, extreme insider control in rug pattern.

### 7. Display three dimensions (not just one grade)

The UI (`TokenHealthDashboard.tsx`) will show:
- **Health Grade**: The blended letter grade (the main score)
- **Momentum**: Activity score as a separate indicator (e.g., "Momentum: D+")
- **Risk Flags**: Existing risk flags shown as warning badges

This gives users the full picture — "Health: B, Momentum: D+" is far more useful than a misleading "F".

## Files Modified

1. **`supabase/functions/bagless-holders-report/index.ts`** — Replace the entire health calculation section (lines ~446-677) with the new structural/activity split, capped modifier buckets, mature floors, and 14-tier grading
2. **`src/components/premium/TokenHealthDashboard.tsx`** — Add Momentum badge, update grade display to support A++/A+/A-/B+/B-/C+/C-/D+/D- grades, show all three dimensions
3. **Any X-post formatting code** that references healthGrade — update to handle new grade strings

## WhiteWhale Example After Fix

- Structural: ~83 (strong holders, high mcap, mature, good liq)
- Activity: ~52 (sell pressure, weaker short-term)
- Blend (mature 75/25): 0.75 × 83 + 0.25 × 52 = 75.3
- Modifiers: activity -8, structural -4 = 63.3
- Mature floor kicks in: raised to 76
- **Grade: B** — with "Momentum: D+" badge

That's believable and accurate.

