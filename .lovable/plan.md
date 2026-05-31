## Goal

Stop depending on Solscan's `/v2.0/token/markets` + `/v2.0/token/holders` label endpoint to identify the LP wallet. Use the obvious truth: **the LP is the biggest holder.**

## The heuristic

For any tradable Solana token, the largest token-account holder is the AMM pool's token vault. We already fetch the full holder list from Helius for the Holders Report — the LP is sitting at rank #1, every time. We just need to *label* it.

## Plan

### 1. New shared helper: `_shared/lp-from-top-holder.ts`

`identifyLPFromTopHolders(holders, knownPoolAddresses?)` returns `{ verifiedLPAccount, verifiedLPSource, poolAddresses }`.

Logic, in order:
1. **DexScreener cross-check (preferred)** — if DexScreener already returned pair addresses for this token, find the top holder whose `owner` or `address` matches one of those pair addresses or whose `owner_program` is in `KNOWN_DEX_PROGRAMS` / `BONDING_CURVE_PROGRAMS`. That's the LP. Confidence: `dexscreener_verified`.
2. **Top-holder fallback** — if no DEX-program match in top 10, take the **#1 holder by balance** and label it `top_holder_heuristic`. Guardrails:
   - Skip if #1 is the mint authority, freeze authority, or the dev wallet (we already know these from the report context).
   - Skip if #1 holds >95% (likely a pre-launch dev bag, not an LP). In that case return `null` and let the report flag "no LP detected / not tradable".
   - Skip if #1's balance is <1% of supply (no meaningful pool).
3. Always also collect any DexScreener pair addresses into `poolAddresses` so downstream LP-exclusion logic still strips them from concentration math.

### 2. Wire into `bagless-holders-report/index.ts`

Current flow: DexScreener → (if 0 pools) Solscan markets → holder analysis.

New flow:
- DexScreener fetch (unchanged — gives us pair addresses + liquidity USD).
- **Skip `fetchSolscanMarkets` entirely.**
- After Helius holder list is loaded, call `identifyLPFromTopHolders(holders, dexScreenerPairAddresses)`.
- Feed `verifiedLPAccount` + `poolAddresses` into the existing LP-exclusion / concentration code exactly the way Solscan's output was used.

### 3. Deprecate `fetchSolscanMarkets`

- Leave the file in place but stop calling it from `bagless-holders-report`.
- This silences the 429 alerts at the source (the function never runs).
- Keep `solscan-markets.ts` available in case another caller needs it later, but mark it deprecated in a header comment.

### 4. No DB changes. No alert-system changes needed.

The Solscan quota alert stops firing because we stop calling Solscan from this path.

## Files touched

- **new**: `supabase/functions/_shared/lp-from-top-holder.ts`
- **edit**: `supabase/functions/bagless-holders-report/index.ts` — remove `fetchSolscanMarkets` call, add `identifyLPFromTopHolders` call after holders fetch
- **edit (header only)**: `supabase/functions/_shared/solscan-markets.ts` — deprecation note

## Why this is better than Solscan

- **Free** — uses holder data we already fetched.
- **Faster** — no extra API call per token.
- **Accurate** — the LP literally *is* the biggest token-account on a live AMM pool; that's how AMMs work.
- **Cross-checked** — DexScreener pair addresses confirm the match when available.

## What this does NOT do

- Does not detect *multiple* pools on different DEXs (Raydium + Meteora). DexScreener already enumerates those pairs; we'll union them into `poolAddresses` so all are excluded from concentration math. Only the #1 (deepest) pool gets the `verifiedLPAccount` label, which matches current Solscan behavior.
- Does not detect LP-lock status. That's a separate concern handled by the LP lock checker, not this lookup.
