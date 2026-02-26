

# Master Spider: Multi-Input Actor Submission

## Problem
Currently there's a single text input that tries to guess what you typed. You want to submit everything you know about an actor at once -- their dev wallet, their token mint, AND their X handle -- and have the spider connect all three as one entity, then spider the entire family tree.

## Changes

### 1. UI Overhaul (OracleMasterSpider.tsx)

Replace the single input field with 3 dedicated labeled inputs:

- **Dev Wallet Address** -- optional, Solana wallet (monospace, validated 32-44 chars)
- **Minted Token Address** -- optional, token mint address (monospace, validated 32-44 chars)  
- **X Account** -- optional, accepts `@handle` or full `https://x.com/handle` URL (auto-extracts handle)

At least ONE field must be filled. The BAD ACTOR / GOOD ACTOR selector and reason textarea stay as they are.

The submit button label stays dynamic: SPIDER / SPIDER & BLACKLIST / SPIDER & WHITELIST.

### 2. Edge Function Update (oracle-master-spider/index.ts)

Update the function to accept a structured multi-input payload:

```text
{
  devWallet?: string,
  tokenMint?: string,  
  xAccount?: string,
  forceVerdict?: 'red' | 'green',
  reason?: string,
  // Keep backward compat with single 'query' field
  query?: string
}
```

Processing logic:

- **Parse X input**: Extract handle from URL or `@handle` format
- **Resolve all three simultaneously**: Look up token mint for creator wallet, validate dev wallet, resolve X handle
- **Cross-link all inputs**: If you provide a wallet + token + handle, all three get linked in `reputation_mesh` as a single actor entity
- **Spider from the wallet**: Use the dev wallet (or resolved wallet from token) as the anchor for genealogy tracing, token discovery, and social discovery
- **Store the X handle**: Always store the X handle in both `reputation_mesh` (linked to the wallet) and in the blacklist/whitelist entry
- **Rate limiting**: Add 200ms delays between Helius RPC calls and batch DB operations to avoid hammering APIs

### 3. Mesh Linking Logic

When all 3 inputs are provided, the function creates these mesh relationships:

```text
wallet --[created]--> token
wallet --[operates]--> @handle
@handle --[token_social]--> token
```

Plus all the existing genealogy, satellite, community admin/mod links. This ensures that querying ANY of the three in future returns the full connected entity.

## Technical Details

**Files to modify:**
- `src/components/admin/oracle/OracleMasterSpider.tsx` -- Replace single input with 3 fields, update mutation payload
- `supabase/functions/oracle-master-spider/index.ts` -- Accept multi-input, cross-link all inputs, add rate limiting delays

**Backward compatibility:** The `query` field still works for single-input lookups (auto-detect mode). The new fields take priority when provided.

