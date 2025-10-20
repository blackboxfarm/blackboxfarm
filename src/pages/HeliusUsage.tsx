import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Activity, TrendingUp, AlertCircle, Clock, Database } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface UsageStats {
  total_calls: number;
  total_credits: number;
  successful_calls: number;
  failed_calls: number;
  avg_response_time_ms: number;
  calls_by_function: Record<string, { calls: number; credits: number; avg_time_ms: number }>;
  calls_by_day: Record<string, number>;
  top_ips: Array<{ ip: string; calls: number }>;
  hourly_distribution: Record<string, number>;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function HeliusUsage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');
  const { toast } = useToast();

  const loadStats = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const { data, error } = await supabase.rpc('get_helius_usage_stats', {
        p_start_date: startDate.toISOString(),
        p_end_date: now.toISOString()
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setStats(data[0] as UsageStats);
      }
    } catch (error) {
      console.error('Failed to load Helius usage stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load API usage statistics',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading usage statistics...</div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Data Available</CardTitle>
            <CardDescription>No Helius API usage data found for the selected time period</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const functionData = Object.entries(stats.calls_by_function || {}).map(([name, data]) => ({
    name: name.replace('supabase/functions/', ''),
    calls: data.calls,
    credits: data.credits,
    avg_time: data.avg_time_ms
  }));

  const dailyData = Object.entries(stats.calls_by_day || {})
    .map(([date, calls]) => ({
      date: new Date(date).toLocaleDateString(),
      calls
    }))
    .reverse();

  const hourlyData = Object.entries(stats.hourly_distribution || {}).map(([hour, calls]) => ({
    hour: `${hour}:00`,
    calls
  }));

  const successRate = stats.total_calls > 0
    ? ((stats.successful_calls / stats.total_calls) * 100).toFixed(1)
    : '0';

  const monthlyEstimate = (stats.total_credits / (timeRange === 'day' ? 1 : timeRange === 'week' ? 7 : 30)) * 30;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Helius API Usage Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor your Helius API consumption to track costs and detect unusual activity
        </p>
      </div>

      <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
        <TabsList>
          <TabsTrigger value="day">Last 24 Hours</TabsTrigger>
          <TabsTrigger value="week">Last 7 Days</TabsTrigger>
          <TabsTrigger value="month">Last 30 Days</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total API Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_calls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total_credits.toLocaleString()} credits used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.successful_calls.toLocaleString()} successful calls
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(stats.avg_response_time_ms)}ms</div>
            <p className="text-xs text-muted-foreground">
              Average latency per request
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Estimate</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(monthlyEstimate).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Estimated credits/month
            </p>
          </CardContent>
        </Card>
      </div>

      {stats.failed_calls > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {stats.failed_calls} Failed Requests
            </CardTitle>
            <CardDescription>
              Some API calls failed. Check the function-specific logs for details.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calls by Function</CardTitle>
            <CardDescription>Which edge functions use Helius API the most</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={functionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="calls" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily Distribution</CardTitle>
            <CardDescription>API calls over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="calls" fill="hsl(var(--chart-2))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hourly Pattern</CardTitle>
            <CardDescription>When do you use the API most?</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="calls" fill="hsl(var(--chart-3))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top IP Addresses</CardTitle>
            <CardDescription>Sources of API requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.top_ips.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm font-mono">{item.ip}</span>
                  <span className="text-sm font-bold">{item.calls.toLocaleString()} calls</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Function Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Function Performance Details</CardTitle>
          <CardDescription>Detailed breakdown of API usage by edge function</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Function</th>
                  <th className="text-right p-2">Calls</th>
                  <th className="text-right p-2">Credits</th>
                  <th className="text-right p-2">Avg Time (ms)</th>
                </tr>
              </thead>
              <tbody>
                {functionData.map((func, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2 font-mono text-sm">{func.name}</td>
                    <td className="text-right p-2">{func.calls.toLocaleString()}</td>
                    <td className="text-right p-2">{func.credits.toLocaleString()}</td>
                    <td className="text-right p-2">{Math.round(func.avg_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
