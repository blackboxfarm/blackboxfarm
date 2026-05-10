---
name: KYC Fast Path + Self-Expanding Dictionary
description: Solscan-direct 1-hop KYC lookup, DB-backed self-growing CEX dictionary, used by mesh-kyc-deep-search before Helius BFS
type: feature
---
`mesh-kyc-deep-search` resolves KYC roots in this order:

1. **Solscan-direct fast path** — `solscanCheckAccountLabel(wallet)` reads `funded_by` from `/v2.0/account/detail`. If the label maps to a known CEX (Binance/Coinbase/Kraken/etc.), we return immediately with `fastPath: 'solscan-direct'` and write `is_kyc_root → directCex` into `reputation_mesh`. **1 API call vs up to 8 hops.**
2. **Helius BFS fallback** — `/v1/wallet/{addr}/funded-by` walked up to depth 8 with sibling discovery.

**CEX dictionary is DB-backed and self-expanding** via `_shared/cex-wallets-db.ts`:
- Source-of-truth: `known_cex_wallets` table (seeded from `_shared/cex-wallets.ts` file).
- 10-min in-memory cache per function instance, warmed at handler start.
- `recordCexWallet()` upserts a new entry whenever Solscan returns a CEX label for an address we don't have yet, OR whenever Helius BFS resolves a CEX-funded root that isn't in our list.
- `getCexNameCached()` is sync and consults file + warmed cache (use this in hot loops). `getCexNameAny()` is async and warms cache on demand.

Result: every KYC trace either hits an existing dictionary entry or *adds* a new one. The dictionary grows automatically; no manual edits to `cex-wallets.ts` are required to expand it. The file dictionary remains as the seed/baseline.

Always-on automation:
- `kyc-backfill-master-10m` (cron, every 10 min) — newest-first KYC trace for unverified `master_token_directory` creators with 24h cooldown.
- `backfill-genealogy-tier-b` (cron, every 6h) — Tier-B reputation backfill for pumpfun_watchlist creators; skips wallets with `trail_end_reason in ('hit_cex','cycle_detected')`.

No clicking required — these run automatically and skip already-completed work.