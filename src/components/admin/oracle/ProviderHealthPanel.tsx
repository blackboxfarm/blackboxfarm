import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProviderStatus {
  serviceName: string;
  totalCalls: number;
  successCalls: number;
  failCalls: number;
  authFailures: number;
  rateLimitHits: number;
  failRate: number;
  avgResponseMs: number;
  lastCallAt: string | null;
  status: 'healthy' | 'degraded' | 'down';
}

const ProviderHealthPanel = () => {
  const { data: providers, isLoading, refetch } = useQuery({
    queryKey: ['provider-health-panel'],
    queryFn: async (): Promise<ProviderStatus[]> => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      // Fetch recent usage grouped by service
      const { data: logs, error } = await supabase
        .from('api_usage_log')
        .select('service_name, response_status, success, response_time_ms, timestamp')
        .gte('timestamp', thirtyMinAgo)
        .order('timestamp', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Group by service
      const grouped = new Map<string, typeof logs>();
      for (const log of logs || []) {
        if (!grouped.has(log.service_name)) grouped.set(log.service_name, []);
        grouped.get(log.service_name)!.push(log);
      }

      // Also check api_service_config for known services
      const { data: configs } = await supabase
        .from('api_service_config')
        .select('service_name, display_name, is_enabled');

      const knownServices = new Set([
        'helius', 'solscan', 'dexscreener', 'pumpfun', 'rugcheck', 'jupiter', 'coingecko',
        ...(configs || []).map(c => c.service_name),
        ...grouped.keys(),
      ]);

      const results: ProviderStatus[] = [];

      for (const svc of knownServices) {
        const svcLogs = grouped.get(svc) || [];
        const total = svcLogs.length;
        const fails = svcLogs.filter(l => !l.success).length;
        const authFails = svcLogs.filter(l => l.response_status === 401 || l.response_status === 403).length;
        const rateHits = svcLogs.filter(l => l.response_status === 429).length;
        const failRate = total > 0 ? fails / total : 0;
        const avgMs = total > 0 
          ? Math.round(svcLogs.reduce((sum, l) => sum + (l.response_time_ms || 0), 0) / total)
          : 0;

        let status: 'healthy' | 'degraded' | 'down' = 'healthy';
        if (authFails > 0 || failRate >= 0.8) status = 'down';
        else if (failRate >= 0.3 || rateHits > 0) status = 'degraded';

        results.push({
          serviceName: svc,
          totalCalls: total,
          successCalls: total - fails,
          failCalls: fails,
          authFailures: authFails,
          rateLimitHits: rateHits,
          failRate,
          avgResponseMs: avgMs,
          lastCallAt: svcLogs[0]?.timestamp || null,
          status,
        });
      }

      // Sort: down first, then degraded, then healthy
      const order = { down: 0, degraded: 1, healthy: 2 };
      results.sort((a, b) => order[a.status] - order[b.status] || b.totalCalls - a.totalCalls);

      return results;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const statusIcon = (s: ProviderStatus['status']) => {
    switch (s) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'degraded': return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'down': return <XCircle className="h-4 w-4 text-red-400" />;
    }
  };

  const statusBadge = (s: ProviderStatus['status']) => {
    const styles = {
      healthy: 'bg-green-500/10 text-green-400 border-green-500/30',
      degraded: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      down: 'bg-red-500/10 text-red-400 border-red-500/30',
    };
    return <Badge className={`text-[10px] ${styles[s]}`}>{s.toUpperCase()}</Badge>;
  };

  return (
    <Card className="border-violet-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            Provider Health (30min window)
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading provider health...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {(providers || []).map(p => (
              <div
                key={p.serviceName}
                className="rounded-lg border bg-card p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {statusIcon(p.status)}
                    <span className="font-mono text-xs font-semibold uppercase">{p.serviceName}</span>
                  </div>
                  {statusBadge(p.status)}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="text-muted-foreground">Calls</div>
                  <div className="text-right font-mono">{p.totalCalls}</div>
                  
                  <div className="text-muted-foreground">Success</div>
                  <div className="text-right font-mono text-green-400">{p.successCalls}</div>
                  
                  <div className="text-muted-foreground">Failures</div>
                  <div className="text-right font-mono text-red-400">{p.failCalls}</div>
                  
                  {p.authFailures > 0 && (
                    <>
                      <div className="text-muted-foreground">401/403</div>
                      <div className="text-right font-mono text-red-500 font-bold">{p.authFailures}</div>
                    </>
                  )}
                  
                  {p.rateLimitHits > 0 && (
                    <>
                      <div className="text-muted-foreground">429 Rate</div>
                      <div className="text-right font-mono text-yellow-500">{p.rateLimitHits}</div>
                    </>
                  )}
                  
                  <div className="text-muted-foreground">Fail %</div>
                  <div className={`text-right font-mono ${p.failRate > 0.3 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {(p.failRate * 100).toFixed(0)}%
                  </div>
                  
                  <div className="text-muted-foreground">Avg ms</div>
                  <div className="text-right font-mono">{p.avgResponseMs}</div>
                </div>

                {p.lastCallAt && (
                  <div className="text-[9px] text-muted-foreground truncate">
                    Last: {new Date(p.lastCallAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            ))}
            {(providers || []).length === 0 && (
              <div className="col-span-full text-center text-xs text-muted-foreground py-4">
                No API calls in the last 30 minutes
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProviderHealthPanel;
