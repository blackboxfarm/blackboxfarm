## Problem

The /holders report is calibrated as if every token were a utility ETH coin. For a $600k Solana memecoin like $ASSFACE this produces:

1. **"Expansion / low confidence" in red** — scary and wrong for a token sitting strong at $600k for days.
2. **"Very Thin" liquidity at 11.84** — but ~10% LP is normal/healthy on Solana memes.
3. **Whale-sell-off panic copy** — "whales" are $1k+ wallets; a $10k sell does not kill a $600k cap.
4. **LP Health = 11/100** — punitive; a normal LP looks broken.
5. **Holder Count = 100/100** — inflated by 1,006 dust wallets; doesn't reflect that only ~1,300 are real participants.
6. **Diamond Hands = 0/100 (red)** — shown even when no historical snapshots exist yet.
7. **Security alert "Dev sold entire position"** — dressed as a near-emergency for what is actually mildly informative.

## Fix

### 1. Lifecycle classifier — add a "Mature Meme" tier (no more low-confidence Expansion)
File: `supabase/functions/token-ai-interpreter/index.ts` `determineLifecycleStage()`

- For tokens with **500+ holders AND pair age ≥ 72h AND market cap proxy / volume strong**, classify as **`Expansion` high** (rename label to "Mature" in UI when age ≥ 7d) instead of falling through to `Expansion / low`.
- Remove the catch-all `return { stage: "Expansion", confidence: "low" }`. Replace with: if holders ≥ 500 and aged ≥ 24h and there is real volume, return `Expansion / medium` minimum; promote to `high` when serious+whale > 15% (currently 25%).
- Pass `pairAgeHours` and `volume24h` into the existing call (already partially threaded).

### 2. Liquidity Coverage thresholds — Solana-meme aware
File: `supabase/functions/token-ai-interpreter/index.ts` `bucketLiquidityCoverage()` + LP$ floor

- Current: ratio < 3 = covered, < 8 = thin, ≥ 8 = very-thin. With ~100% circulating that flags any LP < ~12% as "very thin".
- New rule: bucket primarily on **absolute LP USD value**, not the ratio:
  - LP_USD ≥ $50k → `healthy`
  - LP_USD ≥ $10k → `adequate`
  - LP_USD ≥ $2k → `thin`
  - LP_USD < $2k OR unlocked → `very-thin / critical`
- Use ratio only as a secondary hint when LP_USD missing.
- Bonus: if `secondary_lps_count ≥ 1` (Meteora/Orca/Raydium duplicate pool) bump bucket up one tier.

### 3. Stability sub-scores — recalibrate
File: `supabase/functions/bagless-holders-report/index.ts` lines 480–515

- **lpScore**: change `scoreMetric(lpPct, good=30, bad=5)` → use **LP_USD bands** (≥$50k=100, ≥$25k=85, ≥$10k=70, ≥$5k=55, ≥$2k=40, ≥$500=20, else 5). Add **+5 per additional secondary LP** (capped +15).
- **holderCountScore**: stop counting dust as "real" holders. Use `seriousCount + whaleCount + retailCount` (exclude dust). New thresholds: good=400 real, bad=20.
- Add explicit **dust penalty** to holderCountScore: if dust% > 40, multiply final holderCountScore by 0.85; > 55, by 0.7. Surface a tooltip "Headline holder count inflated by X% dust wallets."

### 4. Whale-volatility narrative — soften and gate by absolute size
File: `supabase/functions/token-ai-interpreter/index.ts` (mode selection + prompt)

- In the prompt (~line 286), add a rule: **Do not warn about whale-driven volatility unless top-1 wallet > 5% of supply OR top-5 > 25% OR mcap < $250k.** For mid-cap memes, frame whale presence as conviction, not threat.
- Adjust `bucketTierDivergence`: only flag "structural tension" when divergence > 50% (was lower) AND mcap < $1M.

### 5. Diamond Hands card — gate behind real history
File: `src/components/premium/RetentionAnalysis.tsx`

- The `isTooYoung` guard already exists but only checks 73h. Add a second condition: hide if the API returns `metrics.total_wallets_start === 0` OR `retention_data.length < 2` (i.e., no historical snapshots yet). Render `null` instead of the red "0/100 High churn risk" panel.

### 6. Security Alerts — tone down dev-sold framing
File: `src/components/holders/SecurityAlertsCard.tsx`

- For the "dev sold entire position" case when token is **aged ≥ 72h AND mcap ≥ $250k**, downgrade visual severity from amber-warning to a neutral info note: *"Creator wallet exited — common after launch handoff. Not necessarily bearish for established tokens."* Keep amber only for young/small tokens.

## Out of scope (this turn)

- Detecting secondary LPs on Meteora/Orca (the +5 bonus assumes the data is already on the report; if not, we'll wire it in a follow-up).
- Rewriting the full stability blend weights — only the two sub-scores above change.

## Files touched

- `supabase/functions/token-ai-interpreter/index.ts`
- `supabase/functions/bagless-holders-report/index.ts`
- `src/components/premium/RetentionAnalysis.tsx`
- `src/components/holders/SecurityAlertsCard.tsx`
