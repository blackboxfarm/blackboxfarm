import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SourceStats {
  source_name: string;
  total_attempts: number;
  successes: number;
  failures: number;
  success_rate_pct: number;
  avg_success_time_ms: number;
  last_attempt_at: string;
}

interface RecentLog {
  id: string;
  source_name: string;
  success: boolean;
  price_fetched: number | null;
  response_time_ms: number;
  error_message: string | null;
  error_type: string | null;
  created_at: string;
}

export function SolPriceAnalytics() {
  const [stats, setStats] = useState<SourceStats[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch stats from the view
      const { data: statsData, error: statsError } = await supabase
        .from('sol_price_source_stats')
        .select('*');
      
      if (statsError) throw statsError;
      setStats(statsData || []);

      // Fetch recent logs
      const { data: logsData, error: logsError } = await supabase
        .from('sol_price_fetch_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (logsError) throw logsError;
      setRecentLogs(logsData || []);
    } catch (error) {
      console.error('Failed to fetch SOL price analytics:', error);
      toast({
        title: "Failed to load analytics",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSourceColor = (source: string): string => {
    const colors: Record<string, string> = {
      jupiter_v6: 'bg-green-500/20 text-green-400',
      binance: 'bg-yellow-500/20 text-yellow-400',
      coingecko: 'bg-orange-500/20 text-orange-400',
      kraken: 'bg-purple-500/20 text-purple-400',
      dexscreener: 'bg-blue-500/20 text-blue-400',
    };
    return colors[source] || 'bg-muted text-muted-foreground';
  };

  const getSuccessRateColor = (rate: number): string => {
    if (rate >= 95) return 'text-green-400';
    if (rate >= 80) return 'text-yellow-400';
    if (rate >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  const totalAttempts = stats.reduce((sum, s) => sum + s.total_attempts, 0);
  const totalSuccesses = stats.reduce((sum, s) => sum + s.successes, 0);
  const overallSuccessRate = totalAttempts > 0 ? ((totalSuccesses / totalAttempts) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          SOL Price Source Analytics (Last 24h)
        </h2>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalAttempts}</div>
            <div className="text-sm text-muted-foreground">Total Fetch Attempts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-400">{totalSuccesses}</div>
            <div className="text-sm text-muted-foreground">Successful Fetches</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-400">{totalAttempts - totalSuccesses}</div>
            <div className="text-sm text-muted-foreground">Failed Attempts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className={`text-2xl font-bold ${getSuccessRateColor(Number(overallSuccessRate))}`}>
              {overallSuccessRate}%
            </div>
            <div className="text-sm text-muted-foreground">Overall Success Rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Source Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Source Performance (Priority Order)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {['jupiter_v6', 'binance', 'coingecko', 'kraken', 'dexscreener'].map((sourceName, index) => {
              const source = stats.find(s => s.source_name === sourceName);
              if (!source) {
                return (
                  <div key={sourceName} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                      <Badge className={getSourceColor(sourceName)}>{sourceName}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">No data yet</span>
                  </div>
                );
              }
              return (
                <div key={source.source_name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                    <Badge className={getSourceColor(source.source_name)}>{source.source_name}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {source.total_attempts} attempts
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-sm">{source.successes}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-sm">{source.failures}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{source.avg_success_time_ms || '-'}ms</span>
                    </div>
                    <span className={`font-bold ${getSuccessRateColor(source.success_rate_pct)}`}>
                      {source.success_rate_pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Fetch Attempts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {recentLogs.map((log) => (
              <div 
                key={log.id} 
                className={`flex items-center justify-between p-2 rounded text-sm ${
                  log.success ? 'bg-green-500/10' : 'bg-red-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  {log.success ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400" />
                  )}
                  <Badge className={getSourceColor(log.source_name)} variant="outline">
                    {log.source_name}
                  </Badge>
                  {log.success && log.price_fetched && (
                    <span className="font-mono text-green-400">${log.price_fetched.toFixed(2)}</span>
                  )}
                  {!log.success && log.error_type && (
                    <span className="text-red-400 text-xs">{log.error_type}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{log.response_time_ms}ms</span>
                  <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {recentLogs.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No fetch logs yet. Logs will appear as SOL price is fetched.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
