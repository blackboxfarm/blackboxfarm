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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';

    // Only intercept /intel/briefing/:slug routes
    const match = url.pathname.match(/^\/intel\/briefing\/([^/]+)\/?$/);
    if (!match) {
      return fetch(request);
    }

    // Only proxy crawler requests — humans get the normal SPA
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

      // Return the og-meta response with proper headers
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
      // On error, fall through to origin
      console.error('[og-router] proxy error:', err.message);
      return fetch(request);
    }
  },
};
