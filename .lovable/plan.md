# 🔧 Post-Mega-Bundle Audit — Gaps & Loose Ends

I went back through every track from today's work and cross-checked it against what's actually in the repo + DB. Here's what's still loose. Most are small; one is the active build blocker.

---

## 🚨 P0 — Active build failure (blocks deploy)

**Problem:** `react-force-graph-3d@1.27.0` pulls in `3d-force-graph@1.80`, which requires `three >= 0.179`. We installed `three@^0.169`, which has **no `three/webgpu` subpath and no `TrackballControls` export at the path the new graph expects** → Rollup can't resolve the imports → `bun run build` dies.

**Two clean fixes — pick one:**
- **(A) Bump `three` to `^0.180.0`** (matches `3d-force-graph`'s peer range, smallest diff). Recommended.
- **(B) Pin `react-force-graph-3d` to an older line (`^1.24.x`) that still works with three 0.169.** Heavier — older API surface.

I'll go with **(A)** unless you object. One-line `package.json` change + reinstall.

---

## 🟡 P1 — Track 1 (named CEX labels) is 80% wired, not 100%

The plan promised the CEX name would surface in **four** spots. Three shipped, one didn't:

| Surface | Status |
|---|---|
| `mesh-shared-funders` `kyc_terminus` field | ✅ shipped |
| `SharedFundersPanel` ribbon | ✅ shipped |
| `PublicBubbleMap` node label | ✅ shipped |
| **`wallet-genealogy-scanner` JSON response** | ❌ never updated — still returns the raw hash, no `kyc_root_cex` |
| **Telegram `/dev` and `/oracle` reports** | ❌ never updated — no grep hits for the new label in the bot files |

**Fix:** add a small `kyc_root_cex: getCexName(rootWallet)` field to `wallet-genealogy-scanner`'s response, and in the Telegram dev/oracle formatters change the "KYC Root: ✅ Found" line to interpolate the CEX name when present (fallback to "✅ Found" when unknown). ~15 lines total.

---

## 🟡 P1 — Track 3 cron was never updated

The plan said: *replace the existing 3-hour cron with a 30 min Tier A + 6 hour Tier B schedule, daily cap ~500.*

Reality (just queried `cron.job`):
```
backfill-genealogy-drip   */10 * * * *   body: {"batchSize": 5}
```
- Still runs every 10 min, no `tier` parameter, no Tier A/B split, no daily cap.
- The function code **supports** tiering — the cron just doesn't send the parameter, so everything goes to default behavior.

**Fix:** one migration to:
1. Drop `backfill-genealogy-drip`
2. Add `backfill-genealogy-tier-a` — `*/30 * * * *`, body `{"batchSize": 10, "tier": "A"}`
3. Add `backfill-genealogy-tier-b` — `0 */6 * * *`, body `{"batchSize": 25, "tier": "B"}`

(Helius budget guard already lives inside the function, so we're safe even if cron fires when quota is hot.)

---

## 🟢 P2 — Minor polish

1. **Insiders auto-loop has no cron either** — only fires when an admin clicks the button in `GenealogyRetracePanel`. That's *probably* intentional (one-shot blast tool), but worth confirming. If you want it to keep itself topped up automatically, add a daily 4am cron firing `{ auto_loop: true, batchSize: 25 }`.
2. **Schematic view is gated only by `viewMode === 'schematic'` — no Pro check.** The plan said 3D would be Pro-only; Schematic was never explicitly gated either way. Currently both are free. If you want them Pro-only, I'll add a `useUserTier` gate with an upgrade nudge for free users.
3. **`SharedFundersPanel` mounting** — confirmed mounted in `PublicBubbleMap`. No issue.
4. **DB column `trail_end_reason`** — migration ran ✅, index present ✅, populated by `auto-genealogy.ts` writes ✅, read by `backfill-genealogy` skip-list ✅. Fully wired.

---

## ✅ What's actually clean (no action)

- 3D component code itself — fine, just blocked by the three version
- Schematic component (`xyflow + dagre`) — renders correctly, layout logic is solid
- 4-way view toggle in the toolbar — wired
- Helius budget guard at 80% — implemented and respected
- Settled-trail skip in both backfill paths — implemented
- Memory files (`view-modes`, `dev-genealogy-tracing`) — updated

---

## 📦 Proposed execution order (one shot)

1. Bump `three` → `^0.180.0`, reinstall → build green
2. Patch `wallet-genealogy-scanner` response with `kyc_root_cex`
3. Patch Telegram `/dev` + `/oracle` formatters to show "KYC Root: Binance" instead of "✅ Found"
4. New migration: drop old cron, install Tier A (30m) + Tier B (6h) crons
5. (Optional, ask first) Add Pro gating to 3D + Schematic views, and a daily auto-loop cron for Insiders

Let me know if you want #5 included or skipped, otherwise I ship #1–#4 on approval.
