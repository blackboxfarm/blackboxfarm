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

    const isShareSubdomain = url.hostname === 'share.blackbox.farm';

    // --- share.blackbox.farm routes — proxy ALL requests to intel-share ---
    // Matches:
    //   share.blackbox.farm/:slug              (short URL)
    //   share.blackbox.farm/intel/briefing/:slug  (long URL shared from app)
    //   /s/:slug on any host                   (legacy short URL)
    const longShareMatch = isShareSubdomain
      ? url.pathname.match(/^\/intel\/briefing\/([^/]+)\/?$/)
      : null;
    const shortShareMatch = url.pathname.match(/^\/s\/([^/]+)\/?$/)
      || (isShareSubdomain && !longShareMatch && url.pathname.match(/^\/([^/]+)\/?$/));
    const shareMatch = longShareMatch || shortShareMatch;
    if (shareMatch) {
      const slug = shareMatch[1];
      const proxyUrl = `${SUPABASE_FUNCTIONS_BASE}/intel-share?slug=${encodeURIComponent(slug)}${url.search ? '&' + url.search.slice(1) : ''}`;
      try {
        const response = await fetch(proxyUrl, {
          redirect: 'manual',
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html',
            'Referer': request.headers.get('referer') || '',
            'X-Forwarded-For': request.headers.get('cf-connecting-ip') || '',
          },
        });

        // Preserve 3xx redirects (humans get sent to canonical blackbox.farm URL)
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (location) {
            return Response.redirect(location, 302);
          }
        }

        const body = await response.arrayBuffer();
        const headers = new Headers(response.headers);
        headers.set('X-OG-Source', 'cloudflare-share-proxy');
        return new Response(body, {
          status: response.status,
          headers,
        });
      } catch (err) {
        console.error('[share-proxy] error:', err.message);
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
