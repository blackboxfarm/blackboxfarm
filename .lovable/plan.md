

## Plan: Simplify OG sharing — single Cloudflare Worker on blackbox.farm

### The core problem
Your SPA can't serve OG tags to crawlers. The og-meta edge function solves this perfectly. The complexity is all in the routing layer (og.blackbox.farm subdomain, separate WAF rules, bot fight mode conflicts).

### The solution
One Cloudflare Worker route on **blackbox.farm itself** that intercepts crawler requests and proxies them to the Supabase og-meta function. Non-crawler requests pass through normally to your SPA.

### What changes

**1. Cloudflare Worker (on blackbox.farm, not og.blackbox.farm)**

The Worker checks the User-Agent. If it's a known crawler (Facebook, Twitter, Discord, Telegram, Google, etc.), it proxies the request to your Supabase og-meta function. Everyone else gets the normal SPA.

```text
User visits blackbox.farm/intel/briefing/some-slug
  ├── Crawler (facebookexternalhit, Twitterbot, etc.)
  │   → Worker fetches Supabase og-meta?slug=some-slug
  │   → Returns HTML with og:image, og:title, etc.
  │   → Crawler reads tags, shows preview
  │
  └── Real user
      → Worker passes through to origin (your SPA)
      → React app loads normally
```

This is literally what every WordPress SEO plugin does, and what prerender.io / rendertron do for SPAs. No subdomain needed. No separate WAF rules. The Worker runs on the same domain, so Bot Fight Mode doesn't interfere — it's YOUR Worker responding, not an external bot trying to access your site.

**2. Update share URLs in codebase**

- `src/pages/IntelBriefingArticle.tsx` — change `shareUrl` from `og.blackbox.farm/intel/briefing/{slug}` to just `blackbox.farm/intel/briefing/{slug}` (same as `articleUrl`)
- `src/components/admin/TokenXDashboard.tsx` — change holders share URL similarly
- Clean URLs, no ugly Supabase domains, no subdomain

**3. No changes to og-meta edge function**

It already works perfectly. The Worker just proxies to it.

**4. Cloudflare Worker code (for your reference — you'd deploy this on Cloudflare)**

```javascript
const CRAWLER_UA = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Discordbot|TelegramBot|Slackbot|WhatsApp|Googlebot|bingbot|Applebot/i;
const SUPABASE_FN = "https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/og-meta";

export default {
  async fetch(request, env) {
    const ua = request.headers.get("User-Agent") || "";
    const url = new URL(request.url);

    // Only intercept crawler requests on matching paths
    if (CRAWLER_UA.test(ua)) {
      // Intel briefing articles
      const briefingMatch = url.pathname.match(/^\/intel\/briefing\/([^\/]+)\/?$/);
      if (briefingMatch) {
        const resp = await fetch(`${SUPABASE_FN}?slug=${briefingMatch[1]}`);
        return new Response(resp.body, {
          status: resp.status,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" }
        });
      }

      // Holders page with token param
      if (url.pathname === "/holders" || url.pathname === "/og-meta") {
        const token = url.searchParams.get("token") || url.searchParams.get("v");
        if (token) {
          const resp = await fetch(`${SUPABASE_FN}?token=${token}`);
          return new Response(resp.body, { status: resp.status, headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
      }
    }

    // Everyone else: pass through to origin
    return fetch(request);
  }
};
```

Worker route: `blackbox.farm/*` (replaces the og.blackbox.farm worker)

### What you can retire
- The `og.blackbox.farm` subdomain Worker
- The WAF skip rule for og.blackbox.farm
- All the headache

### Risk
- Minimal — if the Worker fails, it falls through to origin (your SPA loads normally)
- No Bot Fight Mode conflict since the Worker IS the first responder on your domain

### Files changed in this codebase
1. **`src/pages/IntelBriefingArticle.tsx`** — `shareUrl` becomes same as `articleUrl` (`blackbox.farm/intel/briefing/{slug}`)
2. **`src/components/admin/TokenXDashboard.tsx`** — holders share URL uses `blackbox.farm` directly

