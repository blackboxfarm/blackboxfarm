import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const img = url.searchParams.get("img") || "";
    const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
    const token = url.searchParams.get("token") || "";

    // Basic validation to avoid being an open redirect / arbitrary HTML reflector.
    if (!img || !(img.startsWith("https://") || img.startsWith("http://"))) {
      return new Response("Missing or invalid img param", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const safeSymbol = escapeHtml(symbol || "TOKEN");

    // Where humans should land (canonical + CTA). Include token if available.
    const canonical = token 
      ? `https://blackbox.farm/holders?token=${encodeURIComponent(token)}`
      : `https://blackbox.farm/holders`;

    // Check if this is a bot/crawler - if not, redirect to the actual page
    const userAgent = req.headers.get("user-agent");
    if (!isBot(userAgent)) {
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          "Location": canonical,
        },
      });
    }

    const title = `Holder Analysis: $${safeSymbol} — BlackBox Farm`;
    const description = `Free holder analysis report for $${safeSymbol}.`;

    // This URL (the share page itself) — used as og:url
    const shareUrl = url.toString();

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:image" content="${escapeHtml(img)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(img)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="628" />
  <meta property="og:image:alt" content="Holder Analysis for $${safeSymbol}" />
  <meta property="og:site_name" content="BlackBox Farm" />
  <meta property="og:locale" content="en_US" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(img)}" />
  <meta name="twitter:site" content="@blackboxfarm" />

  <!-- WhatsApp / iMessage / General Messaging -->
  <meta itemprop="name" content="${title}" />
  <meta itemprop="description" content="${escapeHtml(description)}" />
  <meta itemprop="image" content="${escapeHtml(img)}" />

  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: #0b0b0f; color: #eaeaf2; }
    main { max-width: 920px; margin: 0 auto; padding: 28px 16px 40px; }
    .card { border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.03); border-radius: 16px; overflow: hidden; }
    .header { display:flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 16px 16px 10px; }
    .kicker { font-size: 12px; opacity: 0.75; letter-spacing: 0.06em; text-transform: uppercase; }
    .title { font-size: 18px; font-weight: 800; }
    img { width: 100%; height: auto; display: block; }
    .footer { display:flex; justify-content: space-between; gap: 10px; padding: 12px 16px 16px; font-size: 13px; opacity: 0.85; }
    a { color: #6ee7b7; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <div class="header">
        <div>
          <div class="kicker">BlackBox Farm</div>
          <div class="title">Holder Analysis: $${safeSymbol}</div>
        </div>
        <div class="kicker"><a href="${canonical}">${canonical.replace('https://','')}</a></div>
      </div>
      <img src="${escapeHtml(img)}" alt="Holder analysis share card for $${safeSymbol}" loading="eager" />
      <div class="footer">
        <span>Preview image for social sharing</span>
        <span><a href="${canonical}">Open full report →</a></span>
      </div>
    </div>
  </main>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        // Keep it cacheable but not forever (image URLs are immutable anyway).
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (e) {
    console.error("share-card-page error:", e);
    return new Response("Internal error", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
