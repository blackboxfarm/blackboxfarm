import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveMetaTags } from "../_shared/meta-tags-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://blackbox.farm";
const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/blackbox-og-image.png`;
const responseHeaders = {
  ...corsHeaders,
  "X-OG-Meta": "ok",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      return new Response("Missing slug parameter", { status: 400, headers: responseHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: article, error } = await supabase
      .from("intel_briefings")
      .select("title, subtitle, seo_title, seo_description, featured_image_url, social_image_url, slug, category, author, published_at, created_at, tags")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    console.log(`[og-meta] slug="${slug}" found=${!!article} error=${error?.message || 'none'}`);

    if (error || !article) {
      const { data: anyArticle } = await supabase
        .from("intel_briefings")
        .select("slug, is_published")
        .eq("slug", slug)
        .maybeSingle();
      console.log(`[og-meta] debug: article without filter=${JSON.stringify(anyArticle)}`);

      // Resolve sitewide meta for fallback
      const meta = await resolveMetaTags({ scope: 'sitewide' });

      return buildFullPageResponse({
        title: meta.og_title || "Intel Briefings | BlackBox Farm",
        description: meta.og_description || "Solana token intelligence, holder analysis, and on-chain research.",
        image: meta.og_image_url || DEFAULT_OG_IMAGE,
        url: `${SITE_URL}/intel`,
        type: "website",
        slug,
      });
    }

    // Resolve meta overrides: sitewide → /intel page → article-specific
    const meta = await resolveMetaTags({
      scope: 'article',
      routePath: '/intel',
      articleSlug: slug,
    });

    const ogTitle = (article.seo_title || article.title || meta.og_title || "").slice(0, 120);
    const ogDescription = (article.seo_description || article.subtitle || meta.og_description || "").slice(0, 200);
    const ogImage =
      resolveOgImage(article.social_image_url) ||
      resolveOgImage(article.featured_image_url) ||
      meta.og_image_url ||
      DEFAULT_OG_IMAGE;
    // Article canonical/URL/type must ALWAYS be article-specific, never sitewide
    const articleUrl = `${SITE_URL}/intel/briefing/${article.slug}`;
    const publishedAt = article.published_at || article.created_at;
    const author = article.author || "BlackBox Research";
    const category = (article.category || "general").replace(/-/g, " ");
    const tags = article.tags || [];
    const twitterCard = meta.twitter_card || "summary_large_image";
    const twitterImage = ogImage;

    return buildFullPageResponse({
      title: ogTitle,
      description: ogDescription,
      image: ogImage,
      url: articleUrl,
      type: "article",
      publishedAt,
      author,
      category,
      tags,
      siteName: "BlackBox Farm | HoldersIntel",
      slug,
      twitterCard,
      twitterImage,
    });
  } catch (err) {
    console.error("og-meta error:", err);
    return new Response("Internal error", { status: 500, headers: responseHeaders });
  }
});

interface OgParams {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
  publishedAt?: string;
  author?: string;
  category?: string;
  tags?: string[];
  siteName?: string;
  slug: string;
  twitterCard?: string;
  twitterImage?: string;
}

function buildFullPageResponse(params: OgParams): Response {
  const { title, description, image, url, type, publishedAt, author, category, tags, siteName, slug, twitterCard, twitterImage } = params;

  const articleMeta = type === "article"
    ? `
    <meta property="article:published_time" content="${publishedAt || ""}" />
    <meta property="article:author" content="${author || ""}" />
    <meta property="article:section" content="${category || ""}" />
    ${(tags || []).map((t) => `<meta property="article:tag" content="${escapeHtml(t)}" />`).join("\n    ")}`
    : "";

  const jsonLd = type === "article" ? `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "${escapeHtml(title)}",
      "description": "${escapeHtml(description)}",
      "datePublished": "${publishedAt || ""}",
      "author": { "@type": "Organization", "name": "${escapeHtml(author || "BlackBox Research")}" },
      "publisher": {
        "@type": "Organization",
        "name": "BlackBox Farm",
        "url": "https://blackbox.farm",
        "logo": { "@type": "ImageObject", "url": "https://blackbox.farm/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" }
      },
      "mainEntityOfPage": "${url}",
      "image": "${image}"
    }
    </script>` : `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "BlackBox Farm",
      "description": "Advanced DeFi trading platform with automated bots and community campaigns",
      "url": "https://blackbox.farm",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web Browser",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
    }
    </script>`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>${escapeHtml(title)} | BlackBox Farm</title>
    <link rel="icon" href="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" type="image/png">
    <link rel="apple-touch-icon" href="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png">
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="author" content="${escapeHtml(author || "BlackBox Farm")}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />

    <!-- Open Graph -->
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:secure_url" content="${image}" />
    <meta property="og:image:type" content="${image.endsWith('.jpg') || image.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />
    <meta property="og:site_name" content="${siteName || "BlackBox Farm"}" />
    <meta property="og:locale" content="en_US" />
    ${articleMeta}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="${twitterCard || 'summary_large_image'}" />
    <meta name="twitter:site" content="@HoldersIntel" />
    <meta name="twitter:creator" content="@blackbox_farm" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${twitterImage || image}" />

    <!-- WhatsApp / iMessage / General Messaging Apps -->
    <meta itemprop="name" content="${escapeHtml(title)}" />
    <meta itemprop="description" content="${escapeHtml(description)}" />
    <meta itemprop="image" content="${image}" />

    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="#000000" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="BlackBox Farm" />

    ${jsonLd}
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...responseHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeImageUrl(imageUrl?: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  if (imageUrl.startsWith("/")) return `${SITE_URL}${imageUrl}`;
  return `${SITE_URL}/${imageUrl.replace(/^\/+/, "")}`;
}

function resolveOgImage(featuredImageUrl?: string | null): string | undefined {
  return normalizeImageUrl(featuredImageUrl) || undefined;
}
