import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, TrendingUp, Clock, DollarSign, Activity, AlertTriangle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

interface ApiUsageStats {
  total_calls: number;
  total_credits: number;
  successful_calls: number;
  failed_calls: number;
  avg_response_time_ms: number;
  calls_by_service: Record<string, { calls: number; credits: number; avg_time_ms: number; success_rate: number }>;
  calls_by_day: Record<string, { calls: number; credits: number }>;
  top_tokens: Array<{ token_mint: string; calls: number; credits: number }>;
  credits_by_service: Record<string, number>;
}

const SERVICE_COLORS: Record<string, string> = {
  helius: '#f97316',      // Orange
  solscan: '#8b5cf6',     // Purple
  dexscreener: '#10b981', // Emerald
  rugcheck: '#ef4444',    // Red
  pumpfun: '#22c55e',     // Green
  jupiter: '#06b6d4',     // Cyan
  coingecko: '#eab308',   // Yellow
};

// Estimated costs per credit (in USD)
const CREDIT_COSTS: Record<string, number> = {
  helius: 0.0001,    // ~$10 for 100k credits
  solscan: 0.001,    // Pro tier pricing
};

export function HoldersResourceDashboard() {
  const [stats, setStats] = useState<ApiUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7");
  const { toast } = useToast();

  const fetchStats = async () => {
    setLoading(true);
    try {
      const days = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase.rpc('get_api_usage_stats', {
        p_start_date: startDate.toISOString(),
        p_end_date: new Date().toISOString(),
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setStats(data[0] as unknown as ApiUsageStats);
      } else {
        // Set empty stats if no data
        setStats({
          total_calls: 0,
          total_credits: 0,
          successful_calls: 0,
          failed_calls: 0,
          avg_response_time_ms: 0,
          calls_by_service: {},
          calls_by_day: {},
          top_tokens: [],
          credits_by_service: {},
        });
      }
    } catch (error) {
      console.error('Failed to fetch API usage stats:', error);
      toast({
        title: "Error",
        description: "Failed to load API usage statistics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [timeRange]);

  const calculateEstimatedCost = () => {
    if (!stats) return 0;
    let totalCost = 0;
    
    Object.entries(stats.credits_by_service || {}).forEach(([service, credits]) => {
      const costPerCredit = CREDIT_COSTS[service] || 0;
      totalCost += credits * costPerCredit;
    });
    
    return totalCost;
  };

  const getServiceChartData = () => {
    if (!stats?.calls_by_service) return [];
    
    return Object.entries(stats.calls_by_service).map(([service, data]) => ({
      name: service.charAt(0).toUpperCase() + service.slice(1),
      calls: data.calls,
      credits: data.credits,
      avgTime: data.avg_time_ms,
      successRate: data.success_rate,
      fill: SERVICE_COLORS[service] || '#6b7280',
    }));
  };

  const getDailyChartData = () => {
    if (!stats?.calls_by_day) return [];
    
    return Object.entries(stats.calls_by_day)
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calls: data.calls,
        credits: data.credits,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const successRate = stats ? 
    (stats.total_calls > 0 ? (stats.successful_calls / stats.total_calls * 100).toFixed(1) : '100') 
    : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            API Resource Dashboard
          </h2>
          <p className="text-muted-foreground">Track external API usage, costs, and performance</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Today</SelectItem>
              <SelectItem value="7">7 Days</SelectItem>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="90">90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchStats} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Total API Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {loading ? '...' : (stats?.total_calls || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {successRate}% success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Credits Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {loading ? '...' : (stats?.total_credits || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Helius + Solscan Pro
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Est. Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${loading ? '...' : calculateEstimatedCost().toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Based on credit usage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Avg Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {loading ? '...' : `${Math.round(stats?.avg_response_time_ms || 0)}ms`}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all services
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls by Service */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">API Calls by Service</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={getServiceChartData()}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }} 
                />
                <Bar dataKey="calls" radius={[4, 4, 0, 0]}>
                  {getServiceChartData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Usage Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Usage Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={getDailyChartData()}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }} 
                />
                <Line type="monotone" dataKey="calls" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Service Details & Top Tokens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Service Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Service Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {getServiceChartData().map((service) => (
                <div key={service.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: service.fill }}
                    />
                    <span className="font-medium">{service.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {service.calls.toLocaleString()} calls
                    </span>
                    <span className="text-muted-foreground">
                      {Math.round(service.avgTime)}ms
                    </span>
                    <Badge variant={service.successRate >= 95 ? "default" : service.successRate >= 80 ? "secondary" : "destructive"}>
                      {service.successRate}%
                    </Badge>
                  </div>
                </div>
              ))}
              {getServiceChartData().length === 0 && !loading && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No API usage data yet</p>
                  <p className="text-xs">Data will appear after token analyses</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Tokens by Resource Cost */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Tokens by Resource Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(stats?.top_tokens || []).slice(0, 10).map((token, i) => (
                <div key={token.token_mint} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <code className="text-xs font-mono">
                      {token.token_mint.slice(0, 8)}...{token.token_mint.slice(-4)}
                    </code>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span>{token.calls} calls</span>
                    <Badge variant="outline" className="text-xs">
                      {token.credits} credits
                    </Badge>
                  </div>
                </div>
              ))}
              {(stats?.top_tokens || []).length === 0 && !loading && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No token data yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
