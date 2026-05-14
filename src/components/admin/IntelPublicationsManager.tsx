import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { PublicationForm } from './publications/PublicationForm';
import { CalendarView } from './publications/CalendarView';
import { PlatformView } from './publications/PlatformView';
import { ArticleView } from './publications/ArticleView';
import { Calendar, LayoutGrid, Newspaper, CalendarDays } from 'lucide-react';

export const IntelPublicationsManager = () => {
  const queryClient = useQueryClient();
  const [viewTab, setViewTab] = useState('month');

  // Fetch briefings for dropdown
  const { data: briefings = [] } = useQuery({
    queryKey: ['intel-briefings-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefings')
        .select('id, title, slug, published_at')
        .eq('is_published', true)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch publications
  const { data: publications = [] } = useQuery({
    queryKey: ['intel-publications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_publications')
        .select('id, briefing_id, platform, content_depth, is_breadcrumb, published_url, notes, published_at')
        .order('published_at', { ascending: false });
      if (error) throw error;
      // Enrich with briefing titles
      const real = (data || []).map((p: any) => ({
        ...p,
        briefing_title: briefings.find(b => b.id === p.briefing_id)?.title || 'Unknown',
      }));
      // Synthesize the original Website publication for every published briefing
      // using the article's own published_at. These are virtual rows (id prefix
      // `synthetic-`) so they show in calendar/article/platform views and count
      // toward the dropdown badge without requiring a manual log.
      const synthetic = briefings.map((b: any) => ({
        id: `synthetic-website-${b.id}`,
        briefing_id: b.id,
        platform: 'Website',
        content_depth: 100,
        is_breadcrumb: false,
        published_url: `https://blackbox.farm/intel/briefing/${b.slug}`,
        notes: 'original (auto)',
        published_at: b.published_at,
        briefing_title: b.title,
        synthetic: true,
      }));
      return [...synthetic, ...real];
    },
    enabled: briefings.length > 0,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('intel_publications').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intel-publications'] });
      queryClient.invalidateQueries({ queryKey: ['intel-publications', 'exposure-all'] });
      queryClient.invalidateQueries({ queryKey: ['intel-publications', 'exposure'] });
      toast({ title: 'Publication logged' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (id.startsWith('synthetic-')) {
        throw new Error('Auto-generated original Website post — edit the article\'s published date instead.');
      }
      const { error } = await supabase.from('intel_publications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intel-publications'] });
      queryClient.invalidateQueries({ queryKey: ['intel-publications', 'exposure-all'] });
      queryClient.invalidateQueries({ queryKey: ['intel-publications', 'exposure'] });
      toast({ title: 'Publication deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <PublicationForm
        briefings={briefings}
        publications={publications}
        onSubmit={data => addMutation.mutate(data)}
        isSubmitting={addMutation.isPending}
      />

      <Tabs value={viewTab} onValueChange={setViewTab}>
        <TabsList>
          <TabsTrigger value="month"><Calendar className="h-3.5 w-3.5 mr-1" />Month</TabsTrigger>
          <TabsTrigger value="week"><CalendarDays className="h-3.5 w-3.5 mr-1" />Week</TabsTrigger>
          <TabsTrigger value="platform"><LayoutGrid className="h-3.5 w-3.5 mr-1" />Platform</TabsTrigger>
          <TabsTrigger value="article"><Newspaper className="h-3.5 w-3.5 mr-1" />Article</TabsTrigger>
        </TabsList>
        <TabsContent value="month">
          <CalendarView publications={publications} mode="month" />
        </TabsContent>
        <TabsContent value="week">
          <CalendarView publications={publications} mode="week" />
        </TabsContent>
        <TabsContent value="platform">
          <PlatformView publications={publications} onDelete={id => deleteMutation.mutate(id)} />
        </TabsContent>
        <TabsContent value="article">
          <ArticleView publications={publications} briefings={briefings} onDelete={id => deleteMutation.mutate(id)} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
