

## Problem Summary

Three distinct issues are causing bad XBot posts:

1. **Skipped tokens get re-queued on START** — `intel-xbot-start` blindly re-queues ALL `skipped` items to `pending`, including tokens that were skipped 20+ hours ago. When they finally post, the data is stale and the post looks absurd (announcing "DEX Paid!" on a token that was rugged 18 hours prior).

2. **Health scoring has no "absolute failure" floors** — A token with 80%+ dust, 98% price crash, deleted socials, and 16 real holders can still score a C (67/100) because the weighted-average system dilutes catastrophic signals across many soft metrics. There are no hard gates that force an F.

3. **No clear lifecycle model** — The current 4-phase system (`on_curve`, `fresh`, `established`, `mature`) is too coarse. It doesn't distinguish between a token that bonded 2 hours ago vs. one bonded 18 hours ago mid-dump, and metric weights/thresholds don't shift granularly enough across the lifecycle.

---

## Plan

### 1. Stop re-queuing stale skipped tokens

**File:** `supabase/functions/intel-xbot-start/index.ts`

- Change the re-queue query to only re-queue skipped items whose `scheduled_at` is within the last 2 hours. Anything older stays `skipped` permanently.
- Add a `staleness_cutoff` filter: `.gte('scheduled_at', twoHoursAgo)`

### 2. Add absolute failure floors to health scoring

**File:** `supabase/functions/bagless-holders-report/index.ts` (lines ~478-514)

Add hard gates **after** the weighted score is computed but **before** grade assignment:

| Condition | Effect |
|---|---|
| Real holders (non-dust, non-LP) < 15 | Force score to min(score, 20) → automatic F |
| Real holders < 30 | Force score to min(score, 45) → cap at D |
| Price change h24 < -80% | Penalty -25 (currently only -10 for >60%) |
| Price change h24 < -90% | Penalty -35 |
| Volume h24 < $100 AND pair age > 6h | Penalty -20 (dead token) |
| Dust % > 75% | Penalty -15 |
| Top 5 holders > 60% of supply | Penalty -15 |

### 3. Fix dust weight across all phases

**File:** `supabase/functions/bagless-holders-report/index.ts` (line 458-460)

Currently `fresh`, `established`, and `mature` phases have dust weight = 0. Change to:

```
on_curve:    dust: 0.20 (already correct)
fresh:       dust: 0.10
established: dust: 0.10
mature:      dust: 0.10
```

Rebalance other weights accordingly (reduce `lp` slightly in each phase).

### 4. Expand lifecycle phases from 4 to 8

**File:** `supabase/functions/_shared/token-phase.ts` + `bagless-holders-report/index.ts`

New lifecycle model:

```text
Phase           | Age / Condition                    | Key Signals
----------------|------------------------------------|--------------------------
on_curve        | No Raydium pair / liq < $50k       | Holder count, dev %, dust
newborn         | Bonded < 2h                        | Buy momentum, early dist.
early           | 2h - 12h                           | Concentration, sell pressure
adolescent      | 12h - 48h                          | Holder growth, volume trend
established     | 2d - 7d                            | Retention, whale stability
growth          | 7d - 30d                           | Volume consistency, LP depth
mature          | 30d - 90d                           | CEX listings, sustained vol
blue_chip       | 90d+ with vol > $1M/day            | Institutional signals
```

Each phase gets its own weight matrix. The `newborn` and `early` phases are critical for catching the $OilDividends pattern — tokens that bond, get boosted, then immediately dump.

### 5. Add crash-trajectory detection

**File:** `supabase/functions/bagless-holders-report/index.ts`

New penalty block after vitality penalties:

- If `priceChange.h1 < -30%` AND `priceChange.h6 < -60%` → "Bleed arc detected" penalty -20
- If `priceChange.h24 < -80%` AND `txns.h1.sells > txns.h1.buys * 3` → "Dump in progress" penalty -25
- If `dexStatus.hasDexPaid` AND `priceChange.h24 < -70%` → "Paid DEX + crash = likely exit scam" penalty -20

---

### Technical Details

**Weight rebalancing for dust inclusion (fresh/established/mature):**
- `fresh`: holders 0.15 → 0.12, lp 0.15 → 0.13, add dust 0.10 (total still 1.0)
- `established`: holders 0.10 → 0.08, lp 0.15 → 0.12, add dust 0.10 (total still 1.0)
- `mature`: holders 0.10 → 0.08, lp 0.15 → 0.12, add dust 0.10 (total still 1.0)

**$OilDividends case trace with new logic:**
- 80% dust → dustScore = scoreMetric(80, 10, 60) = 0 → weighted contribution tanks
- 16 real holders → hard floor forces score ≤ 20 → **F**
- Price -98% → penalty -35
- Top5 concentration artificially low (spread across dust) → but real-holder floor catches it
- Result: **F** (score ~0) instead of C (67)

