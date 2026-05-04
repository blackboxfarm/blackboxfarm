---
name: Autopsy Cache Policy
description: Aggressive cache-first policy for token autopsy pipeline — never re-fetch immutable dead-token data
type: feature
---
Autopsies analyse dead tokens whose identity/creator/KYC/socials/on-chain history are IMMUTABLE. Re-fetching wastes credits, CPU, and Helius/DexScreener/Pump.fun/Apify quota.

Rules (runFullAutopsyPipeline.ts → autopsy-* functions):
- NEVER pass `force: true` to token-mesh-hydrate, autopsy-tx-timeline, or autopsy-community-sweep from the autopsy pipeline.
- token-mesh-hydrate `surface='autopsy_pipeline'` widens token_lifecycle cache TTL to **30 days** (vs 5min for live surfaces).
- autopsy-tx-timeline self-skips when autopsy_tx_evidence row <6h exists.
- autopsy-community-sweep self-skips when both vulture+dissent blobs <30min exist.
- Only the `autopsy-writer` (AI) phase always re-runs — that's where regen value lives.

If a user explicitly wants to wipe cache, expose a separate "Force fresh fetch" UI affordance — do not default to it.
