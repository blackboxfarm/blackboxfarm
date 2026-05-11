## Why the Birdeye 1,862 ≠ Dev Wallet coverage delta

Two real problems, one cosmetic:

### Problem 1 — Most Birdeye calls are invisible to us
`supabase/functions/_shared/creator-resolver.ts` Step 2 calls Birdeye inline and **never logs to `birdeye_api_usage`**. That path is used by `creator-wallet-resolver`, `creator-lookup`, `enrich-scraped-tokens`, and the non-fast-path branch of `backfill-creator-wallets`. Result: dashboard shows 1,862, our table shows 330. We're flying blind on ~82% of Birdeye spend.

### Problem 2 — Resolved owners aren't all landing in coverage
Of 286 Birdeye-resolved owners logged from `backfill-creator-wallets`:
- 197 visible in MTD ✅
- 89 — mint isn't in MTD at all (resolved but wrote to a base table not joined into the matview, or the upsert went to `scraped_tokens` for a pump-suffixed mint that isn't in `pumpfun_watchlist`)
- The MTD coverage delta (+~1,000) is well below the implied ~1,500+ resolutions across all paths

### Problem 3 (cosmetic) — Matview refresh lag
MTD refreshes every 10 min. UI updates won't be instant even when writes succeed.

---

## Plan

### Step 1 — Instrument the hidden path (highest ROI)
Refactor `_shared/creator-resolver.ts` Step 2 to call the existing `birdeyeResolveCreator()` helper from `_shared/birdeye-creator.ts` instead of its own inline `fetch`. That helper already logs to `birdeye_api_usage` with full status / latency / resolved owner. After this we'll see **all** Birdeye calls in one place and the 1,862 number will reconcile.

### Step 2 — Diagnose the write-back leak in `backfill-creator-wallets`
The fast-path (`birdeyeOnly=true`) in `backfill-creator-wallets/index.ts` resolves an owner but I need to verify its write-back logic mirrors the slow-path:
- pump-suffixed mints → `pumpfun_watchlist.creator_wallet`
- everything else → `scraped_tokens.creator_wallet`
- `developer_profiles` shell row created so KYC backfill picks it up

Then audit the matview definition for `master_token_directory` to confirm it actually selects `creator_wallet` from both base tables (so the writes surface). If the matview only joins one, that explains the 89 missing mints.

### Step 3 — Add a "Birdeye usage" panel to admin Oracle
Small card next to `DevKycCoveragePanel` showing:
- Calls today / this hour
- Success vs failure split
- % that returned an owner
- Last 10 resolved mints

Reads from `birdeye_api_usage` (RLS already restricts to super-admins).

### Step 4 — Force a matview refresh after backfill batches
Have `backfill-creator-wallets` call `refresh materialized view concurrently master_token_directory` (or trigger the existing cron's RPC) when a batch resolves > 0 owners, so the UI reflects writes within seconds rather than up to 10 min.

---

## Technical notes

- `_shared/birdeye-creator.ts` already exists, already returns `string | null`, already does the same retry-free single call. Step 2's retry-on-429 logic should move into the helper so the unified logger keeps that nuance.
- Step 2 fix is ~15 LOC delta; it's a strict refactor with no behavior change other than logging.
- Matview refresh: prefer `concurrently` to avoid blocking reads. Requires a unique index on the matview (likely already present since 10-min cron uses it).
- No DB schema changes required for steps 1, 2, 4. Step 3 is read-only UI.

After step 1 ships you'll be able to verify in one query that `count(*) from birdeye_api_usage` matches the Birdeye dashboard within ~1%, which isolates whether the remaining coverage gap is a write-back bug (Step 2) or just owners Birdeye couldn't resolve.