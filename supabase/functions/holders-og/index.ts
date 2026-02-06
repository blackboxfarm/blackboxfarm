import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // Allow a-z0-9_- for friendly nicknames like "holders3" or "winter_promo".
  // Anything else is stripped to avoid path tricks.
  return v.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
}

serve(async (req) => {
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
        headers: {
          ...corsHeaders,
          "Location": canonical,
        },
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

    // PRIORITY 1: If token param exists, try to get the token's banner
    if (tokenParam) {
      // First check token_banners table (for curated/paid banners)
      let bannerFound = false;
      
      if (communityParam) {
        const { data: tokenBanner } = await supabase
          .from('token_banners')
          .select('banner_url, symbol')
          .eq('x_community_id', communityParam)
          .eq('is_active', true)
          .single();
        
        if (tokenBanner?.banner_url) {
          ogImage = tokenBanner.banner_url;
          tokenSymbol = tokenBanner.symbol;
          isTokenSpecific = true;
          bannerFound = true;
          console.log(`Using token_banners (community): ${tokenSymbol}`);
        }
      }
      
      if (!bannerFound) {
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
          bannerFound = true;
          console.log(`Using token_banners (address): ${tokenSymbol}`);
        }
      }
      
      // Fallback: Check holders_intel_seen_tokens for banner_url or paid_composite_url
      if (!bannerFound) {
        const { data: seenToken } = await supabase
          .from('holders_intel_seen_tokens')
          .select('banner_url, paid_composite_url, symbol, name')
          .eq('token_mint', tokenParam)
          .single();
        
        if (seenToken) {
          // Prefer paid_composite_url for marketing shares, fallback to banner_url
          if (seenToken.paid_composite_url) {
            ogImage = seenToken.paid_composite_url;
            tokenSymbol = seenToken.symbol;
            tokenName = seenToken.name;
            isTokenSpecific = true;
            console.log(`Using paid_composite_url for: ${tokenSymbol}`);
          } else if (seenToken.banner_url) {
            ogImage = seenToken.banner_url;
            tokenSymbol = seenToken.symbol;
            tokenName = seenToken.name;
            isTokenSpecific = true;
            console.log(`Using holders_intel_seen_tokens banner: ${tokenSymbol}`);
          } else {
            tokenSymbol = seenToken.symbol;
            tokenName = seenToken.name;
            console.log(`Token found but no banner: ${tokenSymbol}`);
          }
        }
      }
    }

    // PRIORITY 2: Version param for promotional OG images (if no token-specific banner found)
    if (!isTokenSpecific && versionParam) {
      const safeV = slugifyVersion(versionParam);
      if (safeV) {
        const versionedImageName = `holders_og_${safeV}.png`;
        const versionedImageUrl = `${STORAGE_BASE}/${versionedImageName}`;
        try {
          const checkResponse = await fetch(versionedImageUrl, { method: 'HEAD' });
          if (checkResponse.ok) {
            ogImage = versionedImageUrl;
            console.log(`Using versioned OG image: ${versionedImageName}`);
          } else {
            console.log(`Versioned image not found (${versionedImageName}), using default`);
          }
        } catch {
          console.log(`Failed to check versioned image, using default`);
        }
      }
    }

    // Dynamic OG metadata based on whether we have token-specific content
    const title = isTokenSpecific && tokenSymbol 
      ? `$${tokenSymbol} Holder Analysis — BlackBox Farm`
      : "You Don't Grow on Dust.";
    
    const description = isTokenSpecific && tokenSymbol
      ? `Detailed holder distribution and wallet analysis for $${tokenSymbol}${tokenName ? ` (${tokenName})` : ''}. Discover diamond hands vs dust wallets.`
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
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:secure_url" content="${ogImage}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${isTokenSpecific && tokenSymbol ? `$${tokenSymbol} Holder Analysis` : 'BlackBox Farm - You Don\'t Grow on Dust'}" />
  <meta property="og:site_name" content="BlackBox Farm" />
  <meta property="og:locale" content="en_US" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description.replace(/\n/g, ' ')}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="twitter:site" content="@holdersintel" />

  <!-- WhatsApp / iMessage / General Messaging -->
  <meta itemprop="name" content="${title}" />
  <meta itemprop="description" content="${description.replace(/\n/g, ' ')}" />
  <meta itemprop="image" content="${ogImage}" />

  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: #0b0b0f; color: #eaeaf2; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    main { max-width: 600px; text-align: center; padding: 40px 20px; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { opacity: 0.8; line-height: 1.6; white-space: pre-line; }
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
        // Short cache for token-specific (banner might change), longer for generic
        "Cache-Control": isTokenSpecific ? "public, max-age=300" : "public, max-age=3600",
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
