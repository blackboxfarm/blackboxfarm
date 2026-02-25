

# FlipIt Blacklist Mesh Guard - Instant Warning on Token Entry

## Problem

When you manually enter a token address in FlipIt, the blacklist check only runs **after** background metadata loads (could be 2-5 seconds later). During that window, the "FLIP IT" button is already active and clickable. Worse, the check **never queries the `reputation_mesh` table**, so even if a dev wallet is linked through a funding chain (KYC root, intermediary, satellite), FlipIt has no idea.

The `blacklist_mesh_match` enforcement only exists in the **automated pipeline** (pumpfun token enricher) -- it was never wired into the manual FlipIt entry flow.

## Solution

### 1. Immediate Token Mint Blacklist Check (parallel with price fetch)

Move the `pumpfun_blacklist` check for the **token mint itself** to run in **parallel** with the Helius price fetch (Step 1), not after metadata. This gives an instant warning for any directly blacklisted token -- no need to wait for creator wallet info.

### 2. Add Reputation Mesh Check

Extend `checkBlacklistStatus` to also query `reputation_mesh` for:
- The token mint (check if it's linked to a known scammer)
- The creator wallet (check if it's `directly_funded` or `indirectly_funded` by a blacklisted root)
- Any wallet in the funding chain that has `trust_level = 'scammer'` in `dev_wallet_reputation`

### 3. Block "FLIP IT" Button While Checking

Disable the FLIP IT button while the blacklist check is in progress (show a small shield/scanning indicator). Once the check completes:
- If blacklisted: Show a red warning banner and keep the button disabled (or require explicit override)
- If mesh-linked to scammer: Show an orange warning with the chain explanation
- If clean/whitelisted: Enable normally

## Technical Changes

### File: `src/components/admin/FlipItDashboard.tsx`

**Change 1: Split blacklist check into fast (token-only) and deep (creator + mesh)**

In `fetchInputTokenData`, add an immediate blacklist check for the token mint alongside the Helius price call:

```text
STEP 1 (parallel):
  [A] Helius fast-price fetch (existing)
  [B] Quick blacklist check: pumpfun_blacklist WHERE identifier = tokenMint (NEW)

STEP 4 (background, existing):
  Full metadata fetch -> then deep blacklist check with creator wallet + mesh
```

**Change 2: Add reputation_mesh query to `checkBlacklistStatus`**

After checking `pumpfun_blacklist`, `dev_teams`, etc., add:

```
- Query reputation_mesh WHERE source_id = creatorWallet AND trust_level-related links
- Query dev_wallet_reputation WHERE wallet_address = creatorWallet for scammer/serial_rugger status
- If creator is funded by a blacklisted KYC root, surface that as a warning
```

**Change 3: Disable FLIP IT button during blacklist check**

Add `isCheckingBlacklist` to the FLIP IT button's disabled condition so it can't be clicked until the fast check completes.

### Estimated Impact
- Fast check adds ~50-100ms (single Supabase query, runs in parallel with price)
- Deep mesh check adds ~200-300ms (runs in background, same as now)
- Zero added latency to price display -- price still shows instantly
- Any blacklisted token mint is caught before the user can click buy

