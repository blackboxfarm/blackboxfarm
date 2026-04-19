

## Answer first (no changes yet)

### Q1 — Does Graduation Sell work with a moonbag?
**Not wired yet.** The current evaluator calls `flipit-execute` with `action: "sell"` and **no `sellPercent`** — meaning it dumps **100% of the position** when triggered. The infrastructure for partial sells exists (`action: "partial_sell"` + `sellPercent` is already used by the scalp engine, and `flip_positions` already has `moon_bag_quantity_tokens`, `moon_bag_percent`, `scalp_stage`), but the graduation evaluator doesn't use any of it.

### Q2 — Can I link two 1-SOL entries into one position?
**No, not wired.** Each Flipit buy creates an independent row in `flip_positions`. There are no `parent_position_id`, `linked_position_id`, or `position_group_id` columns. Two 1-SOL buys on the same token are two separate positions with their own GRAD SELL settings, their own arming prices, and their own sell triggers.

---

## Plan to wire both

### Part A — Moonbag support for Graduation Sell

**DB migration** (3 columns on `flip_positions`):
- `graduation_sell_moonbag_pct` numeric default 0 — % of position to KEEP after grad sell fires (0 = sell all, 20 = keep 20% as moonbag)
- `graduation_sell_sold_pct` numeric — actual % sold (audit trail)
- `graduation_sell_moonbag_qty_tokens` numeric — token count retained

**Global default** on `flipit_settings`:
- `graduation_sell_moonbag_pct_default` numeric default 0

**Logic** — `_shared/graduation-sell-evaluator.ts`:
- Resolve `moonbagPct = pos.graduation_sell_moonbag_pct ?? settings.graduation_sell_moonbag_pct_default ?? 0`
- If `moonbagPct > 0`: invoke `action: "partial_sell"` with `sellPercent: 100 - moonbagPct`, then update position to `status: 'moonbag'` and record retained quantity
- If `moonbagPct === 0`: keep current full-sell behavior

**UI** — `GraduationSellControl.tsx` + `GraduationSellGlobalDefaults.tsx`:
- New "Moonbag %" input (0–50, default 0) with helper text: "Keep this % of tokens after grad sell fires for potential further upside"

### Part B — Link multiple positions on the same token

**DB migration** (1 column on `flip_positions`):
- `position_group_id` uuid nullable — positions sharing this ID are treated as one logical position

**UI — `FlipItDashboard.tsx`**:
- Detect when same `wallet_id + token_mint` has 2+ holding positions
- Show a "🔗 Link" button on those rows
- Clicking opens a small picker: "Link with: [other position dropdown]" → assigns same `position_group_id` to both
- Linked positions render as a single combined row in the table with summed quantity/cost basis, weighted-avg buy price, and **shared GRAD SELL settings** (settings stored on the lowest-id row in the group; UI edits propagate to all members)

**Logic — `graduation-sell-evaluator.ts`**:
- When evaluating, group positions by `position_group_id` (positions with NULL group_id stay independent)
- For a group: use the master row's settings, sum quantities, compute weighted-avg arming price
- When firing the sell: invoke `flipit-execute` once per member position with the same `sellPercent` (since each row is its own on-chain holding) — OR add a new `action: "sell_group"` to `flipit-execute` that loops internally

**Recommended approach**: keep it simple — sell each member sequentially in the evaluator (one transaction per position), then mark all as executed together. No changes to `flipit-execute` needed.

### Files
- 1 migration (4 columns total)
- `_shared/graduation-sell-evaluator.ts` — moonbag logic + group handling
- `flipit-unified-monitor/index.ts` — group-aware position fetching
- `GraduationSellControl.tsx` — moonbag % input
- `GraduationSellGlobalDefaults.tsx` — moonbag default
- `FlipItDashboard.tsx` — Link button + grouped row rendering

### Open question
For linked positions, do you want:
- **A:** Both positions share ONE GRAD SELL config (edit once, applies to both — simpler, what's described above)
- **B:** Each keeps its own GRAD SELL config but they execute together when ANY trigger fires (more flexible, more complex)

Default in plan is **A**.

