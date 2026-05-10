---
name: Recycled Community Scoring — Event Driven
description: Recycled-band scoring for x_communities is event-driven (mint, scraper write, rug, dex_paid). 6h cron is fallback only.
type: feature
---

community-recycled-scorer is invoked at the moment each underlying signal changes:

- **on mint / CA query**: `_shared/mesh-ingest.ts` → `evaluate_for_token`
- **on x_communities row write**: `_shared/x-community-resolver.ts` → `evaluate` (catches rename, member bump, new linked mints, admin change)
- **on rug flip**: `insiders-mesh-promoter` + `insiders-mesh-row-action` → `evaluate_for_token`
- **on DEX-paid / CTO flip**: `dex-paid-checker` → `evaluate_for_token`

All hooks call `_shared/trigger-recycled-scorer.ts::fireRecycledScorer()` which is fire-and-forget — never awaits, never throws, never blocks the caller.

The `community-recycled-scorer-6h-fallback` cron runs every 6h and only re-evaluates communities whose `recycled_evaluated_at` is null or >7 days old. It is a sparse drift-catcher, NOT the source of truth. Do not lower the cron interval — add an event hook instead if a signal is being missed.
