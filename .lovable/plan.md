## Two-Stage Cascade: Preview → Execute

Turn the current one-shot CASCADE button into a two-click flow so you can see the projected SOL flow before any transactions fire.

### Stage 1 — CASCADE (preview)

Click **CASCADE** on Wallet 1 of a column:

1. Read current Wallet 1 SOL balance (e.g. 15 SOL).
2. Roll all 9 random leave-behind amounts up front (W1..W9), each uniform `0.75–0.95 SOL`, 6-decimal precision. W10 has no leave-behind (terminal).
3. Walk the projection:
   - `incoming[1] = currentBalance(W1)`
   - `forward[N]  = incoming[N] − leaveBehind[N] − feeBuffer`
   - `incoming[N+1] = forward[N]`
   - `incoming[10]` = final landed amount, no forward.
4. Store the plan in state (column-scoped) and render a red bracketed projection beside every wallet's balance:

```text
W1   15.0000 SOL  [leave 0.8421 → fwd 14.1579]
W2    0.0000 SOL  [in 14.1579 → leave 0.9102 → fwd 13.2477]
...
W10   0.0000 SOL  [in ~3.30 SOL · terminal]
```

5. The button relabels to **EXECUTE** (green) with a small **✕ Cancel** beside it to discard the projection and revert to CASCADE.

Nothing on-chain happens during preview.

### Stage 2 — EXECUTE

Click **EXECUTE**:

1. Send the cached `plan` (array of `{row, leaveBehindLamports}`) to the edge function alongside `columnIndex`.
2. Edge function uses the **provided** leave-behind values instead of rolling its own — so the on-chain outcome matches what you previewed (modulo tiny fee variance).
3. Existing run loop proceeds: troll W1 → transfer (balance − providedLeaveBehind − feeBuffer) → troll W2 → … → troll W10.
4. As each hop completes, the red `[…]` projection on that row turns **green** and shows the realized amount; mismatches >0.001 SOL stay red with a delta.

### UI details (per column)

- Projection chips render inside `WaterfallGrid.tsx` next to each cell's SOL value. Red while pending, green when that hop's transfer is confirmed.
- Header of the column shows: `Projected final W10: 3.3047 SOL` while in preview.
- EXECUTE confirm dialog: "Cascade column N with previewed plan? ~25 min." (no re-rolling).
- Preview is **per-column** state — previewing column 3 doesn't disturb column 1.
- If Wallet 1 balance changes between preview and execute by more than 0.01 SOL, EXECUTE blocks with: "Balance changed since preview, re-run CASCADE."

### Validation during preview (fail fast, no on-chain action)

- If any projected `forward[N] < 0.005 SOL` (W2..W9 wouldn't have enough to cover its own troll), the preview renders that row in red with `INSUFFICIENT` and EXECUTE is disabled.
- If W1 balance < ~0.80 SOL the CASCADE button is disabled with tooltip "need ≥ ~0.80 SOL in Wallet 1".

### Technical details

- **Frontend (`src/components/admin/WaterfallGrid.tsx`)**
  - New per-column state: `cascadePlan: { columnIndex, basis: 'W1 balance at preview time', hops: [{row, leaveBehindLamports, projectedIncomingLamports, projectedForwardLamports, status: 'pending'|'done'|'mismatch'}] }`.
  - Pure helper `buildCascadePlan(w1Balance: number): Plan` — does the roll + walk. Easy to unit test.
  - Button state machine: `idle → preview → executing → done|failed`. Cancel returns to `idle`.
  - Render projection chip inline with existing balance display in each wallet cell.

- **Edge function (`supabase/functions/waterfall-cascade/index.ts`)**
  - Accept optional `plan: { row: number, leaveBehindLamports: number }[]` (length 9, rows 0..8). If present, use it verbatim; if absent, keep current behavior (server-side random) for backwards-compat / direct API use.
  - Validate each `leaveBehindLamports` is within `[0.70, 1.00] SOL` to prevent abuse.
  - On each hop, compute `sendable = balance − plan[row].leaveBehindLamports − FEE_BUFFER_LAMPORTS` exactly as today.
  - Persist the plan on the `waterfall_cascade_runs` row so logs are auditable.

- **DB migration**
  - Add `plan jsonb` column to `waterfall_cascade_runs` (nullable, default null) to record the preview plan that was executed.

### Out of scope

- No changes to the standalone TROLL button.
- No changes to the actual troll cycle logic, transfer logic, or wallet 10 terminal behavior.
- No persistence of the preview across page reloads — it lives in component state only (re-click CASCADE to regenerate).
