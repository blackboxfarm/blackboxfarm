## Audit: where the "$MCUNC class" of bug repeats

The $MCUNC bug had two root causes:
1. **ATH derived indirectly** (max of polled snapshots / 24h GeckoTerminal candles) instead of asking Pump.fun directly for `ath_market_cap`.
2. **Creator wallet treated as hard-to-find** instead of read straight from the mint payload (`pumpData.creator`).

Both were fixed in `autopsy-writer` and `autopsy-tx-timeline`. But the same pattern lives in several other functions. Here's where to apply the same treatment.

### 1. ATH backfill — both functions ignore Pump.fun's authoritative ATH

**Files:** `supabase/functions/ath-24h-backfill/index.ts`, `supabase/functions/ath-backfill/index.ts`

Today:
- `ath-24h-backfill` only reads 24 GeckoTerminal hourly candles → "ATH" is really just a 24h high. Misnamed.
- `ath-backfill` reads up to 1000 hourly candles (~41 days) and falls back to a DexScreener floor estimate.
- **Neither asks Pump.fun**, even though `frontend-api-v3.pump.fun/coins/{mint}` returns `ath_market_cap` directly for every Pump.fun token (the majority of our pipeline).

Fix: prepend a Pump.fun-first step to both functions:
```
1. fetchPumpFunCoin(mint) → if ath_market_cap > 0, use it. Done.
2. Else fall through to GeckoTerminal OHLCV.
3. Else DexScreener floor (ath-backfill only).
```
This makes ATH accurate for ~95% of our tokens and saves GeckoTerminal quota (which is throttled to 30 req/min).

### 2. token-mesh-hydrate — already does Pump.fun-first for socials/creator, but doesn't capture ATH or mcap

**File:** `supabase/functions/token-mesh-hydrate/index.ts`

When we hydrate a freshly-added token (manual autopsy add, /holders entry, etc.), we already pull Pump.fun data for socials and creator. But we throw away `ath_market_cap`, `usd_market_cap`, `created_timestamp`, `image_uri`. So the next step has to re-fetch Pump.fun.

Fix: while we have the Pump.fun payload in hand, write these into `token_lifecycle` (`ath_24h_usd`, `market_cap`, `image_uri`, `first_seen_at`) and `pumpfun_watchlist` (`price_ath_usd`, `image_uri`) in the same upsert. One fetch, full hydration.

### 3. autopsy-writer — Pump.fun image_uri only used for banner, not for the lifecycle/watchlist row

Same payload, same waste. When `autopsy-writer` calls Pump.fun for `ath_market_cap` (the recent fix), it should also persist `image_uri` and `usd_market_cap` back to `token_lifecycle` if missing. This means manual queue entries get their banner thumbnail filled in at write time, not on a separate trigger.

### 4. Discovery Snapshot legend — currently rebuilt from DB each report

**File:** `supabase/functions/autopsy-writer/index.ts`

The Section 0 legend (✅/❌ for Mint/Dev/KYC/X/TG/Website/Discord/TikTok/DexPaid) reads the DB mesh. If hydration didn't run or was partial, the legend shows ❌ even though the data exists in Pump.fun's payload. Fix: in `autopsy-writer`, the same `livePf` fetch that powers ATH should be the source of truth for the legend's social columns (Pump.fun returns `twitter`, `telegram`, `website` directly). Falls back to DB only if the live call fails.

### 5. Sanity checks (no change needed, just confirmed)

- `_shared/creator-resolver.ts` already does **Pump.fun → Helius DAS → on-chain**, in that order. Good.
- `insiders-creator-backfill` and `audit-creator-integrity` already use `fetchPumpFunCoin` first. Good.
- `creator-api.ts` (multi-launchpad) is already Pump.fun-first. Good.

### Plan of action

1. Patch `ath-24h-backfill` and `ath-backfill` to try `fetchPumpFunCoin().ath_market_cap` first, GeckoTerminal only as fallback.
2. Patch `token-mesh-hydrate` to persist `ath_market_cap`, `usd_market_cap`, `image_uri`, `created_timestamp` into `token_lifecycle` + `pumpfun_watchlist` in the same write.
3. Patch `autopsy-writer` to (a) reuse its existing `livePf` fetch to populate the Section 0 legend and (b) write `image_uri`/`usd_market_cap` back to `token_lifecycle` when present.
4. Rename the column comment for `token_lifecycle.ath_24h_usd` in code comments — it's actually "lifetime ATH" everywhere except the very first fetch. (No DB migration; just stop the misleading comments.)

### Out of scope

- Renaming `ath_24h_usd` → `ath_lifetime_usd` (would require migration + types regen).
- Touching CEX/KYC resolution paths — those are already correct and aggressive enough.

### Files to be edited

- `supabase/functions/ath-24h-backfill/index.ts`
- `supabase/functions/ath-backfill/index.ts`
- `supabase/functions/token-mesh-hydrate/index.ts`
- `supabase/functions/autopsy-writer/index.ts`

No DB migrations. No new secrets. All four edits use existing helpers (`fetchPumpFunCoin`, `assertDbWrite`).

---

## Multi-launchpad metadata: `_shared/launchpad-fetch.ts`

Added a unified `fetchLaunchpadCoin(mint, caller)` resolver that routes by mint
suffix to the right launchpad API. Verified state of public APIs (May 2026):

| Launchpad | Public API | Auth | Returns |
|-----------|------------|------|---------|
| Pump.fun  | `frontend-api-v3.pump.fun/coins/{mint}` | none | name/symbol/image/socials/creator/marketCap/**ATH** |
| Bags.fm   | `public-api-v2.bags.fm/api/v1` | `x-api-key` (`BAGS_FM_API_KEY`) | creator (per-mint), feed metadata + IPFS socials (bulk) — **no live mcap, no ATH** |
| Bonk.fun  | none | — | null + `reason: bonkfun_no_public_api` |
| Meteora   | none (AMM only) | — | null + `reason: meteora_no_metadata_layer` |

Returns a normalized `LaunchpadCoin` shape with stable field names
(`imageUri`, `marketCapUsd`, `athMarketCapUsd`, etc.) regardless of launchpad.
`null` data is expected for non-pump non-bags tokens — callers must fall
through to Helius + DexScreener.

### Migration policy (deliberate, not yet done)

Do NOT bulk-rewrite the four `fetchPumpFunCoin` call sites in this same pass.
The pump-only path was just stabilised after the $MCUNC bug; switching the
consumed shape (`d.image_uri` → `data.imageUri`) in autopsy-writer +
token-mesh-hydrate + ath-backfill + ath-24h-backfill in one go is high-risk
for low marginal value (Bags.fm volume in our pipeline is currently <2%).

Migrate one at a time, in priority order, with eyes on each diff:
1. `token-mesh-hydrate` — biggest payoff (every newly-added token flows here)
2. `autopsy-writer` — second biggest (Bags.fm autopsies will get socials/creator)
3. ATH backfills — lowest priority (Bags.fm doesn't expose ATH anyway)

### Bonk.fun gap (parked)

Bonk.fun has no public REST. Reaching parity requires either:
- Bitquery GraphQL (paid, ~$50/mo) — wires cleanly into `fetchLaunchpadCoin`
- Helius `initialize_v2` instruction parser on program `LanMV9...` — free but
  only gives at-mint metadata, not live mcap or socials updates

Decision deferred. The resolver returns `null` with a clear reason so callers
behave correctly regardless.

---

## Pass 3 — follow-on fixes (this turn)

1. **token-mesh-hydrate migrated** to `fetchLaunchpadCoin`. Pump-only
   `fetchPumpFunCoin` calls replaced with the unified resolver. Now Bags.fm
   mints get creator + socials in the same hydration pass; Bonk/Meteora fall
   through cleanly.

2. **MCUNC TG deep-pull silent skip — fixed.** Root cause: DexScreener
   returned the pair without socials, so `identity.telegramUrl` stayed null,
   and the autopsy queue's `if (ident.telegramUrl)` gate skipped the call.
   Added a `socials-backfill` step to `token-mesh-hydrate` that reads from
   `token_social_links` after the harvest step, so identity always reflects
   discovered socials regardless of which provider surfaced them.

3. **Weak-theme copycat detector** added at
   `_shared/copycat-detector.ts`. Pulls the creator's prior Pump.fun launches
   via `fetchPumpFunCreatorCoins`, finds shared-word clusters of ≥3 tokens,
   and emits one of: `weak_theme_copycat`, `low_effort_serial`,
   `mixed_history`, `clean`, `insufficient_history`. Verdict + caution
   message persisted to `dev_wallet_reputation.metadata.copycat` and returned
   in `token-mesh-hydrate` response so /holders + /bubblemap pre-scan can
   show "Dev shipped 5 'UNC' variants in 11 days, all under $30k" banners.

### Files changed
- `supabase/functions/token-mesh-hydrate/index.ts`
- `supabase/functions/_shared/copycat-detector.ts` (new)
- `.lovable/plan.md`
