import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Play, Square, RefreshCw, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BackfillState {
  running: boolean;
  offset: number;
  total: number;
  processed: number;
  errors: number;
  done: boolean;
  batchesCompleted: number;
}

export function ReputationBackfillPanel() {
  const [state, setState] = useState<BackfillState>({
    running: false, offset: 0, total: 0, processed: 0, errors: 0, done: false, batchesCompleted: 0,
  });
  const abortRef = useRef(false);

  const runBatch = useCallback(async (offset: number): Promise<{ nextOffset: number; done: boolean } | null> => {
    const { data, error } = await supabase.functions.invoke('reputation-backfill', {
      body: { offset },
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
      errors: prev.errors + (data.errors || 0),
      done: data.done,
      batchesCompleted: prev.batchesCompleted + 1,
    }));

    return { nextOffset: data.nextOffset, done: data.done };
  }, []);

  const startBackfill = useCallback(async () => {
    abortRef.current = false;
    setState(prev => ({ ...prev, running: true, done: false }));
    toast.info('Starting reputation backfill...');

    let currentOffset = state.offset;

    while (!abortRef.current) {
      const result = await runBatch(currentOffset);
      if (!result || result.done) {
        setState(prev => ({ ...prev, running: false, done: result?.done ?? true }));
        if (result?.done) toast.success('Backfill complete!');
        break;
      }
      currentOffset = result.nextOffset;
      // Small delay between batches
      await new Promise(r => setTimeout(r, 500));
    }
  }, [state.offset, runBatch]);

  const stopBackfill = useCallback(() => {
    abortRef.current = true;
    setState(prev => ({ ...prev, running: false }));
    toast.info('Backfill paused — resume anytime');
  }, []);

  const resetBackfill = useCallback(() => {
    setState({ running: false, offset: 0, total: 0, processed: 0, errors: 0, done: false, batchesCompleted: 0 });
  }, []);

  const progressPct = state.total > 0 ? Math.min(100, (state.offset / state.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Reputation Backfill Engine
        </CardTitle>
        <CardDescription>
          Sync dev_wallet_reputation → developer_profiles. Batch-processes wallets with real rug/success data and mesh connections. Zero external API calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          {!state.running ? (
            <Button onClick={startBackfill} disabled={state.done} size="sm">
              <Play className="h-4 w-4 mr-1" />
              {state.offset > 0 ? 'Resume' : 'Start'} Backfill
            </Button>
          ) : (
            <Button onClick={stopBackfill} variant="destructive" size="sm">
              <Square className="h-4 w-4 mr-1" />
              Pause
            </Button>
          )}
          <Button onClick={resetBackfill} variant="outline" size="sm" disabled={state.running}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          {state.done && <Badge variant="default" className="bg-green-600">✅ Complete</Badge>}
          {state.running && <Badge variant="secondary" className="animate-pulse">Processing...</Badge>}
        </div>

        <Progress value={progressPct} className="h-3" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-muted rounded-lg p-3">
            <div className="text-muted-foreground text-xs">Progress</div>
            <div className="font-mono font-bold">{state.offset.toLocaleString()} / {state.total.toLocaleString()}</div>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="text-muted-foreground text-xs">Upserted</div>
            <div className="font-mono font-bold text-green-500">{state.processed.toLocaleString()}</div>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="text-muted-foreground text-xs">Errors</div>
            <div className="font-mono font-bold text-red-500">{state.errors}</div>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="text-muted-foreground text-xs">Batches</div>
            <div className="font-mono font-bold">{state.batchesCompleted}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
