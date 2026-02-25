

# Creator Wallet Data Integrity: Full Audit and Remediation Plan

## Decisions Made
1. **Audit first** before bulk re-link
2. **Small batches over time** (100 tokens every 5 minutes via cron)
3. **Delete ghost profiles entirely**
4. **Auto-remove blacklist entries** if proven wrong

## Phase 1: Stop the Bleeding ✅ DONE

### 1a. `solscan-creator-lookup` — FIXED
- Pump.fun tokens now use pump.fun API as primary source
- Mint authority fallback only used for non-pump tokens
- No more program addresses stored as creator wallets

### 1b. `token-metadata` fallback — FIXED
- `fetchMintAuthorityFallback` now skipped for pump.fun tokens
- Only non-pump tokens (Raydium direct launches, etc.) use mint authority fallback

### 1c. `enrich-scraped-tokens` — FIXED
- Pump.fun tokens now call pump.fun API directly
- Non-pump tokens still route through `solscan-creator-lookup`

## Phase 2: Audit the Damage ✅ FUNCTION BUILT — NEEDS RUNNING

### `audit-creator-integrity` edge function
- Queries pump.fun tokens from `scraped_tokens`, `token_lifecycle`, or `developer_tokens`
- Calls pump.fun API for each and compares stored vs real creator
- Reports contamination rate and sample mismatches
- Call with: `{ "table": "scraped_tokens", "batchSize": 100, "offset": 0 }`

**Next step**: Run the audit function and review results before proceeding to Phase 3.

## Phase 3: Bulk Re-link — TODO (After Audit)

### `bulk-creator-relinker` edge function — NOT YET BUILT
- Process pump.fun tokens in batches of 100
- Update `scraped_tokens`, `token_lifecycle`, `developer_tokens`
- Delete ghost `developer_profiles`
- Auto-remove wrongly blacklisted wallets from `pumpfun_blacklist`
- Cron: 100 tokens every 5 minutes

## Phase 4: Verify — TODO (After Phase 3)
- Re-run audit function to confirm contamination drops to ~0%

## Files Modified
- `supabase/functions/solscan-creator-lookup/index.ts` — Pump.fun API as primary source
- `supabase/functions/token-metadata/index.ts` — Guarded mint authority fallback
- `supabase/functions/enrich-scraped-tokens/index.ts` — Direct pump.fun API for pump tokens
- **NEW**: `supabase/functions/audit-creator-integrity/index.ts` — Diagnostic function
