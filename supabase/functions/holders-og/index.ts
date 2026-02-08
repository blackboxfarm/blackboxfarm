import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Known bot/crawler user agents that need OG meta tags
const BOT_USER_AGENTS = [
  'twitterbot',
  'facebookexternalhit',
  'linkedinbot',
  'slackbot',
  'telegrambot',
  'discordbot',
  'whatsapp',
  'applebot',
  'googlebot',
  'bingbot',
  'yandexbot',
  'duckduckbot',
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

const SUPABASE_URL = "https://apxauapuusmgwbbzjgfl.supabase.co";
const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/OG`;
const DEFAULT_OG_IMAGE = `${STORAGE_BASE}/holders_og.png`;

function slugifyVersion(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const versionParam = url.searchParams.get("v");
    const tokenParam = url.searchParams.get("token");
    const communityParam = url.searchParams.get("utm_community");
    const userAgent = req.headers.get("user-agent");

    console.log(`[holders-og] REQUEST: token=${tokenParam}, UA=${userAgent?.slice(0,50)}`);

    // Build canonical URL (preserve token + v + utm_community)
    const canonicalUrl = new URL("https://blackbox.farm/holders");
    if (versionParam) canonicalUrl.searchParams.set('v', versionParam);
    if (tokenParam) canonicalUrl.searchParams.set('token', tokenParam);
    if (communityParam) canonicalUrl.searchParams.set('utm_community', communityParam);
    const canonical = canonicalUrl.toString();
    
    // If not a bot, redirect to the actual SPA
    if (!isBot(userAgent)) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, "Location": canonical },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine which OG image to use
    let ogImage = DEFAULT_OG_IMAGE;
    let tokenSymbol: string | null = null;
    let tokenName: string | null = null;
    let isTokenSpecific = false;

    // PRIORITY 0: Check for paid_composite_url first
    if (tokenParam) {
      const { data: seenToken } = await supabase
        .from('holders_intel_seen_tokens')
        .select('paid_composite_url, banner_url, symbol, name')
        .eq('token_mint', tokenParam)
        .single();
      
      if (seenToken?.paid_composite_url) {
        ogImage = seenToken.paid_composite_url;
        tokenSymbol = seenToken.symbol;
        tokenName = seenToken.name;
        isTokenSpecific = true;
      } else if (seenToken?.banner_url) {
        ogImage = seenToken.banner_url;
        tokenSymbol = seenToken.symbol;
        tokenName = seenToken.name;
        isTokenSpecific = true;
      } else if (seenToken) {
        tokenSymbol = seenToken.symbol;
        tokenName = seenToken.name;
      }
    }

    // PRIORITY 1: Check token_banners if no composite found
    if (!isTokenSpecific && tokenParam) {
      const { data: tokenBanner } = await supabase
        .from('token_banners')
        .select('banner_url, symbol')
        .eq('token_address', tokenParam)
        .eq('is_active', true)
        .single();
      
      if (tokenBanner?.banner_url) {
        ogImage = tokenBanner.banner_url;
        tokenSymbol = tokenBanner.symbol;
        isTokenSpecific = true;
      }
    }

    // PRIORITY 2: Version param for promotional OG images
    if (!isTokenSpecific && versionParam) {
      const safeV = slugifyVersion(versionParam);
      if (safeV) {
        const versionedImageUrl = `${STORAGE_BASE}/holders_og_${safeV}.png`;
        try {
          const checkResponse = await fetch(versionedImageUrl, { method: 'HEAD' });
          if (checkResponse.ok) {
            ogImage = versionedImageUrl;
          }
        } catch { /* use default */ }
      }
    }

    // Determine OG image source for debug header
    let ogSource = 'default';
    if (isTokenSpecific && tokenParam) {
      ogSource = ogImage.includes('composite') ? 'composite' : 'banner';
    } else if (versionParam) {
      ogSource = 'versioned';
    }

    // Use an image-proxy edge function for og:image so crawlers never hit Storage/CDNs directly.
    // This is much more reliable for X/Twitter.
    const ogImageUpstream = ogImage;
    const reqUrl = new URL(req.url);
    const edgeBase = reqUrl.pathname.startsWith('/functions/v1/')
      ? `${reqUrl.origin}/functions/v1`
      : reqUrl.origin;

    const proxyUrl = new URL(`${edgeBase}/holders-og-image`);
    if (tokenParam) proxyUrl.searchParams.set('token', tokenParam);
    if (versionParam) proxyUrl.searchParams.set('v', versionParam);
    if (communityParam) proxyUrl.searchParams.set('utm_community', communityParam);

    const ogImageForMeta = proxyUrl.toString();

    // Trim symbol/name to avoid leading/trailing spaces in meta tags
    const cleanSymbol = tokenSymbol?.trim() || null;
    const cleanName = tokenName?.trim() || null;

    console.log(`[holders-og] Serving: ${cleanSymbol || 'default'}, source=${ogSource}, upstream=${ogImageUpstream.slice(-60)}, proxy=${ogImageForMeta.slice(-60)}`);

    // Dynamic OG metadata
    const title = isTokenSpecific && cleanSymbol 
      ? `$${cleanSymbol} Holder Analysis — BlackBox Farm`
      : "You Don't Grow on Dust.";
    
    const description = isTokenSpecific && cleanSymbol
      ? `Detailed holder distribution and wallet analysis for $${cleanSymbol}${cleanName ? ` (${cleanName})` : ''}. Discover diamond hands vs dust wallets.`
      : `Markets are fields. Some roots hold. Some inflate the count. BlackBox.farm shows what actually grows — and what gets culled.`;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description.replace(/\n/g, ' ')}" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description.replace(/\n/g, ' ')}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${ogImageForMeta}" />
  <meta property="og:image:secure_url" content="${ogImageForMeta}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${isTokenSpecific && cleanSymbol ? `$${cleanSymbol} Holder Analysis` : 'BlackBox Farm - You Don\'t Grow on Dust'}" />
  <meta property="og:site_name" content="BlackBox Farm" />
  <meta property="og:locale" content="en_US" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description.replace(/\n/g, ' ')}" />
  <meta name="twitter:image" content="${ogImageForMeta}" />
  <meta name="twitter:site" content="@holdersintel" />

  <meta itemprop="name" content="${title}" />
  <meta itemprop="description" content="${description.replace(/\n/g, ' ')}" />
  <meta itemprop="image" content="${ogImageForMeta}" />

  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: #0b0b0f; color: #eaeaf2; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    main { max-width: 600px; text-align: center; padding: 40px 20px; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { opacity: 0.8; line-height: 1.6; }
    a { color: #6ee7b7; text-decoration: none; display: inline-block; margin-top: 2rem; padding: 12px 24px; border: 1px solid #6ee7b7; border-radius: 8px; }
    a:hover { background: rgba(110, 231, 183, 0.1); }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${description}</p>
    <a href="${canonical}">View Holder Analysis →</a>
  </main>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": isTokenSpecific ? "public, max-age=300" : "public, max-age=3600",
        "X-Debug-OG-Source": ogSource,
        "X-Debug-OG-Image": ogImageUpstream.slice(-80),
        "X-Debug-OG-Proxy": ogImageForMeta.slice(-80),
      },
    });
  } catch (e) {
    console.error("holders-og error:", e);
    return new Response("Internal error", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
