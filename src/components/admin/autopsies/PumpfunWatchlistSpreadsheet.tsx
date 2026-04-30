import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

type WatchlistRow = Database['public']['Tables']['pumpfun_watchlist']['Row'];

const PAGE_SIZE = 1000;

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

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo(() => {
    const first = rows?.[0];
    return first ? Object.keys(first) as Array<keyof WatchlistRow> : [];
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle))
    );
  }, [rows, query]);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-lg font-semibold">Pump.fun watchlist spreadsheet</h4>
          <p className="text-sm text-muted-foreground">
            Last 14 days · every column from <code className="font-mono">pumpfun_watchlist</code> · loads once (use Reload above to refresh).
            {filteredRows && columns.length > 0 ? ` ${filteredRows.length.toLocaleString()} rows × ${columns.length} columns. Scroll horizontally →` : ''}
          </p>
        </div>
        <div className="w-full max-w-sm">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any field…" />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {filteredRows === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No watchlist rows found for the last 14 days.</div>
        ) : (
          <ScrollArea className="w-full max-h-[34rem]">
            <div className="min-w-max">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={String(column)} compact className="whitespace-nowrap sticky top-0 bg-card z-10">
                        {String(column)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      {columns.map((column) => (
                        <TableCell key={`${row.id}-${String(column)}`} compact className="whitespace-nowrap align-top font-mono text-[11px]">
                          {formatValue(row[column])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        )}
      </Card>
    </section>
  );
}