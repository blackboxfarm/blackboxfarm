

## Root Cause: `verifyMintTimestamp` Returns Wrong Date

The bug is in `verifyMintTimestamp()` (line 204-218). It queries:
```
/v0/addresses/${tokenMint}/transactions?type=TOKEN_MINT&limit=1
```

This returns the **most recent** TOKEN_MINT transaction involving that token address — not the **original creation**. For ADX (a 1.5yr old token), a recent mint/transfer event returned a timestamp of "3 minutes ago," which passed the 2-hour freshness check.

The `sinceHours` filter on line 310 (`if (mintAgeHours > sinceHours)`) relied on this broken timestamp, so the old token sailed through as "fresh."

## The Fix (Two Parts)

### Part 1: Fix `verifyMintTimestamp` — Use DAS `getAsset` for True Creation Date

Replace the current approach with a Helius DAS `getAsset` RPC call (already used elsewhere in the codebase via `creator-resolver.ts`). The DAS response includes `content.metadata` and `created_at` / the token's actual creation signature timestamp. This is authoritative for SPL token creation dates.

Fallback: if DAS doesn't return a creation date, fetch `/v0/addresses/${tokenMint}/transactions?type=TOKEN_MINT&limit=50` and take the **oldest** transaction (last item) instead of the newest.

### Part 2: Add Hard Absolute Age Cap

Add a `MAX_ABSOLUTE_MINT_AGE_HOURS = 168` (7 days) constant that acts as an absolute ceiling regardless of any other config. Even if `verifyMintTimestamp` somehow returns a wrong value, no token older than 7 days can trigger an alert.

### Part 3: Index Old Tokens Without Alerting

When a legitimately old token is discovered through a wallet family scan, it should still be:
- Registered in `developer_tokens` / mesh for genealogy tracking
- Logged as `mint_discovered_old` in the decision log

But it must **not**:
- Create an `allstar_mint_alerts` record
- Send Telegram/email notifications
- Trigger admin notifications

This means splitting the current `auditAllstarFamily` flow: discovered tokens that fail the age check get indexed silently into the mesh, while only truly fresh tokens proceed to `createAllstarAlert`.

### Files Changed

1. **`supabase/functions/allstar-mint-auditor/index.ts`**
   - Replace `verifyMintTimestamp` with DAS-based approach + oldest-tx fallback
   - Add `MAX_ABSOLUTE_MINT_AGE_HOURS = 168` hard cap at line 310
   - After the age skip on line 311, add silent mesh indexing (insert into `developer_tokens` if not exists, log decision as `mint_discovered_old`)
   - Update the skip log to clearly indicate "old token indexed to mesh, no alert"

### Summary

The system will still discover and catalog old tokens from wallet families (valuable for the mesh), but will never fire alerts for anything older than 7 days. The true creation date will be verified via DAS rather than the broken "most recent TOKEN_MINT tx" approach.

