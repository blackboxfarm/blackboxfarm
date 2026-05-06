-- Save Solscan Pro API Migration & Expansion plan into the admin To-Do list
INSERT INTO public.admin_todo_items (title, description, category, priority, status)
VALUES (
  'Solscan Pro API Migration & Expansion Plan',
$plan$Recovered from prior analysis (Apr 29 chat). DO NOT BUILD YET — saved for review in a few days.

=== HEADLINE ===
Migration cost: ~10–20 lines of edits. Most logic already written and dormant behind explicit DISABLED early-returns. Activation = remove guards + ensure SOLSCAN_API_KEY (Pro v2.0) present. No callsite rewrites needed.

=== LIST 1 — Existing functions to MODIFY (activate dormant Pro paths) ===
1. _shared/solscan-api.ts → fetchTransactionFromSolscan, parseBuy/SellFromSolscan
   Today: returns null. After: pro-api/v2.0/transaction/detail — pre-parsed sol_bal_change + token_bal_change. Used by flipit-execute & flipit-repair-positions → fills become on-chain truth (exact tokens, exact SOL, exact fee) instead of estimates.
2. _shared/solscan-markets.ts → fetchSolscanMarkets
   Today: returns empty Set. After: /v2.0/token/markets + /v2.0/token/holders. Feeds lp-detection.ts priority-1 solscan_verified source. Eliminates whales-mistaken-for-LP false positives in bagless-holders-report.
3. _shared/solscan-intelligence.ts → fetchTokenMeta, fetchAccountDetail, fetchFunders, fetchCreatedTokens
   Today: 5 DISABLED returns; falls back to scraping HTML for funders. After: native API for token meta, CEX/exchange labels, SOL transfer funding chain, SPL mint history per wallet. Powers oracle-unified-lookup + developer-wallet-tracer. Removes Cloudflare 403/scrape fragility.
4. _shared/solscan-free.ts → fetchSolscanFreeTokenMeta
   Today: free public-api (1k/60s, basic). After: Pro /v2.0/token/meta returns price, mcap, holder count, creation slot, mint/freeze authority, decimals, supply in one call. Saves Helius credits in token-metadata.
5. _shared/provider-health.ts → isSolscanUsable
   Today: auto-demotes Solscan on any 401. After: rate-limit aware; stays in rotation.
6. _shared/auto-genealogy.ts (KYC tracer, MAX_DEPTH 20)
   Today: pure Helius walker, ~1 credit/hop. After: hybrid /account/transfer paged jumps → fewer Helius credits, deeper traces, faster KYC root resolution.
7. oracle-unified-lookup funding chain block (~L726)
   Today: Helius-only. After: Solscan as second corroborating source; mismatch = elevated suspicion.
8. breadcrumbs-scanner provider registry (~L42)
   Today: type:scrape priority 70. After: type:api priority 95 — first-class structured source.
9. developer-wallet-tracer (~L135)
   Today: dormant Solscan branch. After: activated as primary tracer for dev-wallet → mint history walks.
10. token-metadata, bagless-holders-report, flipit-execute, flipit-repair-positions
    Already import disabled functions — wake up automatically, zero callsite edits.

=== LIST 2 — Functions/services Solscan Pro REPLACES or UPGRADES ===
- HTML scraping of solscan.io/account/<wallet> for funders → native /v2.0/account/transfer + /account/detail (no Cloudflare 403s, structured JSON)
- Multi-call Helius getSignaturesForAddress + getTransaction walks for KYC tracing → paged Solscan transfer-activity (fewer Helius credits, deeper depth)
- Estimated flipit fills → Pro transaction/detail truth (accurate PnL, slippage, fee)
- Whale-vs-LP guesswork in holder reports → /v2.0/token/markets authoritative LP list
- Public-tier token meta → Pro /v2.0/token/meta (single-call enrichment; reduces Helius DAS pressure)
- Browserless/Firecrawl scraping for CEX account labels → native account-label endpoint (cuts scrape provider quota)

=== LIST 3 — NEW sellable / monetizable features Pro unlocks ===
1. DeFi Activity Timelines per wallet — /v2.0/account/defi/activities. Sellable as Pro-tier wallet profile tab on Bubble Map / dev pages.
2. Portfolio Valuations on Bubble Map node hover — /v2.0/account/portfolio returns USD-valued SPL holdings. Hover any wallet node → instant net-worth chip.
3. Enhanced Developer Reputation metrics — new signals from /v2.0/account/stake, /balance_change, /token/transfer: dev-initiated burns, stake history, age-of-funds, churn ratio. Folds into dev_wallet_reputation.
4. Authoritative CEX/Exchange Labels — /v2.0/account/detail returns exchange tags. Replaces internal CEX dictionary maintenance.
5. Token Top-Holder Movement Stream — /v2.0/token/holders paginated + diffed → "whale entered/exited" alerts. Sellable as Pro Telegram alert.
6. Real-Time LP/Pool Composition — /v2.0/token/markets exposes every pool with live liquidity. Powers a "liquidity fragmentation" health badge.
7. Cross-Token Wallet Behavior — /v2.0/account/transactions filtered by program → identify wallets that consistently buy before pumps. Foundation for "Smart Money Watch".
8. Mint Authority / Freeze Authority Auditing — Pro meta returns these reliably. Surface as per-token "mintable/freezable" red badge.
9. Forensic Autopsy Enrichment — autopsies gain exact dev profit, retail counterparty list, and labeled CEX off-ramps.
10. Helius Credit Reduction (cost offset) — modeled saving ~30–50% of current genealogy + tx-parsing Helius spend shifts to Solscan flat-rate, partially offsetting $199/mo.

=== RISK & ROLLOUT ===
- Risk: low. Most code already dormant behind DISABLED guards. Free fallbacks remain.
- No data loss / no migrations. Read-only enrichment.
- Provider-health gate keeps Solscan as one of N rotating sources.

=== BUILD SEQUENCE (when approved) ===
1. Confirm/refresh SOLSCAN_API_KEY (Pro v2.0).
2. Lift DISABLED early-returns in 4 shared modules.
3. Update provider-health.ts to rate-limit-aware mode.
4. Promote breadcrumbs-scanner Solscan provider to type:api priority 95.
5. Re-enable Solscan branches in oracle-unified-lookup, developer-wallet-tracer, auto-genealogy.
6. Smoke-test: flipit fill reconciliation, one KYC genealogy walk, one bubble-map funder lookup, one token-meta call.
7. Sequence List 3 features. Recommended first ship: #2 Portfolio chip + #8 Mint/Freeze badge. Then #5 + #9.

=== TO SWITCH TO BUILD ===
- Approve plan. Confirm SOLSCAN_API_KEY is Pro v2.0 (or supply new). Pick first List-3 features (default: #2 + #8, then #5 + #9).
$plan$,
  'integration',
  'high',
  'todo'
);
