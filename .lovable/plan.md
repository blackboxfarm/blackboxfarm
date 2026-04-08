

## Fix Facebook (and All Platform) Article Share Previews

### Problem

The Facebook share screenshots show the same issue as X/Twitter: when sharing an article, the preview displays only the sitewide "BlackBox.Farm" branding with no article title, description, or OG image. The post appears essentially blank.

### Root Cause Analysis

The `SocialShareBar` correctly builds `ogProxyUrl = https://blackbox.farm/og/intel-share?slug={slug}` and Facebook's `useOgUrl: true` means the sharer URL should be `https://www.facebook.com/sharer/sharer.php?u=https://blackbox.farm/og/intel-share?slug=...`.

However, there are two likely issues:

1. **URL encoding conflict**: The `ogProxyUrl` contains a `?slug=` query parameter. When this is passed through `encodeURIComponent()` inside the Facebook sharer URL, the `?` and `=` get encoded. Facebook's crawler then fetches the URL and it should work — but Facebook may be stripping or misinterpreting the double-encoded query string.

2. **No cache-busting**: Facebook aggressively caches OG scrape results. Once it scraped and got the sitewide fallback (before the fix was deployed), it cached that empty result. Without a `&v=timestamp` parameter, Facebook keeps serving the stale cache.

3. **Cloudflare WAF blocking**: The memory notes a required WAF rule ("Allow Social Crawlers") to skip Bot Fight Mode for `facebookexternalhit`. If this rule is missing or misconfigured, Facebook's crawler gets a 403 and falls back to the domain-level metadata.

### Fix — 3 Changes

**1. Add cache-busting to ogProxyUrl** (`src/components/intel/SocialShareBar.tsx`)

Add a `&v=` timestamp parameter to force Facebook (and all platforms) to re-scrape rather than serve stale cache:

```typescript
const ogProxyUrl = slug 
  ? `https://blackbox.farm/og/intel-share?slug=${slug}&v=${Date.now()}` 
  : url;
```

**2. Verify Cloudflare WAF rule** (manual check)

The Cloudflare dashboard must have a WAF Custom Rule (Priority 1) named "Allow Social Crawlers" that SKIPs Bot Fight Mode, Super Bot Fight Mode, Managed WAF, Rate Limiting, and Browser Integrity Check for user-agents matching `facebookexternalhit|facebot|twitterbot|linkedinbot|discordbot|meta-externalagent`. If this rule is missing or disabled, Facebook's crawler will be blocked before it ever reaches the `intel-share` function.

**3. Test with Facebook's debugger tool**

After deploying the cache-bust fix, paste the proxy URL into Facebook's Sharing Debugger (https://developers.facebook.com/tools/debug/) and click "Scrape Again" to force a fresh fetch. This will confirm whether the `intel-share` function is returning proper OG tags to Facebook's crawler.

### What this fixes

- Facebook shares will show article-specific title, description, and featured image
- All `useOgUrl` platforms (X, LinkedIn, Reddit, Pinterest) also benefit from the cache-busting
- Stale/cached previews from before the fix will be bypassed

### Files to modify

| File | Change |
|------|--------|
| `src/components/intel/SocialShareBar.tsx` | Add `&v=${Date.now()}` cache-busting to `ogProxyUrl` |

### Manual action required

Check Cloudflare WAF rules for the "Allow Social Crawlers" rule — if missing, Facebook's crawler is being 403'd and no code fix will help until the WAF rule is in place.

