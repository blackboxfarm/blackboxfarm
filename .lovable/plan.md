
## Plan: Linked-Sell Groups for Same-Token Batch Positions

### Concept
Add a **"link" icon** next to the existing Lock icon in the Rating column. Clicking it on 2+ positions of the **same token mint** chains them into a sell-group. When **Sell Now** is hit on any group member, **all linked positions sell together as one combined order**.

### Mechanics
- **Group key**: a shared `sell_group_id` (UUID) on `flip_positions`. First click on a position → creates a new group with just itself. Click on a second same-mint position → joins the same group. Click on a linked position again → leaves the group (and group is auto-deleted if it drops below 2 members).
- **Visual**: 
  - Unlinked → outline link icon
  - Linked → filled cyan link icon with a small badge showing group size (e.g. "2", "3")
  - All members of the same group share a subtle cyan left-border on the row so user can visually see the chain
- **Guardrail**: link icon is disabled (greyed) on positions whose `token_mint` doesn't match any other holding position. Tooltip: "Need 2+ positions of the same token to link."
- **Sell behavior**: 
  - "Sell Now" on a linked position sells **every position in the group** (sequentially, same slippage/priority-fee settings)
  - Each individual position closes with its own PnL row in Completed Flips (no merging of history — keeps audit trail clean)
  - Toast: "Sold 3 linked positions of $coin.ai"

### Schema change
One column on `flip_positions`:
- `sell_group_id UUID NULL` — null = unlinked. Non-null UUID = member of that group.
- Index on `(sell_group_id)` for fast group lookups.

No separate `sell_groups` table needed — the UUID itself is the group identity. Cheaper, simpler.

### Files touched
1. **Migration**: add `sell_group_id` column + index to `flip_positions`
2. **`FlipItDashboard.tsx`**:
   - Add `Link2` icon import
   - Add `handleToggleSellGroup(position)` — creates/joins/leaves group with same-mint validation
   - Modify `handleForceSell` — if `position.sell_group_id`, fetch all group members and sell each one in sequence
   - Render link icon next to the Lock icon (cyan when grouped, with member-count badge)
   - Add subtle border-l-2 border-cyan-500/40 on rows where `sell_group_id` is set
3. **`FlipPosition` interface**: add `sell_group_id: string | null`

### What's NOT included (confirm if needed)
- Linking across **different tokens** — explicitly blocked, doesn't make trading sense
- Combining linked sells into a **single Jupiter swap transaction** — would require a custom multi-input swap builder. v1 fires sequential sells (still atomic per-position, just back-to-back). Tell me if you want true single-tx batching later.
- Auto-linking by heuristic (e.g. "same token bought within 5min") — manual click only

**Tap "Plan Approved" to build it.**
