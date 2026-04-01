import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { ArticleStructuredData } from '@/components/intel/ArticleStructuredData';
import { BriefingCard } from '@/components/intel/BriefingCard';
import { SocialShareBar } from '@/components/intel/SocialShareBar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { ArticleContent } from '@/components/intel/ArticleMarkdownRenderer';

export default function IntelBriefingArticle() {
  const { slug } = useParams<{ slug: string }>();

  const { data: isPublic, isLoading: accessLoading } = useQuery({
    queryKey: ['intel-public-access'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'intel_briefings_public')
        .maybeSingle();
      return data?.value === 'true';
    },
  });

  const { data: article, isLoading, error } = useQuery({
    queryKey: ['intel-briefing', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefings')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  // Fetch related briefings
  const { data: related } = useQuery({
    queryKey: ['intel-briefing-related', article?.related_slugs],
    queryFn: async () => {
      if (!article?.related_slugs || article.related_slugs.length === 0) return [];
      const { data } = await supabase
        .from('intel_briefings')
        .select('slug, title, subtitle, category, featured_image_url, published_at, tags')
        .in('slug', article.related_slugs)
        .eq('is_published', true);
      return data || [];
    },
    enabled: !!article?.related_slugs && article.related_slugs.length > 0,
  });

  if (!accessLoading && !isPublic) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-2">Coming Soon</h1>
          <p className="text-muted-foreground">This content is not yet available.</p>
        </div>
      </SiteLayout>
    );
  }

  if (isLoading || accessLoading) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
            <div className="h-8 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-64 bg-muted rounded mt-8" />
          </div>
        </div>
      </SiteLayout>
    );
  }

  if (!article) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Briefing Not Found</h1>
          <p className="text-muted-foreground mb-6">This intel briefing doesn't exist or hasn't been published yet.</p>
          <Link to="/intel" className="text-primary hover:underline">← Back to Intel Briefings</Link>
        </div>
      </SiteLayout>
    );
  }

  const articleUrl = `https://blackbox.farm/intel/briefing/${article.slug}`;
  // Share URL routes through og.blackbox.farm so social crawlers get proper OG meta tags
  const shareUrl = `https://og.blackbox.farm/og-meta?slug=${encodeURIComponent(article.slug)}`;

  return (
    <SiteLayout>
      <ArticleStructuredData
        title={article.seo_title || article.title}
        description={article.seo_description || article.subtitle || ''}
        datePublished={article.published_at || article.created_at}
        author={article.author || undefined}
        imageUrl={article.featured_image_url || undefined}
        slug={article.slug}
        category={article.category || undefined}
        tags={article.tags || undefined}
      />

      <article className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <Link to="/intel" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Intel Briefings
          </Link>

          {/* Header */}
          <header className="mb-8 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs uppercase tracking-wider">
                {(article.category || 'general').replace(/-/g, ' ')}
              </Badge>
              {article.tags?.map((tag) => (
                <span key={tag} className="text-[10px] text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">
                  #{tag}
                </span>
              ))}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold leading-tight">{article.title}</h1>
            {article.subtitle && (
              <p className="text-lg text-muted-foreground">{article.subtitle}</p>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {article.author || 'BlackBox Research'}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(article.published_at || article.created_at), 'MMMM d, yyyy')}
              </span>
            </div>

            {/* Published by line + TOP share bar */}
            <div className="text-xs text-muted-foreground border-t border-b border-border py-3 mt-2 space-y-2">
              <p>
                Published by <strong className="text-foreground">BlackBox Farm</strong> | <strong className="text-foreground">HoldersIntel</strong>{' '}
                Category: {(article.category || 'General').replace(/-/g, ' ')} | Solana Token Intelligence
              </p>
              <SocialShareBar url={articleUrl} title={article.title} description={article.subtitle || undefined} />
            </div>
          </header>

          {/* Hero image */}
          {article.featured_image_url && (
            <div className="rounded-xl overflow-hidden mb-8">
              <img
                src={article.featured_image_url}
                alt={article.title}
                className="w-full aspect-[1200/630] object-cover"
              />
            </div>
          )}

          {/* Article content with publication-grade rendering */}
          <ArticleContent content={article.content_md} />

          {/* BOTTOM share bar — just above related/footer */}
          <div className="mt-12 border-t border-border pt-4">
            <SocialShareBar url={articleUrl} title={article.title} description={article.subtitle || undefined} />
          </div>

          {/* Related Briefings */}
          {related && related.length > 0 && (
            <div className="mt-8 pt-8 border-t border-border">
              <h2 className="text-xl font-semibold mb-6">Related Briefings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {related.map((r) => (
                  <BriefingCard key={r.slug} {...r} />
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </SiteLayout>
  );
}
