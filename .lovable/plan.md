

# FlipIt Blacklist Mesh Guard - Instant Warning on Token Entry

## Status: ✅ IMPLEMENTED

## Changes Made

### 1. `supabase/functions/_shared/blacklist-mesh-guard.ts` (NEW)
Shared authoritative guard that checks:
- Token mint in `pumpfun_blacklist` (critical + high = blocked)
- Creator wallet resolved via DB fallback (`pumpfun_watchlist`, `token_lifecycle`)
- Creator wallet in `pumpfun_blacklist`
- `dev_wallet_reputation` for scammer/serial_rugger trust levels
- `reputation_mesh` for funding chain links to blacklisted entities
- Fail-closed for pump.fun tokens with unresolved creator

### 2. `supabase/functions/token-metadata/index.ts`
- Added creator wallet fallback: when pump.fun/bags.fm API fails (e.g. HTTP 530), resolves creator from `pumpfun_watchlist` then `token_lifecycle`
- Logs which fallback source was used

### 3. `supabase/functions/flipit-execute/index.ts`
- Replaced weak single-table blacklist check with full `runMeshGuard()` call
- Now blocks buys for: critical/high blacklisted tokens, blacklisted creators, scammer devs, mesh-linked entities, and unresolved pump creators

### 4. `supabase/functions/flipit-preflight/index.ts`
- Added `runMeshGuard()` in parallel with venue detection
- Returns `BLOCKED` with reason before quote is even fetched

### 5. `src/components/admin/FlipItDashboard.tsx`
- Background metadata fetch now checks: if pump.fun token + creator still null after all fallbacks → sets FAIL state with clear warning
- FLIP IT button remains active per user constraint (warnings are informational)
