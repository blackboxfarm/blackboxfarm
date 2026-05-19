import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pause, Play, Trash2, Terminal } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

type Row = {
  id: number;
  ts: string;
  master_wallet: string;
  family_wallet: string | null;
  source: string;
  status: 'ok' | 'rate_limited' | 'error' | 'new_mint' | 'skip';
  latency_ms: number | null;
  error_msg: string | null;
  mint_address: string | null;
};

const STATUS_TONE: Record<string, string> = {
  ok: 'text-green-400',
  new_mint: 'text-yellow-300',
  rate_limited: 'text-amber-400',
  error: 'text-rose-400',
  skip: 'text-muted-foreground',
};

const STATUS_LABEL: Record<string, string> = {
  ok: 'NO NEW MINTS',
  new_mint: 'NEW MINT FOUND',
  rate_limited: 'RATE LIMITED',
  error: 'ERROR',
  skip: 'SKIPPED',
};

const MAX_ROWS = 500;

export function LiveCheckLog() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [paused, setPaused] = React.useState(false);
  const [filter, setFilter] = React.useState<string>('all');
  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;

  // Initial load (last 200)
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('allstar_audit_check_log')
        .select('*')
        .order('ts', { ascending: false })
        .limit(200);
      if (data) setRows(data as Row[]);
    })();
  }, []);

  // Realtime stream
  React.useEffect(() => {
    const ch = supabase
      .channel('allstar-check-log-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'allstar_audit_check_log' },
        (payload) => {
          if (pausedRef.current) return;
          setRows((prev) => {
            const next = [payload.new as Row, ...prev];
            return next.length > MAX_ROWS ? next.slice(0, MAX_ROWS) : next;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { ok: 0, new_mint: 0, rate_limited: 0, error: 0, skip: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="h-5 w-5 text-green-400" />
            Live Check Log
            <Badge variant="outline" className={`text-[10px] ${paused ? '' : 'animate-pulse'}`}>
              {paused ? 'PAUSED' : 'LIVE'}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({rows.length})</SelectItem>
                <SelectItem value="ok">OK ({counts.ok})</SelectItem>
                <SelectItem value="new_mint">New mints ({counts.new_mint})</SelectItem>
                <SelectItem value="rate_limited">Rate-limited ({counts.rate_limited})</SelectItem>
                <SelectItem value="error">Errors ({counts.error})</SelectItem>
                <SelectItem value="skip">Skipped ({counts.skip})</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)} className="gap-1">
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRows([])} className="gap-1">
              <Trash2 className="h-3 w-3" /> Clear
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Real-time stream of every per-wallet mint-status API check. Newest on top, capped at {MAX_ROWS} in view.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[60vh] overflow-y-auto font-mono text-[11px] bg-black/40 border-t border-border/40">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Waiting for checks…</div>
          ) : (
            <>
              <div className="grid grid-cols-[170px_150px_80px_1fr_70px_1fr] gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
                <span>Timestamp (local)</span>
                <span>Status</span>
                <span>Source</span>
                <span>Dev Wallet (click to copy)</span>
                <span className="text-right">Latency</span>
                <span>Detail</span>
              </div>
              {filtered.map((r) => {
                const wallet = r.family_wallet ?? r.master_wallet;
                const tsDate = new Date(r.ts);
                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-[170px_150px_80px_1fr_70px_1fr] gap-2 px-3 py-1 border-b border-border/10 hover:bg-muted/10"
                  >
                    <span className="text-muted-foreground" title={tsDate.toISOString()}>
                      {format(tsDate, 'yyyy-MM-dd HH:mm:ss')}
                    </span>
                    <span className={`font-bold ${STATUS_TONE[r.status] ?? ''}`}>
                      {STATUS_LABEL[r.status] ?? r.status.toUpperCase()}
                    </span>
                    <span className="text-sky-300">{r.source}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(wallet);
                        toast.success('Wallet copied');
                      }}
                      className="text-left text-foreground/90 hover:text-primary truncate cursor-pointer"
                      title={`Click to copy · ${wallet}`}
                    >
                      {wallet}
                    </button>
                    <span className="text-right text-muted-foreground">{r.latency_ms ?? '-'}ms</span>
                    <span className="truncate text-muted-foreground" title={r.mint_address ?? r.error_msg ?? ''}>
                      {r.mint_address
                        ? <span className="text-yellow-300">mint {r.mint_address}</span>
                        : (r.error_msg ?? '—')}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
