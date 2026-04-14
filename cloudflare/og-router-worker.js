/**
 * Cloudflare Worker: blackbox-og-router
 * 
 * Deploy this worker on your blackbox.farm domain in Cloudflare.
 * It intercepts requests for article routes and proxies crawler/bot
 * requests to the og-meta edge function so they receive article-specific
 * Open Graph meta tags instead of the generic SPA shell.
 * 
 * Human visitors pass through to the origin (Lovable hosting) unchanged.
 * 
 * Route pattern: blackbox.farm/intel/briefing/*
 * 
 * Setup:
 * 1. Go to Cloudflare Dashboard → Workers & Pages → Create Worker
 * 2. Paste this code
 * 3. Add route: blackbox.farm/intel/briefing/*
 * 4. Deploy
 */

const OG_META_BASE = 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/og-meta';

// Crawler patterns — same list used by intel-share edge function
const CRAWLER_PATTERNS = [
  // Social crawlers
  /facebookexternalhit|facebot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /discordbot/i,
  /slackbot/i,
  /telegrambot/i,
  /whatsapp/i,
  /pinterestbot/i,
  /meta-externalagent/i,
  // Search crawlers
  /googlebot/i,
  /bingbot/i,
  /applebot/i,
  /yandexbot/i,
  /baiduspider/i,
  /duckduckbot/i,
  // AI bots
  /chatgpt-user|oai-searchbot|gptbot/i,
  /claudebot|anthropic/i,
  /perplexitybot/i,
  /cohere-ai/i,
  /gemini|google-extended/i,
  /ccbot/i,
  /ia_archiver/i,
];

function isCrawler(userAgent) {
  if (!userAgent) return false;
  return CRAWLER_PATTERNS.some(pattern => pattern.test(userAgent));
}

const SUPABASE_FUNCTIONS_BASE = 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';

    // --- /s/:slug or /:slug on share subdomain — short share URL, proxy ALL requests to intel-share ---
    const isShareSubdomain = url.hostname === 'share.blackbox.farm';
    const shortMatch = url.pathname.match(/^\/s\/([^/]+)\/?$/)
      || (isShareSubdomain && url.pathname.match(/^\/([^/]+)\/?$/));
    if (shortMatch) {
      const slug = shortMatch[1];
      const proxyUrl = `${SUPABASE_FUNCTIONS_BASE}/intel-share?slug=${encodeURIComponent(slug)}${url.search ? '&' + url.search.slice(1) : ''}`;
      try {
        const response = await fetch(proxyUrl, {
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html',
          },
        });
        const body = await response.arrayBuffer();
        const headers = new Headers(response.headers);
        headers.set('X-OG-Source', 'cloudflare-short-url');
        return new Response(body, {
          status: response.status,
          headers,
        });
      } catch (err) {
        console.error('[short-url] error:', err.message);
        return fetch(request);
      }
    }

    // --- /intel/briefing/:slug — intercept crawlers only ---
    const match = url.pathname.match(/^\/intel\/briefing\/([^/]+)\/?$/);
    if (!match) {
      return fetch(request);
    }

    if (!isCrawler(ua)) {
      return fetch(request);
    }

    const slug = match[1];
    const ogMetaUrl = `${OG_META_BASE}?slug=${encodeURIComponent(slug)}`;

    try {
      const response = await fetch(ogMetaUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html',
        },
      });

      const html = await response.text();
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=60, s-maxage=300',
          'X-OG-Source': 'cloudflare-og-router',
          'X-Bot-Detected': ua.slice(0, 100),
        },
      });
    } catch (err) {
      console.error('[og-router] proxy error:', err.message);
      return fetch(request);
    }
  },
};
