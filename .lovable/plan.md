## Problem

In SIM mode, BUY (single cell, **Buy W#**, or via CASCADE) does not always leave a token balance on the wallet, so the follow-on SELL has nothing to sell and either no-ops or relies on the phantom-holding fallback added last turn.

Root causes in `WaterfallGrid.tsx`:

1. **`simBuy` silently produces 0 tokens** when `tokenPrices[mint]` is missing or `priceUsd === 0` (e.g. a brand-new pump.fun mint where DexScreener returns nothing). `tokensOut = priceUsd > 0 ? usdIn / priceUsd : 0` → wallet is debited SOL, credited 0 tokens, sell finds nothing.
2. **`simState` SOL fallback bug.** When a wallet isn't yet in `simState`, `simBuy` starts from `{ sol: 0, tokens: {} }`, so `newSol = max(0, 0 − solIn)` collapses to 0 even though eligibility was computed against `w.sol_balance`. Tokens still get credited, but the wallet's SOL ledger silently desyncs.
3. **CASCADE TROLL cycles already pair BUY→SELL**, so they intentionally leave 0 holdings. That is correct behaviour, but the **column-level Buy W#** must leave tokens behind — today it does, *unless* (1) bites.

## Changes (SIM-only, frontend only)

File: `src/components/admin/WaterfallGrid.tsx`

1. **`simBuy` — guarantee a non-zero token credit.**
   - If `priceUsd > 0`: keep current math.
   - If `priceUsd === 0` or price metadata missing: fall back to a deterministic synthetic rate of `1 SOL → 1_000_000 phantom units`, credit `solIn * 1_000_000` tokens, and tag the log line with `(phantom price)` so it's obvious in the SIM log.
   - This guarantees `cur.tokens[mint] > 0` after every BUY, so `collectSellTargets` finds the wallet.

2. **`simBuy` / `simSell` / `simTroll` — seed missing simState from real balance.**
   - Replace `prev[w.id] ?? { sol: 0, tokens: {} }` with `prev[w.id] ?? { sol: Number(w.sol_balance || 0), tokens: {} }` so the wallet's SOL ledger doesn't snap to 0 the first time it's touched.

3. **Cell-level BUY button (`Cell` component, line ~1070).**
   - Same `simBuy` is reused, so fix in (1) covers it. No additional change.

4. **Keep the phantom-holding fallback in `simSell`** as a safety net for CASCADE-only runs (already shipped last turn).

No edge function, schema, or live-mode changes. CASCADE behaviour unchanged.

## Verification

- Seed W3 R1 with 12 SOL, click **Buy W3** with a fresh pump.fun mint that DexScreener doesn't price → SIM log shows `SIM BUY … → X phantom (phantom price)`, wallet card shows token balance > 0.
- Click **Sell W3** → SIM log shows `SIM SELL X … → Y SOL` against the real (non-phantom) holding, wallet SOL increases.
- Run **CASCADE** on W4 → unchanged: 10 TROLL cycles per hop, no net holdings, then **Sell W4** uses phantom fallback.
