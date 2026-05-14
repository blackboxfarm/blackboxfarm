import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveMetaTags } from "../_shared/meta-tags-resolver.ts";
import { classifyUserAgent, parseReferrerSource } from "../_shared/bot-detector.ts";

const SITE_URL = "https://blackbox.farm";
const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/blackbox-og-image.png`;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const version = url.searchParams.get("v");

    if (!slug) {
      return new Response("Missing slug", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: article, error } = await supabase
      .from("intel_briefings")
      .select("id, title, subtitle, seo_title, seo_description, featured_image_url, social_image_url, slug, category, author, published_at, created_at, tags, updated_at")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    console.log(`[intel-share] slug="${slug}" found=${!!article} error=${error?.message || "none"}`);

    if (error || !article) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: `${SITE_URL}/intel` },
      });
    }

    // Resolve meta overrides: sitewide → /intel page → article-specific
    const meta = await resolveMetaTags({
      scope: 'article',
      routePath: '/intel',
      articleSlug: slug,
    });

    const fullTitle = article.seo_title || article.title || meta.og_title || "";
    const ogTitle = fullTitle.slice(0, 120);
    const pageTitle = fullTitle.slice(0, 60);
    const ogDescription = (article.seo_description || article.subtitle || meta.og_description || "").slice(0, 200);
    const ogImage =
      resolveImage(article.social_image_url) ||
      resolveImage(article.featured_image_url) ||
      meta.og_image_url ||
      DEFAULT_OG_IMAGE;
    const ogImageWidth = article.social_image_url ? "1200" : "1200";
    const ogImageHeight = article.social_image_url ? "628" : "630";
    const canonicalUrl = `${SITE_URL}/intel/briefing/${article.slug}`;
    const shareRequestUrl = `https://share.blackbox.farm/${encodeURIComponent(article.slug)}`;
    const publishedAt = article.published_at || article.created_at;
    const author = article.author || "BlackBox Research";
    const category = (article.category || "general").replace(/-/g, " ");
    const tags = article.tags || [];
    const twitterCard = meta.twitter_card || "summary_large_image";
    const twitterImage = ogImage;

    const uaRaw = req.headers.get("user-agent") || "";
    const { visitorType, botName } = classifyUserAgent(uaRaw);
    const isCrawler = visitorType !== 'human';

    // Log the view asynchronously (fire-and-forget)
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip');
    
    const refererHeader = req.headers.get('referer');
    supabase.from('intel_briefing_views').insert({
      briefing_id: article.id || null,
      slug,
      visitor_type: visitorType,
      bot_name: botName,
      user_agent: uaRaw.slice(0, 500),
      ip_address: ipAddress,
      referer: refererHeader,
      referrer_source: parseReferrerSource(refererHeader),
    }).then(({ error: logErr }) => {
      if (logErr) console.warn('[intel-share] view log error:', logErr.message);
    });

    // Human visitors → instant redirect to the real article
    if (!isCrawler) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: canonicalUrl },
      });
    }

    // Crawlers → full HTML with OG tags
    const articleMeta = `
    <meta property="article:published_time" content="${publishedAt || ""}" />
    <meta property="article:author" content="${esc(author)}" />
    <meta property="article:section" content="${esc(category)}" />
    ${tags.map((t: string) => `<meta property="article:tag" content="${esc(t)}" />`).join("\n    ")}`;

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: ogTitle,
      description: ogDescription,
      datePublished: publishedAt || "",
      author: { "@type": "Organization", name: author },
      publisher: {
        "@type": "Organization",
        name: "BlackBox Farm",
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png` },
      },
      mainEntityOfPage: canonicalUrl,
      image: ogImage,
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(pageTitle)} | BlackBox Farm</title>
  <link rel="canonical" href="${canonicalUrl}" />
  <meta name="description" content="${esc(ogDescription)}" />
  <meta name="robots" content="noindex, follow" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${shareRequestUrl}" />
  <meta property="og:title" content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(ogDescription)}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:secure_url" content="${ogImage}" />
  <meta property="og:image:width" content="${ogImageWidth}" />
  <meta property="og:image:height" content="${ogImageHeight}" />
  <meta property="og:image:alt" content="${esc(ogTitle)}" />
  <meta property="og:site_name" content="BlackBox Farm | HoldersIntel" />
  <meta property="og:locale" content="en_US" />
  ${articleMeta}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${twitterCard}" />
  <meta name="twitter:site" content="@HoldersIntel" />
  <meta name="twitter:creator" content="@blackbox_farm" />
  <meta name="twitter:title" content="${esc(ogTitle)}" />
  <meta name="twitter:description" content="${esc(ogDescription)}" />
  <meta name="twitter:image" content="${twitterImage}" />

  <!-- Messaging Apps -->
  <meta itemprop="name" content="${esc(ogTitle)}" />
  <meta itemprop="description" content="${esc(ogDescription)}" />
  <meta itemprop="image" content="${ogImage}" />

  <script type="application/ld+json">${jsonLd}</script>

  <!-- Fallback redirect for any client that renders JS -->
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${canonicalUrl}">${esc(ogTitle)}</a>...</p>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Robots-Tag": "noindex, follow",
      },
    });
  } catch (err) {
    console.error("[intel-share] error:", err);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveImage(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${SITE_URL}${url}`;
  return `${SITE_URL}/${url}`;
}
