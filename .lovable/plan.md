
Goal: make each Intel Briefing share use that article’s own hero image, title, and subtitle instead of falling back to the sitewide “You Don’t Grow on Dust.” metadata.

What I found
- The article page itself is wired correctly on the client:
  - `src/pages/IntelBriefingArticle.tsx` shares the article URL.
  - `src/components/intel/ArticleStructuredData.tsx` updates the browser head for humans.
- Server-side article OG is also present:
  - `supabase/functions/og-meta/index.ts` already builds article-specific HTML with title, description, image, canonical URL.
- The dangerous fallback is still in `index.html`:
  - sitewide OG tags are hardcoded there with the slogan and default image.
- Your screenshot matches exactly what happens when Facebook misses the article-specific server response and instead sees the default SPA HTML.

Diagnosis
- This is not a “tab reload” problem.
- It is a server/share-routing problem:
  1. Facebook’s share fetch is not consistently reaching the article-specific OG response.
  2. When it misses, it falls back to `index.html`, which still has the global slogan + global image.
- There is also a consistency gap:
  - the share UI uses `article.title` / `article.subtitle`
  - the OG function prefers `seo_title` / `seo_description`
  - so preview text and share text can diverge.

Implementation plan
1. Add a dedicated Intel article share endpoint
- Create a new edge-function-based share page for Intel briefings, similar in spirit to `share-card-page` / `holders-og`.
- Input: `slug`
- Output:
  - full HTML with article-specific `og:*`, `twitter:*`, and `itemprop` tags
  - canonical points to the real article URL
  - human visitors get redirected to the real article
- This gives Facebook a stable server-rendered page built only for sharing, instead of relying on crawler detection on the normal SPA route.

2. Point the article share buttons at the dedicated share URL for OG-based networks
- Update `src/components/intel/SocialShareBar.tsx` so Facebook, LinkedIn, Discord/Pinterest-style OG scrapers use the dedicated share URL.
- Keep the real article URL as the actual destination via canonical/redirect.
- X, Telegram, WhatsApp, email can continue using the canonical article URL where appropriate.

3. Unify the metadata source
- In `src/pages/IntelBriefingArticle.tsx`, pass the same resolved values everywhere:
  - title: `seo_title || title`
  - description: `seo_description || subtitle`
  - image: `featured_image_url`
- Ensure the share bar and OG endpoint both use the same resolved values so the dashboard edits map naturally to what gets shared.

4. Add cache-busting for article share previews
- Include an article version marker in the share URL, based on publish/update timestamp or article revision state.
- This reduces the chance that Facebook keeps showing old article metadata after you edit title/subtitle/hero image.

5. Harden crawler coverage
- Expand bot handling lists to include newer Meta/Facebook agents, not just `facebookexternalhit`.
- Apply this to the repo’s OG-related edge functions for consistency.
- Separately, mirror that same broader UA list in the Cloudflare Worker / WAF skip rule, since that routing is outside this repo and must match.

Files likely affected
- `src/components/intel/SocialShareBar.tsx`
- `src/pages/IntelBriefingArticle.tsx`
- `supabase/functions/og-meta/index.ts` or a new dedicated Intel share function
- possibly `public/_redirects` if we expose the new share endpoint under `/og/*`

Technical shape
```text
Article page
  -> canonical URL: /intel/briefing/:slug

Facebook share button
  -> share URL: /og/intel-briefing?slug=:slug&v=:version

Dedicated share endpoint
  -> query article from Supabase
  -> emit article-specific OG/Twitter tags
  -> canonical = real article URL
  -> redirect humans to canonical
```

Why this is the safest fix
- It removes dependence on Facebook perfectly hitting the main SPA/article route every time.
- It avoids sitewide fallback contamination from `index.html`.
- It makes article #1 and article #2 previews independently resolvable and cacheable.

Validation after implementation
- Test both article URLs in Facebook Sharing Debugger.
- Test real Facebook composer paste/share for both articles.
- Confirm article #2 shows article #2 hero, title, and subtitle.
- Confirm article #1 no longer bleeds into article #2 preview.
- Confirm updated subtitle/SEO edits in the dashboard change the next generated share preview.
