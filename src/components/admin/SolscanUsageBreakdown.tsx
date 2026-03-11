import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { RefreshCw, Database } from 'lucide-react';
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

export function SolscanUsageBreakdown() {
  const [byFunction, setByFunction] = useState<UsageByFunction[]>([]);
  const [dailyData, setDailyData] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 365;
      const since = new Date(Date.now() - daysBack * 24 * 3600_000).toISOString();

      // By function
      const { data: fnData, error: fnErr } = await supabase
        .from('api_usage_log')
        .select('function_name, credits_used, endpoint')
        .eq('service_name', 'solscan')
        .gte('timestamp', since);

      if (fnErr) throw fnErr;

      // Aggregate by function_name
      const fnMap: Record<string, { calls: number; credits: number }> = {};
      const dayMap: Record<string, number> = {};

      for (const row of fnData || []) {
        const fn = row.function_name || row.endpoint || 'unknown';
        if (!fnMap[fn]) fnMap[fn] = { calls: 0, credits: 0 };
        fnMap[fn].calls++;
        fnMap[fn].credits += row.credits_used || 1;
      }

      // We need daily data too - re-query with date grouping
      const { data: rawAll } = await supabase
        .from('api_usage_log')
        .select('timestamp')
        .eq('service_name', 'solscan')
        .gte('timestamp', since)
        .order('timestamp', { ascending: true });

      for (const row of rawAll || []) {
        const day = row.timestamp?.substring(0, 10) || 'unknown';
        dayMap[day] = (dayMap[day] || 0) + 1;
      }

      setByFunction(
        Object.entries(fnMap)
          .map(([fn, v]) => ({ function_name: fn, total_calls: v.calls, total_credits: v.credits }))
          .sort((a, b) => b.total_credits - a.total_credits)
      );

      setDailyData(
        Object.entries(dayMap)
          .map(([date, calls]) => ({ date, calls }))
          .sort((a, b) => a.date.localeCompare(b.date))
      );
    } catch (err: any) {
      toast.error('Failed to fetch Solscan usage: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalCalls = byFunction.reduce((s, d) => s + d.total_calls, 0);
  const totalCredits = byFunction.reduce((s, d) => s + d.total_credits, 0);

  const pieData = (() => {
    const threshold = totalCredits * 0.02;
    const main: typeof byFunction = [];
    let otherCredits = 0, otherCalls = 0;
    for (const d of byFunction) {
      if (d.total_credits >= threshold) main.push(d);
      else { otherCredits += d.total_credits; otherCalls += d.total_calls; }
    }
    if (otherCredits > 0) main.push({ function_name: 'Other', total_credits: otherCredits, total_calls: otherCalls });
    return main;
  })();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Database className="h-4 w-4" /> Total Solscan Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {period === '7d' ? 'Last 7 days' : period === '30d' ? 'Last 30 days' : 'All time'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Credits Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalCredits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{byFunction.length} functions · 10M CU quota (Level 1)</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
        <TabsList>
          <TabsTrigger value="7d">7 Days</TabsTrigger>
          <TabsTrigger value="30d">30 Days</TabsTrigger>
          <TabsTrigger value="all">All Time</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">Credits by Function</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="total_credits"
                    nameKey="function_name"
                    cx="50%" cy="50%"
                    outerRadius={100} innerRadius={50}
                    paddingAngle={2}
                    label={({ function_name, total_credits }) => {
                      const pct = ((total_credits / totalCredits) * 100).toFixed(0);
                      return `${function_name.replace(/^fetch/, '')} ${pct}%`;
                    }}
                    labelLine={false}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value.toLocaleString()} credits`, name]}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">No data for this period</p>
            )}
          </CardContent>
        </Card>

        {/* Table */}
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
                {byFunction.map((row, i) => (
                  <TableRow key={row.function_name}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-mono text-xs text-foreground">{row.function_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{row.total_calls.toLocaleString()}</TableCell>
                    <TableCell className="text-right"><Badge variant="secondary">{row.total_credits.toLocaleString()}</Badge></TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {totalCredits > 0 ? ((row.total_credits / totalCredits) * 100).toFixed(1) : '0'}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Daily trend */}
      {dailyData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">Daily Solscan API Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(d) => d.substring(5)} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="calls" fill="hsl(210, 80%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SolscanUsageBreakdown;
