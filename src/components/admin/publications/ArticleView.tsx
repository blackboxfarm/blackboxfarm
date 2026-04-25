import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Trash2, ChevronDown, ChevronRight, Link2, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ALL_PLATFORMS as ALL_PLATFORMS_SHARED } from './exposure-shared';

interface Publication {
  id: string;
  briefing_id: string;
  platform: string;
  content_depth: number;
  published_url: string | null;
  notes: string | null;
  published_at: string;
  briefing_title?: string;
  is_breadcrumb?: boolean;
}

interface ArticleViewProps {
  publications: Publication[];
  briefings: { id: string; title: string; slug: string }[];
  onDelete?: (id: string) => void;
}

const depthDot = (depth: number) => {
  if (depth >= 100) return 'bg-green-500';
  if (depth >= 75) return 'bg-blue-500';
  if (depth >= 50) return 'bg-amber-500';
  return 'bg-red-500';
};

const depthLabel = (depth: number) => {
  if (depth >= 100) return 'text-green-400';
  if (depth >= 75) return 'text-blue-400';
  if (depth >= 50) return 'text-amber-400';
  return 'text-red-400';
};

const ALL_PLATFORMS = ALL_PLATFORMS_SHARED;

export const ArticleView = ({ publications, briefings, onDelete }: ArticleViewProps) => {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Group by briefing
  const grouped = briefings.map(b => ({
    ...b,
    pubs: publications.filter(p => p.briefing_id === b.id).sort((a, c) => new Date(a.published_at).getTime() - new Date(c.published_at).getTime()),
  })).filter(g => g.pubs.length > 0);

  if (grouped.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">No publications logged yet.</p>;
  }

  return (
    <div className="space-y-2">
      {grouped.map(article => {
        const platforms = new Set(article.pubs.map(p => p.platform));
        const isOpen = openIds.has(article.id);

        return (
          <Collapsible key={article.id} open={isOpen} onOpenChange={() => toggle(article.id)}>
            <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="text-sm font-medium text-foreground truncate">{article.title}</span>
                <Badge variant="outline" className="text-xs shrink-0">{article.pubs.length} posts</Badge>
              </div>
              <div className="flex gap-1 shrink-0">
                {ALL_PLATFORMS.map(p => (
                  <div
                    key={p}
                    className={cn(
                      'w-2 h-2 rounded-full',
                      platforms.has(p) ? 'bg-primary' : 'bg-muted-foreground/20'
                    )}
                    title={p}
                  />
                ))}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-7 mt-1 space-y-1 pb-2">
                {article.pubs.map(pub => (
                  <div key={pub.id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded hover:bg-muted/50">
                    <div className={cn('w-2 h-2 rounded-full shrink-0', depthDot(pub.content_depth))} />
                    <span className="text-muted-foreground w-16 shrink-0">{format(new Date(pub.published_at), 'MMM d')}</span>
                    <span className="text-foreground w-24 shrink-0">{pub.platform}</span>
                    {pub.is_breadcrumb ? (
                      <Badge variant="outline" className="h-4 px-1 text-[9px] shrink-0">
                        <Link2 className="h-2.5 w-2.5 mr-0.5" />link
                      </Badge>
                    ) : (
                      <span className={cn('w-10 shrink-0 font-medium inline-flex items-center gap-1', depthLabel(pub.content_depth))}>
                        <Repeat className="h-2.5 w-2.5" />{pub.content_depth}%
                      </span>
                    )}
                    <span className="text-muted-foreground truncate flex-1">{pub.notes || ''}</span>
                    <div className="flex gap-2 shrink-0">
                      {pub.published_url && (
                        <a href={pub.published_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 text-primary" />
                        </a>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(pub.id)} className="text-destructive hover:text-destructive/80">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
};
