

## What you want

A modal that lets you **manage inline article images after they've been inserted** — list them, reorder, remove, add more, and place them at chosen anchors instead of relying on Smart Placement alone. Works for existing articles being edited.

## How it works conceptually

The article's `content_md` already contains all inline images as `![alt](url)` markdown tokens. The modal parses those out, gives each one a card (thumbnail + position label like "After paragraph 3"), and lets you drag-reorder, delete, or add more. On save, it rewrites `content_md` with images placed at the new anchor positions.

```text
┌─ Manage Article Images ─────────────────────┐
│  [+ Upload]  [+ Gallery]  [+ AI Inspire]    │
│  ─────────────────────────────────────────  │
│  ⋮⋮ [thumb] image-1.jpg  After ¶1   [↕][🗑] │
│  ⋮⋮ [thumb] image-2.jpg  After ¶4   [↕][🗑] │
│  ⋮⋮ [thumb] image-3.jpg  After ¶7   [↕][🗑] │
│                                             │
│  Anchor mode: [Smart] [Manual: ¶ dropdown]  │
│  [Cancel]                          [Apply]  │
└─────────────────────────────────────────────┘
```

## Plan

**1. New component `InlineImageManagerModal.tsx`** in `src/components/admin/`
   - Parses `content_md` → extracts every `![alt](url)` token + records its paragraph position
   - Renders each as a draggable card (use `@dnd-kit/sortable` — already present in project from other features; falls back to `react-beautiful-dnd` if not, will check)
   - Top toolbar: **Upload**, **From Gallery**, **AI Inspire** — all reuse the same handlers as the existing insert flow (cropper + EXIF strip + brand)
   - Each card shows: thumbnail, filename (extracted from URL), current anchor (e.g. "After ¶3"), drag handle, delete button, and an anchor dropdown to manually pick a paragraph slot (¶1, ¶2, … ¶N) or "Auto"
   - Footer **Apply** button → rewrites `content_md`: strips all existing `![…](…)` tokens, then re-inserts in new order at chosen anchors (Smart fallback for "Auto" entries)

**2. Wire into `IntelBriefingsManager.tsx`**
   - Add a third button next to "Insert Gallery Image": **🖼️ Manage Images (N)** showing count of existing inline images
   - Only visible when `content_md` contains at least one `![…](…)` token
   - Opens the modal with current `content_md`; on Apply, updates `form.content_md`

**3. Anchor system (handles "more than 3")**
   - Anchors = indices of paragraph break positions (already computed in existing Smart Placement code at line 486)
   - Manual mode: dropdown shows all `N` paragraph slots so you can place 4, 5, 10+ images precisely
   - Auto mode: keeps current Smart Placement distribution logic (1st near top, last near end, middle ones distributed evenly)

**4. Reorder behavior**
   - Drag changes order in the list; on Apply, image at index `i` goes to anchor at index `i` (manual anchors honored, Auto images fill remaining slots evenly)

## Technical notes

- **Image detection regex:** `/!\[([^\]]*)\]\(([^)]+)\)/g` over `content_md`, skip the hero (only relevant if hero is also embedded as first markdown image — current setup uses `featured_image_url` separately, so all inline `![…]()` tokens are fair game)
- **Thumbnails:** just render the `url` directly with `loading="lazy"` and small dimensions
- **Drag library:** check `package.json` for `@dnd-kit/core` first; if absent use HTML5 native drag-drop (simpler, no dep)
- **Reuse:** `GalleryPickerButton`, `handleGalleryCropComplete` (refactor it slightly so it returns the uploaded URL via a callback rather than always inserting into content directly), `stripExifAndBrand`, `generateImageName`
- **Apply algorithm:**
  ```
  1. Strip all ![…](…) from content_md → cleanContent + paraBreaks recomputed
  2. For each image in new order:
       if anchor === 'auto' → use Smart Placement slot
       else → use paraBreaks[anchorIdx]
  3. Insert from end-to-start (so earlier indices don't shift)
  ```
- **No backend/schema changes** — purely client-side markdown manipulation. Article saves through existing flow.

## Out of scope (ask if you want them later)

- Per-image alt text editing (could add — currently all inline images use `alt="image"`)
- Caption editing (markdown `![caption](url)` syntax — caption shows under image in renderer when alt ≠ "image")
- Image resizing / float left vs right override (renderer auto-alternates via CSS nth-of-type)

