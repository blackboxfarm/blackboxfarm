

## Fix Article OG Sharing — Two Root Causes Found

### What Facebook's Debugger Revealed

1. **`site001.png` does not exist** — The sitewide default OG image (`social-gallery/site001.png`) returns **404** from Supabase Storage. Facebook sees "invalid content type" because the 404 JSON response isn't an image. This is the image referenced in `index.html` line 30.

2. **`intel-share` function has priority bugs** — The meta tags cascade (sitewide → page → article) is working, but the function uses sitewide overrides OVER article-specific data in three places:
   - `canonical_url`: sitewide sets `https://blackbox.farm`, which overrides the article-specific URL
   - `twitter:image`: sitewide sets a default, which overrides the article's `featured_image_url`
   - `og:type`: sitewide sets `website`, should be `article` for briefings

The article's featured image (`intel-images/...cropped.jpg`) is fine — serves correctly as `image/jpeg`. The bug is that `intel-share` never uses it for Twitter because the sitewide meta cascade wins.

### Fixes

**1. Fix `intel-share` function — article data must win over sitewide cascade**

In `supabase/functions/intel-share/index.ts`, change the priority so article-specific values take precedence:

```
// BEFORE (broken — sitewide canonical wins):
const canonicalUrl = meta.canonical_url || `${SITE_URL}/intel/briefing/${article.slug}`;
const twitterImage = meta.twitter_image || ogImage;

// AFTER (article always wins):
const canonicalUrl = `${SITE_URL}/intel/briefing/${article.slug}`;
const ogImage = resolveImage(article.featured_image_url) || meta.og_image_url || DEFAULT_OG_IMAGE;
const twitterImage = ogImage;  // Always use article image, not sitewide fallback
```

Also hardcode `og:type` to `article` since this function only serves articles:
```
<meta property="og:type" content="article" />
```

And set `og:url` to the canonical article URL (not whatever sitewide says):
```
<meta property="og:url" content="${canonicalUrl}" />
```

**2. Fix `site001.png` — sitewide default OG image is missing**

The file `social-gallery/site001.png` returns 404. Two options:
- Re-upload a proper sitewide OG image to the `social-gallery` bucket as `site001.png`
- OR update `index.html` line 30 to point to an image that actually exists (e.g., the logo or a different asset)

This affects the sitewide fallback for any page that doesn't have article-specific OG tags (homepage shares, etc.).

**3. Update `index.html` og:image to use a working URL**

Change line 30 to reference an image that exists and serves with correct content-type headers.

### Files to modify

| File | Change |
|------|--------|
| `supabase/functions/intel-share/index.ts` | Fix priority: article canonical, og:url, og:type, twitter:image always use article data |
| `index.html` | Fix sitewide og:image URL to a file that exists |

### What this fixes

- Facebook, X, LinkedIn, etc. will see the correct article title, description, and featured image
- `twitter:image` will match `og:image` (the article's featured image)
- `og:url` and canonical will point to the real article URL
- Sitewide shares (homepage) will have a valid og:image

