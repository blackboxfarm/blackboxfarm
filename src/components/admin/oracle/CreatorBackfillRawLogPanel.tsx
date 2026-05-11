import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Pause, Play, RefreshCw, Copy, Filter, Terminal } from 'lucide-react';
import { toast } from 'sonner';

interface BackfillEvent {
  id: string;
  created_at: string;
  function_name: string;
  mint: string;
  table_name: string | null;
  column_name: string | null;
  solscan_url: string | null;
  http_status: number | null;
  duration_ms: number | null;
  from_cache: boolean | null;
  resolved_creator: string | null;
  error_message: string | null;
  response_preview: any;
}

type FilterMode = 'all' | 'success' | 'miss' | 'error';

function shortMint(m: string | null) {
  if (!m) return '—';
  return m.length > 12 ? `${m.slice(0, 6)}…${m.slice(-4)}` : m;
}

function fmtTs(ts: string) {
  try {
    const d = new Date(ts);
    return d.toISOString().slice(11, 23); // HH:MM:SS.mmm
  } catch {
    return ts;
  }
}

function classifyEvent(e: BackfillEvent): 'success' | 'miss' | 'error' {
  if (e.resolved_creator) return 'success';
  if ((e.http_status ?? 0) >= 400 || (e.http_status ?? 0) === 0) return 'error';
  return 'miss';
}

function renderEntry(e: BackfillEvent): string {
  const status = classifyEvent(e);
  const marker = status === 'success' ? '✓' : status === 'miss' ? '○' : '✗';
  const cache = e.from_cache ? 'cache=hit' : 'cache=miss';
  const ms = e.duration_ms != null ? `${e.duration_ms}ms` : '—';
  const ts = fmtTs(e.created_at);
  const tbl = (e.table_name ?? '—').padEnd(26).slice(0, 26);
  const head = `[${ts}] ${marker} ${tbl} ${shortMint(e.mint).padEnd(13)} ${String(e.http_status ?? '—').padStart(3)} ${ms.padStart(7)} ${cache}`;
  const req = `  GET ${e.solscan_url ?? 'internal://creator-resolution/' + e.mint}`;
  const outcome = e.resolved_creator
    ? `  ← creator: ${e.resolved_creator}`
    : `  ← ${e.error_message ?? 'miss'}`;
  let body = '';
  try {
    body = `  response: ${JSON.stringify(e.response_preview)}`;
  } catch {
    body = '  response: <unstringifiable>';
  }
  return `${head}\n${req}\n${outcome}\n${body}`;
}

export default function CreatorBackfillRawLogPanel() {
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [liveEvents, setLiveEvents] = useState<BackfillEvent[]>([]);
  const liveRef = useRef<BackfillEvent[]>([]);

  const { data: initial, refetch, isRefetching } = useQuery({
    queryKey: ['creator-backfill-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_backfill_events' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as BackfillEvent[];
    },
    refetchInterval: paused ? false : 5_000,
  });

  // Seed live buffer from initial load
  useEffect(() => {
    if (initial && liveRef.current.length === 0) {
      liveRef.current = initial;
      setLiveEvents(initial);
    }
  }, [initial]);

  // Realtime stream
  useEffect(() => {
    if (paused) return;
    const channel = supabase
      .channel('creator-backfill-events-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'creator_backfill_events' },
        (payload) => {
          const row = payload.new as BackfillEvent;
          liveRef.current = [row, ...liveRef.current].slice(0, 500);
          setLiveEvents([...liveRef.current]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [paused]);

  const filtered = useMemo(() => {
    if (filter === 'all') return liveEvents;
    return liveEvents.filter((e) => classifyEvent(e) === filter);
  }, [liveEvents, filter]);

  const stats = useMemo(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    const recent = liveEvents.filter((e) => new Date(e.created_at).getTime() >= cutoff);
    const resolved = recent.filter((e) => e.resolved_creator).length;
    const misses = recent.filter((e) => !e.resolved_creator && (e.http_status ?? 0) < 400 && (e.http_status ?? 0) !== 0).length;
    const errors = recent.filter((e) => (e.http_status ?? 0) >= 400 || (e.http_status ?? 0) === 0).length;
    const avgMs =
      recent.length > 0
        ? Math.round(recent.reduce((s, e) => s + (e.duration_ms ?? 0), 0) / recent.length)
        : 0;
    return { total: recent.length, resolved, misses, errors, avgMs };
  }, [liveEvents]);

  const visibleText = useMemo(
    () => filtered.map(renderEntry).join('\n\n'),
    [filtered],
  );

  const copyVisible = async () => {
    try {
      await navigator.clipboard.writeText(visibleText);
      toast.success('Copied visible log');
    } catch (e: any) {
      toast.error('Copy failed', { description: e.message });
    }
  };

  return (
    <Card className="border-amber-500/20 bg-gradient-to-br from-amber-950/10 to-background">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-amber-400" />
            Creator Wallet Backfill — Raw Event Stream
          </CardTitle>
          <CardDescription>
            Live raw JSON of every Pump.fun / Helius DAS / Helius RPC resolution from
            <span className="font-mono"> backfill-creator-wallets</span>.
            Newest-first. Auto-pruned to the last 5,000 events.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" variant={paused ? 'default' : 'outline'} onClick={() => setPaused((p) => !p)}>
            {paused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="outline" onClick={copyVisible}>
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Counters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="rounded-md border bg-card/40 p-2">
            <div className="text-muted-foreground">5m total</div>
            <div className="font-mono text-base">{stats.total}</div>
          </div>
          <div className="rounded-md border bg-card/40 p-2">
            <div className="text-emerald-400">resolved</div>
            <div className="font-mono text-base text-emerald-400">{stats.resolved}</div>
          </div>
          <div className="rounded-md border bg-card/40 p-2">
            <div className="text-muted-foreground">misses</div>
            <div className="font-mono text-base">{stats.misses}</div>
          </div>
          <div className="rounded-md border bg-card/40 p-2">
            <div className="text-red-400">errors</div>
            <div className="font-mono text-base text-red-400">{stats.errors}</div>
          </div>
          <div className="rounded-md border bg-card/40 p-2">
            <div className="text-muted-foreground">avg ms</div>
            <div className="font-mono text-base">{stats.avgMs}</div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 text-xs">
          <Filter className="h-3 w-3 text-muted-foreground" />
          {(['all', 'success', 'miss', 'error'] as FilterMode[]).map((f) => (
            <Badge
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              className="cursor-pointer capitalize"
              onClick={() => setFilter(f)}
            >
              {f}
            </Badge>
          ))}
          <span className="ml-auto text-muted-foreground font-mono">
            showing {filtered.length} / {liveEvents.length}
          </span>
        </div>

        {/* Raw scrolling log */}
        <ScrollArea className="h-[480px] rounded-md border bg-black/60">
          <pre className="p-3 text-[11px] leading-relaxed font-mono text-amber-100 whitespace-pre-wrap break-all">
            {filtered.length === 0
              ? '— waiting for events — the next backfill cycle will appear here in real time —'
              : filtered
                  .map((e) => {
                    const k = classifyEvent(e);
                    const tag =
                      k === 'success' ? '\u001b' /* marker only */ : k === 'error' ? '' : '';
                    void tag;
                    return renderEntry(e);
                  })
                  .join('\n\n')}
          </pre>
        </ScrollArea>

        <div className="text-[11px] text-muted-foreground">
          Stream: realtime channel <span className="font-mono">creator-backfill-events-live</span>{' '}
          • Poll fallback every 5s • Order: newest first
        </div>
      </CardContent>
    </Card>
  );
}
