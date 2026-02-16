

# Fix Scoring Engine + Fantasy Table Alignment

## 1. Lower Qualification Score Threshold (50)

Change the hardcoded `MIN_QUALIFICATION_SCORE` constant from `65` to `50` in `supabase/functions/pumpfun-watchlist-monitor/index.ts` (line 54).

This is the only place it's defined — there's no database column for it, so this one-line change does the job.

---

## 2. Recalibrate Scoring Curves for Bonding Curve Tokens

All changes in `supabase/functions/pumpfun-watchlist-monitor/index.ts`:

### Holder Score (lines 516-526)
Rescale from "mature token" (500+ max) to bonding curve reality:

| Holders | Current Score | New Score |
|---------|--------------|-----------|
| 100+    | 10           | 25        |
| 75+     | (n/a)        | 20        |
| 60+     | (n/a)        | 16        |
| 49+     | 5            | 12        |
| 30+     | (n/a)        | 7         |
| < 30    | 2            | 2         |

### Volume Score (lines 528-549)
Rescale from 200+ SOL max to bonding curve volumes. Buy pressure bonus stays unchanged.

| Volume (SOL) | Current Score | New Score |
|-------------|--------------|-----------|
| 50+         | 13           | 25        |
| 30+         | (n/a)        | 20        |
| 20+         | 9            | 16        |
| 10+         | 5            | 12        |
| 5+          | (n/a)        | 7         |
| < 5         | 2            | 2         |

### Momentum Score (lines 621-663)
Change base score from `5` to `12` so first-time evaluations (no previous data to compare against) get a neutral score instead of being penalized. All delta logic stays the same.

### Safety Score
No changes. The existing logic is reasonable for bonding curve tokens.

---

## 3. Fix Fantasy Table Column Order

In `src/components/admin/TokenCandidatesDashboard.tsx` (lines 1998-2007), the cells are currently rendered as:

```text
1. entry_price_usd     (WRONG - should be Disc $)
2. discovery_price      (WRONG - should be Qual $)
3. qualified_price      (WRONG - should be Entry)
4. entry_price_usd      (DUPLICATE)
5. displayPrice         (OK - Current)
```

Fix the order to match headers (Disc $ | Qual $ | Entry | Current):

```text
1. discovery_price      -> Disc $
2. qualified_price      -> Qual $
3. entry_price_usd      -> Entry
4. displayPrice         -> Current (remove duplicate entry_price cell)
```

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/pumpfun-watchlist-monitor/index.ts` | Threshold 65 to 50, rescale holder/volume/momentum curves |
| `src/components/admin/TokenCandidatesDashboard.tsx` | Fix column cell order, remove duplicate entry_price cell |

