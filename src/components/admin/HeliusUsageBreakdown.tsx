import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { RefreshCw, Camera, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UsageByFunction {
  function_name: string;
  total_calls: number;
  total_credits: number;
}

interface DailyUsage {
  date: string;
  calls: number;
  credits: number;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(210, 80%, 55%)',
  'hsl(150, 70%, 45%)',
  'hsl(45, 90%, 55%)',
  'hsl(0, 75%, 55%)',
  'hsl(280, 65%, 55%)',
  'hsl(180, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(330, 70%, 55%)',
  'hsl(120, 50%, 45%)',
];

export function HeliusUsageBreakdown() {
  const [liveData, setLiveData] = useState<UsageByFunction[]>([]);
  const [snapshotData, setSnapshotData] = useState<UsageByFunction[]>([]);
  const [dailyData, setDailyData] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [activeView, setActiveView] = useState('live');

  const fetchLiveData = useCallback(async () => {
    setLoading(true);
    try {
      // Live data from helius_api_usage
      const { data, error } = await supabase.rpc('get_helius_usage_stats', {
        p_start_date: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
        p_end_date: new Date().toISOString(),
      });

      if (error) throw error;
      if (data && data[0]) {
        const byFn = data[0].calls_by_function as Record<string, { calls: number; credits: number }>;
        const mapped = Object.entries(byFn).map(([fn, v]) => ({
          function_name: fn,
          total_calls: v.calls,
          total_credits: v.credits,
        })).sort((a, b) => b.total_credits - a.total_credits);
        setLiveData(mapped);

        const byDay = data[0].calls_by_day as Record<string, number>;
        const dailyMapped = Object.entries(byDay).map(([date, calls]) => ({
          date,
          calls: calls as number,
          credits: 0,
        })).sort((a, b) => a.date.localeCompare(b.date));
        setDailyData(dailyMapped);
      }
    } catch (err: any) {
      toast.error('Failed to fetch live usage: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSnapshotData = useCallback(async () => {
    try {
      const { data, error } = await (supabase
        .from('helius_usage_snapshots' as any)
        .select('function_name, total_calls, total_credits, snapshot_date')
        .order('snapshot_date', { ascending: false }) as any);

      if (error) throw error;
      if (data) {
        // Aggregate all snapshots by function
        const byFn: Record<string, { calls: number; credits: number }> = {};
        for (const row of data as any[]) {
          if (!byFn[row.function_name]) byFn[row.function_name] = { calls: 0, credits: 0 };
          byFn[row.function_name].calls += row.total_calls;
          byFn[row.function_name].credits += row.total_credits;
        }
        const mapped = Object.entries(byFn).map(([fn, v]) => ({
          function_name: fn,
          total_calls: v.calls,
          total_credits: v.credits,
        })).sort((a, b) => b.total_credits - a.total_credits);
        setSnapshotData(mapped);
      }
    } catch (err: any) {
      console.error('Failed to fetch snapshot data:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchLiveData();
    fetchSnapshotData();
  }, [fetchLiveData, fetchSnapshotData]);

  const takeSnapshot = async () => {
    setSnapshotting(true);
    try {
      const { data, error } = await supabase.functions.invoke('database-housekeeping', {
        body: { action: 'snapshot_helius' },
      });
      if (error) throw error;
      toast.success(`Snapshot saved: ${data.snapshotsCreated} aggregates`);
      fetchSnapshotData();
    } catch (err: any) {
      toast.error('Snapshot failed: ' + err.message);
    } finally {
      setSnapshotting(false);
    }
  };

  const currentData = activeView === 'live' ? liveData : snapshotData;
  const totalCalls = currentData.reduce((s, d) => s + d.total_calls, 0);
  const totalCredits = currentData.reduce((s, d) => s + d.total_credits, 0);

  // Pie data — group small slices into "Other"
  const pieData = (() => {
    const threshold = totalCredits * 0.02;
    const main: typeof currentData = [];
    let otherCredits = 0;
    let otherCalls = 0;
    for (const d of currentData) {
      if (d.total_credits >= threshold) {
        main.push(d);
      } else {
        otherCredits += d.total_credits;
        otherCalls += d.total_calls;
      }
    }
    if (otherCredits > 0) {
      main.push({ function_name: 'Other', total_credits: otherCredits, total_calls: otherCalls });
    }
    return main;
  })();

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Database className="h-4 w-4" /> Total API Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeView === 'live' ? 'Last 30 days (live)' : 'All snapshots (historical)'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Credits Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalCredits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{currentData.length} functions</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={fetchLiveData} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={takeSnapshot} variant="outline" size="sm" disabled={snapshotting}>
              <Camera className="h-4 w-4 mr-1" />
              {snapshotting ? 'Saving...' : 'Snapshot Now'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Toggle live vs historical */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList>
          <TabsTrigger value="live">📡 Live (30d)</TabsTrigger>
          <TabsTrigger value="historical">📸 Historical Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PieChartCard data={pieData} totalCredits={totalCredits} />
            <BreakdownTable data={currentData} totalCredits={totalCredits} />
          </div>
          {dailyData.length > 0 && <DailyTrendChart data={dailyData} />}
        </TabsContent>

        <TabsContent value="historical" className="space-y-4">
          {snapshotData.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No snapshots yet</p>
                <p className="text-sm">Click "Snapshot Now" or snapshots are auto-taken before pruning</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PieChartCard data={pieData} totalCredits={totalCredits} />
              <BreakdownTable data={currentData} totalCredits={totalCredits} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PieChartCard({ data, totalCredits }: { data: UsageByFunction[]; totalCredits: number }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm text-foreground">Credits by Function</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="total_credits"
              nameKey="function_name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={50}
              paddingAngle={2}
              label={({ function_name, total_credits }) => {
                const pct = ((total_credits / totalCredits) * 100).toFixed(0);
                return `${function_name.replace(/^(pumpfun-|flipit-)/, '')} ${pct}%`;
              }}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value.toLocaleString()} credits`,
                name,
              ]}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function BreakdownTable({ data, totalCredits }: { data: UsageByFunction[]; totalCredits: number }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm text-foreground">Usage Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Function</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow key={row.function_name}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="font-mono text-xs text-foreground">{row.function_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{row.total_calls.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary">{row.total_credits.toLocaleString()}</Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {totalCredits > 0 ? ((row.total_credits / totalCredits) * 100).toFixed(1) : '0'}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DailyTrendChart({ data }: { data: DailyUsage[] }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm text-foreground">Daily API Calls (30d)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(d) => d.substring(5)}
            />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default HeliusUsageBreakdown;