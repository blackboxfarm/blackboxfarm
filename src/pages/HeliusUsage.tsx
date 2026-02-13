import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Activity, TrendingUp, AlertCircle, Clock, Database, Shield, Zap, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Area, AreaChart } from 'recharts';

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

interface RateLimitState {
  id: string;
  call_count: number;
  window_start: string;
  circuit_breaker_active: boolean;
  circuit_breaker_until: string | null;
  updated_at: string;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function HeliusUsage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [rateLimitState, setRateLimitState] = useState<RateLimitState | null>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
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

      // Fetch stats, rate limit state, and recent logs in parallel
      const [statsResult, rateLimitResult, logsResult] = await Promise.all([
        supabase.rpc('get_helius_usage_stats', {
          p_start_date: startDate.toISOString(),
          p_end_date: now.toISOString()
        }),
        supabase.from('helius_rate_limit_state').select('*').eq('id', 'global').single(),
        supabase.from('helius_api_usage')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      if (statsResult.data && statsResult.data.length > 0) {
        setStats(statsResult.data[0] as UsageStats);
      }

      if (rateLimitResult.data) {
        setRateLimitState(rateLimitResult.data as RateLimitState);
      }

      if (logsResult.data) {
        setRecentLogs(logsResult.data);
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

  const resetCircuitBreaker = async () => {
    try {
      const { error } = await supabase
        .from('helius_rate_limit_state')
        .update({ 
          circuit_breaker_active: false, 
          circuit_breaker_until: null,
          call_count: 0,
          window_start: new Date().toISOString()
        })
        .eq('id', 'global');

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Circuit breaker reset successfully',
      });

      loadStats();
    } catch (error) {
      console.error('Failed to reset circuit breaker:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset circuit breaker',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    loadStats();
  }, [timeRange]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  if (loading && !stats) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading usage statistics...</div>
        </div>
      </div>
    );
  }

  // All 53 functions with Helius tracking enabled
  const ALL_TRACKED_FUNCTIONS = [
    'mint-monitor-scanner', 'pumpfun-dev-tracker', 'pumpfun-dev-analyzer',
    'wallet-behavior-analysis', 'flipit-verify-positions', 'flipit-execute',
    'check-banner-payment', 'execution-monitor', 'scan-offspring-wallets',
    'token-mint-watchdog-monitor', 'admin-add-seen-token', 'helius-fast-price',
    'token-metadata', 'token-metadata-batch', 'get-wallet-balance',
    'get-wallet-transactions', 'refresh-wallet-balances', 'wallet-monitor',
    'scalp-mode-validator', 'flipit-preflight', 'offspring-mint-scanner',
    'banner-refund', 'dust-wallet-monitor', 'developer-wallet-rescan',
    'token-creator-linker', 'telegram-channel-monitor', 'oracle-unified-lookup',
    'developer-enrichment', 'flipit-price-monitor', 'flipit-unified-monitor',
    'flipit-deep-order-monitor', 'flipit-limit-order-monitor', 'flipit-rebuy-monitor',
    'flipit-emergency-monitor', 'flipit-repair-positions', 'flipit-import-position',
    'flipit-cleanup-phantom-positions', 'pumpfun-buy-executor', 'pumpfun-sell-monitor',
    'pumpfun-curve-analyzer', 'pumpfun-early-trade-analyzer', 'pumpfun-lifecycle-monitor',
    'pumpfun-vip-monitor', 'pumpfun-watchlist-monitor', 'pumpfun-fantasy-executor',
    'pumpfun-fantasy-sell-monitor', 'pumpfun-kol-tracker', 'liquidity-lock-checker',
    'whale-transaction-dump', 'wallet-investigator', 'wallet-genealogy-scanner',
    'wallet-sns-lookup', 'developer-token-scanner'
  ];

  const activeFunctionMap = stats?.calls_by_function || {};

  const functionData = ALL_TRACKED_FUNCTIONS.map((fn) => {
    const key = Object.keys(activeFunctionMap).find(k => k.includes(fn)) || fn;
    const data = activeFunctionMap[key];
    return {
      name: fn.slice(0, 20),
      fullName: fn,
      calls: data?.calls || 0,
      credits: data?.credits || 0,
      avg_time: data?.avg_time_ms || 0,
    };
  }).sort((a, b) => b.credits - a.credits);

  const dailyData = stats ? Object.entries(stats.calls_by_day || {})
    .map(([date, calls]) => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calls
    }))
    .reverse() : [];

  const hourlyData = stats ? Object.entries(stats.hourly_distribution || {}).map(([hour, calls]) => ({
    hour: `${hour}:00`,
    calls
  })) : [];

  const successRate = stats && stats.total_calls > 0
    ? ((stats.successful_calls / stats.total_calls) * 100).toFixed(1)
    : '0';

  const monthlyEstimate = stats 
    ? (stats.total_credits / (timeRange === 'day' ? 1 : timeRange === 'week' ? 7 : 30)) * 30
    : 0;

  // Calculate rate limit status
  const rateLimitRemaining = rateLimitState 
    ? Math.max(0, 50 - rateLimitState.call_count) 
    : 50;
  
  const windowAge = rateLimitState 
    ? Math.round((Date.now() - new Date(rateLimitState.window_start).getTime()) / 1000)
    : 0;

  const isCircuitBreakerActive = rateLimitState?.circuit_breaker_active && 
    rateLimitState.circuit_breaker_until && 
    new Date(rateLimitState.circuit_breaker_until) > new Date();

  const circuitBreakerRemaining = isCircuitBreakerActive && rateLimitState?.circuit_breaker_until
    ? Math.round((new Date(rateLimitState.circuit_breaker_until).getTime() - Date.now()) / 1000)
    : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Helius API Usage Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor your Helius API consumption with persistent rate limiting
          </p>
        </div>
        <Button onClick={loadStats} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Rate Limit Status Card - NEW */}
      <Card className={isCircuitBreakerActive ? 'border-destructive bg-destructive/5' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Rate Limit Status (Persistent)
            {isCircuitBreakerActive && (
              <Badge variant="destructive">Circuit Breaker Active</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Real-time rate limiting state shared across all edge functions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Calls Remaining</p>
              <p className="text-2xl font-bold">{rateLimitRemaining}/50</p>
              <p className="text-xs text-muted-foreground">per minute</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Window Age</p>
              <p className="text-2xl font-bold">{windowAge}s</p>
              <p className="text-xs text-muted-foreground">resets at 60s</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Circuit Breaker</p>
              <p className={`text-2xl font-bold ${isCircuitBreakerActive ? 'text-destructive' : 'text-green-500'}`}>
                {isCircuitBreakerActive ? `${circuitBreakerRemaining}s` : 'OK'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isCircuitBreakerActive ? 'cooldown remaining' : 'not tripped'}
              </p>
            </div>
            <div className="flex items-center">
              {isCircuitBreakerActive && (
                <Button onClick={resetCircuitBreaker} variant="destructive" size="sm">
                  Reset Circuit Breaker
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
            <div className="text-2xl font-bold">{(stats?.total_calls || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {(stats?.total_credits || 0).toLocaleString()} credits used
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
              {(stats?.successful_calls || 0).toLocaleString()} successful calls
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(stats?.avg_response_time_ms || 0)}ms</div>
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

      {stats && stats.failed_calls > 0 && (
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
            <CardTitle>Credits by Function</CardTitle>
            <CardDescription>Which edge functions use Helius API the most (sorted by credits)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={functionData.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip 
                  formatter={(value: any, name: string) => [value.toLocaleString(), name === 'credits' ? 'Credits' : 'Calls']}
                  labelFormatter={(label) => functionData.find(f => f.name === label)?.fullName || label}
                />
                <Legend />
                <Bar dataKey="credits" fill="hsl(var(--primary))" name="Credits" />
                <Bar dataKey="calls" fill="hsl(var(--chart-2))" name="Calls" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily Trend</CardTitle>
            <CardDescription>API calls over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="calls" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" />
              </AreaChart>
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
              {(stats?.top_ips || []).slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm font-mono">{item.ip}</span>
                  <span className="text-sm font-bold">{item.calls.toLocaleString()} calls</span>
                </div>
              ))}
              {(!stats?.top_ips || stats.top_ips.length === 0) && (
                <p className="text-sm text-muted-foreground">No IP data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Logs Table - NEW */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Recent API Calls
          </CardTitle>
          <CardDescription>Last 50 Helius API calls with timing and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left p-2">Time</th>
                  <th className="text-left p-2">Function</th>
                  <th className="text-left p-2">Endpoint</th>
                  <th className="text-right p-2">Status</th>
                  <th className="text-right p-2">Time (ms)</th>
                  <th className="text-right p-2">Credits</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="p-2 text-muted-foreground">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {(log.function_name || '').replace('supabase/functions/', '').slice(0, 25)}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {(log.endpoint || log.method || '-').slice(0, 20)}
                    </td>
                    <td className="p-2 text-right">
                      <Badge variant={log.success ? 'outline' : 'destructive'}>
                        {log.response_status || (log.success ? 'OK' : 'ERR')}
                      </Badge>
                    </td>
                    <td className="p-2 text-right">{log.response_time_ms || '-'}</td>
                    <td className="p-2 text-right">{log.credits_used || 1}</td>
                  </tr>
                ))}
                {recentLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      No recent API calls logged. Usage will appear here as functions make Helius API calls.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
                  <th className="text-right p-2">Credits/Call</th>
                </tr>
              </thead>
              <tbody>
                {functionData.map((func, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2 font-mono text-sm">{func.fullName}</td>
                    <td className="text-right p-2">{func.calls.toLocaleString()}</td>
                    <td className="text-right p-2">{func.credits.toLocaleString()}</td>
                    <td className="text-right p-2">{Math.round(func.avg_time)}</td>
                    <td className="text-right p-2">{(func.credits / func.calls).toFixed(1)}</td>
                  </tr>
                ))}
                {functionData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      No function usage data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}