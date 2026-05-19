import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, RefreshCw, ExternalLink, Copy, Loader2, PlayCircle, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  id: string;
  master_wallet: string;
  best_tier: number | null;
  best_token_symbol: string | null;
  best_mcap_achieved: number | null;
  new_mints_found: number | null;
  last_audit_at: string | null;
  audit_count: number | null;
  status: string;
  twitter_handle: string | null;
};

type SortKey = 'last_audit_at' | 'master_wallet' | 'best_token_symbol' | 'best_tier' | 'audit_count' | 'new_mints_found' | 'status';

const PAGE_SIZES = [50, 100, 250, 500];

async function fetchAll(): Promise<Row[]> {
  // Supabase caps at 1000 per request; chunk to get the whole registry.
  const out: Row[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('allstar_dev_registry')
      .select('id, master_wallet, best_tier, best_token_symbol, best_mcap_achieved, new_mints_found, last_audit_at, audit_count, status, twitter_handle')
      .order('last_audit_at', { ascending: false, nullsFirst: false })
      .range(from, from + step - 1);
    if (error) throw error;
    const chunk = (data || []) as Row[];
    out.push(...chunk);
    if (chunk.length < step) break;
    from += step;
  }
  return out;
}

export function AllstarAuditFeed() {
  const [refreshing, setRefreshing] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>('last_audit_at');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = React.useState<number>(100);
  const [page, setPage] = React.useState<number>(1);

  const { data: allRows, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['allstar-audit-feed-all'],
    refetchInterval: 30_000,
    queryFn: fetchAll,
  });

  const { data: totals, refetch: refetchTotals } = useQuery({
    queryKey: ['allstar-audit-feed-totals'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [reg, active, audited24, never, mints24] = await Promise.all([
        supabase.from('allstar_dev_registry').select('id', { count: 'exact', head: true }),
        supabase.from('allstar_dev_registry').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('allstar_dev_registry').select('id', { count: 'exact', head: true }).gte('last_audit_at', since24h),
        supabase.from('allstar_dev_registry').select('id', { count: 'exact', head: true }).is('last_audit_at', null),
        supabase.from('allstar_mint_alerts').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
      ]);
      return {
        registry: reg.count ?? 0,
        active: active.count ?? 0,
        audited24h: audited24.count ?? 0,
        neverAudited: never.count ?? 0,
        newMints24h: mints24.count ?? 0,
      };
    },
  });

  React.useEffect(() => {
    const channel = supabase
      .channel('allstar-audit-feed-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'allstar_dev_registry' }, () => { refetch(); refetchTotals(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'allstar_mint_alerts' }, () => { refetch(); refetchTotals(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, refetchTotals]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refetch(), refetchTotals()]); toast.success('Refreshed'); }
    finally { setTimeout(() => setRefreshing(false), 300); }
  };

  const handleRunNow = async () => {
    setRunning(true);
    const t = toast.loading('Queuing auditor in background (batch of 100)…');
    try {
      const { data, error } = await supabase.functions.invoke('allstar-mint-auditor', {
        body: { audit_batch_size: 100, hours_lookback: 2, background: true },
      });
      if (error) throw error;
      toast.success(`Auditor queued · ${data?.new_allstars_qualified ?? 0} new allstars qualified. Feed refreshing…`, { id: t, duration: 6000 });
      await Promise.all([refetch(), refetchTotals()]);
      [10_000, 25_000, 45_000, 75_000].forEach((ms) => setTimeout(() => { refetch(); refetchTotals(); }, ms));
    } catch (e: any) {
      toast.error(`Auditor failed: ${e?.message ?? e}`, { id: t });
    } finally { setRunning(false); }
  };

  const copyWallet = (w: string) => { navigator.clipboard.writeText(w); toast.success('Copied'); };

  const timeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const sorted = React.useMemo(() => {
    const arr = [...(allRows ?? [])];
    arr.sort((a, b) => {
      let va: any = (a as any)[sortKey];
      let vb: any = (b as any)[sortKey];
      if (sortKey === 'last_audit_at') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
    });
    return arr;
  }, [allRows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  React.useEffect(() => { setPage(1); }, [pageSize, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'last_audit_at' || key === 'audit_count' || key === 'new_mints_found' || key === 'best_tier' ? 'desc' : 'asc'); }
  };

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none ${className ?? ''}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-400" />
            Live Audit Feed
            <Badge variant="outline" className="text-[10px] animate-pulse">LIVE</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={handleRunNow} disabled={running} className="gap-1 active:scale-95 transition-transform">
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
              {running ? 'Auditing…' : 'Run Audit Now'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || isFetching} className="gap-1 active:scale-95 transition-transform">
              {refreshing || isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {refreshing || isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Snapshot of every allstar dev — sortable, paginated, auto-refresh 30s. Cron sweeps all wallets every 30 min.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          {[
            { label: 'Registry Total', value: totals?.registry ?? '—', tone: 'text-foreground' },
            { label: 'Active', value: totals?.active ?? '—', tone: 'text-green-400' },
            { label: 'Audited (24h)', value: totals?.audited24h ?? '—', tone: 'text-sky-400' },
            { label: 'Never Audited', value: totals?.neverAudited ?? '—', tone: 'text-amber-400' },
            { label: 'New Mints (24h)', value: totals?.newMints24h ?? '—', tone: 'text-rose-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className={`text-lg font-bold font-mono ${s.tone}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead k="last_audit_at">Last Audited</SortHead>
                <SortHead k="master_wallet">Dev Wallet</SortHead>
                <SortHead k="best_token_symbol">Best Token</SortHead>
                <SortHead k="best_tier">Tier</SortHead>
                <SortHead k="audit_count" className="text-right">Audits</SortHead>
                <SortHead k="new_mints_found" className="text-right">New Mints</SortHead>
                <SortHead k="status">Status</SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No audits yet</TableCell></TableRow>
              ) : (
                pageRows.map((dev) => (
                  <TableRow key={dev.id} className="text-xs">
                    <TableCell><span className="text-muted-foreground text-[10px]">{dev.last_audit_at ? timeSince(dev.last_audit_at) : '-'}</span></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-[10px] font-mono">{dev.master_wallet.slice(0, 6)}...{dev.master_wallet.slice(-4)}</code>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyWallet(dev.master_wallet)}><Copy className="h-3 w-3" /></Button>
                        <a href={`https://solscan.io/account/${dev.master_wallet}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" /></a>
                      </div>
                    </TableCell>
                    <TableCell>{dev.best_token_symbol ? <Badge variant="secondary" className="text-[10px]">${dev.best_token_symbol}</Badge> : '-'}</TableCell>
                    <TableCell><span className={`font-bold ${(dev.best_tier ?? 0) >= 6 ? 'text-yellow-400' : (dev.best_tier ?? 0) >= 4 ? 'text-amber-600' : 'text-muted-foreground'}`}>T{dev.best_tier ?? '-'}</span></TableCell>
                    <TableCell className="text-right font-mono">{dev.audit_count || 0}</TableCell>
                    <TableCell className="text-right">{dev.new_mints_found ? <Badge variant="destructive" className="text-[10px]">{dev.new_mints_found}</Badge> : <span className="text-green-400">✓ clean</span>}</TableCell>
                    <TableCell><Badge variant={dev.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{dev.status}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-border/40 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">
              Showing {sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft className="h-3 w-3" /></Button>
            <span className="px-2 font-mono">{safePage} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}><ChevronRight className="h-3 w-3" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
