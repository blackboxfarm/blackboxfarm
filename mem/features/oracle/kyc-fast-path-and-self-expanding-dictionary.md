---
name: KYC Fast Path + Self-Expanding Dictionary
description: Solscan-direct 1-hop KYC lookup, DB-backed self-growing CEX dictionary, used by mesh-kyc-deep-search before Helius BFS
type: feature
---
`mesh-kyc-deep-search` resolves KYC roots in this order. Terminator is NOT
CEX-only — bridges, on-ramps, custodians, MM desks and aggregators also count
as KYC origin (column `developer_profiles.kyc_source_type`).

1. **Solscan-direct fast path** — `solscanCheckAccountLabel(wallet)` reads `funded_by` from `/v2.0/account/detail`. If the label maps to a known CEX (Binance/Coinbase/Kraken/etc.), we return immediately with `fastPath: 'solscan-direct'` and write `is_kyc_root → directCex` into `reputation_mesh`. **1 API call vs up to 8 hops.**
2. **Helius BFS fallback** — `/v1/wallet/{addr}/funded-by` walked up to depth 8 with sibling discovery.

**CEX dictionary is DB-backed and self-expanding** via `_shared/cex-wallets-db.ts`:
- Source-of-truth: `known_cex_wallets` table (seeded from `_shared/cex-wallets.ts` file). Now carries `entity_type` column (`cex | bridge | onramp | aggregator | mm_desk | custodian`).
- Label classification lives in `_shared/kyc-entity-classifier.ts` (`classifyEntityFromLabel`), used by both the fast path and the BFS terminator.
- 10-min in-memory cache per function instance, warmed at handler start.
- `recordCexWallet()` upserts a new entry whenever Solscan returns a CEX label for an address we don't have yet, OR whenever Helius BFS resolves a CEX-funded root that isn't in our list.
- `getCexNameCached()` is sync (name only). `getEntityCached()` returns `{ name, type }`. `getCexNameAny()` is async and warms cache on demand.

Result: every KYC trace either hits an existing dictionary entry or *adds* a new one. The dictionary grows automatically; no manual edits to `cex-wallets.ts` are required to expand it. The file dictionary remains as the seed/baseline.

Always-on automation:
- `kyc-backfill-master-2m` (cron, every 2 min, batch 100) — newest-first KYC trace for unverified `master_token_directory` creators. Cooldown enforced via `developer_profiles.kyc_last_checked_at` (column is `master_wallet_address`, NOT `developer_wallet` — old code had a silent bug there).
- `creator-wallet-resolver-2m` (cron, every 2 min, batch 50) — fills missing `creator_wallet` on tokens by calling `resolveTokenCreator()` (Pump.fun → Helius DAS → Helius RPC). Writes to `pumpfun_watchlist` for pump mints, otherwise upserts `scraped_tokens`. Also creates a `developer_profiles` shell so the KYC backfill picks it up next cycle.
- `backfill-genealogy-tier-b` (cron, every 6h) — Tier-B reputation backfill for pumpfun_watchlist creators; skips wallets with `trail_end_reason in ('hit_cex','cycle_detected')`.
- `kyc-rescan-master-dict` (on-demand / 6h cron) — ZERO API cost. Walks unverified `developer_profiles` and re-checks the in-DB `reputation_mesh` funding graph against the broadened entity dictionary, flipping wallets retroactively when the dictionary grows. Stamps `kyc_trail_status` (`verified | trail_no_kyc | trail_incomplete`) so the UI can split honestly instead of treating "not traceable" as "unverified".

No clicking required — these run automatically and skip already-completed work.

## Critical persistence path (do not break)

`master_token_directory.kyc_verified` is computed from `developer_profiles.kyc_verified` (joined on `master_wallet_address = creator_wallet`). `mesh-kyc-deep-search` MUST upsert `developer_profiles` with `kyc_verified=true, kyc_source, kyc_source_type, kyc_trail_status='verified', kyc_verification_date, kyc_last_checked_at` whenever a KYC root is found (both Solscan-direct fast path AND BFS path). Writing only to `reputation_mesh` is not enough — the matview won't flip green.

Live coverage is visible on `/super-admin → Oracle tab → Dev Wallet + KYC Coverage` panel.