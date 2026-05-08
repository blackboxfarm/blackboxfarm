## Solscan Pro v2.0 — Status Audit & Remaining Plan

### What's already done (verified in current code)

**Phase 0 — Pro key activation** ✅
- `verify-solscan-pro` edge function exists; `SOLSCAN_API_KEY` confirmed Pro v2.0 (200s on `/token/meta`, `/account/transfer`).
- `_shared/solscan-api.ts` — Pro v2.0 enabled, `token` header, `/v2.0/transaction/detail`.
- `_shared/solscan-intelligence.ts` — Pro endpoints live: `/token/meta`, `/account/detail` (CEX labels), `/account/transfer` (SPL transfer + mint chains).
- `_shared/solscan-markets.ts` — Pro `/token/markets` + `/token/holders`, correct `token[]` param.
- `_shared/solscan-free.ts` — Pro v2.0 path enabled for token meta.
- `_shared/provider-health.ts` — Solscan no longer auth-broken.

**Phase 0b — Hybrid genealogy** ✅
- `_shared/auto-genealogy.ts` uses Solscan Pro `/v2.0/account/transfer` as the fast-path funder discovery before falling back to Helius.

### What's NOT done yet (gaps vs the To-Do)

From LIST 1 of the To-Do:
- ❌ **#7 — `oracle-unified-lookup` funding-chain block**: no Solscan corroborating-source branch found in the unified lookup.
- ❌ **#8 — `breadcrumbs-scanner` promotion**: Solscan is still `type: 'scrape', priority: 70`. Needs to become `type: 'api', priority: 95` using Pro `/v2.0/token/meta`.
- ❌ **#9 — `developer-wallet-tracer` activation as primary tracer**: file exists but not wired as the lead tracer in the discovery jobs that currently lean on Helius.
- ⚠️ **#10 — `token-metadata`, `bagless-holders-report`, `flipit-execute`, `flipit-repair-positions`**: imports detected but no audit yet that they actually invoke the new Pro paths instead of legacy fallbacks.

LIST 3 — sellable features unlocked: **none built yet.**

---

### Plan to finish — 4 phases

#### Phase A — Wire the dormant consumers (List 1 #7-#10)

1. **breadcrumbs-scanner**: promote Solscan to `{ key: 'solscan', type: 'api', priority: 95, apiEndpoint: 'pro-api.solscan.io/v2.0/token/meta?address={MINT}' }` with `token` header. Keep scrape entry as fallback at priority 60.
2. **oracle-unified-lookup**: add Solscan-Pro corroboration block to the funding-chain section — calls `fetchSolscanCEXLabel()` and `fetchSolscanFundingChain()` from `_shared/solscan-intelligence.ts`, merges into the existing creator chain, and tags `source: 'solscan_pro'` for evidence transparency.
3. **developer-wallet-tracer**: make it the first-pass tracer in `developer-discovery-job` and the watchlist enricher; Helius becomes secondary.
4. **Audit pass**: open `token-metadata`, `bagless-holders-report`, `flipit-execute`, `flipit-repair-positions` and replace any remaining HTML-scrape / public-tier paths with the Pro helpers. Add `assertDbWrite` on every write touched (per Core memory).

#### Phase B — First wave of new sellable features (List 3 #2 + #8)

5. **Portfolio chip on Bubble Map nodes**: new `_shared/solscan-portfolio.ts` calling `/v2.0/account/portfolio`; surface as a hover chip on wallet bubbles (USD total + top 3 token tickers). Cached 5 min in `wallet_portfolio_cache` table.
6. **Mint / Freeze authority badge**: extend `token_meta` enrichment to capture `mint_authority` and `freeze_authority` from Pro `/token/meta`; render a red/green badge in token header + Hacker Terminal evidence.

#### Phase C — Second wave (List 3 #5 + #9)

7. **Real-time LP composition** (`/token/markets` deeper read): show LP token mix and pool routes on the BubbleMap LP node; replace whale-vs-LP guesswork.
8. **Forensic Autopsy enrichment**: feed `token_autopsy_engine` with Pro transfer history + CEX labels for richer `death_cause` reasoning.

#### Phase D — Cost & ops controls

9. **Solscan request budget** in `_shared/solscan-api.ts`: per-minute rate limiter (Pro v2.0 ≈ 1k rpm), simple LRU response cache (5 min for meta, 60 s for transfers), structured `[Solscan]` log lines for credit accounting.
10. **Helius credit drop verification**: add a daily counter that compares Helius RPC calls before/after Phase A to confirm the projected 30–50% reduction.

### Technical notes

- All new edge functions and helpers must use `assertDbWrite` for writes (Core memory: zero-tolerance silent fails).
- All Pro requests use `'token': SOLSCAN_API_KEY` header (not `Authorization: Bearer`).
- Respect the existing `provider-health.ts` circuit breaker — wrap new helpers in `await withProviderHealth('solscan', ...)`.
- No hard-coded SOL/USD values anywhere (Core memory).
- Keep `dex-top-200` cache as the sole price authority; Solscan is for chain truth, labels, and structure — not for prices.

### Out of scope for this plan
- Replacing DexScreener pricing — Solscan is not used for live price.
- Re-enabling Solscan in any code path the Strategic Direction memory de-prioritises.