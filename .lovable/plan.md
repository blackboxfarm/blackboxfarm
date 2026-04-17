

The user is asking a reflective/strategic question — what did we learn from this session's failures and successes, and how do we build a better self-healing system for the FlipIt trading flow.

This is **not** a build request — it's a planning/diagnostic conversation. Let me synthesize the lessons from this session and propose a concrete monitoring/sync system.

## Session Recap — What Worked vs What Didn't

### What Worked
1. **Linked-Sell Groups** — clean schema (single `sell_group_id` column), simple UI (link icon next to lock), sequential sells. Shipped cleanly.
2. **Manual price refresh button** — small, surgical, immediate user value.
3. **Extended FLIP IT timeout to 90s** — pragmatic match to real-world Helius latency.
4. **Manual Solscan/Helius balance reconciliation** — DAS API via `helius-rpc-proxy` correctly returned the true on-chain balance and we patched the DB row.

### What Didn't Work / Surfaced Hidden Bugs
1. **Sell failure on $coin.ai** — the *root cause was bad data*, not bad swap code. `quantity_tokens_raw` had a UI decimal (`2032783.49815`) instead of atomic units (`2032783498150`). Jupiter/Raydium were sent a quantity ~1 millionth of the real holding → ROUTE_NOT_FOUND / slippage trip.
2. **Token-2022 vs SPL detection** — venues failed silently because the program ID wasn't being passed/respected.
3. **No automatic balance reconciliation** — we only caught the bad quantity because the user complained. The unified monitor was "successfully" pricing a phantom amount.
4. **Slippage was static** — when a swap reverted with custom error 6024 (slippage), we had no auto-retry escalation.
5. **"Nothing to monitor, skipping" after a sell** — confirms 1 holding → 0 holdings, but no post-sell sanity check that the wallet actually emptied.

## The Pattern
Every recent failure traced back to **DB ↔ chain drift**. The DB *thought* it knew the position, but the on-chain truth had moved on (decimals wrong, token-2022 program, balance dust, venue migrated). We'd been treating the DB as authoritative; it isn't.

## Proposed: Sync Sentinel + Pre-Flight Reconciliation

A small, layered safety net — three things, not a rewrite:

### 1. Pre-Sell Reconciliation (highest value)
Before any sell fires (manual OR group OR auto-TP), `flipit-execute` does a 1-call DAS check:
- Fetch real on-chain balance for `(walletPubkey, tokenMint)` via `helius-rpc-proxy`
- If on-chain balance ≠ `quantity_tokens_raw` (tolerance: ±1%), patch the DB row and use the on-chain number
- If on-chain balance is 0 → mark position `closed_external` (already sold elsewhere), don't attempt swap
- Detect token program (SPL vs Token-2022) from the asset response and pass it to the swap builder

This single check would have prevented today's $coin.ai failure entirely.

### 2. Auto-Escalating Slippage on Specific Errors
In `flipit-execute`, parse the error code:
- Custom 6024 (Jupiter slippage) → retry once at 2× slippage (capped at 50%)
- ROUTE_NOT_FOUND on full size → retry at 50% size, then 25%
- All venues fail → mark position `sell_failed` with structured `error_code` (not just a string blob), surface a "Retry with higher slippage" button

### 3. Drift Sentinel (background, every 10 min)
A new lightweight cron `flipit-drift-sentinel`:
- For each `holding` position, sample on-chain balance via DAS
- If drift > 5% → flag `needs_reconciliation = true` and refresh quantity
- If on-chain balance = 0 but DB says holding → flag `ghost_position = true` (likely sold/transferred outside the system)
- Surface ghosts/drifted positions in a small dashboard widget so user sees them before clicking Sell

### 4. Structured error_code column
Today `error_message` is a giant string. Add `error_code` (enum: `slippage`, `no_route`, `insufficient_balance`, `program_mismatch`, `quote_unavailable`, `unknown`) so the UI can show the right hint and the auto-retry logic knows what to do.

## Files Touched (when approved)
- Migration: add `error_code TEXT`, `needs_reconciliation BOOL`, `ghost_position BOOL`, `last_chain_sync_at TIMESTAMPTZ` to `flip_positions`
- `supabase/functions/flipit-execute/index.ts` — add pre-sell reconciliation block + slippage/size escalation
- `supabase/functions/flipit-drift-sentinel/index.ts` — new function, cron every 10 min
- `src/components/admin/FlipItDashboard.tsx` — show drift/ghost badges, "Reconcile now" button per row, structured error hints

## What's NOT in scope (confirm if wanted)
- Rewriting the swap builder for multi-program (Token-2022) atomic swaps — would touch many venues
- Replacing the unified monitor — it works; we're adding a sentinel beside it, not replacing
- Auto-retry on a schedule for `sell_failed` positions — manual button only for v1 (safer)

**Tap "Plan Approved" to build it. Or tell me which of the 4 pieces to drop / reorder.**

