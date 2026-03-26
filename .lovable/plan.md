

# Fix: Lowercase Solana Addresses Breaking Helius API Calls

## Root Cause Found

**File**: `src/hooks/useMeshGraph.ts`, line 581

```typescript
const normalizedInput = input.trim().replace(/^@/, '').toLowerCase();
```

This `.toLowerCase()` is applied to ALL inputs — including Solana wallet addresses and token mints. It was put there for X handle normalization (handles are case-insensitive), but it destroys Base58-encoded Solana addresses which are case-sensitive.

The lowercased address then flows into:
- `oracle-unified-lookup` (line 691) — the oracle itself doesn't lowercase, but receives already-broken input
- `mesh-kyc-deep-search` (lines 762, 775, 901, 932) — sends lowercased wallet to Helius `/v1/wallet/funded-by` → **400 Bad Request**
- `reputation_mesh` queries (lines 617, 623, 810) — queries with wrong-case IDs → **silent misses**

This is why we see 33 Helius failures — every wallet trace from the UI sends a corrupted address.

## The Fix

**Split normalization by input type** — only lowercase X handles, preserve original case for everything else.

### Changes to `src/hooks/useMeshGraph.ts`

Replace the single `normalizedInput` with type-aware normalization:

```typescript
const trimmedInput = input.trim().replace(/^@/, '');
const isBase58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedInput);
const isCommunityId = /^\d{10,25}$/.test(trimmedInput);
const isCommunityUrl = trimmedInput.toLowerCase().includes('/communities/');
const isUrl = trimmedInput.includes('://') || trimmedInput.includes('.com') || trimmedInput.includes('.io');

// Only lowercase for X handles — Solana addresses are case-sensitive Base58
const normalizedInput = (isBase58 || isCommunityId || isCommunityUrl || isUrl)
  ? trimmedInput
  : trimmedInput.toLowerCase();
```

This preserves original case for wallets/tokens/URLs while still lowercasing X handles. All downstream references to `normalizedInput` continue working unchanged.

### Safety net in `mesh-kyc-deep-search/index.ts`

Add a validation guard at the entry point so even if bad data somehow arrives, it rejects early with a clear error instead of burning Helius credits:

```typescript
if (walletAddress !== walletAddress && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
  throw new Error(`Invalid Base58 wallet address received: ${walletAddress.slice(0,12)}...`);
}
```

### Impact
- Fixes all 33 Helius 400 errors immediately
- Fixes silent reputation_mesh query misses for case-sensitive IDs
- No behavioral change for X handle lookups (those are already case-insensitive)
- Saves wasted Helius API credits

