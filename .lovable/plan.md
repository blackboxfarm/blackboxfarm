

## Plan: Switch share URLs and OG image references to og.blackbox.farm

### What changes

**1. Edge function `og-meta/index.ts` — rewrite image URLs to use og.blackbox.farm proxy**

The `og:image` and `twitter:image` tags currently point to raw Supabase storage URLs. Since your Cloudflare Worker on `og.blackbox.farm` can proxy these, we don't need to change the image URLs themselves (they're Supabase storage URLs, not og.blackbox.farm). However, looking at your screenshot, the images are already served fine from Supabase storage — the issue is the **share link URL** being ugly.

No changes needed in the edge function for images — they already resolve correctly.

**2. `src/pages/IntelBriefingArticle.tsx` — change shareUrl to og.blackbox.farm**

Change line 97 from:
```
const shareUrl = `https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/og-meta?slug=${encodeURIComponent(article.slug)}`;
```
to:
```
const shareUrl = `https://og.blackbox.farm/intel/briefing/${article.slug}`;
```

This uses the clean URL format that your Cloudflare Worker already supports (it matches `/intel/briefing/{slug}` and proxies to the Supabase function).

**3. `src/components/admin/TokenXDashboard.tsx` — change holdersUrl to og.blackbox.farm**

Change line 222 from:
```
const holdersUrl = new URL(`https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/holders-og`);
```
to:
```
const holdersUrl = new URL(`https://og.blackbox.farm/og-meta`);
```
(Or whatever route your Worker supports for holders-og — need to confirm if your Worker handles that path too.)

### Risk note

We tried `og.blackbox.farm` before and got 403s from Cloudflare. If the WAF skip rule is now working (your screenshot shows it serving correct HTML), this should work. If Facebook still gets 403s, we'd need to revert.

### Summary of files changed
- `src/pages/IntelBriefingArticle.tsx` — shareUrl → `og.blackbox.farm/intel/briefing/{slug}`
- `src/components/admin/TokenXDashboard.tsx` — holdersUrl → `og.blackbox.farm` equivalent

