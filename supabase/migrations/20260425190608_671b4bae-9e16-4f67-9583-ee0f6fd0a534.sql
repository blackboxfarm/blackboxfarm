INSERT INTO public.super_admin_docs (slug, title, category, summary, content_md, tags, is_pinned, sort_order)
VALUES (
  'intel-briefings-guide',
  '📰 Intel Briefings — Overview & Guide',
  'content',
  'Complete reference for the Intel Briefings tab: editor, hero image gallery, condensation, publishing mesh, view tracking, sharing, and SEO.',
  $MD$# 📰 Intel Briefings — Overview & Guide

The **Intel Briefings** tab in Super Admin is the editorial command center for BlackBox Farm''s long-form on-chain intelligence content. Briefings are the public-facing authority layer that drives SEO, X/Twitter exposure, Telegram funnel traffic, and ICP-targeted conversion.

Public surface: **/intel** (index) and **/intel/briefing/:slug** (article).

---

## 🧱 Architecture at a glance

| Layer | Purpose |
|---|---|
| `intel_briefings` table | Source of truth: title, slug, markdown, hero image, SEO, related slugs, `target_persona_slug` |
| `intel_publications` table | Cross-platform distribution log (X, Telegram, LinkedIn, Medium…) |
| `intel_briefing_views` | Per-session view tracking with bot classification + UTM capture |
| `track-briefing-view` edge function | Server-side view logger (service-role, dedupes by `session_id`) |
| Cloudflare `blackbox-og-router` worker | Crawler interception → injects per-article OG tags |
| Static page generator | Pre-renders article HTML at build time for SEO crawlers |
| `share.blackbox.farm/[slug]` | Unified share subdomain with rich previews |

---

## 🛠️ Sub-tabs in the Manager

### 1. ✍️ Editor
- Markdown body with live preview
- **Hero image** — upload OR pick from the AI-generated gallery
- **"Inspire 3 New"** uses existing gallery images as style references
- **Smart Placement** auto-inserts gallery images at H2 boundaries
- All hero/inline images run through `imageMetadata.ts` for branding stamps + EXIF cleanup
- SEO fields: `seo_title`, `seo_description` (auto-default to article title/subtitle)
- `target_persona_slug` — tags article to a Marketing Profile persona (Awakened Degen, KYC Refugee, Operator)
- `related_slugs` — up to 3 manually curated related articles
- Toggle `is_published` to make live

### 2. 🖼️ Image Gallery
- Hero-derived gallery with AI variants
- Reusable across articles
- "Gallery from Hero" generates 3 stylistic siblings on demand

### 3. 📑 Condensed Variants
- System auto-generates **75% / 50% / 25%** condensed versions of every article
- Used for cross-platform reposts (X threads, TG broadcasts, LinkedIn)
- Stored alongside the main article — never overwrite manually unless intentional

### 4. 📡 Publications (Publishing Mesh)
- Log every external post: platform, URL, content depth, breadcrumb flag, notes, published_at
- **Views**: Month / Week / Platform / Article tabs
- Drives the article-exposure analytics and ICP attribution
- `is_breadcrumb = true` marks teaser posts that link back to the canonical briefing

### 5. 📊 Visitor Analytics
- Real-time view counts (humans vs bots classified server-side)
- Referrer source + UTM capture per session
- Bot detection happens in `track-briefing-view` — never trust client-side

### 6. 🔗 Meta Tags Manager
- Per-article OG/Twitter card overrides
- Defaults intelligently to article title / description / hero image
- Cloudflare worker injects these on crawler requests

---

## 🌐 Public-side rendering

`/intel` (`src/pages/IntelBriefings.tsx`)
- Category filter chips (Holder Analysis, Wallet Tracing, Scam Detection, Platform Guides, Market Intel, General)
- Gated by `system_settings.intel_briefings_public = ''true''`
- Pulls only `is_published = true` rows

`/intel/briefing/:slug` (`src/pages/IntelBriefingArticle.tsx`)
- Hero, author, date, category badge, tags
- TOP + BOTTOM `SocialShareBar`
- `ArticleStructuredData` injects JSON-LD (`Article` schema)
- Related Briefings section
- Fires `track-briefing-view` exactly once per session (via `useRef` guard + `sessionStorage` ID)

---

## 🔄 Cross-tab integrations

- **Marketing Profiles** → `target_persona_slug` lets you slice analytics by ICP
- **Email Campaigns** → can pull condensed variants as ready-made send copy
- **Telegram /HoldersIntel bot** → broadcasts via `holders_intel_post_queue` (newest-first)
- **X / @blackbox_farm** → posts via `holders-intel-poster` with breadcrumb safeguards

---

## ✅ Operational best practices

1. **Always set a hero image** — drives 3-4× CTR on social previews
2. **Tag a persona** before publishing so analytics segment correctly
3. **Log every external repost** in Publications — otherwise the mesh undercounts exposure
4. **Use condensed variants**, don''t manually shorten — keeps voice consistent
5. **Check Visitor Analytics weekly** to identify which categories convert which personas
6. **Never edit the slug after publishing** — breaks shares, OG cache, and SEO backlinks
7. **Respect the `target_persona_slug`** — write each article for ONE persona, not three

---

## ⚠️ Common pitfalls

- Forgetting to flip `is_published` → article 404s on `/intel/briefing/:slug`
- Editing slug after share links are out → orphaned `share.blackbox.farm` URLs
- Skipping `seo_description` → meta tags fall back to subtitle (often too short)
- Manually overwriting condensed variants → AI re-condense will clobber on next regen
- Logging the same publication twice → inflates Platform-view exposure stats

---

## 🗄️ Storage details

- **Table**: `public.intel_briefings`
- **Key columns**: `slug` (unique), `title`, `subtitle`, `category`, `tags[]`, `content_md`, `featured_image_url`, `seo_title`, `seo_description`, `author`, `published_at`, `is_published`, `related_slugs[]`, `target_persona_slug`
- **RLS**: Public read where `is_published = true`; admin-only write
- **Migrations**: All schema changes via `supabase/migrations/` — never edit directly
$MD$,
  ARRAY['intel-briefings','content','seo','publishing','analytics','reference'],
  true,
  3
);