## Goal

When a user enters an X handle into the bubblemap, render a tight, handle-rooted lineage that reads:

```
@handle  (with ghost stack if the handle was rotated)
   │ role badge (Creator / Admin / Mod / Member)
   ▼
X Community  ·  X Community  ·  X Community
(recycled IDs render as ghost-stacked cards: same ID counted twice = 1 card with 1 ghost behind, distinct IDs render side by side)
   │
   ▼
$TICKER per community
   │
   ▼
Dev Wallet  (convergence point — multiple tokens collapse onto the same dev)
   │
   ▼
KYC Root
```

No other branches, no orphan wallets, no token siblings, no extra socials. The handle is the only root.

---

## Why @pumpfun711 currently blows up

Confirmed from DB:
- 18 rows in `token_social_links.extracted_handle = pumpfun711`
- 3 communities where `pumpfun711 ∈ admin_usernames`
- 0 communities where `pumpfun711 ∈ moderator_usernames`
- 2 hits inside `member_sample`

So the data IS there. The render fails for two independent reasons:

1. **Centerpiece ID mismatch.** `PublicBubbleMap` calls `focusOnEntity('pumpfun711', 'x_account')` and passes `centerpieceId={focusedEntity?.id}` (= the bare handle), but graph nodes are minted as `x_account:pumpfun711`. `pruneToHandleChain` looks up `handleNode` by `n.id === centerpieceId || (n.fullId || '').endsWith(':' + centerpieceId)`. When the lookup misses, the function early-returns the full graph — that's the 56-node mess. We need to canonicalize the handle id (lowercase, strip `@`, strip `x_account:` prefix) on both sides before matching.

2. **Community discovery is too narrow.** `useMeshGraph`'s reverse lookup only matches `admin_usernames`/`moderator_usernames` arrays. It misses:
   - communities whose tokens reference the handle via `token_social_links.extracted_handle` (the 18-token signal)
   - communities discovered via `member_sample`
   - the seed `x_account` node itself if the handle has no existing mesh links yet
  
  Result: the handle node gets dropped or stranded, prune fails, fallback floods the canvas with the 18 tokens × their wallets.

---

## Plan

### Part 1 — Fix the handle centerpiece resolution (frontend only)

`src/components/bubble-map/BubbleMapSchematic.tsx`
- Add `canonicalHandleId(raw)` → strips `@`, lowercases, strips `x_account:` prefix.
- In the `centerpiece === 'handle'` branch, find the handle node by:
  1. `n.type === 'x_account'` AND `canonicalHandleId(n.id) === canonicalHandleId(centerpieceId)`
  2. fallback: `canonicalHandleId(n.label) === canonicalHandleId(centerpieceId)`
- If no handle node exists in `graphData`, **synthesize one** locally (id = `x_account:<handle>`, type `x_account`) so the prune always has a root and the user sees at minimum "@handle (no communities yet)".
- Tighten `pruneToHandleChain`:
  - Hop 1: only `x_community` neighbors of the handle.
  - Hop 2: only `token` neighbors of those communities.
  - Hop 3: only `wallet` nodes flagged `isDev`/`is_dev` neighbors of those tokens — drop the `|| true` bug that currently keeps every wallet.
  - Hop 4: only `kyc_root` neighbors of the dev wallets.
  - Drop everything else, including stray `x_account` siblings and other-token holders.

### Part 2 — Make sure communities are actually fetched for a handle (frontend)

`src/hooks/useMeshGraph.ts` reverse-lookup block (lines ~172–234):
- Keep the existing `admin_usernames` / `moderator_usernames` lookup.
- Add a second pass: pull `token_social_links` rows where `lower(extracted_handle) = handle`, collect their `mint` set, then `select community_id, name, linked_token_mints from x_communities where linked_token_mints && <mints>`.
- Add a third pass: `member_sample` text contains the handle (optional, behind a small `limit 25` to keep it cheap).
- For every community discovered, upsert the same `handle → community` and `community → token` links into `reputation_mesh` so they persist for next time.
- Always seed an `x_account` node for the searched handle into the returned graph even when zero communities are found, so the schematic root always renders.

### Part 3 — Recycled-ID rendering for communities and handle

Already partially in place via `recycled_band` + `name_history`. Extend:

**Communities**
- Group rendered communities by `community_id`. If the same `community_id` appears more than once across the chain (because the mesh has multiple `community_for` rows pointing at distinct tokens), render a single card with `n - 1` ghost cards behind it. Ghost tooltip lines: `prev $TICKER · member_count_at_time · last_seen`. Source: `name_history` from `resolve-labels`.
- If two communities share the same ID, the layout still shows two columns but each is the stacked card — that matches the user's "3 communities, 3 names, 2 IDs" example.

**Handle**
- Read `x_account_registry.handle_history` via `resolve-labels` (extend the function to accept `handles: string[]` and return `{ display_name, handle_history, name_history }`).
- If `handle_history.length > 0`, render the handle node with the same ghost-stack treatment, tooltip listing each prior `@handle` + first/last seen.

### Part 4 — Role badge on the handle→community edge

Edge already carries `relationship` (`community_admin` / `community_mod` / `community_creator` / `member_of`). Schematic edge renderer maps it via `ROLE_BADGE` (already defined). Verify the edge label component renders the icon + chip; if `role` is missing, infer from the upserted relationship string.

### Part 5 — `resolve-labels` edge function additions

`supabase/functions/resolve-labels/index.ts`
- New input field: `handles: string[]`.
- New output field: `handles: { [handle]: { display_name, handle_history, is_rotated } }`.
- Read from `x_account_registry` keyed on `current_handle` (lowercased). Cap `handle_history` to 4 entries like communities.

### Part 6 — Files touched

Edited
- `src/components/bubble-map/BubbleMapSchematic.tsx` — canonical id matching, tighter prune, ghost stack for handle and for repeated community IDs.
- `src/hooks/useMeshGraph.ts` — broaden handle→community discovery (token_social_links + member_sample), always seed handle node.
- `supabase/functions/resolve-labels/index.ts` — return handle history.
- `src/components/bubble-map/PublicBubbleMap.tsx` — pass canonical handle (no `@`, no `x_account:` prefix) as `centerpieceId`; ensure `centerpiece="handle"` is set whenever `classified.kind === 'handle'`.

No migrations, no new tables, no new cron.

### Part 7 — Acceptance

1. Submit `@pumpfun711` → schematic shows the handle as the single root with the 3 admin communities directly below, plus any additional communities discovered via the 18 linked tokens.
2. Each handle→community edge shows the correct role badge (Admin for the 3, Member/Mod where applicable).
3. If any community ID repeats in the chain, it renders as a single card with ghost cards behind it; hover shows the prior $TICKERs and member counts.
4. If `@pumpfun711` itself has handle history, the handle node shows ghost cards with prior `@handles`.
5. Each community has at most one downstream `$TICKER`; each `$TICKER` has exactly one downstream dev wallet; multiple tokens that share a dev wallet visibly converge on that single wallet node.
6. Total node count for the `@pumpfun711` view drops from 56 to roughly: 1 handle + ≤ N communities + ≤ N tokens + ≤ M dev wallets + ≤ K KYC roots — no orphan wallets, no unrelated socials.
7. Token, wallet, and community searches keep their existing schematic behavior — no regression.

---

**Awaiting "Plan Approved" before I touch any files.**