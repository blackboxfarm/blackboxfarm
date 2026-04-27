## Goal

Stop sending you on a treasure hunt. Put the genealogy action buttons **right inside the Wallet Cross-Links card** in the Insiders Lifecycle tab, and have the cheap one auto-run when there's no KYC data so you don't even have to click.

## What changes

All edits in **`src/components/admin/tabs/InsidersLifecycleTab.tsx`** — no other files touched. The two edge functions (`insiders-genealogy-rescan-kyc`, `insiders-genealogy-backfill`) already exist and are called identically to how `GenealogyRetracePanel` calls them today; we just move the trigger.

### 1. Add two action buttons inside the Wallet Cross-Links card header

Right next to the title `Wallet Cross-Links`, alongside the `319 creators • 0 KYC roots` stats, add:

- **🏦 Rescan KYC (free)** — invokes `insiders-genealogy-rescan-kyc` in a loop (batchSize 1000, up to 20 iterations, break when `scanned === 0`). Zero RPC cost. Same logic as `GenealogyRetracePanel.runRescan`.
- **🧬 Retrace Insiders KYC** — invokes `insiders-genealogy-backfill` with `{ auto_loop: true, batchSize: 25 }`. Same logic as `GenealogyRetracePanel.runInsiders`.

Both buttons:
- Show a spinner while running (`rescanRunning`, `retracingKyc` state — the second can reuse the existing `tracingKyc` state already in the file at line 346).
- Call `await fetchCrossLinks()` and `await fetchRows()` on completion so the `0 KYC roots` count and the table refresh in place.
- Toast success/failure with counts (e.g. "12 new KYC roots resolved").

### 2. Auto-run "Rescan KYC (free)" once on tab load when KYC = 0

In the existing `useEffect(() => { fetchCrossLinks(); }, [])` (line 342), after the first `fetchCrossLinks()` resolves, if `crossLinks.stats.rowsWithKyc === 0` AND `rowsWithCreator > 0`, automatically fire the rescan once (guarded by a `hasAutoRescannedRef` to prevent loops). It's free, takes a few seconds, and instantly populates the Shared KYC tab with whatever the current `cex-wallets.ts` dictionary can resolve from already-traced chains.

The expensive Helius retrace stays manual (button click) because it burns RPC credits.

### 3. Remove the now-misleading hint

Delete the amber inline message at line 789-791 that says *"run 'Rescan KYC (free)' or 'Retrace Insiders KYC' in Utilities → Genealogy to populate"*. The buttons will be right there.

### 4. Layout

```text
┌─ Wallet Cross-Links ─ 319 creators • 0 KYC roots ─ [Rescan KYC] [Retrace KYC] ─[↻]─┐
│  [Shared Creator (8)]  [Shared Funder (50)]  [🏦 Shared KYC (0)]                    │
│  ...                                                                                │
```

On the 1206px viewport this fits one row; below ~900px the buttons wrap under the title (already handled by `flex-wrap` on the parent).

## Out of scope

- The duplicate buttons in `GenealogyRetracePanel` (Utilities tab) stay where they are — they're still useful for the Archive (Tier A/B) flow and as a global control panel. We're additive, not destructive.
- No edge function changes. No DB changes.

## Why auto-rescan is safe

`insiders-genealogy-rescan-kyc/index.ts` only re-checks already-fetched chain wallets against the in-memory CEX dictionary (`getCexName`). No Helius calls, no Solscan calls — purely a DB scan + update. Worst case it does nothing.
