import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  onSuccess: () => void;
}

export function FotobombTargetForm({ onSuccess }: Props) {
  const [pageUrl, setPageUrl] = useState('');
  const [maxPhotos, setMaxPhotos] = useState(500);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageUrl.trim()) return;

    // Basic validation
    const url = pageUrl.trim();
    if (!url.includes('facebook.com') && !url.includes('fb.com')) {
      toast.error('Please enter a valid Facebook page URL');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fotobomb-scrape', {
        body: { action: 'scrape', pageUrl: url, maxPhotos },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Found ${data.photosFound} photos from page!`);
      setPageUrl('');
      queryClient.invalidateQueries({ queryKey: ['fotobomb-targets'] });
      onSuccess();
    } catch (err: any) {
      console.error('FOTOBOMB scrape error:', err);
      toast.error(err.message || 'Failed to scrape page');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Add Facebook Page Target
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="pageUrl" className="text-xs text-muted-foreground">
              Facebook Page URL
            </Label>
            <Input
              id="pageUrl"
              placeholder="https://www.facebook.com/PageName"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="w-32 space-y-1">
            <Label htmlFor="maxPhotos" className="text-xs text-muted-foreground">
              Max Photos
            </Label>
            <Input
              id="maxPhotos"
              type="number"
              min={10}
              max={5000}
              value={maxPhotos}
              onChange={(e) => setMaxPhotos(Number(e.target.value))}
              disabled={loading}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={loading || !pageUrl.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scraping…
                </>
              ) : (
                '💣 FOTOBOMB'
              )}
            </Button>
          </div>
        </form>
        {loading && (
          <p className="text-xs text-muted-foreground mt-2">
            ⏳ This can take 2-5 minutes depending on page size. Apify is scraping oldest photos first…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
