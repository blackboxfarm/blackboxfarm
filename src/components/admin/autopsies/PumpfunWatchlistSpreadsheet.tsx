import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

type WatchlistRow = Database['public']['Tables']['pumpfun_watchlist']['Row'];

// Derived per-token decision data joined from sibling tables.
type DerivedRow = {
  // token_health_snapshots (latest)
  snap_total_holders?: number | null;
  snap_real_holders?: number | null;
  snap_health_grade?: string | null;
  snap_health_score?: number | null;
  snap_top10_pct?: number | null;
  snap_dust_pct?: number | null;
  snap_at?: string | null;
  // holders_intel_seen_tokens
  seen_was_posted?: boolean | null;
  seen_times_posted?: number | null;
  seen_health_grade?: string | null;
  seen_mcap_at_discovery?: number | null;
  // token_lifecycle
  lc_ath_24h_usd?: number | null;
  lc_autopsy_at?: string | null;
  lc_death_cause?: string | null;
  // funnel_feed_discoveries (latest)
  disc_mesh_status?: string | null;
  disc_watchlist_status?: string | null;
  disc_xpost_status?: string | null;
  disc_source_name?: string | null;
};
type AugmentedRow = WatchlistRow & DerivedRow & { __decision_score?: number };

// Columns whose values are JSON/objects and not meaningfully sortable

const PAGE_SIZE = 1000;
const ROWS_PER_PAGE = 50;

// Columns whose values are JSON/objects and not meaningfully sortable
const NON_SORTABLE_KEYS = new Set(['metadata', 'snapshot', 'extra', 'raw', 'data']);

function isSortableValue(v: unknown) {
  if (v == null) return true;
  const t = typeof v;
  return t === 'number' || t === 'string' || t === 'boolean';
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? -1 : 1;
  const as = String(a);
  const bs = String(b);
  const ad = Date.parse(as);
  const bd = Date.parse(bs);
  if (!Number.isNaN(ad) && !Number.isNaN(bd) && /\d{4}-\d{2}-\d{2}/.test(as) && /\d{4}-\d{2}-\d{2}/.test(bs)) {
    return ad - bd;
  }
  return as.localeCompare(bs);
}

function formatValue(value: unknown) {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export default function PumpfunWatchlistSpreadsheet() {
  const { toast } = useToast();
  const [rows, setRows] = useState<WatchlistRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<keyof WatchlistRow | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  // Multi-select filters. Empty Set = "all".
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  // Default: hide 'rejected' — they're filtered out for autopsy purposes anyway.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(['rejected']));
  // statusFilter holds EXCLUDED statuses (toggle = exclude/include).
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLDivElement>(null);
  const [innerWidth, setInnerWidth] = useState(0);

  const load = useCallback(async () => {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const collected: WatchlistRow[] = [];

    for (let from = 0; from < 10_000; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('pumpfun_watchlist')
        .select('*')
        .gte('first_seen_at', cutoff)
        .order('first_seen_at', { ascending: false })
        .range(from, to);

      if (error) {
        toast({ title: 'Failed to load watchlist', description: error.message, variant: 'destructive' });
        setRows([]);
        return;
      }

      const batch = (data ?? []) as WatchlistRow[];
      collected.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    setRows(collected);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Sync the two scrollbars (top dummy <-> real table)
  useEffect(() => {
    const top = topScrollRef.current;
    const tbl = tableScrollRef.current;
    if (!top || !tbl) return;
    let lock = false;
    const onTop = () => {
      if (lock) return;
      lock = true;
      tbl.scrollLeft = top.scrollLeft;
      lock = false;
    };
    const onTbl = () => {
      if (lock) return;
      lock = true;
      top.scrollLeft = tbl.scrollLeft;
      lock = false;
    };
    top.addEventListener('scroll', onTop);
    tbl.addEventListener('scroll', onTbl);
    return () => {
      top.removeEventListener('scroll', onTop);
      tbl.removeEventListener('scroll', onTbl);
    };
  }, []);

  // Track inner table width so the top dummy scrollbar matches
  useEffect(() => {
    const inner = tableInnerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(() => setInnerWidth(inner.scrollWidth));
    ro.observe(inner);
    setInnerWidth(inner.scrollWidth);
    return () => ro.disconnect();
  }, [rows, page]);

  const columns = useMemo(() => {
    const first = rows?.[0];
    return first ? (Object.keys(first) as Array<keyof WatchlistRow>) : [];
  }, [rows]);

  const sortableColumns = useMemo(() => {
    const set = new Set<string>();
    if (!rows || rows.length === 0) return set;
    const sample = rows.slice(0, 25);
    for (const col of columns) {
      const k = String(col);
      if (NON_SORTABLE_KEYS.has(k)) continue;
      if (sample.some((r) => isSortableValue(r[col]))) set.add(k);
    }
    return set;
  }, [rows, columns]);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    const needle = query.trim().toLowerCase();
    const sourceScoped = sourceFilter.size === 0
      ? rows
      : rows.filter((r) => sourceFilter.has(r.source ?? '(none)'));
    const statusScoped = statusFilter.size === 0
      ? sourceScoped
      : sourceScoped.filter((r) => !statusFilter.has((r as any).status ?? '(none)'));
    const base = !needle
      ? statusScoped
      : statusScoped.filter((row) =>
          Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle))
        );
    if (!sortKey) return base;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => compareValues(a[sortKey], b[sortKey]) * dir);
  }, [rows, query, sortKey, sortDir, sourceFilter, statusFilter]);

  useEffect(() => { setPage(0); }, [query, sortKey, sortDir, sourceFilter, statusFilter]);

  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!rows) return m;
    for (const r of rows) {
      const k = r.source ?? '(none)';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!rows) return m;
    for (const r of rows) {
      const k = (r as any).status ?? '(none)';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  function toggleSource(src: string) {
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src); else next.add(src);
      return next;
    });
  }
  function toggleStatusExclusion(st: string) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(st)) next.delete(st); else next.add(st);
      return next;
    });
  }

  const totalPages = filteredRows ? Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE)) : 1;
  const pageRows = useMemo(() => {
    if (!filteredRows) return null;
    const start = page * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, page]);

  function toggleSort(col: keyof WatchlistRow) {
    if (!sortableColumns.has(String(col))) return;
    if (sortKey === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(col);
      setSortDir('desc');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-lg font-semibold">Token Funnel Pool — all sources</h4>
          <p className="text-sm text-muted-foreground">
            Last 14 days · every candidate ingested into <code className="font-mono">pumpfun_watchlist</code> from the pump.fun websocket firehose <em>and</em> external funnel feeds (e.g. relayed Telegram channels). Not a curated watchlist — this is the raw qualifying pool the autopsy/buy/monitor pipelines pull from. Click sortable headers to sort · {ROWS_PER_PAGE} rows/page.
            {filteredRows && columns.length > 0 ? ` ${filteredRows.length.toLocaleString()} rows × ${columns.length} columns.` : ''}
          </p>
        </div>
        <div className="w-full max-w-sm">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any field…" />
        </div>
      </div>

      {sourceCounts.size > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground w-16">Source:</span>
            <Button
              variant={sourceFilter.size === 0 ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSourceFilter(new Set())}
            >
              All ({(rows?.length ?? 0).toLocaleString()})
            </Button>
            {Array.from(sourceCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([src, count]) => {
                const active = sourceFilter.has(src);
                return (
                  <Button
                    key={src}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs font-mono"
                    onClick={() => toggleSource(src)}
                    title="Click to toggle (multi-select)"
                  >
                    {src} ({count.toLocaleString()})
                  </Button>
                );
              })}
          </div>
          {statusCounts.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground w-16">Status:</span>
              <span className="text-[10px] text-muted-foreground italic">click to exclude →</span>
              {Array.from(statusCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([st, count]) => {
                  const excluded = statusFilter.has(st);
                  return (
                    <Button
                      key={st}
                      variant={excluded ? 'outline' : 'default'}
                      size="sm"
                      className={`h-7 text-xs font-mono ${excluded ? 'line-through opacity-50' : ''}`}
                      onClick={() => toggleStatusExclusion(st)}
                      title={excluded ? 'Excluded — click to include' : 'Included — click to exclude'}
                    >
                      {st} ({count.toLocaleString()})
                    </Button>
                  );
                })}
            </div>
          )}
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {pageRows === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No watchlist rows found for the last 14 days.</div>
        ) : (
          <>
            {/* Always-visible horizontal scrollbar pinned to the top */}
            <div
              ref={topScrollRef}
              className="w-full overflow-x-scroll overflow-y-hidden border-b border-border"
              style={{ scrollbarWidth: 'auto', scrollbarColor: 'hsl(var(--muted-foreground)) transparent' }}
            >
              <div style={{ width: innerWidth, height: 1 }} />
            </div>
            <div
              ref={tableScrollRef}
              className="w-full max-h-[34rem] overflow-x-scroll overflow-y-auto"
              style={{ scrollbarWidth: 'auto', scrollbarColor: 'hsl(var(--muted-foreground)) transparent' }}
            >
              <div ref={tableInnerRef} className="w-max">
            <Table className="w-max min-w-full">
              <TableHeader>
                <TableRow>
                  {columns.map((column) => {
                    const key = String(column);
                    const sortable = sortableColumns.has(key);
                    const active = sortKey === column;
                    return (
                      <TableHead
                        key={key}
                        compact
                        className={`whitespace-nowrap sticky top-0 bg-card z-20 shadow-[inset_0_-1px_0_hsl(var(--border))] ${sortable ? 'cursor-pointer select-none hover:bg-muted/40' : ''}`}
                        onClick={sortable ? () => toggleSort(column) : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {key}
                          {sortable &&
                            (active ? (
                              sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 opacity-40" />
                            ))}
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow key={row.id}>
                    {columns.map((column) => (
                      <TableCell
                        key={`${row.id}-${String(column)}`}
                        compact
                        className="whitespace-nowrap align-top font-mono text-[11px]"
                      >
                        {formatValue(row[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </div>
          </>
        )}
      </Card>

      {filteredRows && filteredRows.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
          <div>
            Showing {(page * ROWS_PER_PAGE + 1).toLocaleString()}–
            {Math.min((page + 1) * ROWS_PER_PAGE, filteredRows.length).toLocaleString()} of{' '}
            {filteredRows.length.toLocaleString()}
            {sortKey ? <> · sorted by <code className="font-mono">{String(sortKey)}</code> {sortDir}</> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-3 w-3 mr-1" /> Prev
            </Button>
            <span>Page {page + 1} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
