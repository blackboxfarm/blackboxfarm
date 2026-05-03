## Goal

Make "Generate Report" (Live Death Watch, Cool Deaths Backlog) and "Draft" (Lambs / Autopsy Queue row) execute the **full forensic pipeline** in one click — identical to the "Add & Draft" flow already wired up in `AutopsyQueueBody.handleManualAdd`.

## Current behavior (the gap)

| Surface | Button | What it actually runs |
|---|---|---|
| Queue → Add & Draft (manual mint) | Add & Draft | hydrate → tx-timeline → tg-deep-pull → community-sweep → writer ✅ |
| Queue → Lambs row | Draft | `autopsy-writer` only ❌ |
| Queue → Live Death Watch | Generate Report | `autopsy-writer` only ❌ |
| Queue → Cool Deaths Backlog | Generate Report | `autopsy-writer` only ❌ |
| Drafts tab | Re-Hydrate / Re-Forensics / Re-Generate | surgical re-runs (kept as-is) |

## Plan

### 1. Extract a shared pipeline runner

New file `src/components/admin/autopsies/runFullAutopsyPipeline.ts`:

```ts
runFullAutopsyPipeline({
  mint,
  candidateId,        // optional; created if missing
  sourceFeed,         // 'live_death_watch' | 'cool_deaths_backlog' | 'lambs' | 'admin_manual'
  ticker?, tokenName?, // for backlog where we already cleaned them
  extras?,            // ath/liq/creator for backlog upsert
  toast,              // injected
}): Promise<{ candidateId: string; identity: any }>
```

Pulls the existing block out of `AutopsyQueueBody.handleManualAdd` (lines ~80–170) verbatim:
1. Upsert / find `autopsy_candidates` row (re-using existing matching logic per surface).
2. `token-mesh-hydrate` (force: true) — emits per-step toasts.
3. Empty-object refusal guard.
4. `autopsy-tx-timeline`.
5. Conditional `autopsy-tg-deep-pull` (only if `identity.telegramUrl`).
6. `autopsy-community-sweep` with both lenses.
7. `autopsy-writer`.

Errors at each step → `destructive` toast; the writer step is the only hard-throw (so the user always sees a finished or clearly-failed run).

### 2. Wire it into the three surfaces

- **`LiveDeathWatch.tsx`** — replace the body of `generateReport` (currently just upserts a candidate + invokes `autopsy-writer`) with a call to `runFullAutopsyPipeline({ sourceFeed: 'live_death_watch', mint: r.token_mint, ticker, tokenName, extras: {...} })`. Keep the existing `proc` lock so the button still becomes "Queued / Analyzing… / Drafted / Published".
- **`CoolDeathsBacklog.tsx`** — replace `draftAutopsy` with `runFullAutopsyPipeline({ sourceFeed: 'cool_deaths_backlog', mint, ticker, tokenName, extras: { ath_usd, current_mcap_usd, liquidity_usd, creator_wallet, death_confidence } })`. After success, write `drafted_at` to `autopsy_backlog` (existing behavior).
- **`AutopsyQueueBody.tsx` → `draft(id)`** (called by `AutopsyCandidateRow` "Draft" button in the Lambs subtab) — look up the row's `token_mint`, call `runFullAutopsyPipeline({ candidateId: id, mint, sourceFeed: 'lambs' })`. Button label stays "Draft" (or rename to "Run Pipeline" — see open question).
- **`AutopsyQueueBody.handleManualAdd`** — replace the inline block with a call to the new helper to keep one source of truth.

### 3. UI affordance

- Add a small inline note under each card explaining the button now runs the full pipeline (hydrate → forensics → TG → community → writer), so users understand the longer wait.
- Disable the trigger button until the pipeline resolves (existing pattern via `busy` already there in all three components).

## Files touched

- **new** `src/components/admin/autopsies/runFullAutopsyPipeline.ts`
- `src/components/admin/autopsies/LiveDeathWatch.tsx` (`generateReport`)
- `src/components/admin/autopsies/CoolDeathsBacklog.tsx` (`draftAutopsy`)
- `src/components/admin/autopsies/AutopsyQueueBody.tsx` (`handleManualAdd`, `draft`)

No edge-function changes, no DB migrations.

## Open question

The "Draft" button label on Lambs rows: keep as "Draft" or rename to "Generate Report" to match the other two surfaces? Either is fine — I'll match the others ("Generate Report") unless you say otherwise.
