---
name: Insiders Pipeline Orchestrator
description: 3-hourly cron chain that resolves every Insiders dev wallet and walks every dev wallet to a final KYC verdict (CEX label or proven dead-end)
type: feature
---
The `insiders-pipeline-orchestrator` edge function runs every 3h via pg_cron job `insiders-pipeline-orchestrator-3h` (jobid 211).

Chain order:
1. `insiders-lifecycle-builder` — parse new Telegram messages
2. `insiders-creator-backfill` — fill missing `creator_wallet` (Pump.fun → Helius DAS → on-chain)
3. `insiders-genealogy-backfill` — walk creator → KYC, depth 30, with 24h retry cooldown
4. `insiders-genealogy-rescan-kyc` — free re-check vs current CEX dictionary (always runs even if earlier steps fail)

Status columns on `telegram_insider_token_lifecycle`:
- `creator_status`: `unknown` | `resolving` | `resolved` | `unresolvable` (after 3 attempts)
- `kyc_status`: `pending` | `tracing` | `kyc_resolved` | `no_kyc_reachable` | `failed`
- `kyc_label`: human-readable CEX (e.g. `Binance`, `Coinbase`) or `Router: Axiom` for infra dead-ends

Helius budget guard: 80% of 10M monthly quota aborts auto_loop steps. Cheaper steps still continue.

Both backfills are idempotent — they skip rows in their target state and respect cooldowns (24h for KYC retry, 7d for unresolvable creator retry).