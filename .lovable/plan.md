

## Publishing Mesh Dashboard — Plan

### What It Is
A new "Publications" sub-tab inside the Intel Briefings admin section that tracks where each article has been cross-posted, at what content depth (100%, 75%, 50%, 25%), on which platform, and when. Multiple views let you see the mesh from different angles.

### Database

**New table: `intel_publications`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| briefing_id | uuid FK → intel_briefings.id | Which article |
| platform | text | e.g. "Website", "Medium", "Reddit", "Twitter/X", "Fiverr Repost", "Threads", "LinkedIn" |
| content_depth | integer | 100, 75, 50, 25 |
| published_url | text (nullable) | Link to the post |
| notes | text (nullable) | e.g. "rewritten for brevity", "intro thread" |
| published_at | timestamptz | When it went live on that platform |
| created_at | timestamptz | default now() |

RLS: admin-only via `has_role(auth.uid(), 'super_admin')`.

### UI — Publications Tab

Inside IntelBriefingsManager, add an internal tab bar: **Articles | Publications**

The Publications tab contains:

1. **Log a Publication** — quick form: pick article (dropdown of published briefings), platform (dropdown + custom), content depth (4 radio buttons: 100/75/50/25%), date, optional URL, optional notes.

2. **Four views** (sub-tabs or toggle):
   - **Calendar (Month)** — grid calendar showing colored dots per day. Each dot = a publication, color-coded by content depth. Click a day to see details.
   - **Calendar (Week)** — same concept, expanded weekly view with more detail per cell (article title, platform icon, depth badge).
   - **By Platform** — grouped columns/cards showing each platform and its publications listed chronologically. Quick visual of platform coverage gaps.
   - **By Article** — each article as an expandable row showing all its cross-posts as a horizontal timeline/mesh. Shows coverage completeness (which platforms, which depths).

3. **Content Depth Legend** — consistent color scheme:
   - 100% = green (full article)
   - 75% = blue (substantial rewrite)
   - 50% = amber (condensed)
   - 25% = red/pink (intro/teaser)

### Files to Create/Modify

- **Migration**: Create `intel_publications` table with RLS
- **New component**: `src/components/admin/IntelPublicationsManager.tsx` — main container with the 4 views
- **New component**: `src/components/admin/publications/PublicationForm.tsx` — add/edit form
- **New component**: `src/components/admin/publications/CalendarView.tsx` — month + week calendar
- **New component**: `src/components/admin/publications/PlatformView.tsx` — grouped by platform
- **New component**: `src/components/admin/publications/ArticleView.tsx` — grouped by article with cross-post mesh
- **Modify**: `src/components/admin/IntelBriefingsManager.tsx` — add Articles/Publications tab switcher
- **Modify**: `src/pages/SuperAdmin.tsx` — no changes needed (publications lives inside the existing intel-briefings tab)

### Technical Notes
- Calendar views use a simple CSS grid (no heavy library needed), with date-fns for date math
- Platform icons from lucide-react where possible, text fallback otherwise
- All CRUD through Supabase client with optimistic updates via react-query
- Inline edit/delete on each publication entry

