import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://blackbox.farm";
const DEFAULT_OG_IMAGE = "https://apxauapuusmgwbbzjgfl.supabase.co/storage/v1/object/public/OG/holders_og.png";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      return new Response("Missing slug parameter", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: article, error } = await supabase
      .from("intel_briefings")
      .select("title, subtitle, seo_title, seo_description, featured_image_url, slug, category, author, published_at, created_at, tags")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error || !article) {
      // Fallback: return default site OG tags
      return buildHtmlResponse({
        title: "Intel Briefings | BlackBox Farm",
        description: "Solana token intelligence, holder analysis, and on-chain research.",
        image: DEFAULT_OG_IMAGE,
        url: `${SITE_URL}/intel`,
        type: "website",
      });
    }

    const ogTitle = (article.seo_title || article.title || "").slice(0, 60);
    const ogDescription = (article.seo_description || article.subtitle || "").slice(0, 160);
    const ogImage = article.featured_image_url || DEFAULT_OG_IMAGE;
    const articleUrl = `${SITE_URL}/intel/briefing/${article.slug}`;
    const publishedAt = article.published_at || article.created_at;
    const author = article.author || "BlackBox Research";
    const category = (article.category || "general").replace(/-/g, " ");
    const tags = article.tags || [];

    return buildHtmlResponse({
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
    });
  } catch (err) {
    console.error("og-meta error:", err);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
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
}

function buildHtmlResponse(params: OgParams): Response {
  const { title, description, image, url, type, publishedAt, author, category, tags, siteName } = params;

  const articleMeta = type === "article"
    ? `
    <meta property="article:published_time" content="${publishedAt || ""}" />
    <meta property="article:author" content="${author || ""}" />
    <meta property="article:section" content="${category || ""}" />
    ${(tags || []).map((t) => `<meta property="article:tag" content="${t}" />`).join("\n    ")}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="${type}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:secure_url" content="${image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="${image.endsWith('.jpg') || image.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'}" />
  <meta property="og:site_name" content="${siteName || "BlackBox Farm"}" />
  ${articleMeta}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@HoldersIntel" />
  <meta name="twitter:creator" content="@blackbox_farm" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${image}" />

  <!-- Redirect real users (crawlers don't execute JS) -->
  <script>window.location.replace("${url}");</script>
  <link rel="canonical" href="${url}" />
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <p><a href="${url}">Read the full article on BlackBox Farm</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
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
