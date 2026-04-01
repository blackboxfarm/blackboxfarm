

# Intel Briefings Admin Tab — Super Admin Dashboard

## What
Add a new "Intel Briefings" tab next to the Testimonials tab in the Super Admin dashboard. This is a full article management UI for creating, editing, previewing, and publishing briefings — with markdown editing, image support, category management, revision history, and a visual preview before going live.

## Database Changes

**New table: `intel_briefing_revisions`** — stores edit history for each article.

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| briefing_id | uuid FK → intel_briefings | Parent article |
| content_md | text | Snapshot of markdown at save |
| title | text | Title at time of revision |
| edited_by | uuid | User who made the edit |
| revision_note | text | Optional note ("updated intro", etc.) |
| created_at | timestamptz | When revision was saved |

RLS: Super admin only (SELECT, INSERT).

**Storage bucket: `intel-images`** — for article images (hero images, inline images). Public read, super admin upload.

## New Component: `IntelBriefingsManager.tsx`

Full admin panel with these capabilities:

### Article List View
- Table of all briefings (published + drafts) with title, category, status badge, date, actions
- Filter by category, status (draft/published)
- Quick toggle publish/unpublish

### Article Editor (create + edit)
- **Title, subtitle, slug** (auto-generated from title, editable)
- **Category** dropdown (existing categories from DB + option to type a new one)
- **Tags** input (comma-separated or chip input)
- **Author** field (default "BlackBox Research")
- **Markdown editor** — textarea with the full article content
- **Featured image upload** — drag/drop or file picker, uploads to `intel-images` bucket
- **SEO fields** — seo_title, seo_description (collapsible section)
- **Related articles** — multi-select from existing briefings
- **Publish toggle** — draft vs published, with published_at date picker

### Visual Preview
- Side-by-side or toggle between edit and preview
- Preview renders markdown via `react-markdown` + `remark-gfm` (same as public page)
- Shows how the article will look before publishing

### Revision History
- Each save creates a revision in `intel_briefing_revisions`
- View past revisions with diff or restore capability
- Shows who edited and when

### Paste/Upload Import
- Paste raw markdown into the editor
- Upload `.md` file which populates the editor fields

## Files to Create/Edit

| Action | File |
|--------|------|
| Create | `supabase/migrations/xxx_intel_briefing_revisions.sql` |
| Create | `src/components/admin/IntelBriefingsManager.tsx` |
| Edit | `src/pages/SuperAdmin.tsx` — add tab trigger + content next to Testimonials |

## Integration in SuperAdmin.tsx

- Add lazy import for `IntelBriefingsManager`
- Add TabsTrigger after Testimonials: `📰 Intel Briefings` with blue/indigo gradient
- Add TabsContent with same pattern (activeTab guard + Suspense + ErrorBoundary)

