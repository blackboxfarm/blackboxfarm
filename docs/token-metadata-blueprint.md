# Blueprint for Fetching Complete SPL Token Metadata (Image & Description)

This document explains why image/description fields are sometimes missing when fetching token info, and provides clear, optional instruction paths that a system like **lovable.dev** can follow to reliably resolve metadata.

---

## Core Insight

* SPL Token accounts (Token Program / Tokenkeg) only expose **on-chain fields**: supply, decimals, authorities.
* **Image** and **description** are **not on-chain**. They live in **off-chain JSON** referenced by the **Metaplex Metadata PDA**.
* To access them, you must:

  1. Resolve the **Metaplex Metadata PDA** for the mint.
  2. Read the PDA → extract the `uri`.
  3. **HTTP GET** that `uri` → parse `image` / `description`.

If you skip steps (2) or (3), you won't see those fields.

---

## Option 1: Use Helius Enhanced APIs (Simplest)

### Request:

```http
POST https://api.helius.xyz/v0/tokens/metadata?api-key=YOUR_KEY
Content-Type: application/json

{
  "mintAccounts": ["GvkxeDmoghdjdrmMtc7EZQVobTgV7JiBLEkmPdVyBAGS"],
  "includeOffChain": true
}
```

### Response fields to use:

* `onChainMetadata.metadata.data.uri` → the JSON URL
* `offChainMetadata.metadata.image` → image URL
* `offChainMetadata.metadata.description` → description
* `onChainMetadata.metadata.data.name/symbol` → name/symbol

### Alternate endpoint:

```http
POST https://api.helius.xyz/v0/assets?api-key=YOUR_KEY
Content-Type: application/json

{
  "id": "GvkxeDmoghdjdrmMtc7EZQVobTgV7JiBLEkmPdVyBAGS",
  "options": { "showFungible": true, "includeOffChain": true }
}
```

---

## Option 2: Pure RPC Flow (Do-It-Yourself)

1. **Derive PDA**

```
PDA = findProgramAddress(
  ["metadata", METAPLEX_PROGRAM_ID, mint],
  METAPLEX_PROGRAM_ID
)
```

Where `METAPLEX_PROGRAM_ID = metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`.

2. **Read account info** → decode Metaplex Metadata struct.

   * Extract `data.uri` (trim nulls).

3. **HTTP GET** the `uri`. Expect schema like:

```json
{
  "name": "BAGLESS",
  "symbol": "BAGLESS",
  "description": "…",
  "image": "https://arweave.net/.../image.png"
}
```

If `description` or `image` are missing here, they simply don't exist.

---

## Option 3: Fallbacks When Metadata is Weak

* If the `uri` JSON lacks `description` or `image`, fallback to:

  * **Jupiter tokenlist / Birdeye / RugCheck / DexScreener** → usually provide `logoURI`.
* Expect only a `logoURI` (image), not a full description.

---

## Logic Flow (Recommended)

```pseudo
INPUT: mint address

STEP 1: Confirm this is a mint, not an ATA.

STEP 2: Try Helius /assets or /tokens/metadata with includeOffChain=true.
  IF success and fields found:
    RETURN {name, symbol, image, description}

STEP 3: If off-chain empty:
  Derive PDA → fetch URI → HTTP GET JSON.
  IF JSON has image/description:
    RETURN them.

STEP 4: If still missing:
  Query Jupiter tokenlist / Birdeye / Dexscreener.
  IF logoURI present:
    RETURN image = logoURI, description = null.

STEP 5: If all fail:
  RETURN only on-chain fields.
```

---

## Debug Checklist

* Always log the **uri** extracted from PDA.
* Show HTTP errors (403/404/timeout) instead of failing silently.
* If JSON parse fails, surface raw content for inspection.

---

## Notes for Agents (lovable.dev)

* **Do this if you want complete metadata:** use PDA → uri → JSON fetch.
* **Do this if you want a one-shot:** use Helius with `includeOffChain: true`.
* **Do this if you want fallbacks:** query tokenlists for `logoURI`.

---

**Conclusion:** The missing image/description isn't a bug in your agent—it's because you're not fetching the **off-chain JSON**. Implement one of these flows and you'll always know what metadata is truly available.