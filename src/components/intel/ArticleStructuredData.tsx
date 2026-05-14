import { useEffect } from 'react';

const SITE_URL = 'https://blackbox.farm';

function normalizeImageUrl(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  if (imageUrl.startsWith('/')) return `${SITE_URL}${imageUrl}`;
  return `${SITE_URL}/${imageUrl.replace(/^\/+/, '')}`;
}

interface ArticleStructuredDataProps {
  title: string;
  description: string;
  datePublished: string;
  author?: string;
  imageUrl?: string;
  socialImageUrl?: string;
  slug: string;
  category?: string;
  tags?: string[];
  sameAs?: string[];
}

export function ArticleStructuredData({
  title,
  description,
  datePublished,
  author = 'BlackBox Research',
  imageUrl,
  socialImageUrl,
  slug,
  category,
  tags = [],
  sameAs = [],
}: ArticleStructuredDataProps) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} | Intel Briefings | BlackBox Farm`;

    const normalizedImageUrl = normalizeImageUrl(imageUrl);
    // Twitter/Facebook/LinkedIn render 1.91:1; prefer the dedicated social card
    const normalizedSocialUrl = normalizeImageUrl(socialImageUrl) || normalizedImageUrl;

    const setMeta = (name: string, content: string, prop = 'name') => {
      let el = document.querySelector(`meta[${prop}="${name}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(prop, name);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    // Dynamic canonical
    const articleUrl = `${SITE_URL}/intel/briefing/${slug}`;
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    const prevCanonical = canonical?.href;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = articleUrl;

    const ogTitle = title.length > 60 ? title.slice(0, 57) + '...' : title;

    setMeta('description', description);
    setMeta('og:title', ogTitle, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:type', 'article', 'property');
    setMeta('og:url', articleUrl, 'property');
    if (normalizedSocialUrl) {
      setMeta('og:image', normalizedSocialUrl, 'property');
      setMeta('og:image:secure_url', normalizedSocialUrl, 'property');
      setMeta('og:image:width', '1200', 'property');
      setMeta('og:image:height', socialImageUrl ? '628' : '630', 'property');
      setMeta('twitter:image', normalizedSocialUrl);
      setMeta('image', normalizedSocialUrl, 'itemprop');
    }
    setMeta('twitter:card', normalizedSocialUrl ? 'summary_large_image' : 'summary');
    setMeta('twitter:site', '@HoldersIntel');
    setMeta('twitter:title', ogTitle);
    setMeta('twitter:description', description);
    setMeta('article:published_time', datePublished, 'property');
    if (category) setMeta('article:section', category, 'property');

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'intel-briefing-jsonld';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description,
      datePublished,
      author: { '@type': 'Organization', name: author },
      publisher: {
        '@type': 'Organization',
        name: 'BlackBox Farm',
        url: 'https://blackbox.farm',
        logo: { '@type': 'ImageObject', url: 'https://blackbox.farm/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png' },
      },
      mainEntityOfPage: `https://blackbox.farm/intel/briefing/${slug}`,
      image: normalizedImageUrl || undefined,
      about: ['Solana', 'holder analysis', 'wallet tracing', 'on-chain intelligence', ...(tags || [])],
      keywords: tags?.join(', '),
      isPartOf: { '@type': 'WebSite', name: 'BlackBox Farm', url: 'https://blackbox.farm' },
      sameAs: sameAs.length > 0 ? sameAs : undefined,
    });
    document.head.appendChild(script);

    return () => {
      document.title = prev;
      document.getElementById('intel-briefing-jsonld')?.remove();
      if (prevCanonical) canonical.href = prevCanonical;
    };
  }, [title, description, datePublished, author, imageUrl, socialImageUrl, slug, category, tags, sameAs]);

  return null;
}
