import { useCallback, useEffect, useMemo, useState } from 'react';
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
    const base = !needle
      ? rows
      : rows.filter((row) =>
          Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle))
        );
    if (!sortKey) return base;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => compareValues(a[sortKey], b[sortKey]) * dir);
  }, [rows, query, sortKey, sortDir]);

  useEffect(() => { setPage(0); }, [query, sortKey, sortDir]);

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
          <h4 className="text-lg font-semibold">Pump.fun watchlist spreadsheet</h4>
          <p className="text-sm text-muted-foreground">
            Last 14 days · every column from <code className="font-mono">pumpfun_watchlist</code> · click sortable headers to sort · {ROWS_PER_PAGE} rows/page.
            {filteredRows && columns.length > 0 ? ` ${filteredRows.length.toLocaleString()} rows × ${columns.length} columns.` : ''}
          </p>
        </div>
        <div className="w-full max-w-sm">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any field…" />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {pageRows === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No watchlist rows found for the last 14 days.</div>
        ) : (
          <div
            className="w-full max-h-[34rem] overflow-auto"
            style={{ scrollbarWidth: 'auto', scrollbarColor: 'hsl(var(--muted-foreground)) transparent' }}
          >
            <Table>
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
                        className={`whitespace-nowrap sticky top-0 bg-card z-10 ${sortable ? 'cursor-pointer select-none hover:bg-muted/40' : ''}`}
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
