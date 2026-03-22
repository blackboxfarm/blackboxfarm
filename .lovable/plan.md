

## Wallet Family Surveillance Engine — MVP v1

A secondary, concurrent mint discovery system that runs alongside the existing Allstar/Oracle infrastructure. Seeds from `allstar_dev_registry`, discovers wallet families via Helius transaction analysis, scores relationships, polls for new mints, and visualizes families as interactive graphs.

---

### New Database Tables (6 tables)

**`wallet_families`** — Family clusters
- `id`, `seed_wallet`, `family_name`, `total_wallets`, `risk_score`, `total_mints_detected`, `last_rescored_at`, `created_at`

**`wallet_family_members`** — Individual wallets within a family
- `id`, `family_id` (FK), `wallet_address`, `label` (seed/parent/sibling/child/cex_gateway), `tier` (A/B/C/X), `confidence_score` (0-100), `status` (active/dormant/excluded), `last_signature`, `last_polled_at`, `first_seen_at`, `last_activity_at`

**`wallet_family_edges`** — Relationship graph edges
- `id`, `family_id`, `from_wallet`, `to_wallet`, `edge_type` (FUNDED_BY, FUNDS_TO, CO_MINTED_WITH, SAME_UPSTREAM_SOURCE, TOKEN_TRANSFER_TO, PROFIT_RETURN_PATH, POSSIBLE_CEX_GATEWAY), `weight`, `evidence_count`, `confidence`, `first_seen_at`, `last_seen_at`

**`wallet_family_evidence`** — Raw evidence items backing each edge
- `id`, `family_id`, `wallet`, `related_wallet`, `evidence_type`, `tx_signature`, `program_id`, `mint`, `amount_sol`, `timestamp`, `score_delta`, `raw_json` (JSONB)

**`wallet_family_mint_events`** — Detected mint events from family wallets
- `id`, `family_id`, `mint_address`, `detected_by_wallet`, `event_type` (DIRECT_DEV_MINT, PROBABLE_DEV_ASSOCIATED_MINT, FAMILY_EARLY_ENTRY, SIBLING_WALLET_MINT), `confidence`, `tx_signature`, `token_name`, `token_symbol`, `launchpad`, `created_at`

**`wallet_family_poll_queue`** — Priority-based polling scheduler
- `id`, `wallet_address`, `family_id`, `priority` (P1-P4), `poll_interval_sec`, `next_poll_at`, `last_polled_at`, `fail_count`, `last_result`, `burst_mode_until`

---

### New Edge Functions (3 functions)

**1. `family-discovery-engine`** — Family expansion loop (cron every 10 min)
- Pulls active seed wallets from `allstar_dev_registry`
- For each seed, fetches recent Helius transaction history (`getSignaturesForAddress` + `getTransaction`)
- Parses for: direct SOL funding, token transfers, co-mint participation, profit return paths, upstream funders
- Scores candidate wallets using weighted evidence (direct funding +40, co-mint +25, same upstream +15, profit return +20, exchange noise -20)
- Applies tier thresholds: A (70+), B (45-69), C (25-44), X (<25)
- Inserts/updates `wallet_family_members`, `wallet_family_edges`, `wallet_family_evidence`
- Recursive expansion through Tier A/B wallets only (max depth 3)
- Feeds discovered wallets back into `reputation_mesh` with `discovered_via: family_scanner`

**2. `family-mint-monitor`** — Mint surveillance loop (cron every 5 min for P1, 15 min for P2+)
- Reads `wallet_family_poll_queue` ordered by `next_poll_at`
- For each due wallet, fetches new signatures since `last_signature`
- Detects mint events: `initializeMint` instructions, Pump.fun launch program interactions, new token account creation patterns
- On detection: inserts into `wallet_family_mint_events`, cross-posts to `allstar_mint_alerts` for existing dashboard visibility, enters **burst mode** (temporary 60s polling for 10 min on all family members)
- Manages backoff: no activity in 7 days → downgrade to P4

**3. `family-graph-api`** — Read API for the frontend graph UI
- Accepts `family_id` or `seed_wallet`
- Returns full graph: nodes (wallets with labels/tiers/confidence) + edges (relationships with types/weights)
- Returns family stats: total wallets, mint history, success rate, rug rate, avg ATH
- Returns mint event timeline

---

### Integration Points with Existing Systems

- **Allstar Registry → Family Scanner**: Seeds auto-imported from `allstar_dev_registry` on each discovery run
- **Family Scanner → reputation_mesh**: New wallets discovered by families are written to `reputation_mesh` with source attribution
- **Family Mint Events → allstar_mint_alerts**: Cross-posted so existing Allstar Mint Alerts tab shows family-discovered mints too
- **wallet-genealogy-scanner reuse**: The family discovery engine shares the same CEX wallet list and funding-chain logic
- **Helius client**: Uses existing `helius-client.ts` shared module with rate limiting and circuit breaker

---

### New UI Components (under Allstar Tab)

**New sub-tab: "🕸️ Family Intel"** added to `AllstarTab.tsx`

Contains 3 views toggled by mini-buttons:

**a) Family Dashboard** — Summary table
- Lists all discovered wallet families
- Columns: Seed Wallet, Family Name, Total Wallets, Tier A/B/C counts, Mints Detected, Risk Score, Last Activity
- Click a family → opens the graph view

**b) Family Graph** — Interactive visualization (using `reactflow` / `@xyflow/react`)
- Seed wallet centered
- Parent/funder wallets above, siblings left/right, children below
- CEX gateway nodes in distinct color
- Edge labels showing relationship type + confidence
- Mint event badges on nodes
- Click node → links to Oracle wallet lookup

**c) Mint Feed** — Live mint events from all families
- Chronological feed of `wallet_family_mint_events`
- Shows: family name, detecting wallet, token symbol, confidence, event type
- Acknowledged/unacknowledged toggle
- Links to pump.fun / DexScreener

---

### Cron Schedule (added to `reconcile-cron-jobs`)

| Job | Schedule | Function |
|-----|----------|----------|
| Family Discovery | Every 10 min | `family-discovery-engine` |
| Family Mint Monitor (P1) | Every 5 min | `family-mint-monitor` with `priority=P1` |
| Family Mint Monitor (P2+) | Every 15 min | `family-mint-monitor` with `priority=P2,P3,P4` |

---

### Implementation Order

1. Create 6 database tables via migration
2. Build `family-discovery-engine` edge function
3. Build `family-mint-monitor` edge function
4. Build `family-graph-api` edge function
5. Build Family Dashboard + Graph + Mint Feed UI components
6. Add "Family Intel" sub-tab to AllstarTab
7. Register cron jobs via `reconcile-cron-jobs`
8. Wire cross-posting to `allstar_mint_alerts` and `reputation_mesh`

---

### Technical Notes

- **Graph library**: `@xyflow/react` (React Flow) — already proven for directed graph UIs, handles zoom/pan/click natively
- **Helius budget**: Conservative polling (5-15 min) keeps this well within paid tier limits; burst mode is temporary (10 min windows)
- **No websockets**: Pure polling via `getSignaturesForAddress` + `getTransaction` through existing `helius-client.ts`
- **Existing system unchanged**: This runs completely parallel — the Allstar auditor, mint-monitor-scanner, and Oracle spider continue independently

