## Event-driven ingest (May 2026 update)

- Postgres trigger `trg_insiders_call_enqueue_aft_ins` fires on every INSERT into
  `telegram_channel_calls WHERE channel_name ILIKE 'insiders'` and calls
  `insiders-row-ingest` immediately. No more waiting for the 2-min cron.
- `insiders-row-ingest` order:
  1. **DB-first cache** (`_shared/token-cache-lookup.ts`) — reuse creator/dev/KYC
     from prior Insiders rows, `token_lifecycle`, `developer_profiles`.
  2. **Resolve creator_wallet** (Pump.fun → Birdeye → Helius DAS → Helius RPC).
  3. **Solscan `fund_by`** on the creator wallet → `dev_wallet`. One HTTP call.
     - Hit → `dev_wallet_source = 'solscan_fund_by'`.
     - Miss → `dev_wallet_source = 'in_process'`, poster shows "In Process".
  4. Upsert lifecycle row with `ingest_latency_ms` and fire `no-lube-ingest`.
- The 2-min `insiders-lifecycle-builder` cron remains as a safety sweep for any
  rows the trigger missed; pre-pipeline backlog rows are marked
  `ingest_status='archived'` and hidden from the Process tab.
# No Lube — Private Channel Processing Protocol

This document describes **every variable** the system fetches, resolves, calculates, or writes when a new token is scraped from the Insiders channel and pushed through the No Lube pipeline. The Process tab in the Private channel renders this file as the canonical reference, and each row in the recent-tokens table opens the same field list filled in with that token's live values.

The pipeline is the same one that runs when a token mint is dropped into `/holders` — every Insiders mint is funneled through `bagless-holders-report` so the No Lube post is built on top of a full intel snapshot.

---

## Phase A — Input + parallel fetches

- **token_mint** — Solana mint address scraped from the Insiders Telegram channel.
- **session_id** — surface session for tracing.
- **ip_address / user_agent** — caller context for audit log.
- **search_id** — UUID for this report run.
- **fetchSolscanMarkets** — pool/AMM list for the mint.
- **fetchDexScreenerData** — current price, market cap, liquidity, 24h volume, pair address, socials.
- **fetchRugCheckInsiders** — RugCheck insider/cluster flags.

## Phase B — Creator + LP discovery

- **creator_status** — `unknown` | `resolving` | `resolved` | `unresolvable`. Set by `creator-wallet-resolver` (Pump.fun coin API → Birdeye → Helius DAS → on-chain `getSignaturesForAddress`).
- **creator_wallet** — wallet that deployed the mint, written to `telegram_insider_token_lifecycle.creator_wallet`.
- **fetchCreatorInfo** — Pump.fun / launchpad creator dossier.
- **allPoolAddresses** — every LP address found across markets.
- **Helius getProgramAccounts** — full holder list for the mint.

## Phase C — Holder math

- **tokenSupply** / **decimals**
- per-holder balances (raw + percent)
- **LP detection** — flag wallets that are AMM pools.
- **tier flags** — whale / shrimp / fresh / KOL / dev classifications.
- **rankedHolders** — sorted holder list with tier annotations.
- **potentialDevWallet** — heuristic dev candidate when creator chain is incomplete.
- **healthScore** — composite 0–100 with breakdown (distribution, freshness, insider density, social health).

## Phase D — Intelligence batch

- **crossLinkHolderReputation** — `dev_wallet_reputation` matches per holder.
- **fetchHistoricalDelta** — last snapshot vs now (holder count, top-10 %, mcap drift).
- **detectSocialChanges** — diff vs `token_social_links` snapshot.
- **matchKOLWallets** — KOL dictionary hits.
- **traceDevGenealogy** — walk dev → funder hops → KYC root (CEX label or `Router: …`).
- **detectFreshWallets** — wallets created within the last N hours.

## Phase E — Mesh writes

- **feedTokenLifecycle** — upsert into `telegram_insider_token_lifecycle` (entry_market_cap, peak_market_cap, peak_multiplier, mesh_hydrated_at, dev_wallet_resolved_at, holders_refreshed_at, etc.).
- **feedInsiderWallets** — insider cluster nodes/edges.
- **meshFeed.token / meshFeed.insiders** — bubble-map mesh hydration.
- **expandGenealogyTree** — `genealogy_chain`, `genealogy_depth`, `genealogy_kyc_root`, `kyc_label`, `kyc_status`.
- **generateWarningsFromHoldersData → writeEarlyWarnings** — dev_history_warning, rug_evidence, socials_changed.

## Phase F — Final persistence

- **upsertHealthSnapshot** — health score row.
- **holders_intel_seen_tokens** — surface seen counter.
- **pumpfun_watchlist** — auto-add when relevant.
- **logCompleteSearch** — audit trail.

---

## No Lube post gate (after `/holders` completes)

The orchestrator only posts when **all** of these are true:

1. `entry_market_cap > 0`
2. `creator_status = 'resolved'`
3. `dev_wallet_resolved_at IS NOT NULL`
4. `mesh_hydrated_at IS NOT NULL`
5. live DexScreener mcap fresh (≤ 5 min)
6. not present in `no_lube_post_log` (dedup window)
7. not flagged `terminal_dead`

If any check fails the row returns `not_eligible_yet` — **never** a retry loop. The strict gate prevents the failures that retries used to mask.

## Lifecycle columns rendered in the per-token popup

`token_symbol`, `token_mint`, `channel_name`, `launchpad`, `entry_mc_text`, `entry_market_cap`, `peak_market_cap`, `peak_multiplier`, `peak_reached_at`, `milestone_count`, `last_milestone_at`, `total_messages`, `first_called_at`, `ingest_status`, `ingest_started_at`, `ingest_completed_at`, `ingest_last_error`, `creator_status`, `creator_wallet`, `creator_attempts`, `creator_last_attempt_at`, `creator_resolved_at`, `creator_risk_tier`, `dev_wallet_resolved_at`, `dev_history_warning`, `kyc_status`, `kyc_label`, `kyc_attempts`, `kyc_last_attempt_at`, `genealogy_depth`, `genealogy_kyc_root`, `mesh_hydrated_at`, `mesh_promoted_at`, `mesh_promotion_status`, `mesh_promotion_reason`, `holders_refreshed_at`, `blackbox_harvested_at`, `enrichment_status`, `enrichment_last_run_at`, `socials_changed`, `socials_last_checked_at`, `is_rugged`, `lifespan_minutes`, `created_at`, `updated_at`.