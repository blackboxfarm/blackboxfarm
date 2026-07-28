## Verdict: the logic is sound — the contracts line up

Traced the whole path against the actual code:

- `consolidateAllToW1` picks `column_index === 0 && row_index === 0` as W1·Wallet 1 and targets every other loaded wallet (rows 0-9, all 10 columns).
- It calls `refreshBalancesForBuy()` (no args = all wallets), and `applyRefreshPayload` fills `balancesRef.current[pubkey] = { sol, tokens[] }` — exactly the shape the plan builder reads.
- Token move: `waterfall-withdraw` with `amount: -1` is a recognised "max" sentinel — for SPL it reads the full `fromAcc.amount` and creates the destination ATA if missing (payer = sending wallet, which is why the pre-fund step exists).
- SOL sweep: `amount: -1` with `mint: "SOL"` sends `balance - fee`, so the 0.006 SOL pre-fund is recovered in step 4.
- Ordering (refresh → pre-fund → tokens → SOL) is correct: SOL is only swept after tokens have moved, so no wallet is left fee-broke mid-transfer.
- Sequential with 250-300ms spacing, errors collected not thrown, "insufficient SOL" suppressed on the sweep pass.

## Four real gaps worth fixing before a live run

1. **Refresh timeout risk (biggest).** `waterfall-refresh-balances-solscan` with no pubkeys scans all 100 wallets, 4 network calls each, concurrency 3 — that can exceed the edge function wall clock and abort the whole consolidate at step 1. Fix: refresh in chunks of ~20 pubkeys from the client, merging results (payload already supports `partial`).
2. **No W1 balance pre-check.** If `needFunding.length` is 30, W1 needs ~0.18 SOL. Today it just fails 30 times. Fix: compute required = count × 0.006 and abort with a clear message if W1's live SOL is short.
3. **Token-2022 mints silently fail.** `waterfall-withdraw` hardcodes `TOKEN_PROGRAM_ID`; any Token-2022 holding errors out and lands in the console log only. Fix: detect the owner program from the mint account and use the matching program id / ATA derivation.
4. **Empty ATA rent stays locked.** Consolidate moves balances but leaves ~0.002 SOL of rent in each now-empty token account, so the final SOL sweep under-collects. Fix: offer to run the existing dust-sweep close pass on each wallet after its tokens move (or prompt "run dust sweep first?").

## Technical notes

All changes stay in `src/components/admin/WaterfallGrid.tsx` except item 3, which needs `supabase/functions/waterfall-withdraw/index.ts` to resolve the token program dynamically. Item 1 also needs no backend change — chunking is client-side.

Optional dry-run mode: a `simulate` flag that runs the planning phase and prints the full move list to console without invoking `waterfall-withdraw`, so you can eyeball it against real balances before spending a lamport.
