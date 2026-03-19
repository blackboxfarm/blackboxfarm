

# Health Scoring Overhaul — Structural vs Activity Split (IMPLEMENTED)

## What Changed

### 1. Split metrics into Structural and Activity scores (0-100 each)

**Structural Score** (long-term health) — weighted blend of:
- Holder Count (15%), Whale Distribution (18%), LP Quality (15%), Insider/Bundled (15%), Dust Quality (8%), Dev Allocation (8%), Longevity/Survival (12%), Holder Retention (9%)

**Activity Score** (short-term momentum) — weighted blend of:
- Transaction Activity (20%), Buy/Sell Ratio (20%), Volume/MCap (20%), 24h Price (20%), 6h/1h Stability (20%)

### 2. Phase-based blending — mature tokens weight structural heavily

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

### 3. Capped modifier buckets (no more death by a thousand cuts)

- **Activity weakness bucket**: cap at **-12**
- **Structural weakness bucket**: cap at **-15**  
- **Catastrophic bucket** (rug, liquidity removed, -90% collapse): cap at **-35**

### 4. Mature token floors (broken only by catastrophic flags)

- **Blue chip** (90d+, $25M+, 10K+ holders, $250K+ liq, 100+ txns/24h): floor = 82 (B+)
- **Mature** (30d+, $10M+, 5K+ holders, $100K+ liq, 50+ txns/24h): floor = 76 (B)
- **Growth** (7d+, $1M+, 500+ holders, $50K+ liq): floor = 65 (C+)

Uses **total holder count** (including dust).

### 5. 14-tier grading: A++ to F

### 6. Three-dimension display in UI

- **Health Grade**: Blended letter grade
- **Momentum**:,(Activity score as separate badge  
- **Structural/Activity/Blended**: Numeric scores shown in dashboard

## Files Modified

1. `supabase/functions/bagless-holders-report/index.ts` — Complete health scoring rewrite (deployed)
2. `src/components/premium/TokenHealthDashboard.tsx` — Three-dimension display with momentum badge
3. `src/components/BaglessHoldersReport.tsx` — Pass new props + updated HealthScore interface

## Backward Compatibility

- Grade is still a string field — consumers using `startsWith('A')` etc. work fine
- `stabilityScore` and `stabilityGrade` still populated for legacy consumers
- Share card Satori `getGradeColor` already uses `startsWith` — handles A+/B-/etc.
- X-post templates use `{healthGrade}` string replacement — works with any grade string
- `holders-intel-poster` SKIP_GRADES is empty array — no filtering impact
