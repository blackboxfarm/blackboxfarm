import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Play, Square, RefreshCw, Link, CheckCircle, Clock } from 'lucide-react';
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

interface LastRunInfo {
  totalLinks: number;
  meshTotal: number;
  lastRunAt: string | null;
  runCount: number;
  loaded: boolean;
}

export function SocialLinksBackfillPanel() {
  const [state, setState] = useState<BackfillState>({
    running: false, offset: 0, total: 0, processed: 0, skipped: 0, done: false, batchesCompleted: 0, currentLinks: 0,
  });
  const [lastRun, setLastRun] = useState<LastRunInfo>({
    totalLinks: 0, meshTotal: 0, lastRunAt: null, runCount: 0, loaded: false,
  });
  const abortRef = useRef(false);

  // Load previous run status on mount
  useEffect(() => {
    async function loadStatus() {
      try {
        // Get current token_social_links count
        const { count: linkCount } = await supabase
          .from('token_social_links')
          .select('*', { count: 'exact', head: true });

        // Get mesh total for comparison
        const { count: meshCount } = await supabase
          .from('reputation_mesh')
          .select('*', { count: 'exact', head: true })
          .eq('linked_type', 'token')
          .in('source_type', ['x_account', 'telegram', 'x_community', 'website', 'discord']);

        // Get last run info from edge_function_runs
        const { data: lastRuns } = await supabase
          .from('edge_function_runs')
          .select('started_at, status')
          .eq('function_name', 'social-links-backfill')
          .eq('status', 'success')
          .order('started_at', { ascending: false })
          .limit(1);

        // Count today's runs
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { count: todayRuns } = await supabase
          .from('edge_function_runs')
          .select('*', { count: 'exact', head: true })
          .eq('function_name', 'social-links-backfill')
          .eq('status', 'success')
          .gte('started_at', todayStart.toISOString());

        setLastRun({
          totalLinks: linkCount || 0,
          meshTotal: meshCount || 0,
          lastRunAt: lastRuns?.[0]?.started_at || null,
          runCount: todayRuns || 0,
          loaded: true,
        });
      } catch (err) {
        console.warn('Failed to load backfill status:', err);
        setLastRun(prev => ({ ...prev, loaded: true }));
      }
    }
    loadStatus();
  }, [state.done]); // reload when a run completes

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

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const coveragePct = lastRun.meshTotal > 0
    ? Math.min(100, (lastRun.totalLinks / lastRun.meshTotal) * 100).toFixed(1)
    : '0';

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
        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/30 w-fit mt-1">
          ⚡ Automated — runs every ~15 min via orchestrator
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Previous run status */}
        {lastRun.loaded && (
          <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-medium">
              {lastRun.lastRunAt ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  <span>Last run: {formatTimeAgo(lastRun.lastRunAt)}</span>
                  <span className="text-muted-foreground">({lastRun.runCount} batches today)</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-yellow-500" />
                  <span>Never run</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                🔗 {lastRun.totalLinks.toLocaleString()} links stored
              </Badge>
              <Badge variant="outline" className="text-xs">
                📊 {lastRun.meshTotal.toLocaleString()} mesh entries
              </Badge>
              <Badge variant="outline" className="text-xs">
                📈 {coveragePct}% coverage
              </Badge>
            </div>
            {Number(coveragePct) >= 95 && (
              <p className="text-green-600 text-[11px]">
                ✅ Coverage is high — re-running will only pick up new mesh entries.
              </p>
            )}
          </div>
        )}

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
