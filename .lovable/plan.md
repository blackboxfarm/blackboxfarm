## Goal

When a user searches an X handle (e.g. `@pumpfun711`), the schematic must render the full fan-out, with **resolved human labels everywhere**:

```text
                @pumpfun711
                /    |    \
        Comm A   Comm B   Comm C        (named, e.g. "Unstable Unicorn")
        /  \      |       / | \
     $TKN $TKN  $TKN   $TKN $TKN $TKN   (tickers, not mint slugs)
        \  |     /       \  |  /
           Dev Wallet ── Dev Wallet     (convergence)
                \         /
                 KYC Root (CEX)
```

DB confirms `@pumpfun711` admins **3 communities** (1 nameless + "Unstable Unicorn" 3 tokens + "Great Auto Income Now" 6 tokens) with 10 tokens total — but the schematic currently shows only 1 community + 1 token + a "funded_rejected_dev" badge sitting on the dev card.

## Root causes

1. **Reverse community lookup writes to DB but the in-memory `allLinks` for the current render never gets those rows** — they only appear on the next page load. Need to also push the upserted links into `allLinks` so the first render is complete.
2. **`pruneToHandleChain` Hop 3 requires `wallet.isDev === true`**, but dev-wallet flagging only happens when a `created`/`created_by` link exists in the fetched batch. With 10 tokens the 2-hop budget (capped at 20 entities) is exhausted before dev wallets get queried, so they're absent — Hop 3 finds nothing and the chain truncates.
3. **Token tickers and community names render as `$` / `Community #202216`** because:
   - `resolve-labels` only reads `token_metadata` / `x_communities.name` — the nameless community has `name = null` and many tokens aren't in `token_metadata`. Need fallbacks: `token_lifecycle.symbol`, `dexscreener_cache.symbol`, and pump.fun mint suffix → enqueue resolver.
4. **Edge labels for non-chain relationships (`funded_rejected_dev`, `linked_to_dev`, `promotes_token`) leak into the schematic** when both endpoints survive pruning, dropping their badge on top of nearby cards. Already partially fixed last turn — extend the allowed-pair filter to also drop label text for any edge whose relationship doesn't match the chain semantics (admin/mod/created/community_for/funded/same_kyc_root).

## Changes

### `src/hooks/useMeshGraph.ts`
- After the reverse-community-lookup `upsert`, **push the same link rows into `allLinks`** (mapped to the `reputation_mesh` shape) so the first render has them — no second page load required.
- Same treatment for the `x_community` focus branch (lines 268-340).
- Bump the 2-hop cap from 20 → 60 **only when the centerpiece is `x_account`/`x_user`** so all token→dev edges get fetched.
- Add a third-hop fetch for any wallet node that doesn't yet have a `created`/`created_by` neighbor — this guarantees `isDev` flagging before the schematic prunes.

### `supabase/functions/resolve-labels/index.ts`
- Token name fallback chain: `token_metadata.symbol` → `token_lifecycle.symbol` → `dexscreener_cache.symbol`. Return whichever resolves first.
- Community name fallback: if `x_communities.name` is null, return `name_history[-1].name` if present; else leave null and let the client show `Community #<6-char-id>` as today.

### `src/components/bubble-map/BubbleMapSchematic.tsx`
- Tighten the edge filter so only chain-semantic relationships render labels: `community_admin`/`admin_of`, `community_mod`/`mod_of`, `community_for`/`linked_token`, `created`/`created_by`, `funded`/`funded_by`, `same_kyc_root`. All other edges between kept nodes get dropped (no label, no line) to prevent badge collisions on cards.
- Token card label: if ticker is still missing after `resolve-labels`, show the **last 4 chars of the mint suffix** (e.g. `pump`, `bonk`) as a temporary label instead of bare `$`, plus the spinner.

### Verification
1. Search `@pumpfun711` in schematic view — expect 3 community cards (one with `Community #202216` fallback, two with real names), each fanning to its tokens with tickers, all token edges meeting at the dev wallet(s), with KYC root above when present.
2. Confirm no `funded_rejected_dev` / `linked_to_dev` text overlaps any card.
3. Confirm a fresh handle (no prior reverse-lookup) renders fully on first paint, not after refresh.
