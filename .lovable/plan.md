
## Final plan — Curve-Death Autopsy Pipeline ("Lambs")

### Terminology lock-in
- **Lambs** = pump.fun tokens that died on the bonding curve at **≥75% curve ATH**, never graduated. This is the entire autopsy-eligible pool from pump.fun.
- **<75% curve ATH** = ignored. Not logged, not stored, not surfaced. Wasted bodies.
- **NULL `bonding_curve_pct`** = ignored (same as <75%). We can't write a meaningful report on tokens with no peak data.
- **Graduated to Raydium** = separate future track ("Post-Graduation Deaths"), bigger blast radius.

### Data confirms the gate is right

```
dead pumpfun tokens          22,018
  ├─ ≥75% curve ATH (Lambs)     ~17   ← autopsy-eligible pool
  ├─ <75% curve ATH         12,160+   ← ignored
  └─ NULL curve_pct           9,841   ← ignored
graduated then died:              0   ← future track
```

Queue collapses from ~22k noise to a hand-curated ~17 actual cases. Going forward, real-time intake catches new ≥75% deaths as they happen.

---

### Pipeline overview

```text
pumpfun_watchlist (status='dead', is_graduated=false)
        │
        ▼
   bonding_curve_pct >= 75 ?
        │
   ┌────┴────┐
   NO        YES → Lamb
   │              │
ignore      classify with curve-aware causes
   │              │
   ✗     ┌────────┼─────────┐
       Bad Dev  Slow Wash  Sad Fade
       Tier A   Tier A     Tier B
       (manual  (manual    (manual
        review) review)    review)
```

**Auto-publish stays OFF for all tiers until you've reviewed quality.** Every autopsy goes through manual approval. We can flip the auto-publish switch later per-cause.

---

### Classifier — curve-aware death causes

Replaces generic `failed_launch` for pumpfun curve deaths. New IDs in `_shared/autopsy-taxonomy.ts`:

| Cause ID                | Intent     | Tier | Trigger (pumpfun_watchlist signals)                                                 |
|-------------------------|------------|------|--------------------------------------------------------------------------------------|
| `curve_snipe_rug`       | malicious  | A    | curve ≥75, `dev_sold=true`, `dev_holding_pct < 1`, age < 24h                          |
| `curve_wallet_washer`   | malicious  | A    | curve ≥75, creator linked to ≥3 prior dead tokens AND sells via linked-wallet pattern (`linked_wallet_count > 5`, `bundled_buy_count > 0`, holders drained while dev_holding_pct holds steady) |
| `curve_slow_bleed`      | malicious  | B    | curve ≥75, `dev_sold=true` in tranches, `price_peak → price_current` decay >90%       |
| `curve_failed_launch`   | negligent  | B    | curve ≥75, `dev_sold=false`, holders evaporated, no wash signals                      |

**Bad-Dev vs Sad-Dev rule (your clarification baked in):**
A "sad dev" who runs **20 linked wallets, drips sells into new buys, lets the token bleed to 70%, and walks** is **NOT sad — that's `curve_wallet_washer` (Bad Dev, Tier-A)**. Detection: creator wallet has >3 prior dead tokens AND token shows `linked_wallet_count > 5` or sustained dev_holding while price collapses. A creator whose tokens just *organically faded* with no wash patterns and no linked-wallet sells = ignored Lamb (no autopsy).

---

### Funnel rewrite — `autopsy-funnel-feeder`

Replace pumpfun source block:
1. Pull `pumpfun_watchlist WHERE status='dead' AND is_graduated IS NOT TRUE AND bonding_curve_pct >= 75`.
2. Drop everything below 75% and everything with NULL curve_pct silently. No log table, no record.
3. Set `source_feed = 'pumpfun_curve_death'` (renamed from `pumpfun_watchlist`).
4. Run curve-aware classifier; insert into `autopsy_candidates` with appropriate cause + tier.
5. **All tiers → status='pending' awaiting manual approval.** No auto-publish branch executes.

One-time backfill SQL after deploy: delete existing `autopsy_candidates` rows where `source_feed='pumpfun_watchlist'` and either `bonding_curve_pct IS NULL` (we'll need to join from pumpfun_watchlist) or `< 75`. Re-run the funnel to repopulate the ~17 real Lambs.

---

### Banner generation — pump.fun mint image only

Curve-death tokens almost never have DexScreener pages (no Raydium pool). Update `autopsy-banner-overlay`:

- **Source priority for curve deaths:** `pumpfun_watchlist.image_url` ONLY. Skip the DexScreener `pairs[0].info.header` lookup entirely when `source_feed='pumpfun_curve_death'`.
- If `image_url` is missing → fall back to a default "Lamb silhouette" template (we have the BlackBox autopsy frame; center is just black with a "?" silhouette).
- Decoration protocol unchanged (corner stamps, BLACKBOX AUTOPSY stencil bottom-right). Center 60% = the pump.fun mint image, untouched.

This also matches the existing banner protocol's "decorate, don't cover" rule — perfect for tiny pump.fun token icons that need a forensic frame.

---

### UI — `/super-admin/autopsy-queue`

- Header rebrand: "Autopsy Queue — Lambs (Pump.fun Curve Deaths)".
- Curve % badge per row (`94%` gold, `82%` silver, `76%` bronze) — sortable.
- Death taxonomy modal updated with the four new causes + a **Bad-Dev vs Sad-Dev panel** explaining the wallet-washer detection logic (your "20 wallets, drips into new buys" example as the canonical illustration).
- Source-feed badge shows `pumpfun_curve_death` with tooltip "Lamb · pump.fun, died on bonding curve before graduation".
- Subtle "Auto-publish: DISABLED · manual review required" indicator in the header so it's clear nothing slips out without you.

---

### Real-time future hook (noted, not built this pass)

The Watchlist Monitor already tracks live `bonding_curve_pct`. After this lands, a follow-up adds a watcher: when a watchlist token transitions from `bonding_curve_pct ≥ 75` to `status='dead'` within X minutes, fire `autopsy-funnel-feeder` immediately for that single mint → instant autopsy draft on a fresh 89%-rug while the X conversation is still warm. That's the timely-tool play. Not in this build, but the schema and classifier here support it directly.

---

### Technical change list (this build)

- **Edit:** `supabase/functions/_shared/autopsy-taxonomy.ts` — add 4 curve causes + descriptions, mark all as `autoPublish: false` for now.
- **Edit:** `supabase/functions/autopsy-funnel-feeder/index.ts` — replace pumpfun block with curve-gated query, rename source_feed, run curve classifier, drop sub-75/NULL silently.
- **Edit:** `supabase/functions/autopsy-banner-overlay/index.ts` — for `source_feed='pumpfun_curve_death'`, source from `pumpfun_watchlist.image_url` only; default Lamb silhouette fallback.
- **Edit:** `src/data/autopsyTaxonomy.ts` — add 4 curve causes + Bad-Dev/Sad-Dev explainer copy.
- **Edit:** `src/components/admin/autopsies/DeathTaxonomyModal.tsx` — render new explainer panel.
- **Edit:** `src/components/admin/autopsies/AutopsyCandidateRow.tsx` — Curve % badge, updated source-feed label.
- **Edit:** `src/components/admin/autopsies/AutopsyQueueBody.tsx` — header rebrand, "Auto-publish DISABLED" indicator, sort by curve %.
- **One-time SQL:** delete stale `autopsy_candidates` rows where `source_feed='pumpfun_watchlist'` AND mint's `bonding_curve_pct < 75 OR IS NULL`. Re-run funnel.
- **Memory:** create `mem://features/autopsy/curve-death-pipeline.md` capturing the 75% Lamb gate, Bad-Dev rule, and auto-publish=off policy.

Approve and I'll build it.
