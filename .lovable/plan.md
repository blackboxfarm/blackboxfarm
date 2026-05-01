
## Two issues, one plan

---

### Part 1 — Autopsy "Re-generate" button (clarification)

**Good news: it didn't go anywhere.** The Re-generate button still lives on every draft row in `AllDrafts.tsx` (lines 287-330). It's just not on the sub-tab you're viewing in screenshot 3.

In your screenshot you're on **"Drafts (your reports)"** which shows the *current* draft for `$uncraft`. The Re-generate button appears on **each individual draft row** — visible when you scroll the row right, or when the row is in `analyzing v4` / `failed` / `approved` state. The button calls `autopsy-writer` with `regenerate: true`.

**Action:** I'll make the Re-generate button more prominent on the Drafts row so it's never missed — move it to the front of the action button cluster with a clear `🔄 Re-generate` label, and ensure it shows for every status (not just terminal ones).

No structural change needed — just visibility polish.

---

### Part 2 — Inline variant tabs in Intel Briefings editor

**You're 100% right and the plumbing is already half-built.** Here's what exists vs. what's missing:

**Already built:**
- `intel_briefing_variants` table (`briefing_id`, `depth`, `content_md`)
- `condense-article` edge function (uses Lovable AI Gateway / Gemini 3 Flash)
- `ContentCondenser.tsx` standalone "Repurpose" tab that handles 75/50/25%
- Publication form already tracks `is_breadcrumb` + `content_depth` for tracking exposure

**Missing — what this plan delivers:**
1. The variant tabs are NOT shown inline next to Edit/Preview in the article editor (you have to leave the editor and go to a different tab to see them).
2. **Breadcrumbs** is not yet a generatable depth variant (only 75/50/25 exist).
3. No "view this variant in the editor preview" affordance.

---

### The new editor tab strip

Replace the current 2-tab strip:

```text
[Edit] [Preview]                              [Import .md] [Insert Gallery] [Breadcrumbs] [Revisions]
```

With a 6-tab strip that maps directly to your publications model:

```text
[Edit ✏️] [Preview 👁️] | [100% Full] [75% Substantial] [50% Condensed] [25% Teaser] [🔗 Breadcrumb]
```

- **Edit** / **Preview** — unchanged (they always operate on the 100% master article).
- **100% Full** — read-only echo of the master `content_md` for parity (so the row looks complete).
- **75% / 50% / 25%** — each tab loads from `intel_briefing_variants` for that depth.
- **Breadcrumb** — new variant stored as `depth = 0` (a teaser/announcement <25% intended for X/Telegram-style posts that link back).

### Each variant tab (75/50/25/Breadcrumb) shows:

- A header strip: depth badge + suggested platforms (e.g. "Medium / Long-form")
- **Generate** button (when empty) → calls `condense-article` with the depth-specific instruction
- **Re-generate** button (when filled) → re-runs the AI on the master 100% article
- **Save** + **Copy** buttons
- A markdown textarea bound to the variant's `content_md`
- Last-updated timestamp + character count + % of master length (live calculated)
- A small **"Open in Preview"** button that swaps the Preview tab to render this variant instead of the 100% (so you can see it formatted before posting)

### Breadcrumb depth

Adds a 4th depth (`depth = 0`) with its own instruction:

> "Compose a 2-3 sentence teaser/breadcrumb post (max ~280 chars) suitable for Twitter/X or Telegram. Lead with the most provocative hook from the article. End with a link back to blackbox.farm/intel/briefing/{slug}. No hashtags unless they appear in the original."

### Repurpose tab (existing)

Stays as-is for the bulk batch view across all articles. The new inline tabs are the **per-article authoring surface**; the Repurpose tab remains the **fleet-wide overview**. Both read/write the same `intel_briefing_variants` table so they stay in sync.

---

### Technical details

**Files edited:**
- `src/components/admin/IntelBriefingsManager.tsx` — extend the editor `Tabs` block (around line 1010) to include 5 extra `TabsTrigger`s + `TabsContent`s. Lift variant fetching for `editingId` via React Query.
- `src/components/admin/publications/ContentCondenser.tsx` — extend `DEPTH_CONFIG` to include `{ depth: 0, label: 'Breadcrumb', platform: 'X / Telegram teaser' }` and add the breadcrumb instruction branch in `handleGenerate`.
- `src/components/admin/autopsies/AllDrafts.tsx` — promote Re-generate button visibility (front of action cluster, always visible).

**New file:**
- `src/components/admin/intel/VariantEditorTab.tsx` — a small reusable component for one variant tab (textarea + Generate/Save/Copy/Open-in-Preview buttons). Used 4× in the editor (one per non-100% depth).

**Edge function:**
- `condense-article` — already accepts arbitrary `instruction` + `content` in the body, so no edge changes needed. The new breadcrumb instruction is passed from the client.

**No DB migration needed** — `intel_briefing_variants.depth` is already an `integer`, so `depth = 0` just works. The existing UNIQUE/lookup logic in `ContentCondenser` keys by `${briefingId}-${depth}` and handles it natively.

**No schema/type regeneration needed** — depth is already typed as `number`.

### Out of scope (call out so we don't drift)

- Auto-publishing variants to external platforms — variants are still copy-paste-by-hand into Medium/Reddit/X. The Publications tracker already logs where each depth got posted (your screenshot 1 form).
- Per-platform tone tuning beyond the 4 existing depths (e.g. "LinkedIn voice"). Can be added later as additional depth profiles or a freeform "custom prompt" field — flag if you want it now.
- Image picking inside variants — variants are text-only for now; the master article keeps the gallery/hero image.
