
# 🎯 Mega-Bundle: KYC Names + Mass Retrace + 3D + Schematic Ladder

Four tracks, one approval. I'll ship in this order so each piece compounds: (1) labels light up everywhere → (2) backfills populate the mesh → (3) richer mesh feeds the new visualizations.

---

## Track 1 — Show the actual CEX name everywhere ("Binance", not "Found")

**Problem:** UI/logs just say "KYC found" or show a hash. We already have `getCexName()` in `_shared/cex-wallets.ts` — it just isn't propagated.

**Changes:**
- **Backend — `_shared/auto-genealogy.ts`**: Add `cexName` to `GenealogyResult` (already partially there in `parentWallets[].cexName`) and to the top-level summary so callers don't have to re-scan the chain.
- **Edge function — `mesh-shared-funders/index.ts`**: When a funder *is* a CEX (currently filtered out), surface it in a separate `kyc_terminus: { wallet, cex_name }` field.
- **Edge function — `wallet-genealogy-scanner` response**: Echo `kyc_root_cex` in the JSON so the UI gets it without a second query.
- **UI — `SharedFundersPanel.tsx`**: 
  - New top-line ribbon: `🏦 KYC Root: Binance` (green) / `⚠ Trail ended: depth_cap` (amber) / `🔍 Trail ended: unclassified_funder` (grey)
  - Each sibling/funder hash gets a hover tooltip showing CEX name if known
- **UI — `PublicBubbleMap.tsx` & `HackerTerminal.tsx`**: KYC root node label changes from `"5tzFki…uAi9"` → `"Binance (5tzFki…uAi9)"`
- **Telegram — `/dev` & `/oracle` reports**: `KYC Root: Binance` instead of `KYC Root: ✅ Found`
- **DB column (optional, no migration if we skip)**: I'll *not* add a column — derive at read time from `cex-wallets.ts` so the truth source stays in code and re-labelling is a redeploy, not a backfill.

---

## Track 2 — Retrace every Insiders Lifecycle token NOW (one big pass)

**Problem:** `insiders-genealogy-backfill` exists but only runs when triggered. The Insiders list is high-signal, low-volume, so we can blast it.

**Changes:**
- **Edge function — `insiders-genealogy-backfill/index.ts`**:
  - Already works in batches of 25. Add an `auto_loop` mode: when called with `{ auto_loop: true }`, it self-invokes the next batch via `supabase.functions.invoke('insiders-genealogy-backfill', { body: {...} })` until `remaining === 0`.
  - Throttled by the existing 250 ms per-wallet sleep + the new linear-walk depth (max ~20 Helius calls per wallet vs the old branching cost).
- **Admin trigger UI** — small button on `/super-admin` (or wherever the Insiders panel lives) labelled **"Retrace all Insiders KYC"** that fires the loop and shows a progress badge (`X/Y traced, Z KYC roots resolved`).
- **Helius budget guard:** abort the loop if today's `helius_usage` row crosses 80% of monthly quota (memory: 10M/mo cap).

**Estimated cost:** ~current Insiders count × 20 Helius calls × ~5 credits each. We'll log it before/after so you see exact spend.

---

## Track 3 — Recurring retrace for the entire Archive (newest first)

**Problem:** Same as #2 but for the much larger `pumpfun_watchlist` + `telegram_insider_token_lifecycle` archive. Can't blast it all at once.

**Changes:**
- **Rewrite `backfill-genealogy/index.ts`** to:
  - Order by **`first_seen_at DESC` / `created_at DESC`** (newest first, currently no order at all → it grabs random rows).
  - Skip rows where `dev_wallet_reputation.upstream_wallets` already contains a CEX hit OR `trail_end_reason` is a terminal state (`hit_cex`, `cycle_detected`).
  - Tier the queue: **Tier A** = tokens with peak_multiplier > 5x or in Insiders lifecycle (priority); **Tier B** = everything else.
- **New cron** (replaces the existing 3-hour one):
  - Every 30 min: Tier A, batch 10
  - Every 6 hours: Tier B, batch 25 (off-peak)
  - Hard daily cap of ~500 wallets so we stay well under Helius quota.
- **`dev_wallet_reputation` already stores `upstream_wallets`** — we'll add `trail_end_reason` (text) so we can skip dead-ends on subsequent passes instead of retracing them. *(One small migration.)*

---

## Track 4a — 3D Bubble Map (rotatable)

**Verdict:** Doable, low risk if we keep it as a **toggle** alongside the existing 2D view. No replacement.

**Changes:**
- Install `react-force-graph-3d` (sibling to the `react-force-graph-2d` already in the project — same API surface).
- New component `BubbleMap3D.tsx` reusing the same `nodes/links` data shape that feeds `PublicBubbleMap`.
- Toggle in the bubble-map header: `2D | 3D | Schematic` (segmented control).
- 3D defaults: dark space background, gold/amber edges, particle-style nodes sized by `value`, slow auto-rotate that stops on user drag.
- Mobile: 3D toggle hidden (forced 2D) — three.js perf is unkind to phones.
- Pro-only feature (uses existing `useUserTier` gate already imported in `BubbleMap.tsx`).

---

## Track 4b — Schematic Ladder View (the blueprint)

**Verdict:** Highest forensic value of the new views. Image #2 (the layered diagram) is the template. Mind-castle/Gimli view (#4) is too artistic for daily use — skipping for now.

**Changes:**
- New component `BubbleMapSchematic.tsx` using **`@xyflow/react`** (already installed!) with `dagre` layout (tiny dep, ~10kb).
- Vertical layered topology, top → bottom:
  1. **CEX Roots** (Binance / Coinbase / etc.) — labeled rectangles
  2. **Hop wallets** in the funding chain — short hash boxes with depth label
  3. **Creator wallet** — gold-bordered diamond
  4. **Tokens minted by this creator** — small pill nodes with peak-multiplier badge
  5. **Sibling tokens** (from Track 1's shared-funders data) — branched off shared funder boxes
- Edges labelled with hop number and SOL amount where known.
- Color-coded: red edges = CEX→burner, gold = main trail, dim grey = sibling branches.
- Click any node → focus + sidebar drawer with raw mesh evidence.
- Same toggle as 4a so users can switch 2D ⇄ 3D ⇄ Schematic without leaving the page.

---

## Track 5 — Memory + plan housekeeping

- Update `mem://features/oracle/dev-genealogy-tracing` with the named-CEX surfacing rule.
- Add `mem://features/bubble-map/view-modes` documenting the three view toggle (2D / 3D / Schematic) so future agents don't accidentally rip one out.
- Patch `.lovable/plan.md` with the post-ship state.

---

## What I'm explicitly NOT doing
- Mind-Castle / Gimli artistic view — fun, but no forensic ROI right now.
- Cross-token graph (multi-creator simultaneous view) — separate request, would need its own UX pass.
- Adding new CEX hot wallets — that's a data-curation task, separate from this code work. (The 1,737-fanout suspect from the prior plan stays on the to-do list as a manual Solscan label check.)

---

## Ship status — ALL TRACKS LANDED ✅

1. ✅ Track 1 (Named CEX labels) — `getCexName()` propagated through `mesh-kyc-deep-search`, `SharedFundersPanel`, `PublicBubbleMap`
2. ✅ Track 2 (Insiders auto-loop) — `insiders-genealogy-backfill` supports `{ auto_loop: true }` + 80% Helius budget guard
3. ✅ Track 3 (Archive prioritized retrace) — `backfill-genealogy` rewritten with Tier A/B + newest-first + settled-trail skip; `dev_wallet_reputation` migration added (`trail_end_reason`, `trail_end_kyc_root`, `trail_end_at`)
4. ✅ Admin trigger — `GenealogyRetracePanel` mounted in `/super-admin` Utilities tab
5. ✅ Track 4a (3D) — `BubbleMap3D.tsx` (react-force-graph-3d), desktop-only toggle, slow auto-rotate
6. ✅ Track 4b (Schematic) — `BubbleMapSchematic.tsx` (xyflow + dagre), layered CEX→Funder→Dev→Token→Socials blueprint
7. ✅ Track 5 (memory) — `mem://features/bubble-map/view-modes` + named-CEX rule appended to `mem://features/oracle/dev-genealogy-tracing`

## Skipped (intentional)
- Mind-Castle / Gimli artistic view — low forensic ROI, can revisit on demand
- Cross-token graph (multi-creator simultaneous view) — separate UX pass
