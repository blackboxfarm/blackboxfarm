## Goal

When a user enters an X **handle** into the bubblemap, render a purpose-built "handle-rooted" schematic that reads left→right exactly the way you described — Handle → Communities (with role badge on the edge) → $TICKER → Dev Wallet — and visualizes recycled communities as ghost-stack snapshots.

This replaces the current generic schematic for handle inputs only. Token / wallet / community inputs keep the existing schematic.

---

## Layer order (top → bottom, dagre LR)

```
[ @handle ]
    │ (role icon: 👑 Creator · 🛡 Admin · 🔧 Mod · 👤 Member)
    ▼
[ X Community: "Readable Name" ]   ← if recycled, show ghost stack:
    │                                  ┌──────────┐
    │                                  │ Ghost 3/3│  prior name + member count + last seen
    │                                  ├──────────┤
    │                                  │ Ghost 2/3│  prior $TICKER + timestamp
    │                                  └──────────┘
    ▼
[ $TICKER ]   ← the token this community was created for
    │
    ▼
[ Dev Wallet ]  (gold diamond, links upward to KYC root if known)
```

## Part 1 — Input routing

`PublicBubbleMap.handleSearch` already classifies via `inputClassifier.ts`. When `kind === 'handle'`, pass a new prop `centerpiece="handle"` + `centerpieceId` to `BubbleMapSchematic`. Schematic switches to the handle-rooted layout builder.

## Part 2 — Data: role-on-edge

Roles (Creator/Admin/Mod/Member) live in `x_community_members` (or equivalent — confirmed by `x-handle-resolver`). The mesh hook already pulls handle→community links; we extend the link payload with `role` so the schematic can render a role badge.

**Edits:**
- `useMeshGraph` (or wherever handle→community links are built) — include `role: 'creator'|'admin'|'mod'|'member'` on each `handle→x_community` link.
- `BubbleMapSchematic` edge renderer — when `relationship === 'member_of'` (or similar), render the role icon as the edge label with a small chip.

## Part 3 — Recycled community ghost stack

For every `x_community` node where `recycled_count > 1`:
- Render the **current** node as the visible card.
- Render `recycled_count - 1` smaller, dimmer "ghost" cards offset by 6px x/y behind it (pure CSS in the node renderer — no extra graph nodes, so layout stays clean).
- Each ghost shows one prior snapshot from `x_communities.name_history` (added in the recycle-events migration): `{prev_name} · {member_count_at_time} · {last_seen} · prior $TICKER`.
- Hover the stack → tooltip with full snapshot list.

**Data source:** `resolve-labels` edge function already returns `recycled_count`. Extend its output to also return `name_history` snapshots (capped at 4) for any community with `recycled_count > 1`.

## Part 4 — Community → $TICKER → Dev Wallet chain

Already in the graph for the most part. Make sure for handle-rooted view we:
- Drop unrelated branches (other dev wallets, KYC roots not in the chain) unless `mode === 'branches'`.
- New helper `pruneToHandleChain(graphData, handleId)` mirrors `pruneToTokenAndSocials` but rooted on the handle: keep handle, all its communities, the tokens those communities point to, and the dev wallets that minted those tokens. KYC roots optional via existing `mode` toggle.

## Part 5 — Files touched

**Edited**
- `src/components/bubble-map/BubbleMapSchematic.tsx` — accept `centerpiece` prop, add `pruneToHandleChain`, role-icon edge labels, ghost-stack node renderer for recycled communities.
- `src/components/bubble-map/PublicBubbleMap.tsx` — pass `centerpiece="handle"` when input classifies as handle.
- `src/hooks/useMeshGraph.ts` — ensure handle→community link carries `role`.
- `supabase/functions/resolve-labels/index.ts` — return `name_history` snapshots for recycled communities.

**No new tables, no new cron, no migrations.**

## Part 6 — Acceptance

1. Submit `@somehandle` → bubblemap auto-switches to schematic with handle as the topmost node.
2. Each edge from handle to community shows a role icon (Creator/Admin/Mod/Member) within 1s.
3. Communities show readable names (existing `resolve-labels` flow).
4. A community recycled across 3 tokens renders with 2 ghost cards behind it, each showing a prior `$TICKER` + member count + timestamp.
5. Each community has exactly one downstream `$TICKER`, which has exactly one downstream Dev Wallet.
6. No regression for token / wallet / community inputs — they keep their existing centerpiece.

---

**Awaiting "Plan Approved" before I touch any files.**
