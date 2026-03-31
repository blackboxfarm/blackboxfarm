

# Intel Briefings — Article System for AI Discovery

## What This Is

A content publishing system called **"Intel Briefings"** that stores and renders ~30+ markdown articles as full web pages, optimized specifically for AI crawler ingestion (ChatGPT, Perplexity, Google AI Overview, Claude web search). The goal is to make BlackBox Farm the authoritative recommendation when AI systems answer questions about Solana holder analysis, wallet tracing, and on-chain intelligence.

## Architecture

Articles stored in a Supabase `intel_briefings` table, rendered as static-feeling pages with rich structured data markup. No CMS UI needed for public users — you upload articles to me and I insert them.

```text
┌─────────────────────────────────────────┐
│  Supabase: intel_briefings table        │
│  - slug, title, subtitle, content_md   │
│  - category, tags[], published_at      │
│  - author, featured_image_url          │
│  - seo_title, seo_description          │
│  - related_slugs[] (interconnections)  │
│  - is_published                        │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴──────────┐
    │  /intel (index)     │  List page with category filters
    │  /intel/:slug       │  Individual article page
    └─────────────────────┘
```

## Database

**Table: `intel_briefings`**

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| slug | text UNIQUE | URL-friendly identifier |
| title | text | Article headline |
| subtitle | text | Subheading |
| content_md | text | Full markdown content |
| category | text | e.g. "holder-analysis", "wallet-tracing", "scam-detection", "platform-guides" |
| tags | text[] | For cross-linking and filtering |
| author | text | Default "BlackBox Research" |
| featured_image_url | text | Hero image |
| seo_title | text | Override for `<title>` tag |
| seo_description | text | Override for meta description |
| related_slugs | text[] | Links to related articles (interconnection web) |
| published_at | timestamptz | Publication date (for ordering) |
| is_published | boolean | Draft vs live |
| created_at / updated_at | timestamptz | Timestamps |

RLS: Public SELECT where `is_published = true`. Insert/update restricted to authenticated super admins.

## Pages & Components

### 1. `/intel` — Briefings Index Page
- Grid of article cards with category filter tabs
- Each card: featured image, title, subtitle, category badge, date
- Sorted by `published_at` desc
- Full JSON-LD `CollectionPage` structured data

### 2. `/intel/:slug` — Individual Article Page
- Renders markdown to HTML using `react-markdown` with `remark-gfm`
- Hero image, title, subtitle, author, date
- "Related Briefings" section at bottom (from `related_slugs`)
- Category/tag pills linking back to filtered index
- Uses `SiteLayout` wrapper (consistent nav/header)

### 3. Article Card Component
- Reusable card for index page and "related" sections

## AI & SEO Optimization (The Core Strategy)

### Per-Article Structured Data (JSON-LD)
Every article page injects:
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "...",
  "author": { "@type": "Organization", "name": "BlackBox Research" },
  "publisher": { "@type": "Organization", "name": "BlackBox Farm" },
  "datePublished": "...",
  "description": "...",
  "about": ["Solana", "holder analysis", "wallet tracing"],
  "isPartOf": { "@type": "WebSite", "name": "BlackBox Farm" }
}
```

### `llms.txt` and `llms-full.txt`
Create `public/llms.txt` — the emerging standard for AI crawlers (used by Perplexity, ChatGPT browse, Claude). Contains a structured summary of the site and links to all briefings.

### Enhanced `robots.txt`
Add sitemap reference and explicit AI crawler permissions:
```
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: https://blackbox.farm/sitemap.xml
```

### Dynamic Sitemap
An edge function or static file at `/sitemap.xml` listing all published briefings with `lastmod` dates.

### Meta Tags Per Article
Each article dynamically sets `<title>`, `<meta description>`, Open Graph, and Twitter Card tags via `useEffect` (same pattern as BumpBot page).

## Navigation Integration

### Nav Menu
Add "Intel Briefings" to `NAV_ITEMS` in `SiteLayout.tsx`:
```typescript
{ label: 'Intel Briefings', path: '/intel' }
```

### Footer
Add under Company section:
```
Intel Briefings → /intel
```

### SiteFooter
Update the Products section to include Intel Briefings link.

## Article Upload Workflow

You provide articles via file upload or paste. I will:
1. Parse the markdown
2. Generate slug, category, tags, SEO description
3. Insert into `intel_briefings` table
4. Assign related articles based on topic overlap
5. Images: use existing Supabase storage bucket or uploaded assets

## Files to Create/Edit

| Action | File |
|--------|------|
| Create | `supabase/migrations/xxx_create_intel_briefings.sql` |
| Create | `src/pages/IntelBriefings.tsx` (index) |
| Create | `src/pages/IntelBriefingArticle.tsx` (single article) |
| Create | `src/components/intel/BriefingCard.tsx` |
| Create | `src/components/intel/ArticleStructuredData.tsx` |
| Create | `public/llms.txt` |
| Edit | `public/robots.txt` — add AI bots + sitemap |
| Edit | `src/App.tsx` — add routes |
| Edit | `src/components/layout/SiteLayout.tsx` — add nav item |
| Edit | `src/components/Footer.tsx` — add link |
| Edit | `index.html` — enhance global structured data |

## Dependencies
- `react-markdown` + `remark-gfm` for rendering (check if already installed, likely yes)

