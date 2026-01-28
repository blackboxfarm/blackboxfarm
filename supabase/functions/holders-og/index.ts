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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const versionParam = url.searchParams.get("v");
    const userAgent = req.headers.get("user-agent");
    
    // Build canonical URL with version if present
    const canonical = versionParam 
      ? `https://blackbox.farm/holders?v=${versionParam}`
      : "https://blackbox.farm/holders";
    
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

    // Determine which OG image to use based on version param
    // Format: v=20260128 maps to holders_og_20260128.png
    let ogImage = DEFAULT_OG_IMAGE;
    
    if (versionParam && /^\d{8}$/.test(versionParam)) {
      // Check if versioned image exists in storage
      const versionedImageName = `holders_og_${versionParam}.png`;
      const versionedImageUrl = `${STORAGE_BASE}/${versionedImageName}`;
      
      // Quick HEAD request to check if file exists
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

    // OG metadata for /holders page
    const title = "You Don't Grow on Dust.";
    const description = `Markets are fields.
Some roots hold.
Some inflate the count.
BlackBox.farm shows what actually grows — and what gets culled.`;

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
  <meta property="og:image:alt" content="BlackBox Farm - You Don't Grow on Dust" />
  <meta property="og:site_name" content="BlackBox Farm" />
  <meta property="og:locale" content="en_US" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description.replace(/\n/g, ' ')}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="twitter:site" content="@blackboxfarm" />

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
        "Cache-Control": "public, max-age=3600",
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
