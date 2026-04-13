import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Eye, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  onViewGallery: (targetId: string) => void;
}

export function FotobombTargetList({ onViewGallery }: Props) {
  const { data: targets, isLoading, refetch } = useQuery({
    queryKey: ['fotobomb-targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fotobomb_targets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'scraping': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">📋 Scrape Targets</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !targets?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No targets yet. Add a Facebook page above to start scraping.
          </p>
        ) : (
          <div className="space-y-2">
            {targets.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{t.page_name || 'Unknown'}</span>
                    <Badge variant={statusColor(t.status)} className="text-xs">
                      {t.status === 'scraping' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {t.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="truncate max-w-[300px]">{t.page_url}</span>
                    <span>📸 {t.total_photos_found || 0} photos</span>
                    {t.last_scraped_at && (
                      <span>Last: {format(new Date(t.last_scraped_at), 'MMM d, yyyy')}</span>
                    )}
                  </div>
                  {t.error_message && (
                    <p className="text-xs text-destructive mt-1">{t.error_message}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewGallery(t.id)}
                  disabled={t.status === 'scraping' || !t.total_photos_found}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Review
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
