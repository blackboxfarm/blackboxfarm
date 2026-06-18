## Why you didn't see TROLL buys/sells in SIM cascade

The live `waterfall-cascade` edge function actually does interleave 10 TROLL buy→sell cycles per wallet (via `runTrollCycles`) **before** each wallet-to-wallet forward. But the **SIM** path in `WaterfallGrid.tsx → executePlan()` (lines 520–549) takes a shortcut: it only simulates the SOL transfers and logs one CASCADE line per hop. The TROLL leg is skipped entirely in SIM, which is why the 12 SOL distributed cleanly with no buy/sell rows.

## Fix: simulate the TROLL cycles in SIM cascade

Update the SIM branch of `executePlan` in `src/components/admin/WaterfallGrid.tsx` so each hop mirrors the real edge function order:

```text
for each hop r in 0..9:
  1. SIM TROLL: 10 cycles × (BUY TROLL → SELL TROLL) on wallet Wr
     - per cycle: deduct SIM_TROLL_COST_PER_CYCLE SOL from Wr (fee jitter)
     - appendLog: "W{col+1}·R{r+1}  troll cycle k/10  buy/sell  −{fee} SOL"
     - small await (e.g. 60–120 ms) per cycle so the log streams
  2. If r === 9: terminal, log "holds X SOL", break.
  3. SIM TRANSFER: leave behind / forward (existing logic, unchanged)
```

Details:
- Reuse the existing `SIM_TROLL_COST_PER_CYCLE` constant (already defined at line 15) so the SIM cost model stays consistent with `simTroll()`.
- Use `appendLog({ kind: "TROLL", ... })` for the cycle lines so they're visually distinct from `CASCADE` transfer lines. If `"TROLL"` isn't an allowed `kind` in `SimLogEntry`, add it.
- Update `simState[Wr].sol` after the troll block (subtract `10 * SIM_TROLL_COST_PER_CYCLE`) **before** computing the hop's leave/forward amounts, so the displayed balances reflect realistic post-TROLL SOL.
- Keep total per-hop sim latency reasonable (≈1–1.5 s for 10 cycles + transfer) so a full column finishes in ~12–15 s.
- Header banner already says "10 hops"; optionally tweak the start log to `"… starting (10 hops × 10 TROLL cycles)"`.

No edge-function or DB changes required — the live cascade already runs TROLL correctly; only the SIM visualization is missing it.

## Files touched

- `src/components/admin/WaterfallGrid.tsx` (SIM branch of `executePlan` only)
