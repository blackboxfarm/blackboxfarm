

## Fix Intel Briefings Social Sharing — Root Cause Analysis and Plan

### What is actually broken (3 distinct problems)

**Problem 1: `index.html` has wrong hardcoded meta tags that contaminate everything**

The root `index.html` contains:
- `og:title` = "You Don't Grow on Dust."
- `og:description` = "Markets are fields. Some roots hold..."
- `og:url` = `https://blackbox.farm/holders`
- `og:image` = the old TEST image (`blackbox-og-image.png`)

This is the SPA shell. When you visit `/intel/briefing/...`, the `_redirects` file proxies to `og-meta` edge function — but **Lovable hosting ignores `_redirects`** (that is a Netlify feature). So on the Lovable preview/published site, every page loads `index.html` first with these wrong tags. The `ArticleStructuredData` component tries to fix them via JavaScript DOM manipulation, but **crawlers do not execute JavaScript** — they read the initial HTML and see the wrong sitewide defaults.

The Cloudflare Worker on `blackbox.farm` does intercept crawler requests to `/intel/briefing/*` and proxies to `og-meta`, which works. But for platforms like Threads (which uses the direct URL, not the `/og/` proxy), the page source shows `index.html` defaults because Threads' crawler may not be in the Cloudflare Worker's regex list.

**Problem 2: The `intel-share` edge function returns 404 via Lovable hosting**

The share buttons for OG-dependent platforms (X, Facebook, LinkedIn, Reddit, Pinterest) build a URL like `https://blackbox.farm/og/intel-share?slug=...`. This relies on Cloudflare's Worker to proxy `/og/*` to Supabase edge functions. That part works for crawlers. But when you test by clicking the share button, the browser navigates to X/Facebook/etc. with this URL, and those platforms' crawlers hit Cloudflare and get proxied correctly.

However: the `intel-share` function's `resolveMetaTags` cascade calls the `meta_tags_config` table. Currently there is only ONE row (sitewide). Since `intel-share` calls `resolveMetaTags({ scope: 'article', routePath: '/intel', articleSlug: slug })`, and there are NO article-specific or `/intel` page overrides in `meta_tags_config`, the sitewide row wins — overriding the article's own title/description/image with the sitewide values.

This is the cascade bug: `meta.og_title` from sitewide gets priority over `article.seo_title || article.title` because of line 71 in `og-meta/index.ts`:
```
const ogTitle = (meta.og_title || article.seo_title || article.title || "").slice(0, 120);
```
Since `meta.og_title` = "BlackBox.Farm" (from sitewide config), it is truthy and wins.

**Same bug in `intel-share/index.ts` line 53:**
```
const fullTitle = meta.og_title || article.seo_title || article.title || "";
```

**Problem 3: `index.html` defaults are stale/wrong regardless**

The `og:url` points to `/holders` instead of the site root. The description is a creative marketing line that was never set by the user. The Meta Tags Manager has the correct sitewide values in the database, but `index.html` was never updated to match.

### The Fix (4 files)

**1. Update `index.html` — replace hardcoded meta with values from Meta Tags Manager**

Replace the hardcoded OG/Twitter/itemprop meta tags with the values currently saved in `meta_tags_config` sitewide row:
- `og:title` → "BlackBox.Farm"
- `og:description` → "Crypto has hands — we show them. *HoldersIntel AI*..."
- `og:url` → "https://blackbox.farm"
- `og:image` → the uploaded sitewide image from social-gallery storage
- Same for twitter:* and itemprop tags

**2. Fix `og-meta/index.ts` — article data must take priority over sitewide meta**

The cascade logic is backwards for article pages. The resolver returns sitewide defaults, but article-specific data from `intel_briefings` (title, subtitle, featured_image_url) should take priority over sitewide meta. Fix lines 71-74:

```typescript
// Article's own data takes priority; meta_tags_config override only if article-specific scope exists
const ogTitle = (article.seo_title || article.title || meta.og_title || "").slice(0, 120);
const ogDescription = (article.seo_description || article.subtitle || meta.og_description || "").slice(0, 200);
const ogImage = resolveOgImage(article.featured_image_url) || meta.og_image_url || DEFAULT_OG_IMAGE;
```

This way: article's own fields win → article-scope meta_tags_config override wins → sitewide fallback.

**3. Fix `intel-share/index.ts` — same cascade priority fix**

Same issue on lines 53-56. Article data must win over sitewide meta:

```typescript
const fullTitle = article.seo_title || article.title || meta.og_title || "";
const ogDescription = (article.seo_description || article.subtitle || meta.og_description || "").slice(0, 200);
const ogImage = resolveImage(article.featured_image_url) || meta.og_image_url || DEFAULT_OG_IMAGE;
```

**4. Fix `SocialShareBar.tsx` — all platforms use direct article URL, not `/og/` proxy URL**

Per your requirement: every share button should expose the human-readable article URL (`/intel/briefing/...`). The `/og/intel-share` proxy URL should only exist for the Cloudflare Worker to intercept crawlers — it should never be visible to users.

Change all platforms to use the direct article URL. Remove the `useOgUrl` / `ogShareUrl` mechanism entirely. The Cloudflare Worker already intercepts crawler requests to `/intel/briefing/*` and proxies to `og-meta`, so crawlers will get correct metadata regardless.

### Deployment

After code changes:
- Redeploy `og-meta` and `intel-share` edge functions
- The `index.html` change deploys automatically with the build
- Cloudflare cache may need purging for the article URLs

### What this fixes
- X/Twitter share: shows article title + article hero image (Cloudflare Worker intercepts Twitter's crawler)
- Facebook share: same — Facebook crawler hits Cloudflare, gets proxied to og-meta with correct article data
- LinkedIn share: same
- Threads share: uses direct article URL — Cloudflare intercepts crawler
- Telegram/WhatsApp/Discord: use direct URL with inline text (already correct)
- Pinterest/Reddit: use direct article URL
- All platforms see the article's own hero image, not the sitewide image

