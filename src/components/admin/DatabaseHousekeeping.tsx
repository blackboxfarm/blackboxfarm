import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Trash2, RefreshCw, Database, AlertTriangle, CheckCircle, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TableStat {
  table: string;
  rowCount: number;
  retentionDays: number | null;
  error?: string;
}

interface PruneResult {
  table: string;
  rowsBefore: number;
  rowsDeleted: number;
  rowsAfter: number;
  retentionDays: number;
}

const ROW_WARN_THRESHOLD = 50_000;
const ROW_CRITICAL_THRESHOLD = 200_000;

export function DatabaseHousekeeping() {
  const [stats, setStats] = useState<TableStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [lastPruneResults, setLastPruneResults] = useState<PruneResult[] | null>(null);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('database-housekeeping', {
        body: { action: 'stats' },
      });
      if (error) throw error;
      setStats(data.stats || []);
      setLastRunTime(new Date().toISOString());
    } catch (err: any) {
      toast.error('Failed to fetch table stats: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const runPrune = async (dryRun: boolean) => {
    setPruning(true);
    try {
      const { data, error } = await supabase.functions.invoke('database-housekeeping', {
        body: { action: 'prune', dryRun },
      });
      if (error) throw error;
      setLastPruneResults(data.results || []);
      toast.success(
        dryRun
          ? `Dry run complete — ${data.results?.reduce((s: number, r: PruneResult) => s + (r.rowsBefore - r.rowsAfter), 0) || 0} rows would be deleted`
          : `Pruned ${data.totalDeleted?.toLocaleString()} rows in ${data.executionMs}ms`
      );
      if (!dryRun) fetchStats();
    } catch (err: any) {
      toast.error('Prune failed: ' + err.message);
    } finally {
      setPruning(false);
    }
  };

  const pruneNotifications = async () => {
    setPruning(true);
    try {
      const { data, error } = await supabase.functions.invoke('database-housekeeping', {
        body: { action: 'prune_notifications' },
      });
      if (error) throw error;
      toast.success(`Cleaned ${data.readNotificationsDeleted} old read notifications`);
      fetchStats();
    } catch (err: any) {
      toast.error('Notification prune failed: ' + err.message);
    } finally {
      setPruning(false);
    }
  };

  const totalRows = stats.reduce((sum, s) => sum + Math.max(s.rowCount, 0), 0);
  const warningTables = stats.filter(s => s.rowCount >= ROW_WARN_THRESHOLD);

  const getRowBadge = (count: number) => {
    if (count >= ROW_CRITICAL_THRESHOLD) return <Badge variant="destructive">{count.toLocaleString()}</Badge>;
    if (count >= ROW_WARN_THRESHOLD) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{count.toLocaleString()}</Badge>;
    return <Badge variant="secondary">{count.toLocaleString()}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Database className="h-4 w-4" /> Total Rows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalRows.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.length} monitored tables</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Tables Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {warningTables.length > 0 ? (
                <span className="text-yellow-400">{warningTables.length}</span>
              ) : (
                <span className="text-green-400">0</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">&gt;{ROW_WARN_THRESHOLD.toLocaleString()} rows</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Last Checked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-foreground">
              {lastRunTime ? new Date(lastRunTime).toLocaleTimeString() : 'Never'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Auto-prune runs daily at 3 AM UTC</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">🧹 Database Housekeeping</CardTitle>
          <CardDescription>Prune old log data to keep the database performant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={fetchStats} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh Stats
            </Button>
            <Button onClick={() => runPrune(true)} variant="outline" size="sm" disabled={pruning}>
              <Eye className="h-4 w-4 mr-1" />
              Dry Run (Preview)
            </Button>
            <Button onClick={() => runPrune(false)} variant="destructive" size="sm" disabled={pruning}>
              <Trash2 className="h-4 w-4 mr-1" />
              {pruning ? 'Pruning...' : 'Prune Now'}
            </Button>
            <Button onClick={pruneNotifications} variant="outline" size="sm" disabled={pruning}>
              🔔 Clean Old Notifications
            </Button>
          </div>

          {/* Table Stats */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Retention</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((stat) => {
                const pct = Math.min((stat.rowCount / ROW_CRITICAL_THRESHOLD) * 100, 100);
                return (
                  <TableRow key={stat.table}>
                    <TableCell className="font-mono text-sm text-foreground">{stat.table}</TableCell>
                    <TableCell className="text-right">{getRowBadge(stat.rowCount)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {stat.retentionDays ? `${stat.retentionDays}d` : '—'}
                    </TableCell>
                    <TableCell className="w-32">
                      <Progress
                        value={pct}
                        className={`h-2 ${pct >= 90 ? '[&>div]:bg-red-500' : pct >= 50 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-green-500'}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Last Prune Results */}
          {lastPruneResults && lastPruneResults.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-foreground mb-2">Last Prune Results</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {lastPruneResults.map((r) => (
                  <div key={r.table} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                    <span className="font-mono text-foreground">{r.table}</span>
                    <span className="text-muted-foreground">
                      {r.rowsDeleted > 0 ? (
                        <span className="text-green-400">-{r.rowsDeleted.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">no change</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
