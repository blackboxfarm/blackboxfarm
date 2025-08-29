import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw,
  TrendingUp,
  DollarSign,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ExecutionMetrics {
  transactionId: string;
  status: 'pending' | 'confirming' | 'confirmed' | 'failed' | 'dropped';
  startTime: number;
  confirmationTime?: number;
  blockHeight?: number;
  slot?: number;
  confirmations: number;
  actualFee: number;
  slippage?: number;
  priceImpact?: number;
  mevProtected: boolean;
  retryCount: number;
  errorReason?: string;
}

interface Analytics {
  totalTrades: number;
  successRate: number;
  avgExecutionTime: number;
  totalVolume: number;
  totalFees: number;
  profitLoss: number;
}

interface ExecutionMonitorProps {
  signature?: string;
  sessionId?: string;
  autoRefresh?: boolean;
}

export function ExecutionMonitor({ 
  signature, 
  sessionId, 
  autoRefresh = true 
}: ExecutionMonitorProps) {
  const [metrics, setMetrics] = useState<ExecutionMetrics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchMetrics = async () => {
    if (!signature || !sessionId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('execution-monitor', {
        body: { signature, sessionId }
      });

      if (error) throw error;
      setMetrics(data.metrics);
      setAnalytics(data.analytics);
    } catch (error) {
      console.error('Execution monitoring error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch execution metrics",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (signature && sessionId) {
      fetchMetrics();
    }
  }, [signature, sessionId]);

  useEffect(() => {
    if (!autoRefresh || !signature || !sessionId) return;
    
    const interval = setInterval(() => {
      if (metrics?.status === 'pending' || metrics?.status === 'confirming') {
        fetchMetrics();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [autoRefresh, signature, sessionId, metrics?.status]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
      case 'dropped':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'confirming':
        return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'default';
      case 'failed':
      case 'dropped':
        return 'destructive';
      case 'confirming':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (!signature && !analytics) {
    return (
      <Card className="p-4">
        <div className="text-center text-muted-foreground">
          No transactions to monitor
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Transaction */}
      {metrics && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {getStatusIcon(metrics.status)}
              <span className="font-medium">Transaction Status</span>
            </div>
            <Badge variant={getStatusColor(metrics.status)}>
              {metrics.status.toUpperCase()}
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Transaction ID:</span>
              <span className="font-mono text-xs">
                {metrics.transactionId.slice(0, 8)}...{metrics.transactionId.slice(-8)}
              </span>
            </div>

            {metrics.status === 'confirming' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Confirmations:</span>
                  <span>{metrics.confirmations}/32</span>
                </div>
                <Progress value={(metrics.confirmations / 32) * 100} />
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span>Actual Fee:</span>
              <span>{metrics.actualFee.toFixed(6)} SOL</span>
            </div>

            {metrics.mevProtected && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span>MEV Protected</span>
              </div>
            )}

            {metrics.errorReason && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                {metrics.errorReason}
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchMetrics}
            disabled={loading}
            className="mt-4 w-full"
          >
            <RefreshCw className={`w-3 h-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        </Card>
      )}

      {/* Session Analytics */}
      {analytics && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4" />
            <span className="font-medium">Session Analytics</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-2xl font-bold">{analytics.totalTrades}</div>
              <div className="text-sm text-muted-foreground">Total Trades</div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-bold text-green-600">
                {analytics.successRate.toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-bold">{analytics.avgExecutionTime.toFixed(1)}s</div>
              <div className="text-sm text-muted-foreground">Avg Speed</div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-bold">${analytics.totalVolume.toFixed(0)}</div>
              <div className="text-sm text-muted-foreground">Volume</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Total Fees:
              </span>
              <span>{analytics.totalFees.toFixed(6)} SOL</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                P&L:
              </span>
              <span className={analytics.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
                ${analytics.profitLoss.toFixed(2)}
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}