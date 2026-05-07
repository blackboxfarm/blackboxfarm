import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PLATFORM_ICONS } from '@/components/admin/publications/exposure-shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrossPostStripProps {
  briefingId: string;
  variant?: 'compact' | 'full';
}

interface PubRow {
  platform: string;
  published_url: string | null;
  published_at: string;
}

/**
 * Renders a strip of platform icons linking out to every external republish
 * of this article. Drives backlink reciprocity + reader trust.
 * - compact: small icon-only row (top of article)
 * - full:   labelled chips with platform names (bottom of article)
 */
export function CrossPostStrip({ briefingId, variant = 'compact' }: CrossPostStripProps) {
  const { data: pubs } = useQuery({
    queryKey: ['intel-cross-posts', briefingId],
    queryFn: async () => {
      const { data } = await supabase
        .from('intel_publications')
        .select('platform, published_url, published_at')
        .eq('briefing_id', briefingId)
        .not('published_url', 'is', null)
        .order('published_at', { ascending: false });
      return (data || []) as PubRow[];
    },
    enabled: !!briefingId,
  });

  // Dedupe to one entry per platform (latest URL wins)
  const byPlatform = new Map<string, PubRow>();
  (pubs || []).forEach(p => {
    if (!p.published_url) return;
    if (!byPlatform.has(p.platform)) byPlatform.set(p.platform, p);
  });
  const items = Array.from(byPlatform.values());
  if (items.length === 0) return null;

  if (variant === 'compact') {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span className="uppercase tracking-widest font-semibold">Also on</span>
          <div className="flex items-center gap-1 flex-wrap">
            {items.map(p => {
              const Icon = PLATFORM_ICONS[p.platform] || ExternalLink;
              return (
                <Tooltip key={p.platform}>
                  <TooltipTrigger asChild>
                    <a
                      href={p.published_url!}
                      target="_blank"
                      rel="noopener nofollow external"
                      className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      <Icon className="h-3 w-3" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Read on {p.platform}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          This Briefing Is Also Published On
        </h3>
        <span className="text-[10px] text-muted-foreground/70">{items.length} platform{items.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(p => {
          const Icon = PLATFORM_ICONS[p.platform] || ExternalLink;
          return (
            <a
              key={p.platform}
              href={p.published_url!}
              target="_blank"
              rel="noopener nofollow external"
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border',
                'bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary',
                'text-xs font-medium transition-colors group'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{p.platform}</span>
              <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
            </a>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        BlackBox Farm syndicates intel briefings across the open web. Click any platform to read the mirrored version and see community discussion.
      </p>
    </div>
  );
}