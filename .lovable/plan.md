# Why the buy is failing (answered first)

The buy failure has **nothing to do with Solscan**. Two distinct failures are visible in `flipit-execute` logs at 21:01 UTC:

**1. `raydium-swap` edge function is crashing on boot (primary cause of "non-2xx status code")**
```
event loop error: Error: Expected to resolve main module, got Import instead.
  at node_modules/localhost/rpc-websockets/9.3.9/dist/index.cjs:6:12
```
Every recent boot of `raydium-swap` dies before serving a request. `flipit-execute` passes TradeGuard cleanly (price $0.0000133, 0.025 SOL, slippage 5%), invokes `raydium-swap`, and immediately gets a non-2xx back because the function never started. This is a CJS/ESM resolution bug in `rpc-websockets@9.3.9` (pulled in transitively by `@solana/web3.js` / `@raydium-io/raydium-sdk`).

Fix path: pin `rpc-websockets` to a version that resolves cleanly under Deno's edge runtime (typically `7.x`), or refactor `raydium-swap` to use Jupiter's REST swap endpoint and drop the websocket dependency entirely.

**2. A second failure (`buy-1778360482185`) shows a frontend bug**
- `explicitBuyAmountSol: 2202.643` for a `$50` buy at `solPrice=$93.26` → correct value would be ~`0.536` SOL.
- The frontend is computing `usd * solPrice` (or dividing by an inverted price) instead of `usd / solPrice`. This is unrelated to Solscan and a separate bug.

Both should be tracked separately from the Solscan work below. Want me to dig into either after the plan is approved?

---

# Plan

## Part A — Solscan caller cleanup

Audit shows these are still using legacy / wrong patterns:

| File | Issue |
|---|---|
| `_shared/solscan-markets.ts` line 87 | `/token/holders?address=` — needs verification (likely fine, holders endpoint uses `address`) |
| `liquidity-lock-checker/index.ts` line 67–103 | `SOLSCAN_API_KEY = null` hard-disable + uses `/token/markets?address=` (wrong v2 param) |
| `lifecycle-scorecard-builder/index.ts` line 20 | Direct `fetch()` bypasses `solscanFetch` rate limiter + cache |
| `probe-burns/index.ts` line 25 | Direct `fetch()`, bypasses limiter |
| `probe-buybacks/index.ts` line 36 | Direct `fetch()`, bypasses limiter |
| `_shared/solscan-intelligence.ts` (multiple) | Already uses helpers but some endpoints need v2 param verification |
| `breadcrumbs-scanner/index.ts` line 173 | Direct fetch, bypasses limiter |
| `flipit-execute/index.ts` line 1288 + `flipit-repair-positions` line 95 | Direct fetch, bypasses limiter |

Actions:
1. Re-route every Solscan call through `solscanFetch()` (so the master dashboard captures every request).
2. Fix the `/token/markets?address=` → `?token[]=` param in `liquidity-lock-checker` (and remove the `null` hard-disable).
3. Grep-confirm zero hardcoded keys, zero references to old `public-api.solscan.io` v1, zero `Authorization: Bearer` (Pro v2 uses the `token:` header).
4. Make `SOLSCAN_API_KEY` the single source of truth — remove any disabled/short-circuit branches left over from the previous outage.

## Part B — Dedicated "Solscan" master dashboard tab

A new admin tab purpose-built for the $199/mo Pro v2 key. Replaces the existing minimal `SolscanUsageBreakdown` panel.

### Backend
1. New table `solscan_api_calls` (append-only, 30-day retention):
   - `id, ts, endpoint_path, function_name, http_status, duration_ms, from_cache, error_message, response_bytes, mint_or_address, billed (bool)`
2. Patch `_shared/solscan-rate-limiter.ts` so every `solscanFetch()` writes one row (fire-and-forget). Capture caller via `(new Error()).stack` parse OR explicit `callerName` arg.
3. New edge function `solscan-usage-stats` returns aggregates for the dashboard:
   - Calls today / this billing period (cycle starts the **8th of each month**)
   - Success vs error breakdown by HTTP status
   - Top endpoints by call count + avg latency
   - Top calling functions
   - Cache hit ratio
   - Live RPM gauge (from `getSolscanRateStats()`)
   - Recent errors stream (last 50)

### Frontend (`src/components/admin/SolscanDashboard.tsx`)
A single, dense dashboard — not a sub-tab — registered in `UtilitiesTab.tsx` as a top-level tab named **"Solscan"** (replacing the current `solscan-breakdown` slot).

Sections:
1. **Header strip** — key fingerprint (masked), verdict badge from `verify-solscan-pro`, billing-cycle countdown ("12 days until reset on June 8"), $199 plan label.
2. **Live throttle** — current RPM / 800 ceiling, cache size, in-flight requests.
3. **Billing cycle usage** — total calls since last 8th, daily sparkline, projected month-end total.
4. **Endpoint breakdown table** — endpoint, calls, success %, avg ms, cache hit %, last error.
5. **Calling functions table** — which edge functions burn the most quota.
6. **Errors feed** — last 50 non-2xx with timestamp, endpoint, status, message.
7. **Pro v2 feature inventory** — static doc panel listing every Pro v2 endpoint we use, what it powers in the product, and the user benefit. Sourced from a one-time read of [pro-api.solscan.io docs](https://pro-api.solscan.io/pro-api-docs/v2.0). Sections:
   - `/token/meta` → mint/freeze authority audit on token cards
   - `/token/markets` → liquidity-lock-checker pool detection
   - `/token/holders` → top-holder concentration in HoldersIntel
   - `/token/transfer?activity_type[]=ACTIVITY_SPL_BURN` → burn events in lifecycle scorecard
   - `/account/transfer` → wallet activity in oracle / dev genealogy
   - `/account/portfolio` → wallet investigator
   - `/account/defi/activities` → buyback detection
   - `/transaction/detail` → tx forensics
   - **NEW Pro v2 endpoints we're not yet using** (highlighted with "Untapped" badge so we can roadmap them)
8. **Manual probe button** — re-runs `verify-solscan-pro` and displays the 3-probe result inline.

### Wiring
- Replace `SolscanUsageBreakdown` import in `UtilitiesTab.tsx` with `SolscanDashboard`.
- Move the tab to a prominent first/second position in the tab list and rename trigger to `🔎 Solscan`.

## Technical details
- Logging insert uses `assertDbWrite` per the zero-tolerance rule.
- `solscan_api_calls` RLS: super-admin read only; service-role insert.
- Billing-cycle math: if today < 8th, cycle started 8th of last month; else 8th of this month. Pure date-fns, no hardcoded SOL/USD anything.
- No new secrets needed — existing `SOLSCAN_API_KEY` covers everything.

## Out of scope (separate tickets)
- `raydium-swap` boot crash (the actual buy failure)
- Frontend `buyAmountSol` calculation bug
