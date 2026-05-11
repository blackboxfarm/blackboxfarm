---
name: KYC Solscan-First Per-Hop Routing
description: mesh-kyc-deep-search BFS tries Solscan funded_by + top-funder before Helius; cron disables sibling discovery
type: feature
---
`mesh-kyc-deep-search` per-hop funder lookup (`tryFundedBy`) order:
1. **Solscan** — `solscanDiscoverFunders` (top SOL funder via `/v2.0/account/transfer`) + `solscanCheckAccountLabel` on that funder. Returns Helius-shaped `{funder, funderName, funderType, amount}`.
2. **Helius** `/v1/wallet/{addr}/funded-by` — only if Solscan returns nothing.

Helius cost per chain reduces from N hops × 1 Helius call to ~0–1 Helius calls per chain (only on Solscan misses).

**Cron path (`kyc-backfill-master`)** passes `discoverBundle: false, maxDepth: 5` to skip Helius `getEnhancedTransactions` sibling/bundle expansion (the single biggest Helius hog). Sibling discovery still runs when the UI/on-demand caller omits the flag.

The depth-0 Solscan-direct fast path (1 call CEX label hit) remains unchanged.
