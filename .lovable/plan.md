

## Fix X/Twitter Article Share Cards — OG Tags Not Reaching Crawler

### Problem

When sharing an Intel Briefing to X via the share button, the card preview shows the **sitewide** default OG tags ("BlackBox.Farm" / "Crypto has hands — we show them...") instead of the article-specific title, description, and featured image. The screenshots confirm this — both in the compose window and the live posted tweet.

### Root Cause

The share button passes `https://blackbox.farm/intel/briefing/{slug}` as the URL. X's Twitterbot crawler fetches this URL to generate the card, but it receives the SPA's `index.html` with sitewide OG tags instead of the `og-meta` edge function response. The `_redirects` rewrite rule exists but is not being reached by X's crawler (likely bypassed by the Cloudflare proxy layer).

However, the `/og/*` proxy path **is** reliably intercepted by both Cloudflare and `_redirects` — and the `intel-share` edge function already exists with full article-specific OG tags + crawler detection (serves OG HTML to bots, 302 redirects humans to the real article).

### Fix

**File: `src/components/intel/SocialShareBar.tsx`**

For platforms that rely on OG unfurling (X, Facebook, LinkedIn, Reddit, Pinterest), change the share URL from the direct article URL to `https://blackbox.farm/og/intel-share?slug={slug}`. This ensures:

1. X's crawler hits `/og/intel-share?slug=...` → Cloudflare proxies to `intel-share` function → returns article-specific OG HTML with correct title, description, image
2. Humans clicking the card link → `intel-share` detects non-crawler UA → 302 redirect to the real article URL
3. The card preview shows the correct `og:url` (canonical article URL), so it displays cleanly

For platforms that don't unfurl (Telegram, WhatsApp, Discord, Email, Threads), keep using the direct article URL since those were already fixed or don't need OG crawling.

**Changes needed:**

1. Accept a new `slug` prop in `SocialShareBarProps` (extracted from the article data already available in `IntelBriefingArticle.tsx`)
2. Compute `ogProxyUrl = https://blackbox.farm/og/intel-share?slug=${slug}` inside the component
3. For platforms with `useOgUrl: true` (X, Facebook, LinkedIn, Reddit, Pinterest), pass `ogProxyUrl` to `getUrl()` instead of the direct article URL
4. For clipboard copy and non-unfurl platforms, continue using the direct article URL

**File: `src/pages/IntelBriefingArticle.tsx`**

Pass `slug={article.slug}` to both `<SocialShareBar>` instances.

### Technical Detail

- `intel-share` function (already deployed) handles everything: crawler detection, article OG resolution with `meta_tags_config` overrides, JSON-LD structured data, and human redirect
- The `/og/*` redirect in `_redirects` (`/og/* → supabase functions 200!`) is the most reliable proxy path
- No edge function changes needed — `intel-share` is already complete and correct
- The `og:url` in `intel-share` output is set to the canonical article URL, so X's card will display `blackbox.farm/intel/briefing/...` as the domain, not the ugly `/og/` path

