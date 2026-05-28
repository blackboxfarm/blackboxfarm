import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE_URL = 'https://blackbox.farm';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://apxauapuusmgwbbzjgfl.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU';
const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/blackbox-og-image.png`;
const DIST_INDEX_PATH = path.resolve('dist/index.html');
const DIST_REDIRECTS_PATH = path.resolve('dist/_redirects');
const GENERATED_REDIRECTS_START = '# BEGIN INTEL BRIEFING STATIC ROUTES';
const GENERATED_REDIRECTS_END = '# END INTEL BRIEFING STATIC ROUTES';

export async function generateIntelBriefingPages() {
  let baseHtml;
  try {
    baseHtml = await readFile(DIST_INDEX_PATH, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.warn(`[intel-og-pages] skipped: ${DIST_INDEX_PATH} not found (likely a dev build)`);
      return;
    }
    throw err;
  }
  const assetTags = extractAssetTags(baseHtml);
  const appRoot = baseHtml.match(/<div id="root"><\/div>/)?.[0] || '<div id="root"></div>';
  let articles = [];
  try {
    articles = await fetchPublishedArticles();
  } catch (err) {
    console.warn(`[intel-og-pages] skipped: ${err?.message || err}`);
    return;
  }

  const briefingsDir = path.resolve('dist', 'intel', 'briefing');
  await mkdir(briefingsDir, { recursive: true });

  for (const article of articles) {
    if (!article?.slug) continue;

    const articleDir = path.join(briefingsDir, article.slug);
    await mkdir(articleDir, { recursive: true });
    const outputPath = path.join(articleDir, 'index.html');
    await writeFile(outputPath, buildArticleHtml(article, assetTags, appRoot), 'utf8');
  }

  console.log(`[intel-og-pages] generated ${articles.length} article page(s) as exact-match files`);
}

async function fetchPublishedArticles() {
  const params = new URLSearchParams({
    select: 'slug,title,subtitle,seo_title,seo_description,featured_image_url,content_md,author,published_at,created_at,category,tags',
    is_published: 'eq.true',
    order: 'published_at.desc.nullslast',
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/intel_briefings?${params.toString()}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`[intel-og-pages] failed to fetch articles: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function buildArticleHtml(article, assetTagsMarkup, appRootMarkup) {
  const title = (article.seo_title || article.title || 'Intel Briefing').trim();
  const description = (article.seo_description || article.subtitle || extractFirstParagraph(article.content_md) || 'Solana token intelligence, holder analysis, and on-chain research.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  const image = resolveArticleImage(article);
  const author = (article.author || 'BlackBox Research').trim();
  const publishedAt = article.published_at || article.created_at || '';
  const category = (article.category || 'general').replace(/-/g, ' ');
  const tags = Array.isArray(article.tags) ? article.tags.filter((tag) => typeof tag === 'string' && tag.trim()) : [];
  const articleUrl = `${SITE_URL}/intel/briefing/${article.slug}`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished: publishedAt,
    author: { '@type': 'Organization', name: author },
    publisher: {
      '@type': 'Organization',
      name: 'BlackBox Farm',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png`,
      },
    },
    mainEntityOfPage: articleUrl,
    image,
    about: ['Solana', 'holder analysis', 'wallet tracing', 'on-chain intelligence', ...tags],
    keywords: tags.join(', '),
    isPartOf: { '@type': 'WebSite', name: 'BlackBox Farm', url: SITE_URL },
  }, null, 2).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>${escapeHtml(title)} | BlackBox Farm</title>
    <link rel="icon" href="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" type="image/png" />
    <link rel="apple-touch-icon" href="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="author" content="${escapeHtml(author)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${articleUrl}" />

    <meta property="og:type" content="article" />
    <meta property="og:url" content="${articleUrl}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:secure_url" content="${image}" />
    <meta property="og:image:type" content="${inferImageType(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />
    <meta property="og:site_name" content="BlackBox Farm | HoldersIntel" />
    <meta property="og:locale" content="en_US" />
    <meta property="article:published_time" content="${escapeHtml(publishedAt)}" />
    <meta property="article:author" content="${escapeHtml(author)}" />
    <meta property="article:section" content="${escapeHtml(category)}" />
    ${tags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}" />`).join('\n    ')}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@HoldersIntel" />
    <meta name="twitter:creator" content="@blackbox_farm" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${image}" />

    <meta itemprop="name" content="${escapeHtml(title)}" />
    <meta itemprop="description" content="${escapeHtml(description)}" />
    <meta itemprop="image" content="${image}" />

    <script type="application/ld+json">${jsonLd}</script>
    ${assetTagsMarkup}
  </head>
  <body>
    ${appRootMarkup}
  </body>
</html>`;
}

function resolveArticleImage(article) {
  return normalizeUrl(article.featured_image_url) || extractFirstMarkdownImage(article.content_md) || DEFAULT_OG_IMAGE;
}

function extractFirstMarkdownImage(markdown) {
  if (!markdown) return null;
  const match = markdown.match(/!\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/);
  return normalizeUrl(match?.[1]);
}

function extractFirstParagraph(markdown) {
  if (!markdown) return '';

  const cleaned = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/[*_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, 200);
}

function normalizeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return `${SITE_URL}${value}`;
  return `${SITE_URL}/${value.replace(/^\/+/, '')}`;
}

function inferImageType(imageUrl) {
  const cleanUrl = imageUrl.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (cleanUrl.endsWith('.webp')) return 'image/webp';
  if (cleanUrl.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function extractAssetTags(html) {
  const tags = html.match(/<(?:link|script)\b[^>]*(?:href|src)="(?:\/assets\/|\/~flock\.js)[^"]*"[^>]*>(?:<\/script>)?/g) || [];
  return tags.join('\n    ');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function writeStaticArticleRedirects(articles) {
  let redirects = '';

  try {
    redirects = await readFile(DIST_REDIRECTS_PATH, 'utf8');
  } catch {
    redirects = '/*  /index.html  200\n';
  }

  const generatedRules = articles
    .filter((article) => typeof article?.slug === 'string' && article.slug.trim())
    .map((article) => article.slug.trim())
    .flatMap((slug) => [
      `/intel/briefing/${slug}  /intel/briefing/${slug}/index.html  200`,
      `/intel/briefing/${slug}/  /intel/briefing/${slug}/index.html  200`,
    ])
    .join('\n');

  const generatedBlock = `${GENERATED_REDIRECTS_START}\n${generatedRules}\n${GENERATED_REDIRECTS_END}`;
  const existingBlock = new RegExp(`${escapeRegExp(GENERATED_REDIRECTS_START)}[\\s\\S]*?${escapeRegExp(GENERATED_REDIRECTS_END)}\\n?`, 'g');
  const cleaned = redirects.replace(existingBlock, '').trimEnd();
  const fallbackIndex = cleaned.indexOf('\n/*  /index.html  200');

  const nextRedirects = fallbackIndex >= 0
    ? `${cleaned.slice(0, fallbackIndex).trimEnd()}\n\n${generatedBlock}\n${cleaned.slice(fallbackIndex + 1)}`
    : `${cleaned}\n\n${generatedBlock}\n`;

  await writeFile(DIST_REDIRECTS_PATH, `${nextRedirects.trim()}\n`, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateIntelBriefingPages();
}