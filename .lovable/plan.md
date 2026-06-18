
## Goal

While in SIM mode, every wallet card in `WaterfallGrid` shows live USD + SOL value of its held SIM tokens, refreshed on a fixed interval, and every SIM SELL records a realized PnL (entry vs exit) shown both in the per-action log row and as a running per-wallet total.

## Scope

Frontend only — `src/components/admin/WaterfallGrid.tsx` and the `WalletCard` sub-component inside it. No DB, no edge functions, no schema changes. Uses existing `tokenPrices` (DexScreener) + `solUsd` (useSolPrice) that the grid already loads.

## Behaviour

1. **Live price polling (SIM mode only)**
   - Add a 15-second interval that re-fetches DexScreener prices for every distinct mint currently held in `simState` (union of `targetMint`, `perColMints`, and any mint key inside `simState[*].tokens`).
   - Reuses the existing `fetchTokenMeta` path already used on mint change; just re-invokes it for the active mint set.
   - Pauses when the browser tab is hidden (`document.visibilityState === "hidden"`) and resumes on visibility — avoids burning DexScreener calls on background tabs.
   - A small "Live · updated 12s ago" pill under the SIM banner shows last refresh timestamp and a manual Refresh button.

2. **Per-wallet live value display**
   - Each `WalletCard` already lists token rows. Extend each row to show:
     - `amount TICKER` (existing)
     - `≈ $X.XX` (amount × current priceUsd)
     - `≈ Y.YYYY SOL` (USD / current solUsd)
   - Add a card-level "Total ≈ $… / … SOL" line summing all held tokens + SIM SOL balance, so the user sees one combined wallet value that ticks with price.

3. **Realized PnL on SIM SELL**
   - Track entry cost per (walletId, mint) in a new `simCostBasis` state shape:
     `Record<walletId, Record<mint, { solIn: number; usdIn: number; tokens: number }>>`
   - `simBuy` adds to the basis (accumulating solIn, usdIn, tokens).
   - `simSell` computes:
     - `proceedsSol`, `proceedsUsd` (existing math)
     - `costSol = basis.solIn * (soldTokens / basis.tokens)`, same for USD
     - `pnlSol = proceedsSol − costSol`, `pnlUsd = proceedsUsd − costUsd`, `pnlPct = pnlUsd / costUsd`
   - The log entry for that SELL appends: `PnL +0.0123 SOL (+$1.45, +12.3%)` colored green/red.
   - After sell, decrement the basis proportionally (or clear it if fully sold).

4. **Per-wallet realized PnL badge**
   - Maintain `simRealizedPnl: Record<walletId, { sol: number; usd: number }>` updated on every SIM SELL / CASCADE sell.
   - WalletCard shows a compact `Realized: +0.0420 SOL (+$5.12)` line under the token list when non-zero, colored by sign.

5. **Persistence**
   - Extend the existing `PERSIST_KEY` blob to include `simCostBasis` and `simRealizedPnl` so values survive tab switches and reloads (same pattern already used for `simState` and `simLog`).
   - `Reset All Grid` clears them too.

6. **Edge cases**
   - When DexScreener has no price yet (`phantomPrice` path in `simBuy`), basis records `usdIn: 0`. On sell, PnL is reported in SOL only and the USD column shows `—`.
   - If `solUsd` is 0 (price feed down), USD totals show `—` but SOL totals still update.
   - Polling pauses while `simMode === false` (no point recomputing live prices on the live‑wallet view).

## Technical Notes

- Reuse existing `tokenPrices` state shape `{ priceUsd, symbol, ... }`; just refresh entries in place.
- Polling implemented as a single `useEffect([simMode, simState, targetMint, perColMints])` that sets up `setInterval(refreshAll, 15_000)` and a `visibilitychange` listener.
- `refreshAll` calls the existing fetcher in parallel (`Promise.all`) and `setTokenPrices((prev) => ({ ...prev, ...next }))`.
- All new derived totals (`walletUsdValue`, `walletSolValue`) computed inside `WalletCard` via `useMemo` so they re-render automatically when `tokenPrices` updates.
- No changes to the cascade edge function — the realized PnL math runs purely client-side off the existing simulated buy/sell ledger.

## Verification

1. Enable SIM, set a target mint with a known DexScreener price, BUY on W1·R1 with 1 SOL.
2. Wait 15s → card USD/SOL value updates as price ticks.
3. SELL → log shows `PnL ±… SOL (±$…, ±…%)`; wallet card shows a `Realized:` row.
4. Switch tabs, come back → values + realized PnL persist (localStorage).
5. CASCADE on a column → each hop's paired sell contributes to that wallet's realized PnL.
