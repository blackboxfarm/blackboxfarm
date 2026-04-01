import { useEffect } from 'react';

interface ArticleStructuredDataProps {
  title: string;
  description: string;
  datePublished: string;
  author?: string;
  imageUrl?: string;
  slug: string;
  category?: string;
  tags?: string[];
}

export function ArticleStructuredData({
  title,
  description,
  datePublished,
  author = 'BlackBox Research',
  imageUrl,
  slug,
  category,
  tags = [],
}: ArticleStructuredDataProps) {
  useEffect(() => {
    // Set page title and meta
    const prev = document.title;
    document.title = `${title} | Intel Briefings | BlackBox Farm`;

    const setMeta = (name: string, content: string, prop = 'name') => {
      let el = document.querySelector(`meta[${prop}="${name}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(prop, name);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta('description', description);
    setMeta('og:title', title, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:type', 'article', 'property');
    setMeta('og:url', `https://blackbox.farm/intel/briefing/${slug}`, 'property');
    if (imageUrl) setMeta('og:image', imageUrl, 'property');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    if (imageUrl) setMeta('twitter:image', imageUrl);
    setMeta('article:published_time', datePublished, 'property');
    if (category) setMeta('article:section', category, 'property');

    // JSON-LD
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
      mainEntityOfPage: `https://blackbox.farm/intel/${slug}`,
      image: imageUrl || undefined,
      about: ['Solana', 'holder analysis', 'wallet tracing', 'on-chain intelligence', ...(tags || [])],
      keywords: tags?.join(', '),
      isPartOf: { '@type': 'WebSite', name: 'BlackBox Farm', url: 'https://blackbox.farm' },
    });
    document.head.appendChild(script);

    return () => {
      document.title = prev;
      document.getElementById('intel-briefing-jsonld')?.remove();
    };
  }, [title, description, datePublished, author, imageUrl, slug, category, tags]);

  return null;
}
