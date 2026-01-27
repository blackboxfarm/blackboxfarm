import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, Zap, Flame } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SurgeAlert {
  id: string;
  token_mint: string;
  symbol: string | null;
  name: string | null;
  alert_type: string;
  search_count: number;
  time_window_minutes: number;
  unique_ips: number | null;
  detected_at: string;
  posted: boolean;
  queue_id: string | null;
}

const alertTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  surge_10min: { label: 'Search Surge', icon: <Zap className="h-3 w-3" />, color: 'bg-yellow-500' },
  spike_1hr: { label: 'Interest Spike', icon: <Flame className="h-3 w-3" />, color: 'bg-orange-500' },
  trending_24hr: { label: 'Trending', icon: <TrendingUp className="h-3 w-3" />, color: 'bg-blue-500' },
};

export function SurgeAlertsPanel() {
  const [alerts, setAlerts] = useState<SurgeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('holders_intel_surge_alerts')
        .select('*')
        .gte('detected_at', twentyFourHoursAgo)
        .order('detected_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAlerts((data as SurgeAlert[]) || []);
    } catch (err) {
      console.error('Failed to fetch surge alerts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('surge-alerts-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'holders_intel_surge_alerts' },
        () => fetchAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const stats = {
    total: alerts.length,
    posted: alerts.filter(a => a.posted).length,
    pending: alerts.filter(a => !a.posted && a.queue_id).length,
    byType: {
      surge_10min: alerts.filter(a => a.alert_type === 'surge_10min').length,
      spike_1hr: alerts.filter(a => a.alert_type === 'spike_1hr').length,
      trending_24hr: alerts.filter(a => a.alert_type === 'trending_24hr').length,
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Surge Alerts
            <Badge variant="outline" className="ml-2 text-xs">
              Last 24hr
            </Badge>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="bg-muted/50 rounded p-2 text-center">
            <div className="font-bold text-lg">{stats.total}</div>
            <div className="text-muted-foreground">Total</div>
          </div>
          <div className="bg-green-500/10 rounded p-2 text-center">
            <div className="font-bold text-lg text-green-500">{stats.posted}</div>
            <div className="text-muted-foreground">Posted</div>
          </div>
          <div className="bg-yellow-500/10 rounded p-2 text-center">
            <div className="font-bold text-lg text-yellow-500">{stats.pending}</div>
            <div className="text-muted-foreground">Pending</div>
          </div>
          <div className="bg-primary/10 rounded p-2 text-center">
            <div className="font-bold text-lg text-primary">{stats.byType.surge_10min}</div>
            <div className="text-muted-foreground">Surges</div>
          </div>
        </div>

        {/* Alerts table */}
        {loading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No surge alerts in the last 24 hours
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead compact className="w-24">Token</TableHead>
                  <TableHead compact>Type</TableHead>
                  <TableHead compact className="text-right">Searches</TableHead>
                  <TableHead compact className="text-right">IPs</TableHead>
                  <TableHead compact className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => {
                  const config = alertTypeConfig[alert.alert_type] || alertTypeConfig.surge_10min;
                  return (
                    <TableRow key={alert.id}>
                      <TableCell compact className="font-mono text-xs">
                        {alert.symbol ? `$${alert.symbol}` : alert.token_mint.slice(0, 6)}
                      </TableCell>
                      <TableCell compact>
                        <Badge 
                          variant="outline" 
                          className={`text-xs gap-1 ${config.color} text-white border-0`}
                        >
                          {config.icon}
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell compact className="text-right font-medium">
                        {alert.search_count}
                      </TableCell>
                      <TableCell compact className="text-right text-muted-foreground">
                        {alert.unique_ips || '-'}
                      </TableCell>
                      <TableCell compact className="text-right">
                        {alert.posted ? (
                          <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">
                            ✓ Posted
                          </Badge>
                        ) : alert.queue_id ? (
                          <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 text-xs">
                            Queued
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs">
                            {formatTimeAgo(alert.detected_at)}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
