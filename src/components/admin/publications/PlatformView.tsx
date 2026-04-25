import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link2 } from 'lucide-react';

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

interface PlatformViewProps {
  publications: Publication[];
  onDelete?: (id: string) => void;
}

const depthBadge = (depth: number) => {
  const colors: Record<number, string> = {
    100: 'bg-green-500/20 text-green-400 border-green-500/30',
    75: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    50: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    25: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return colors[depth] || colors[25];
};

export const PlatformView = ({ publications, onDelete }: PlatformViewProps) => {
  const platforms = [...new Set(publications.map(p => p.platform))].sort();

  if (platforms.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">No publications logged yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {platforms.map(platform => {
        const pubs = publications
          .filter(p => p.platform === platform)
          .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

        return (
          <Card key={platform}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                {platform}
                <Badge variant="outline" className="text-xs">{pubs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pubs.map(pub => (
                <div key={pub.id} className="flex items-start justify-between gap-2 text-xs border-b border-border pb-2 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground truncate font-medium">{pub.briefing_title || 'Untitled'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {pub.is_breadcrumb ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border border-primary/40 bg-primary/10 text-primary inline-flex items-center gap-0.5">
                          <Link2 className="h-2.5 w-2.5" />breadcrumb
                        </span>
                      ) : (
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] border', depthBadge(pub.content_depth))}>
                          {pub.content_depth}%
                        </span>
                      )}
                      <span className="text-muted-foreground">{format(new Date(pub.published_at), 'MMM d')}</span>
                    </div>
                    {pub.notes && <p className="text-muted-foreground italic mt-0.5 truncate">{pub.notes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
