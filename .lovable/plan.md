## Problem

Logs show the real failure chain on token `5QgYwF...pump`:

1. PumpPortal returns `custom program error: 0x1` (pump.fun bonding-curve rejected the buy — typically insufficient SOL/slippage on the curve).
2. The "fast-path" I added then tries **bags.fm** for a pure **pump.fun** token (bestDex=`pumpswap`, hasBagsFm=`false`). bags.fm builds a quote/tx anyway, and signing+sending it OOMs the function.
3. `raydium-swap` returns 500 → `waterfall-swap` surfaces "non-2xx".

The fast-path is wrong: bags.fm is only valid when the token actually lives on bags.fm. For pumpfun BC tokens it should NOT fall through to bags.fm — it should return the PumpPortal error cleanly.

## Fix

Edit `supabase/functions/raydium-swap/index.ts` fast-path block:

- Gate the bags.fm fast-path on `hasBagsFm === true` (from the dex venue hint). For pure pumpfun tokens, skip bags.fm entirely.
- When skipped, return HTTP 502 with the PumpPortal error verbatim and `error_code: "PUMPFUN_CURVE_REJECTED"` (include the 0x1 hint → "insufficient SOL or slippage too tight on pump.fun curve").
- Keep the existing bags.fm fast-path ONLY for `hasBagsFm` tokens.

Edit `supabase/functions/waterfall-swap/index.ts`:

- When `swapResult.error_code === "PUMPFUN_CURVE_REJECTED"`, return a friendlier message: `pump.fun rejected buy (likely insufficient SOL in wallet or slippage too tight)` so the W1/W2 toasts show the actionable cause instead of "non-2xx".

Deploy both functions.

## Why this fixes it

- No more bags.fm tx build/sign for pumpfun tokens → no OOM → function returns cleanly.
- The real cause (curve rejected the buy, almost certainly wallet SOL balance vs `buyLamports + priority fee + rent`) is surfaced to the UI so you can top up the wallet or lower the buy size.

## Not changed

- Decryption path, walletSource routing, PumpPortal call itself — all confirmed working in logs.
- bags.fm fast-path stays intact for real bags.fm tokens.