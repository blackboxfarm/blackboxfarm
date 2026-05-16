# Backfill Review — Side-by-Side Card Comparison

## Problem
Current Backfill Review shows a confusing field-level diff table. You want to **see** what changes — full @HoldersIntel card rendered twice (Before / After) so you can eyeball it like a real post.

## What I'll build

Replace the existing `BackfillReview.tsx` queue UI with a **batch reviewer** that pulls the next **5 pending proposals** and shows each as:

```text
┌──────────────── Proposal 1 of 5 ────────────────┐
│  1a — BEFORE (current archive)                   │
│  [full HoldersIntelTweetCard rendered]           │
│                                                  │
│  1b — AFTER (TG-parsed)                          │
│  [full HoldersIntelTweetCard rendered]           │
│                                                  │
│  Changed fields: real_holders, dust_pct, grade   │
│  [✅ Approve]  [❌ Reject]                       │
│  Feedback: [______________________________]      │
└──────────────────────────────────────────────────┘
```

Stacked vertically — 5 of these per page. Sticky header shows progress (`2/5 reviewed`) and a final **Apply Approved** button.

## Technical details

1. **`BackfillReview.tsx`** — rewrite:
   - Fetch `holders_intel_backfill_proposals` where `status='pending'` limit 5, order oldest first
   - For each row, build two `ArchiveRow` objects (before from `before_json`, after = before merged with `after_json`) and render `<HoldersIntelTweetCard row={...} />` twice side-by-side (md:grid-cols-2, stacks on mobile)
   - Auto-compute `changed_fields` list (highlighted chip row between cards)
   - Per-card actions: Approve (status='accepted'), Reject (status='rejected', optional `reviewer_feedback` text)
   - Bottom bar: "Apply N Approved to Archive" (calls existing apply path), "Load Next 5", counts of accepted/rejected/pending in current batch

2. **Migration** — add `reviewer_feedback text` column to `holders_intel_backfill_proposals` so rejection reasons feed back into parser tuning.

3. **No changes** to the edge function, parser, or archive write path — only the review UX.

## Out of scope
- Parser improvements (separate pass after we see what users reject)
- Bulk-accept-all (kept but de-emphasized; per-item is the point)

Reply **Plan Approved** to proceed.
