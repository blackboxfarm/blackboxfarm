import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Play, Square, RefreshCw, Link, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BackfillState {
  running: boolean;
  offset: number;
  total: number;
  processed: number;
  skipped: number;
  done: boolean;
  batchesCompleted: number;
  currentLinks: number;
}

export function SocialLinksBackfillPanel() {
  const [state, setState] = useState<BackfillState>({
    running: false, offset: 0, total: 0, processed: 0, skipped: 0, done: false, batchesCompleted: 0, currentLinks: 0,
  });
  const abortRef = useRef(false);

  const runBatch = useCallback(async (offset: number): Promise<{ nextOffset: number; done: boolean } | null> => {
    const { data, error } = await supabase.functions.invoke('social-links-backfill', {
      body: { offset, batchSize: 500 },
    });

    if (error) {
      toast.error(`Batch error: ${error.message}`);
      return null;
    }

    setState(prev => ({
      ...prev,
      offset: data.nextOffset || prev.offset,
      total: data.total || prev.total,
      processed: prev.processed + (data.processed || 0),
      skipped: prev.skipped + (data.skipped || 0),
      done: data.done,
      currentLinks: data.currentLinks || prev.currentLinks,
      batchesCompleted: prev.batchesCompleted + 1,
    }));

    return { nextOffset: data.nextOffset, done: data.done };
  }, []);

  const startBackfill = useCallback(async () => {
    abortRef.current = false;
    setState(prev => ({ ...prev, running: true, done: false, processed: 0, skipped: 0, batchesCompleted: 0 }));
    
    let currentOffset = state.offset;
    while (!abortRef.current) {
      const result = await runBatch(currentOffset);
      if (!result || result.done) break;
      currentOffset = result.nextOffset;
      await new Promise(r => setTimeout(r, 500));
    }

    setState(prev => ({ ...prev, running: false }));
    if (!abortRef.current) toast.success('Social links backfill complete!');
  }, [runBatch, state.offset]);

  const stopBackfill = useCallback(() => {
    abortRef.current = true;
    setState(prev => ({ ...prev, running: false }));
    toast.info('Backfill stopped');
  }, []);

  const progressPct = state.total > 0 ? Math.min(100, (state.offset / state.total) * 100) : 0;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link className="w-4 h-4" />
          Social Links Backfill
        </CardTitle>
        <CardDescription className="text-xs">
          Extract social data from reputation_mesh → token_social_links
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {!state.running ? (
            <Button size="sm" onClick={startBackfill} disabled={state.done}>
              <Play className="w-3 h-3 mr-1" /> {state.done ? 'Done' : 'Start'}
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={stopBackfill}>
              <Square className="w-3 h-3 mr-1" /> Stop
            </Button>
          )}
          {state.done && (
            <Button size="sm" variant="outline" onClick={() => setState(prev => ({ ...prev, offset: 0, done: false, processed: 0, skipped: 0, batchesCompleted: 0 }))}>
              <RefreshCw className="w-3 h-3 mr-1" /> Reset
            </Button>
          )}
        </div>
        
        {(state.running || state.processed > 0) && (
          <>
            <Progress value={progressPct} className="h-2" />
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">✅ {state.processed} links created</Badge>
              <Badge variant="outline">⏭ {state.skipped} skipped</Badge>
              <Badge variant="outline">📦 {state.batchesCompleted} batches</Badge>
              {state.total > 0 && <Badge variant="outline">📊 {state.total} mesh entries</Badge>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
