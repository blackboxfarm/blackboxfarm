import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CalendarIcon, ChevronDown, ChevronRight, Search, AlertTriangle, CheckCircle2, Clock, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface RegistryEntry {
  function_name: string;
  description: string | null;
  data_in: string | null;
  data_out: string | null;
  category: string | null;
  is_active: boolean | null;
  priority_tier: string | null;
}

interface RunStats {
  function_name: string;
  total: number;
  successes: number;
  failures: number;
  avg_duration: number;
}

interface RunDetail {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: any;
  invocation_source: string | null;
}

const categoryColors: Record<string, string> = {
  trading: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  social: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  intel: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  monitoring: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  admin: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  notifications: 'bg-green-500/20 text-green-400 border-green-500/30',
  auth: 'bg-red-500/20 text-red-400 border-red-500/30',
  analysis: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  data: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  operations: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  ads: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  billing: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  maintenance: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  community: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  api: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  general: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  deprecated: 'bg-red-900/20 text-red-600 border-red-900/30',
  testing: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

export function FunctionOperationsDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'failures' | 'total'>('failures');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;

  // Fetch registry
  const { data: registry = [] } = useQuery({
    queryKey: ['function-registry'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('edge_function_registry')
        .select('*')
        .order('function_name');
      if (error) throw error;
      return data as RegistryEntry[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch daily run stats
  const { data: runData = [], isLoading: runsLoading } = useQuery({
    queryKey: ['function-runs-daily', dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('edge_function_runs')
        .select('function_name, status, duration_ms')
        .gte('started_at', dayStart)
        .lte('started_at', dayEnd);
      if (error) throw error;

      // Aggregate by function_name
      const stats: Record<string, RunStats> = {};
      for (const row of data || []) {
        const fn = row.function_name;
        if (!stats[fn]) {
          stats[fn] = { function_name: fn, total: 0, successes: 0, failures: 0, avg_duration: 0 };
        }
        stats[fn].total++;
        if (row.status === 'success') stats[fn].successes++;
        else if (row.status === 'error') stats[fn].failures++;
        stats[fn].avg_duration += (row.duration_ms || 0);
      }
      for (const s of Object.values(stats)) {
        s.avg_duration = s.total > 0 ? Math.round(s.avg_duration / s.total) : 0;
      }
      return Object.values(stats);
    },
    refetchInterval: 30000,
  });

  // Build merged view
  const categories = useMemo(() => {
    const cats = new Set<string>();
    registry.forEach(r => cats.add(r.category || 'general'));
    return Array.from(cats).sort();
  }, [registry]);

  const runMap = useMemo(() => {
    const m: Record<string, RunStats> = {};
    runData.forEach(r => { m[r.function_name] = r; });
    return m;
  }, [runData]);

  const mergedRows = useMemo(() => {
    let rows = registry.map(r => ({
      ...r,
      stats: runMap[r.function_name] || { function_name: r.function_name, total: 0, successes: 0, failures: 0, avg_duration: 0 },
    }));

    // Also add functions in runs but not in registry
    const registryNames = new Set(registry.map(r => r.function_name));
    runData.forEach(rd => {
      if (!registryNames.has(rd.function_name)) {
        rows.push({
          function_name: rd.function_name,
          description: null,
          data_in: null,
          data_out: null,
          category: 'general',
          is_active: true,
          stats: rd,
        });
      }
    });

    // Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => r.function_name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      rows = rows.filter(r => (r.category || 'general') === categoryFilter);
    }

    // Sort
    if (sortBy === 'failures') rows.sort((a, b) => b.stats.failures - a.stats.failures || a.function_name.localeCompare(b.function_name));
    else if (sortBy === 'total') rows.sort((a, b) => b.stats.total - a.stats.total || a.function_name.localeCompare(b.function_name));
    else rows.sort((a, b) => a.function_name.localeCompare(b.function_name));

    return rows;
  }, [registry, runMap, runData, searchQuery, categoryFilter, sortBy]);

  // Summary
  const totalRuns = runData.reduce((s, r) => s + r.total, 0);
  const totalSuccesses = runData.reduce((s, r) => s + r.successes, 0);
  const totalFailures = runData.reduce((s, r) => s + r.failures, 0);
  const successRate = totalRuns > 0 ? Math.round((totalSuccesses / totalRuns) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search functions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="failures">Most Failures</SelectItem>
            <SelectItem value="total">Most Runs</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={<Activity className="h-4 w-4" />} label="Total Runs" value={totalRuns} color="text-foreground" />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Successes" value={totalSuccesses} color="text-green-400" />
        <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="Failures" value={totalFailures} color="text-red-400" />
        <SummaryCard icon={<Clock className="h-4 w-4" />} label="Success Rate" value={`${successRate}%`} color={successRate >= 90 ? 'text-green-400' : successRate >= 70 ? 'text-yellow-400' : 'text-red-400'} />
      </div>

      {/* Function table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead compact className="w-8"></TableHead>
              <TableHead compact>Function</TableHead>
              <TableHead compact className="hidden lg:table-cell">Description</TableHead>
              <TableHead compact className="hidden xl:table-cell">In → Out</TableHead>
              <TableHead compact className="text-right w-20">✅</TableHead>
              <TableHead compact className="text-right w-20">❌</TableHead>
              <TableHead compact className="w-28">Rate</TableHead>
              <TableHead compact className="text-right w-20 hidden sm:table-cell">Avg ms</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runsLoading ? (
              <TableRow>
                <TableCell compact colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : mergedRows.length === 0 ? (
              <TableRow>
                <TableCell compact colSpan={8} className="text-center py-8 text-muted-foreground">No functions found</TableCell>
              </TableRow>
            ) : mergedRows.map((row) => (
              <FunctionRow
                key={row.function_name}
                row={row}
                isExpanded={expandedRow === row.function_name}
                onToggle={() => setExpandedRow(expandedRow === row.function_name ? null : row.function_name)}
                dayStart={dayStart}
                dayEnd={dayEnd}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {mergedRows.length} functions • {registry.length} registered • Data from {format(selectedDate, 'PPP')}
      </p>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className={cn("text-2xl font-bold", color)}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function FunctionRow({
  row,
  isExpanded,
  onToggle,
  dayStart,
  dayEnd,
}: {
  row: RegistryEntry & { stats: RunStats };
  isExpanded: boolean;
  onToggle: () => void;
  dayStart: string;
  dayEnd: string;
}) {
  const { stats } = row;
  const rate = stats.total > 0 ? Math.round((stats.successes / stats.total) * 100) : -1;
  const cat = row.category || 'general';

  return (
    <>
      <TableRow
        className={cn("cursor-pointer", stats.failures > 0 && "bg-red-500/5")}
        onClick={onToggle}
      >
        <TableCell compact>
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </TableCell>
        <TableCell compact>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px] px-1 py-0", categoryColors[cat])}>
              {cat}
            </Badge>
            <span className="font-mono text-xs">{row.function_name}</span>
          </div>
        </TableCell>
        <TableCell compact className="hidden lg:table-cell text-muted-foreground max-w-[200px] truncate">
          {row.description || '—'}
        </TableCell>
        <TableCell compact className="hidden xl:table-cell text-muted-foreground max-w-[200px] truncate">
          {row.data_in || row.data_out ? `${row.data_in || '?'} → ${row.data_out || '?'}` : '—'}
        </TableCell>
        <TableCell compact className="text-right font-mono text-green-400">
          {stats.successes > 0 ? stats.successes : '—'}
        </TableCell>
        <TableCell compact className="text-right font-mono text-red-400">
          {stats.failures > 0 ? stats.failures : '—'}
        </TableCell>
        <TableCell compact>
          {rate >= 0 ? (
            <div className="flex items-center gap-1">
              <Progress
                value={rate}
                className="h-2 w-16"
              />
              <span className={cn(
                "text-xs font-mono",
                rate >= 90 ? 'text-green-400' : rate >= 70 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {rate}%
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell compact className="text-right font-mono hidden sm:table-cell">
          {stats.avg_duration > 0 ? `${stats.avg_duration}` : '—'}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell compact colSpan={8} className="p-0">
            <ExpandedRunDetails functionName={row.function_name} dayStart={dayStart} dayEnd={dayEnd} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ExpandedRunDetails({ functionName, dayStart, dayEnd }: { functionName: string; dayStart: string; dayEnd: string }) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['function-run-details', functionName, dayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('edge_function_runs')
        .select('id, status, started_at, finished_at, duration_ms, error_message, metadata, invocation_source')
        .eq('function_name', functionName)
        .gte('started_at', dayStart)
        .lte('started_at', dayEnd)
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as RunDetail[];
    },
  });

  if (isLoading) return <div className="p-3 text-xs text-muted-foreground">Loading runs...</div>;
  if (runs.length === 0) return <div className="p-3 text-xs text-muted-foreground">No runs recorded for this day</div>;

  return (
    <div className="bg-muted/30 p-2 max-h-[300px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border/50">
            <th className="text-left p-1">Time</th>
            <th className="text-left p-1">Status</th>
            <th className="text-left p-1">Source</th>
            <th className="text-right p-1">Duration</th>
            <th className="text-left p-1">Details</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(run => {
            const events = run.metadata?.events as Array<{ level: string; msg: string; ts: string }> | undefined;
            return (
              <tr key={run.id} className="border-b border-border/20 hover:bg-muted/50">
                <td className="p-1 font-mono whitespace-nowrap">
                  {run.started_at ? format(new Date(run.started_at), 'HH:mm:ss') : '—'}
                </td>
                <td className="p-1">
                  <Badge variant="outline" className={cn(
                    "text-[10px] px-1 py-0",
                    run.status === 'success' ? 'text-green-400 border-green-500/30' :
                    run.status === 'error' ? 'text-red-400 border-red-500/30' :
                    'text-yellow-400 border-yellow-500/30'
                  )}>
                    {run.status}
                  </Badge>
                </td>
                <td className="p-1 text-muted-foreground">{run.invocation_source || '—'}</td>
                <td className="p-1 text-right font-mono">{run.duration_ms ? `${run.duration_ms}ms` : '—'}</td>
                <td className="p-1">
                  {run.error_message && (
                    <span className="text-red-400 truncate block max-w-[300px]" title={run.error_message}>
                      {run.error_message}
                    </span>
                  )}
                  {events && events.length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {events.map((ev, i) => (
                        <div key={i} className={cn(
                          "truncate max-w-[400px]",
                          ev.level === 'error' ? 'text-red-400' :
                          ev.level === 'warn' ? 'text-yellow-400' : 'text-muted-foreground'
                        )} title={ev.msg}>
                          [{ev.level}] {ev.msg}
                        </div>
                      ))}
                    </div>
                  )}
                  {!run.error_message && (!events || events.length === 0) && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
