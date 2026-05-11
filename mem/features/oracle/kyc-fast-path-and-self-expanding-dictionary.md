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
- `backfill-creator-wallets-2m` (jobid 231, every 2 min) + `backfill-creator-wallets-catchup-10m` (jobid 232) — fill missing `creator_wallet` on tokens NEWEST-FIRST by calling `resolveTokenCreator()` (Pump.fun → Helius DAS → Helius RPC). Writes to `pumpfun_watchlist` for pump mints, otherwise upserts `scraped_tokens`. Also creates a `developer_profiles` shell so the KYC backfill picks it up next cycle. (Replaces the older `kyc-backfill-master-2m` which is no longer scheduled — `kyc-bulk-mesh-runner-5m` covers that role.)
- `backfill-genealogy-tier-b` (cron, every 6h) — Tier-B reputation backfill for pumpfun_watchlist creators; skips wallets with `trail_end_reason in ('hit_cex','cycle_detected')`.
- `kyc-rescan-master-dict-6h` (jobid 234, cron `0 */6 * * *`, batch 1000) — ZERO API cost. Walks unverified `developer_profiles` and re-checks the in-DB `reputation_mesh` funding graph against the broadened entity dictionary, flipping wallets retroactively when the dictionary grows. Stamps `kyc_trail_status` (`verified | trail_no_kyc | trail_incomplete`) so the UI can split honestly instead of treating "not traceable" as "unverified".
- `kyc-bulk-mesh-runner-5m` (jobid 233, every 5 min, batch 20, concurrency 5) — fires `mesh-kyc-deep-search` against the NEWEST unverified `developer_profiles` (ordered by `created_at desc`). When the top of the queue is exhausted within the 24h cooldown window, it naturally laps back to fresh entries.
- **Inline mesh-funnel hook**: `creator-wallet-resolver` fires `mesh-kyc-deep-search` (fire-and-forget) right after upserting the dev-profile shell, so newly-discovered creators get KYC-traced immediately instead of waiting up to 5 min for the cron.

## Two pipelines, two "newest" queues (don't confuse them)
1. **Newest tokens missing a dev wallet** → `backfill-creator-wallets-2m` orders `master_token_directory` by `created_at desc` where `creator_wallet IS NULL`.
2. **Newest dev wallets missing KYC** → `kyc-bulk-mesh-runner-5m` orders `developer_profiles` by `created_at desc` where `kyc_verified` is null/false.
Stage 1 feeds Stage 2 automatically (creator-wallet-resolver creates the dev-profile shell). The inline mesh-funnel hook bypasses the 5-min wait for fresh wallets.

No clicking required — these run automatically and skip already-completed work.

## Critical persistence path (do not break)

`master_token_directory.kyc_verified` is computed from `developer_profiles.kyc_verified` (joined on `master_wallet_address = creator_wallet`). `mesh-kyc-deep-search` MUST upsert `developer_profiles` with `kyc_verified=true, kyc_source, kyc_source_type, kyc_trail_status='verified', kyc_verification_date, kyc_last_checked_at` whenever a KYC root is found (both Solscan-direct fast path AND BFS path). Writing only to `reputation_mesh` is not enough — the matview won't flip green.

Live coverage is visible on `/super-admin → Oracle tab → Dev Wallet + KYC Coverage` panel.

## Pump.fun creator-coins resolver (3-tier fallback)

`_shared/pumpfun-creator-coins-resolver.ts` exports `resolveCreatorCoins(wallet, opts)` used in place of `fetchPumpFunCreatorCoins` whenever fallback resilience matters. Chain:
1. **API** — existing `frontend-api-v3.pump.fun /coins/user-created-coins` (paginated).
2. **Browserless** — scrapes `https://pump.fun/profile/{wallet}` and parses `/coin/{mint}` anchors.
3. **Apify** — `apify/web-scraper` actor, gated to "important" wallets (KYC-verified OR `total_tokens_created > 5`) and capped at 50 runs/day.

Cooldown is enforced via `pumpfun_profile_scrape_log` (PK `wallet_address`): 6h default, 1h for KYC-verified. Diagnostic endpoint: `pumpfun-profile-scrape-test` (admin button on Dev/KYC Coverage panel; `bypassCooldown` + `allowApify` toggles).

Wired callers: `mesh-wallet-token-discovery` (full chain) and `_shared/copycat-detector.ts` (Browserless fallback when API returns 0). Other pump.fun callers still use `fetchPumpFunCreatorCoins` directly to avoid double-scraping in latency-sensitive paths.