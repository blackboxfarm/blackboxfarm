
What’s creating the wrong meta tags right now is not your article editor. It is the root SPA HTML shell.

What I found

1. Root default tags
- File: `index.html`
- This is the exact source of the bad tags shown in your screenshot:
  - `canonical = https://blackbox.farm`
  - `og:url = https://blackbox.farm`
  - `og:image = https://blackbox.farm/assets/blackbox-og-image.png`
- So when Facebook gets the generic shell instead of article-specific HTML, it will show that default image and root canonical.

2. Client-side article tags
- File: `src/components/intel/ArticleStructuredData.tsx`
- This updates `<title>`, canonical, OG tags, Twitter tags, and JSON-LD after React loads.
- Humans see this in the browser.
- Social crawlers usually do not rely on this because they scrape the raw HTML before the React app runs.

3. Build-time static article HTML
- File: `scripts/generate-intel-briefing-pages.mjs`
- Triggered from: `vite.config.ts`
- This script fetches published articles from `intel_briefings` and writes:
  - `dist/intel/briefing/[slug]/index.html`
- It builds proper article HTML with:
  - article canonical
  - article og:url
  - article og:title/description
  - article hero image or first markdown image
- This is the correct “should generate the correct HTML” path.

4. DB-backed meta override system
- File: `src/components/admin/MetaTagsManager.tsx`
- Table used: `meta_tags_config`
- Resolver used by edge functions:
  - `supabase/functions/_shared/meta-tags-resolver.ts`
- This is where page/article/sitewide override values can come from if set.
- But your screenshot proves the crawler is not getting this article-aware path. It is getting the root shell.

5. Crawler-specific HTML endpoints
- File: `supabase/functions/intel-share/index.ts`
- File: `supabase/functions/og-meta/index.ts`
- These can generate article-specific HTML for bots.
- But your broken shared URL in the screenshot is the actual article route:
  - `/intel/briefing/how-to-detect-a-rug-pull-before-it-happens`
- So unless routing sends crawlers to one of these functions, they won’t help.

Why your screenshot is happening

Facebook is scraping the published article URL and receiving the root `index.html` shell, not the article-specific generated HTML.

That is why it sees:
- root canonical
- root og:url
- root og:image

In plain English:
```text
Article URL requested
    -> hosting serves generic SPA shell
    -> shell contains root meta tags from index.html
    -> crawler caches those
```

Not where it is coming from
- Not from the article form itself
- Not from the hero image uploader
- Not from the article content markdown
- Not from the per-article meta form alone

Where it actually comes from
```text
Primary bad source now:
index.html

Article-specific sources that exist but are apparently not being served:
scripts/generate-intel-briefing-pages.mjs
supabase/functions/intel-share/index.ts
supabase/functions/og-meta/index.ts
src/components/intel/ArticleStructuredData.tsx (browser only, too late for crawlers)
```

Implementation plan to fix this properly

1. Trace the serving path for `/intel/briefing/:slug`
- Verify whether published hosting is serving:
  - `dist/intel/briefing/[slug]/index.html`
  - or generic root `dist/index.html`
- If the generic shell is always served, the static-generation approach is not actually winning at request time.

2. Remove ambiguity and establish one source of truth
- Keep one authoritative crawler path for article metadata.
- Best likely approach:
  - article routes should return dedicated static HTML directly
  - React hydration can still happen afterward
- If Lovable hosting ignores generated deep static files for SPA routes, switch article crawler delivery to a guaranteed edge-function/proxy route and make share links use that path consistently.

3. Make article routes bot-safe by architecture, not by hope
- Option A: strengthen static article route serving so `/intel/briefing/:slug` returns the generated file for direct requests
- Option B: if hosting behavior prevents that, add a deterministic bot-facing resolver path and wire sharing/debugging/admin preview to it instead of the raw SPA route

4. Add an explicit in-app diagnostic for every article
- Show for each slug:
  - raw published HTML source being returned
  - resolved canonical
  - resolved og:url
  - resolved og:image
  - source used: root shell / static page / edge function / DB override
- This prevents guessing next time.

5. Tighten the source hierarchy
- Define the final image/meta priority clearly:
```text
article meta override (meta_tags_config)
-> article featured_image_url
-> first markdown image
-> global default
```
- Ensure all generators and edge functions use the exact same resolution logic.

Technical details

Files already identified as relevant
- `index.html` — root default tags currently leaking to crawlers
- `src/components/intel/ArticleStructuredData.tsx` — client-side meta mutation
- `scripts/generate-intel-briefing-pages.mjs` — static article HTML generation
- `vite.config.ts` — build hook that runs the generator
- `supabase/functions/intel-share/index.ts` — crawler HTML proxy/share path
- `supabase/functions/og-meta/index.ts` — raw OG inspection endpoint
- `supabase/functions/_shared/meta-tags-resolver.ts` — DB override resolver
- `src/components/admin/MetaTagsManager.tsx` — admin editor for overrides
- `src/pages/IntelBriefingArticle.tsx` — article page using client-side tags

Most likely root cause
```text
Published request to /intel/briefing/:slug
-> Lovable SPA hosting fallback serves root index.html
-> crawler reads root tags from index.html
-> article-specific static HTML is not what the crawler actually receives
```

What I would do next once approved
- Inspect the exact published response path behavior for article URLs
- Verify whether generated deep HTML files are actually reachable in published output
- Refactor to a single guaranteed article-meta delivery path
- Update the admin diagnostic screen so you can see the exact raw HTML/meta for any slug instantly
