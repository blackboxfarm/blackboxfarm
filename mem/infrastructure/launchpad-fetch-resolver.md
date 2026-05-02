---
name: Launchpad Fetch Resolver
description: Unified `fetchLaunchpadCoin` in _shared/launchpad-fetch.ts is the canonical multi-launchpad metadata entry point; do not reinvent launchpad detection in callers
type: preference
---
`supabase/functions/_shared/launchpad-fetch.ts` exposes `fetchLaunchpadCoin(mint, caller)` which routes by mint suffix:

- `*pump`  → Pump.fun frontend-api-v3 (free, full data including ATH)
- `*BAGS`  → Bags.fm public-api-v2 with `BAGS_FM_API_KEY` (creator + IPFS socials only; no live mcap/ATH)
- `*BONK`  → returns null + `reason: bonkfun_no_public_api` (no public REST exists)
- other    → returns null + `reason: meteora_no_metadata_layer` / `unknown_launchpad`

Returns a normalized `LaunchpadCoin` shape: `imageUri`, `marketCapUsd`, `athMarketCapUsd`, `creator`, `twitter`, `telegram`, `website`, `discord`, `status`, `createdAt`. Callers must fall through to Helius + DexScreener when `data === null`.

**How to apply:** In any new edge function that needs launchpad metadata, import `fetchLaunchpadCoin` — never call `fetchPumpFunCoin` directly and never write `mint.endsWith('pump')` checks in callers. Existing pump-only callers (autopsy-writer, token-mesh-hydrate, ath-backfill, ath-24h-backfill) are migrated one at a time, intentionally not in bulk, to protect the just-stabilised Pump.fun path.

**Why:** Centralises launchpad detection, prevents the $MCUNC class of bug from regressing as we add Bonk.fun/Bags.fm/Meteora support, and makes future API additions (Bitquery for Bonk.fun, etc.) a single-file change.