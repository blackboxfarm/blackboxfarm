import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ALL_PLATFORMS, PLATFORM_ICONS, PublicationLite, missingPlatforms } from './exposure-shared';
import { format } from 'date-fns';
import { ExternalLink, AlertTriangle, Link2, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExposurePanelProps {
  briefingId: string | null;
  briefingTitle?: string;
}

/**
 * Per-article exposure history shown inside the article edit panel.
 * Lists every publication chronologically + flags missing platforms.
 */
export const ExposurePanel = ({ briefingId, briefingTitle }: ExposurePanelProps) => {
  const { data: pubs = [], isLoading } = useQuery({
    queryKey: ['intel-publications', 'exposure', briefingId],
    queryFn: async (): Promise<PublicationLite[]> => {
      if (!briefingId) return [];
      const { data, error } = await supabase
        .from('intel_publications')
        .select('id, briefing_id, platform, content_depth, is_breadcrumb, published_url, published_at')
        .eq('briefing_id', briefingId)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PublicationLite[];
    },
    enabled: !!briefingId,
  });

  if (!briefingId) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Exposure History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Save the article first to start logging publications.</p>
        </CardContent>
      </Card>
    );
  }

  const missing = missingPlatforms(pubs, briefingId);
  const breadcrumbs = pubs.filter(p => p.is_breadcrumb);
  const republishes = pubs.filter(p => !p.is_breadcrumb);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Exposure History</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{pubs.length} posts</Badge>
            <Badge variant="outline" className="text-[10px]">
              <Repeat className="h-2.5 w-2.5 mr-0.5" />{republishes.length}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <Link2 className="h-2.5 w-2.5 mr-0.5" />{breadcrumbs.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Coverage map */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Coverage</p>
          <div className="flex flex-wrap gap-1">
            {ALL_PLATFORMS.map(p => {
              const Icon = PLATFORM_ICONS[p];
              const count = pubs.filter(x => x.platform === p).length;
              const has = count > 0;
              return (
                <span
                  key={p}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border',
                    has
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-muted/30 text-muted-foreground/50 border-border'
                  )}
                  title={p}
                >
                  {Icon && <Icon className="h-2.5 w-2.5" />}
                  {p}
                  {count > 1 && <span className="font-semibold">×{count}</span>}
                </span>
              );
            })}
          </div>
        </div>

        {/* Gaps alert */}
        {missing.length > 0 && (
          <div className="flex items-start gap-2 p-2 rounded border border-amber-500/30 bg-amber-500/5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-500 font-medium">Not yet seeded on {missing.length} platforms</p>
              <p className="text-muted-foreground mt-0.5">{missing.slice(0, 8).join(', ')}{missing.length > 8 ? '…' : ''}</p>
            </div>
          </div>
        )}

        {/* Timeline */}
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : pubs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No publications logged yet for this article.</p>
        ) : (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Timeline</p>
            {pubs.map(p => {
              const Icon = PLATFORM_ICONS[p.platform];
              return (
                <div key={p.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                  <span className="text-muted-foreground w-16 shrink-0">{format(new Date(p.published_at), 'MMM d')}</span>
                  <span className="inline-flex items-center gap-1 w-28 shrink-0 text-foreground">
                    {Icon && <Icon className="h-3 w-3" />}
                    {p.platform}
                  </span>
                  {p.is_breadcrumb ? (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      <Link2 className="h-2.5 w-2.5 mr-0.5" />breadcrumb
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      <Repeat className="h-2.5 w-2.5 mr-0.5" />{p.content_depth}%
                    </Badge>
                  )}
                  <span className="flex-1" />
                  {p.published_url && (
                    <a href={p.published_url} target="_blank" rel="noopener noreferrer" className="text-primary">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};