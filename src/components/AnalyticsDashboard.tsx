import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { 
  TrendingUp, 
  DollarSign, 
  Zap, 
  Target, 
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface AnalyticsData {
  performance: {
    totalTrades: number;
    successfulTrades: number;
    successRate: number;
    totalVolume: number;
    avgTradeSize: number;
    profitLoss: number;
    totalFees: number;
    avgExecutionTime: number;
    bestPerformingToken: string;
    worstPerformingToken: string;
  };
  timeSeriesData: Array<{
    date: string;
    volume: number;
    trades: number;
    fees: number;
    successRate: number;
  }>;
  tokenDistribution: Array<{
    token: string;
    volume: number;
    trades: number;
    profit: number;
  }>;
  recentAlerts: Array<{
    type: 'success' | 'warning' | 'error';
    message: string;
    timestamp: string;
  }>;
}

export function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const { user } = useAuth();

  const fetchAnalytics = async () => {
    if (!user) return;

    try {
      // Fetch trade history for analytics
      const { data: trades } = await supabase
        .from('trade_history')
        .select(`
          *,
          trading_sessions!inner(user_id)
        `)
        .eq('trading_sessions.user_id', user.id)
        .gte('executed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('executed_at', { ascending: false });

      // Fetch recent activity logs
      const { data: logs } = await supabase
        .from('activity_logs')
        .select(`
          *,
          trading_sessions!inner(user_id)
        `)
        .eq('trading_sessions.user_id', user.id)
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: false })
        .limit(10);

      if (!trades) return;

      // Calculate performance metrics
      const successfulTrades = trades.filter(t => t.status === 'confirmed');
      const totalVolume = trades.reduce((sum, trade) => sum + (trade.usd_amount || 0), 0);
      const totalFees = trades.length * 0.000005; // Rough estimate
      
      // Group by date for time series
      const dailyData = trades.reduce((acc, trade) => {
        const date = new Date(trade.executed_at).toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = { date, volume: 0, trades: 0, fees: 0, successful: 0 };
        }
        acc[date].volume += trade.usd_amount || 0;
        acc[date].trades += 1;
        acc[date].fees += 0.000005;
        if (trade.status === 'confirmed') acc[date].successful += 1;
        return acc;
      }, {} as any);

      const timeSeriesData = Object.values(dailyData).map((day: any) => ({
        ...day,
        successRate: day.trades > 0 ? (day.successful / day.trades) * 100 : 0
      }));

      // Token distribution
      const tokenData = trades.reduce((acc, trade) => {
        const token = trade.token_mint || 'Unknown';
        if (!acc[token]) {
          acc[token] = { token, volume: 0, trades: 0, profit: 0 };
        }
        acc[token].volume += trade.usd_amount || 0;
        acc[token].trades += 1;
        return acc;
      }, {} as any);

      const tokenDistribution = Object.values(tokenData) as Array<{
        token: string;
        volume: number;
        trades: number;
        profit: number;
      }>;

      // Recent alerts from logs
      const recentAlerts = logs?.map(log => ({
        type: log.log_level === 'error' ? 'error' as const : 
              log.log_level === 'warn' ? 'warning' as const : 'success' as const,
        message: log.message,
        timestamp: log.timestamp
      })) || [];

      setAnalytics({
        performance: {
          totalTrades: trades.length,
          successfulTrades: successfulTrades.length,
          successRate: trades.length > 0 ? (successfulTrades.length / trades.length) * 100 : 0,
          totalVolume,
          avgTradeSize: trades.length > 0 ? totalVolume / trades.length : 0,
          profitLoss: 0, // Would need entry/exit prices to calculate
          totalFees,
          avgExecutionTime: 2.3, // Placeholder
          bestPerformingToken: 'SOL',
          worstPerformingToken: 'UNKNOWN'
        },
        timeSeriesData,
        tokenDistribution,
        recentAlerts
      });

    } catch (error) {
      console.error('Analytics fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [user, timeRange]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  if (!analytics) return null;

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', '#8884d8', '#82ca9d', '#ffc658'];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm text-muted-foreground">Success Rate</span>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {analytics.performance.successRate.toFixed(1)}%
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-muted-foreground">Total Volume</span>
          </div>
          <div className="text-2xl font-bold">
            ${analytics.performance.totalVolume.toFixed(0)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-muted-foreground">Total Trades</span>
          </div>
          <div className="text-2xl font-bold">
            {analytics.performance.totalTrades}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-muted-foreground">Avg Speed</span>
          </div>
          <div className="text-2xl font-bold">
            {analytics.performance.avgExecutionTime}s
          </div>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="performance" className="w-full">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Trading Volume Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="volume" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Success Rate Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="successRate" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Token Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.tokenDistribution}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="volume"
                  label={({ token, percent }) => `${token}: ${(percent * 100).toFixed(0)}%`}
                >
                  {analytics.tokenDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {analytics.recentAlerts.map((alert, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                  {alert.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />}
                  {alert.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />}
                  {alert.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />}
                  <div className="flex-1">
                    <div className="text-sm">{alert.message}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(alert.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}