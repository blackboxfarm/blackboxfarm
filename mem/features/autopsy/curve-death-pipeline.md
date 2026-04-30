---
name: Curve-Death Autopsy Pipeline (Lambs)
description: Pump.fun curve-death funnel rules — 75% gate, Bad-Dev vs Sad-Dev, auto-publish disabled
type: feature
---

**Lambs** = pump.fun tokens that died on the bonding curve at **bonding_curve_pct >= 75** and never graduated (`is_graduated != true`). Source feed: `pumpfun_curve_death`.

**Hard rules:**
- `bonding_curve_pct < 75` OR `IS NULL` → IGNORED. Not logged, not surfaced, no record. Do not create an `autopsy_lambs` table to log them. Wasted bodies.
- Graduated tokens (`is_graduated = true`) are out of scope here — separate future "Post-Graduation Deaths" track.
- Old `source_feed='pumpfun_watchlist'` rows below 75% were deleted in migration; new pipeline writes only `pumpfun_curve_death`.

**Curve-aware causes** (in `_shared/autopsy-taxonomy.ts` via `classifyCurveDeath`):
- `curve_snipe_rug` (Tier-A): dev_sold + dev_holding_pct<1 + age<24h
- `curve_wallet_washer` (Tier-A): creator has >=3 prior dead tokens AND (linked_wallet_count>5 OR bundled_buy_count>0)
- `curve_slow_bleed` (Tier-B): dev_sold + (price_peak→price_current decay > 90%)
- `curve_failed_launch` (Tier-B): no wash signals, no dev sell

**Bad-Dev vs Sad-Dev rule:** A creator running 20 linked wallets that drips sells into fresh buys on a ≥75% curve and walks is `curve_wallet_washer` (Tier-A, malicious) — NOT a sad dev. Sad devs (organic fades, no wash patterns, no linked wallets) become `curve_failed_launch` if they hit 75%, ignored otherwise.

**Auto-publish: DISABLED on every curve cause** (autoPublishMinConfidence=999). Manual review required for every Lamb until quality is proven. Flip per-cause later via taxonomy threshold.

**Banner generation:** For `source_feed='pumpfun_curve_death'`, `autopsy-banner-overlay` reads `pumpfun_watchlist.image_url` only (then falls back to pump.fun API). Skips DexScreener entirely — curve deaths almost never have a Raydium pool.

**Future hook:** real-time watcher should fire `autopsy-funnel-feeder` for a single mint when watchlist token transitions from bonding_curve_pct≥75 to status='dead'. Schema and classifier already support single-mint invocation.
