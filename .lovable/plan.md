
Goal: stabilize Oracle/Bubble Map so it does not depend on broken Solscan paid endpoints, surface provider failures clearly, and restore reliable KYC bubble visibility with managed rollout.

1) What is happening right now (root-cause summary)
- Solscan is effectively broken for your current key tier:
  - `api_usage_log` last 24h: `solscan=320 calls, all 401`; `helius=14 calls, all 200`.
  - Errors are explicit: `"Unauthorized: Please upgrade your api key level."`
- System still “partly works” because many paths already use alternatives:
  - Pump.fun APIs
  - Helius (e.g., `mesh-kyc-deep-search` funded-by is returning 200)
  - DB cache (`token_lifecycle`, `developer_tokens`, `reputation_mesh`)
  - Some modules fall back to public/non-pro Solscan endpoints or scrape fallback
- Why behavior feels weird:
  - Several functions return `200` with partial/null data instead of hard failure (silent degradation).
  - `oracle-unified-lookup` still calls Solscan for funding/token fallback in quick spider path.
  - `api_provider_config` currently has `helius` disabled and `solscan` enabled, so provider-based paths can pick the wrong default.
- Why KYC “stopped” in Bubble Map:
  - Backend KYC is working (`mesh-kyc-deep-search` works and writes `kyc_root` links).
  - UI graph fetch scope is too narrow: it fetches only links directly touching focused/expanded IDs. If focus is token-only, newly added `kyc_root -> wallet` links are often not pulled unless wallet is expanded.
  - Spider attempts cap (`max 2`) is consumed quickly (including auto enrich calls), then further clicks show “Max attempts reached”.

2) Managed implementation plan (phased, low-risk)
Phase A — Immediate stability + observability (no behavior surprises)
- Add a shared “provider capability gate” utility (from `api_service_config` + `api_provider_config` + recent `api_usage_log` failures).
- Standardize external-call responses across Oracle functions to include:
  - `sourceUsed`, `fallbackUsed`, `degradedMode`, `errors[]`.
- Stop silent null-success for critical paths:
  - For creator/funder lookups, return structured degraded status instead of plain null.
- Add Oracle diagnostics panel summary in UI:
  - “Provider health: Solscan degraded, Helius healthy”.

Phase B — KYC reliability restoration (highest priority)
- In `oracle-unified-lookup`, replace Solscan funding discovery with Helius-funded-by chain as primary (shared logic from `mesh-kyc-deep-search`).
- Keep Solscan funding only as optional tertiary fallback (feature-flagged).
- Bubble Map fixes:
  - On “Find KYC Root”, auto-expand traced wallet (and discovered root) before refetch.
  - Expand graph query from strict 1-hop to include 2-hop around expanded wallets OR explicitly include new IDs returned from KYC response.
  - Replace hard “2 attempts forever” with cooldown-based retry policy (e.g., 2 immediate + reset after N minutes).

Phase C — Creator resolution unification (remove Solscan dependency drift)
- Replace `solscan-creator-lookup` internals with canonical chain:
  1) pump.fun coin API
  2) Helius transaction mint proof
  3) Helius DAS getAssetsByCreator
  4) internal DB records
- Update callers (`flipit-*`, `enrich-scraped-tokens`, `scalp-mode-validator`, etc.) to use unified resolver contract.
- Keep function name compatibility initially to avoid broad breakage.

Phase D — Governance + change management
- Create a Solscan dependency matrix (function, endpoint, criticality, replacement, fallback, owner).
- Roll out behind feature flags:
  - `ORACLE_USE_HELIUS_FUNDING_PRIMARY=true`
  - `DISABLE_SOLSCAN_OPTIONAL_PATHS=true` (staged later)
- Add canary verification:
  - Compare old vs new output for a small wallet/token sample set before full switch.

3) Technical details (implementation specifics)
- Shared modules to add/extend:
  - `_shared/provider-health.ts`
  - `_shared/creator-resolver.ts` (or upgrade existing resolver path)
  - `_shared/funding-resolver.ts` (Helius-funded-by chain logic)
- Key files to change first:
  - `supabase/functions/oracle-unified-lookup/index.ts`
  - `src/hooks/useMeshGraph.ts`
  - `src/components/admin/oracle/MeshGraphVisualizer.tsx`
  - `supabase/functions/solscan-creator-lookup/index.ts` (compat wrapper to new resolver)
- Config correction:
  - Re-enable Helius in `api_provider_config` and lower Solscan priority for tx/funding capabilities.
- UX behavior:
  - Show explicit “Degraded data source” badge when any critical upstream fails.
  - Keep diagnostics visible even when `found=true` to avoid false confidence.

4) Validation checklist (before/after)
- Wallet KYC check:
  - Run `mesh-kyc-deep-search` and confirm kyc_root row exists and appears as bubble without manual graph workaround.
- Spider resilience:
  - Repeated clicks no longer dead-end after 2 attempts; cooldown retry works.
- Provider sanity:
  - `api_usage_log` should show Helius calls for KYC funding path; Solscan 401 volume drops sharply.
- Creator path:
  - Non-pump + pump tokens both resolve via unified chain without Solscan dependency.

5) Expected outcome
- You keep momentum without rebuild: migrate incrementally, keep interfaces stable, and remove Solscan as a hidden hard dependency.
- System becomes predictable: explicit degraded states, deterministic fallback order, and restored KYC bubble visibility.
