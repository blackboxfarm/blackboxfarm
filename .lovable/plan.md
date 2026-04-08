

## Answers + Plan: Minimap, KYC Coverage, Mesh Gaps, Token Autopsy

### Your Data Reality (live numbers)

```text
MESH COVERAGE SCORECARD:
─────────────────────────────────────────────
Tokens mapped (created_token):         73,844
Dev wallets mapped:                    29,031
X Communities mapped:                   6,441
Social accounts linked:               113,734
Wallets with funding chains:           23,630
KYC roots confirmed:                       11  ← PROBLEM
─────────────────────────────────────────────
Watchlist tokens with dev wallet:      89,319
Token lifecycle entries:                2,494
Oracle-analyzed tokens:                     0  ← NOT RUNNING
```

### Q2: Background KYC tracer — YES, but it's barely working

`backfill-genealogy` runs every 10 minutes via cron, processing 5 wallets per batch. It calls `wallet-genealogy-scanner` for each. **But only 11 KYC roots exist** out of 23,630 wallets with funding chains. The scanner finds funding links but rarely reaches a confirmed CEX wallet (the known CEX list in `developer-wallet-tracer` has only ~12 hardcoded addresses). Most traces end as "cold trail" because the CEX wallet list is too small.

### Q3: Do we have 40K fully mapped? NO.

- 73K tokens → 29K dev wallets ✅ (good coverage)
- 29K dev wallets → 23K have funding chains ✅ (decent)
- 23K funding chains → **11 KYC roots** ❌ (catastrophic gap)
- 6.4K X communities mapped, 113K social accounts ✅ (strong)
- `oracle-auto-classifier` has analyzed **0 tokens** — it exists but is never called by cron

### Q4: Token autopsy/post-mortem — DOES NOT EXIST YET

The `oracle-auto-classifier` calculates rug pull scores and can classify wallets, but there is no dedicated "cause of death" analysis. `token_lifecycle` has fields like `current_status`, `market_cap`, `liquidity_usd` but no death-cause column or autopsy function. This needs to be built.

---

## Plan: 4 Deliverables

### 1. Bubblemap Minimap (navigational overlay)

Add a small canvas in the top-right corner of the bubblemap card that renders a simplified overview of all nodes (dots only, no labels). Shows the current viewport as a rectangle. Click anywhere on the minimap to re-center the main graph on that area. Appears only when node count > 10.

| File | Change |
|------|--------|
| `src/components/bubble-map/BubbleMapMinimap.tsx` | New component: renders a 120x80px (mobile: 60x40px) canvas showing all node positions as colored dots + viewport rectangle. Click handler calls `graphRef.current.centerAt()` |
| `src/components/bubble-map/PublicBubbleMap.tsx` | Render `<BubbleMapMinimap>` in top-right of the graph container div, pass `graphRef`, `displayData`, `dimensions` |

### 2. Fix KYC Root Discovery (expand CEX wallet database)

The reason only 11 KYC roots exist: the hardcoded CEX list has ~12 addresses. Real Binance alone has 100+ hot wallets. We need to use Helius's address labels or a larger CEX database.

| File | Change |
|------|--------|
| `supabase/functions/_shared/cex-wallets.ts` | New shared module: export a comprehensive CEX wallet map (~200 addresses across Binance, Coinbase, Kraken, Bybit, OKX, KuCoin, Gate.io, MEXC, HTX) sourced from known public lists |
| `supabase/functions/wallet-genealogy-scanner/index.ts` | Import from shared `cex-wallets.ts` instead of inline list; also check Helius address labels (if tx metadata includes `label` field) |
| `supabase/functions/developer-wallet-tracer/index.ts` | Import from shared `cex-wallets.ts` |
| `supabase/functions/mesh-kyc-deep-search/index.ts` | Import from shared `cex-wallets.ts` |

### 3. Activate Oracle Auto-Classifier via Cron

The classifier exists but is never scheduled. Add it to the cron reconciliation.

| File | Change |
|------|--------|
| `supabase/functions/reconcile-cron-jobs/index.ts` | Add cron entry: `oracle-auto-classifier` every 15 minutes with `{ "processNewTokens": true }` body |

### 4. Token Autopsy Engine (new)

A new edge function that examines dead/dying tokens and determines cause of death.

**Death categories**: `rug_pull` (dev dumped >50% supply fast), `slow_drain` (dev sold gradually over days), `abandoned` (dev stopped all activity), `liquidity_pulled` (LP removed), `organic_death` (natural decline, no dev malice), `unknown`

| File | Change |
|------|--------|
| Migration | Add `death_cause`, `death_confidence`, `autopsy_at`, `autopsy_notes` columns to `token_lifecycle` |
| `supabase/functions/token-autopsy/index.ts` | New function: For tokens where `market_cap < 1000` or `liquidity_usd < 500`, analyze dev wallet behavior (did they dump? pull LP? vanish?). Uses existing `dev_behavior_scores` + `holder_movements` data. Writes cause of death back to `token_lifecycle` |
| `supabase/functions/reconcile-cron-jobs/index.ts` | Add cron: `token-autopsy` every 30 minutes, batch of 20 tokens |

### Deployment sequence

1. Migration (new columns)
2. `cex-wallets.ts` shared module
3. Update scanner + tracer + mesh-kyc to use shared CEX list
4. New `token-autopsy` function
5. Update cron reconciliation (add classifier + autopsy jobs)
6. `BubbleMapMinimap` component
7. Deploy all edge functions

