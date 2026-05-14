## Goal
Add a new **TL;DR** variant alongside the existing 75% / 50% / 25% / Breadcrumb tabs. Each article gets a 2–3 sentence TL;DR snippet stored in `intel_briefing_variants`. Provide a one-click backfill for the existing catalog.

## Storage decision
Reuse the existing `intel_briefing_variants` table — just add `depth = 1` as the TL;DR sentinel (kept distinct from `0` = Breadcrumb teaser-with-link).

```text
depth =  75 → 75% Substantial
depth =  50 → 50% Condensed
depth =  25 → 25% Teaser
depth =   1 → TL;DR snippet  ← NEW (no backlink, 2–3 sentences, ~300 chars)
depth =   0 → Breadcrumb (X/TG teaser w/ link)
```

## Changes

### 1. DB migration
- Drop + recreate `intel_briefing_variants_depth_check` to allow `depth IN (0, 1, 25, 50, 75)`.

### 2. `VariantEditorTab.tsx`
- Extend `buildInstruction()` with a `depth === 1` branch:
  > "Write a 2–3 sentence TL;DR (~300 chars max) summarizing the article's core thesis. No hashtags, no link, no preamble. Plain prose. Output only the snippet."

### 3. `IntelBriefingsManager.tsx`
- Add `TabsTrigger value="vtldr"` ("📝 TL;DR (n)") + matching `TabsContent` rendering `<VariantEditorTab depth={1} label="TL;DR" platform="Snippet / summary" badgeColor="bg-emerald-500/20 text-emerald-400" />`.
- Add `wtldr = variantWc(1)` for the count badge.
- Bump the variant-completeness column to `n/5` (TL;DR + 75/50/25/breadcrumb).

### 4. `ContentCondenser.tsx`
- Add `{ depth: 1, label: 'TL;DR', platform: 'Snippet / summary', color: 'bg-emerald-500/20 text-emerald-400' }` to `DEPTH_CONFIG`.
- Add the `depth === 1` branch in `handleGenerate()` with the same TL;DR instruction.
- Add a **"Backfill TL;DR (N missing)"** button at the top: scans all published briefings without a `depth = 1` variant and calls `condense-article` sequentially with a small delay between calls, writing each result back via the existing save mutation. Shows progress toast (`x / N done`).

### 5. No public-article display change
TL;DR is generated and stored only — public rendering on `IntelBriefingArticle` is left untouched (out of scope unless you want it shown above the article body).

## Out of scope
- Auto-generation on article publish (going-forward path is just "the tab is there to click Generate"). If you want truly automatic on publish, say the word and I'll add a trigger/hook.
- Showing TL;DR on the public article page.

Awaiting **Plan Approved**.