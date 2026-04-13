import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ArrowLeft, Check, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  targetId: string | null;
  onBack: () => void;
}

export function FotobombGallery({ targetId, onBack }: Props) {
  const [filter, setFilter] = useState<string>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: target } = useQuery({
    queryKey: ['fotobomb-target', targetId],
    queryFn: async () => {
      if (!targetId) return null;
      const { data, error } = await supabase
        .from('fotobomb_targets')
        .select('*')
        .eq('id', targetId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!targetId,
  });

  const { data: images, isLoading } = useQuery({
    queryKey: ['fotobomb-images', targetId, filter],
    queryFn: async () => {
      if (!targetId) return [];
      let query = supabase
        .from('fotobomb_images')
        .select('*')
        .eq('target_id', targetId)
        .order('posted_at', { ascending: true, nullsFirst: false });

      if (filter !== 'all') {
        query = query.eq('review_status', filter);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!targetId,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase
        .from('fotobomb_images')
        .update({ review_status: status, reviewed_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, { status, ids }) => {
      toast.success(`${ids.length} photo(s) ${status}`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['fotobomb-images', targetId] });
    },
  });

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!images) return;
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map((i: any) => i.id)));
    }
  };

  const handleBulkAction = (status: string) => {
    if (selectedIds.size === 0) return;
    reviewMutation.mutate({ ids: Array.from(selectedIds), status });
  };

  const handleSingleReview = (id: string, status: string) => {
    reviewMutation.mutate({ ids: [id], status });
  };

  if (!targetId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a target from the Targets tab to review photos.
        </CardContent>
      </Card>
    );
  }

  const counts = {
    pending: images?.filter((i: any) => i.review_status === 'pending').length ?? 0,
    approved: images?.filter((i: any) => i.review_status === 'approved').length ?? 0,
    rejected: images?.filter((i: any) => i.review_status === 'rejected').length ?? 0,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h3 className="font-semibold">{target?.page_name || 'Loading…'}</h3>
            <p className="text-xs text-muted-foreground">
              Sorted oldest → newest
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">⏳ Pending ({counts.pending})</SelectItem>
              <SelectItem value="approved">✅ Approved ({counts.approved})</SelectItem>
              <SelectItem value="rejected">❌ Rejected ({counts.rejected})</SelectItem>
              <SelectItem value="all">📋 All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="default" onClick={() => handleBulkAction('approved')}>
            <Check className="h-3 w-3 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleBulkAction('rejected')}>
            <X className="h-3 w-3 mr-1" /> Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Select all */}
      {images && images.length > 0 && (
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          {selectedIds.size === images.length ? 'Deselect All' : `Select All (${images.length})`}
        </Button>
      )}

      {/* Gallery grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !images?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No {filter !== 'all' ? filter : ''} photos found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images.map((img: any) => (
            <div
              key={img.id}
              className={`relative group rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                selectedIds.has(img.id) 
                  ? 'border-primary ring-2 ring-primary/30' 
                  : 'border-border hover:border-muted-foreground'
              }`}
              onClick={() => handleToggleSelect(img.id)}
            >
              {/* Image */}
              <div className="aspect-square bg-muted">
                <img
                  src={img.image_url}
                  alt={img.caption?.slice(0, 50) || 'Facebook photo'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '';
                    (e.target as HTMLImageElement).classList.add('hidden');
                  }}
                />
              </div>

              {/* Selection checkbox overlay */}
              <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                selectedIds.has(img.id)
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-background/80 border-muted-foreground/50'
              }`}>
                {selectedIds.has(img.id) && <Check className="h-3 w-3" />}
              </div>

              {/* Status badge */}
              <div className="absolute top-2 right-2">
                <Badge
                  variant={img.review_status === 'approved' ? 'default' : img.review_status === 'rejected' ? 'destructive' : 'secondary'}
                  className="text-[10px] px-1.5 py-0"
                >
                  {img.review_status === 'approved' ? '✅' : img.review_status === 'rejected' ? '❌' : '⏳'}
                </Badge>
              </div>

              {/* Date overlay */}
              {img.posted_at && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1">
                  {format(new Date(img.posted_at), 'MMM d, yyyy')}
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); handleSingleReview(img.id, 'approved'); }}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); handleSingleReview(img.id, 'rejected'); }}
                >
                  <X className="h-3 w-3" />
                </Button>
                {img.image_url && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs"
                    onClick={(e) => { e.stopPropagation(); window.open(img.image_url, '_blank'); }}
                  >
                    🔗
                  </Button>
                )}
              </div>

              {/* Caption tooltip */}
              {img.caption && (
                <div className="absolute bottom-6 left-0 right-0 bg-black/70 text-white text-[9px] px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                  {img.caption.slice(0, 80)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
