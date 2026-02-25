

# Creator Wallet Data Integrity: Full Audit and Remediation Plan

## The Problem (Recap)

The system has been storing **incorrect creator wallets** for pump.fun tokens across multiple database tables. This means the blacklist mesh, developer profiles, reputation scores, and rejection logic have all been operating on wrong data for potentially 50,000+ tokens.

## Root Cause: 3 Contamination Sources Found

### Source 1: `solscan-creator-lookup` (ACTIVE - Still broken)
- **File**: `supabase/functions/solscan-creator-lookup/index.ts` line 57
- **Code**: `data.creator || data.mint_authority || data.owner`
- **Problem**: Falls back to `mint_authority` when Solscan doesn't return a `creator` field. For pump.fun tokens, the mint authority is a **pump.fun program address**, NOT the human creator.
- **Called by**: `enrich-scraped-tokens` -- which runs on ALL newly scraped tokens. This is the **primary enrichment pipeline** and has been writing wrong creators into `scraped_tokens.creator_wallet` for every token it processes.

### Source 2: `token-metadata` mint authority fallback (ACTIVE - Still broken)
- **File**: `supabase/functions/token-metadata/index.ts` lines 240-267
- **Code**: `fetchMintAuthorityFallback()` returns `mintAuthority` or `freezeAuthority` as the "creator"
- **Problem**: Same issue -- mint authority is NOT the creator for pump.fun tokens. This fallback is used when the pump.fun API fails (HTTP 530, timeout, etc.)
- **Used when**: The pump.fun API call at line 700 fails, and DB lookups also miss. The system then grabs mint authority from on-chain data and stores it as `creator_wallet`.

### Source 3: `token-creator-linker` Helius fallback (FIXED in last session)
- **File**: `supabase/functions/token-creator-linker/index.ts`
- **Previously**: Grabbed fee payer from the most recent transaction instead of the oldest (creation) transaction.
- **Now**: Fixed to paginate to the oldest signature, and pump.fun API is used first.

## Contaminated Tables

| Table | Field | How it got dirty |
|-------|-------|-----------------|
| `scraped_tokens` | `creator_wallet` | `enrich-scraped-tokens` calls `solscan-creator-lookup` which returns mint authority |
| `token_lifecycle` | `creator_wallet` | Written by `token-creator-linker` (old broken Helius logic) |
| `developer_tokens` | `creator_wallet` | Written by `token-creator-linker` |
| `developer_profiles` | `master_wallet_address` | Created by `token-creator-linker` for wrong wallets |
| `pumpfun_watchlist` | `creator_wallet` | Populated from various enrichment pipelines |
| `dev_wallet_reputation` | `wallet_address` | Reputation scores assigned to wrong wallets |
| `reputation_mesh` | `source_id` / `linked_id` | Funding chain links built from wrong wallets |
| `pumpfun_blacklist` | `identifier` | Could contain wrong wallet addresses flagged as blacklisted |

## Downstream Logic That Uses Dirty Data

1. **`blacklist-mesh-guard.ts`** -- Resolves creator from `pumpfun_watchlist` and `token_lifecycle` (both dirty). May be blocking innocent wallets and passing real scammers.
2. **`pumpfun-reeval-watchlist`** -- Batch-checks creator wallets against blacklist. Wrong wallets = wrong rejections.
3. **`social-larp-detector`** -- Blacklists creator wallets when LARP is detected. If the wrong wallet was passed in, an innocent wallet gets blacklisted.
4. **`oracle-unified-lookup`** -- Builds dev intel reports from `developer_tokens` and `token_lifecycle`. Wrong creator = wrong dev profile shown.
5. **`developer-wallet-rescan`** / `offspring-mint-scanner` -- Scans for related tokens by creator wallet. Wrong wallet = missing or phantom token lists.

## What's Still Safe

- **`creator-api.ts`** (shared utility) -- Correctly uses `pumpData.creator` from pump.fun API. Any function using this shared utility got the right answer.
- **`flipit-execute`** -- Uses pump.fun API directly for metadata. Correct.
- **Trade execution** -- Trades are mint-based, not creator-based. No trades were affected.
- **Tokens processed AFTER the `token-creator-linker` fix** -- These got the correct creator.

---

## Remediation Plan

### Phase 1: Stop the Bleeding (Fix remaining broken sources)

**1a. Fix `solscan-creator-lookup`**
- For pump.fun tokens (detected by mint ending in `pump` or launchpad field), call the pump.fun API FIRST: `https://frontend-api.pump.fun/coins/{mint}`
- Only use Solscan as fallback for non-pump tokens
- Never return `mint_authority` as creator for pump.fun tokens

**1b. Fix `token-metadata` fallback**
- In `fetchMintAuthorityFallback`, add a guard: if the token is a pump.fun token, do NOT use mint authority as the creator
- Instead, call the pump.fun API as the authoritative source
- Keep mint authority fallback only for non-pump tokens (Raydium direct launches, etc.)

**1c. Fix `enrich-scraped-tokens`**
- Update the creator enrichment path to call pump.fun API directly for pump.fun tokens instead of routing through `solscan-creator-lookup`

### Phase 2: Audit the Damage

**2a. Build a diagnostic edge function (`audit-creator-integrity`)**
- Query all pump.fun tokens from `scraped_tokens`, `token_lifecycle`, `developer_tokens` where `creator_wallet` is set
- For a sample batch (e.g., 500 tokens), call the pump.fun API and compare the stored `creator_wallet` against the real `creator` field
- Report: how many match, how many mismatch, what the mismatched values look like
- This tells us the actual contamination rate before committing to a mass update

### Phase 3: Bulk Re-link (After Audit Confirms Scale)

**3a. Build `bulk-creator-relinker` edge function**
- Process pump.fun tokens in batches of 50-100 (pump.fun API rate limits)
- For each token: fetch real creator from pump.fun API
- If stored creator differs from real creator:
  - Update `scraped_tokens.creator_wallet`
  - Update `token_lifecycle.creator_wallet`
  - Update `developer_tokens.creator_wallet` and `developer_id`
  - Flag old ghost `developer_profiles` for cleanup
- Log all corrections for review

**3b. Clean ghost developer profiles**
- After re-linking, identify `developer_profiles` that no longer have any tokens pointing to them
- Mark them as `ghost_profile` or delete them
- Clean corresponding `dev_wallet_reputation` and `reputation_mesh` entries

**3c. Recalculate reputation scores**
- Trigger `calculate-developer-integrity` for all affected developers
- Rebuild `reputation_mesh` links for corrected wallets

### Phase 4: Verify

- Re-run the audit function to confirm contamination rate drops to near-zero
- Spot-check 10-20 known tokens manually against pump.fun to verify correct creator

---

## Questions That Were Skipped Last Time

These are the decisions needed before proceeding:

1. **Should we run the audit first** (Phase 2) to see how bad the damage actually is before doing the mass re-link? Or go straight to fixing everything?

2. **Rate limiting strategy**: The pump.fun API may rate-limit us if we hit it with 50,000 requests. Should we process in small batches over time (e.g., 100 tokens every 5 minutes via a cron), or do a single large batch run?

3. **Ghost profile handling**: When we find developer profiles built around wrong wallets, should we delete them entirely, or mark them as "ghost/invalid" and keep them for audit trail?

4. **Blacklist review**: Some wallets in `pumpfun_blacklist` may be innocent wallets that got blacklisted due to wrong creator attribution. Should we flag these for manual review, or auto-remove blacklist entries where the creator wallet was proven wrong?

## Files to Modify

- `supabase/functions/solscan-creator-lookup/index.ts` -- Add pump.fun API as primary source
- `supabase/functions/token-metadata/index.ts` -- Guard mint authority fallback for pump tokens
- `supabase/functions/enrich-scraped-tokens/index.ts` -- Use pump.fun API directly for pump tokens
- **NEW**: `supabase/functions/audit-creator-integrity/index.ts` -- Diagnostic function
- **NEW**: `supabase/functions/bulk-creator-relinker/index.ts` -- Mass correction function

