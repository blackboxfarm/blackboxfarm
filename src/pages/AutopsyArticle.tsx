import { useEffect, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Skull, Calendar, FileText, Twitter } from 'lucide-react';
import { format } from 'date-fns';
import { ArticleContent } from '@/components/intel/ArticleMarkdownRenderer';
import { SocialShareBar } from '@/components/intel/SocialShareBar';
import { getAutopsy, type AutopsyEntry } from '@/data/autopsies';
import { supabase } from '@/integrations/supabase/client';
import { HarmBadge } from '@/components/autopsy/HarmBadge';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AutopsyTweetComposer } from '@/components/admin/autopsies/AutopsyTweetComposer';

export default function AutopsyArticle() {
  const { slug } = useParams<{ slug: string }>();
  const staticAutopsy = slug ? getAutopsy(slug) : undefined;
  const { isSuperAdmin } = useUserRoles();
  const [autopsy, setAutopsy] = useState<AutopsyEntry | undefined | null>(staticAutopsy ?? null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // If not in static list, look up in DB
    if (staticAutopsy || !slug) return;
    supabase
      .from('autopsy_reports')
      .select('slug, title, subtitle, ticker, token_mint, verdict, risk_score, harm_score, harm_headline, harm_breakdown, hero_image_path, source_banner_url, tags, md_content, md_path, published_at')
      .eq('slug', slug)
      .eq('is_current', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setAutopsy(undefined); return; }
        setAutopsy({
          slug: data.slug,
          title: data.title,
          subtitle: data.subtitle ?? '',
          mintAddress: data.token_mint,
          ticker: data.ticker ?? '',
          verdict: data.verdict ?? 'AUTOPSY',
          riskScore: data.risk_score ?? '—',
          harmScore: (data as any).harm_score ?? null,
          harmHeadline: (data as any).harm_headline ?? null,
          harmBreakdown: (data as any).harm_breakdown ?? null,
          publishedAt: data.published_at,
          mdPath: data.md_path ?? `/autopsies/${data.slug}.md`,
          downloadName: `${data.ticker ?? 'token'}_Autopsy_BlackBoxFarm.md`,
          tags: (data.tags ?? []) as string[],
          heroImage: data.hero_image_path ?? '',
          sourceBanner: data.source_banner_url ?? undefined,
        });
        // DB-backed: render md_content directly
        if (data.md_content) { setContent(data.md_content); setLoading(false); }
      });
  }, [slug, staticAutopsy]);

  useEffect(() => {
    if (!autopsy) return;
    if (content) { setLoading(false); return; } // already populated from DB
    setLoading(true);
    fetch(autopsy.mdPath)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.text();
      })
      .then((txt) => { setContent(txt); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopsy?.slug]);

  useEffect(() => {
    if (!autopsy) return;
    document.title = `${autopsy.title} | Token Autopsy — BlackBox Farm`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', autopsy.subtitle);

    // OG / Twitter meta tags
    const absoluteImg = autopsy.heroImage.startsWith('http')
      ? autopsy.heroImage
      : `${typeof window !== 'undefined' ? window.location.origin : 'https://blackbox.farm'}${autopsy.heroImage}`;
    const tags: Array<[string, string, string]> = [
      ['property', 'og:title', autopsy.title],
      ['property', 'og:description', autopsy.subtitle],
      ['property', 'og:image', absoluteImg],
      ['property', 'og:type', 'article'],
      ['property', 'og:url', `https://blackbox.farm/autopsy/${autopsy.slug}`],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', autopsy.title],
      ['name', 'twitter:description', autopsy.subtitle],
      ['name', 'twitter:image', absoluteImg],
    ];
    const created: HTMLMetaElement[] = [];
    tags.forEach(([attr, key, val]) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
        created.push(el);
      }
      el.setAttribute('content', val);
    });

    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'autopsy-jsonld';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: autopsy.title,
      description: autopsy.subtitle,
      datePublished: autopsy.publishedAt,
      image: absoluteImg,
      author: { '@type': 'Organization', name: 'BlackBox Farm / HoldersIntel' },
      publisher: { '@type': 'Organization', name: 'BlackBox Farm' },
      url: `https://blackbox.farm/autopsy/${autopsy.slug}`,
    });
    document.head.appendChild(ld);
    return () => {
      document.getElementById('autopsy-jsonld')?.remove();
      created.forEach((el) => el.remove());
    };
  }, [autopsy]);

  if (autopsy === undefined) return <Navigate to="/autopsy" replace />;
  if (autopsy === null) return <SiteLayout><div className="container mx-auto px-4 py-12 text-sm text-muted-foreground">Loading autopsy…</div></SiteLayout>;

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/autopsy/${autopsy.slug}`
    : `https://blackbox.farm/autopsy/${autopsy.slug}`;

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-4xl">
        <Link to="/autopsy" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> All Autopsies
        </Link>

        {/* Hero autopsy banner */}
        <div className="rounded-xl overflow-hidden border border-destructive/30 mb-6 bg-black">
          <img
            src={autopsy.heroImage}
            alt={`${autopsy.title} — forensic autopsy banner`}
            width={1500}
            height={500}
            className="w-full h-auto block"
          />
        </div>

        {/* Header card (themed) */}
        <div className="rounded-xl border border-destructive/30 bg-card p-5 md:p-6 mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/40 uppercase tracking-wider">
              <Skull className="h-3 w-3 mr-1" /> {autopsy.verdict}
            </Badge>
            {typeof autopsy.harmScore === 'number' ? (
              <HarmBadge score={autopsy.harmScore} headline={autopsy.harmHeadline} breakdown={autopsy.harmBreakdown} size="md" />
            ) : (
              <Badge variant="outline" className="uppercase tracking-wider">Risk {autopsy.riskScore}</Badge>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <Calendar className="h-3 w-3" />{format(new Date(autopsy.publishedAt), 'MMMM d, yyyy')}
            </span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold mb-2">{autopsy.title}</h1>
          <p className="text-muted-foreground text-sm md:text-base mb-4">{autopsy.subtitle}</p>
          {autopsy.harmHeadline && (
            <p className="text-sm text-destructive font-medium mb-4">☠ {autopsy.harmHeadline}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a href={autopsy.mdPath} download={autopsy.downloadName}>
              <Button size="sm" variant="default" className="gap-1.5">
                <Download className="h-4 w-4" /> Download .md
              </Button>
            </a>
            <Link to={`/autopsy/${autopsy.slug}/raw`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5">
                <FileText className="h-4 w-4" /> View Raw
              </Button>
            </Link>
            <code className="text-[10px] md:text-xs px-2 py-1 rounded bg-muted text-muted-foreground break-all">
              {autopsy.mintAddress}
            </code>
          </div>
        </div>

        {/* White content card — black-on-white document feel on dark site */}
        <article className="rounded-xl bg-white text-black shadow-xl border border-border overflow-hidden">
          <div className="px-5 md:px-10 py-8 md:py-12 autopsy-doc">
            {loading && (
              <p className="text-gray-500 text-sm">Loading autopsy report…</p>
            )}
            {error && (
              <p className="text-red-600 text-sm">Failed to load autopsy report. Please try the download link above.</p>
            )}
            {!loading && !error && content && (
              <ArticleContent content={content} />
            )}
          </div>
        </article>

        <div className="mt-8">
          <SocialShareBar
            url={shareUrl}
            title={autopsy.title}
            description={autopsy.subtitle}
            slug={autopsy.slug}
          />
        </div>

        <p className="text-xs text-muted-foreground/70 text-center mt-10 max-w-2xl mx-auto">
          © 2026 BlackBox Farm / HoldersIntel · Licensed under CC BY-NC-ND 4.0 · Forensic analysis based on public Solana ledger data.
        </p>
      </div>

      {isSuperAdmin && (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              size="lg"
              className="fixed bottom-6 right-6 z-50 shadow-lg gap-2"
              variant="default"
            >
              <Twitter className="h-4 w-4" /> Generate X Post
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>DeadTokens X Post — {autopsy.ticker || autopsy.slug}</DialogTitle>
            </DialogHeader>
            <AutopsyTweetComposer
              input={{
                ticker: autopsy.ticker,
                title: autopsy.title,
                mintAddress: autopsy.mintAddress,
                slug: autopsy.slug,
                verdict: autopsy.verdict,
                harmHeadline: autopsy.harmHeadline ?? null,
                harmScore: autopsy.harmScore ?? null,
              }}
              heroImage={autopsy.heroImage}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Override muted text inside the white doc so it remains readable */}
      <style>{`
        .autopsy-doc :where(p, li, blockquote) { color: #1f2937; }
        .autopsy-doc :where(h1, h2, h3, h4, strong) { color: #0f172a; }
        .autopsy-doc :where(em) { color: #374151; }
        .autopsy-doc :where(code) { color: #0f172a; background: #f3f4f6; padding: 0 4px; border-radius: 4px; }
        .autopsy-doc :where(pre) { background: #0f172a; color: #f1f5f9; padding: 16px; border-radius: 8px; overflow-x: auto; }
        .autopsy-doc :where(pre code) { background: transparent; color: inherit; padding: 0; }
        .autopsy-doc :where(table) { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.9rem; }
        .autopsy-doc :where(th, td) { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; vertical-align: top; }
        .autopsy-doc :where(th) { background: #f9fafb; font-weight: 600; }
        .autopsy-doc :where(a) { color: #2563eb; text-decoration: underline; word-break: break-word; }
        .autopsy-doc :where(hr) { border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0; }
        .autopsy-doc :where(blockquote) { border-left: 4px solid #ef4444; background: #fef2f2; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0; }
      `}</style>
    </SiteLayout>
  );
}