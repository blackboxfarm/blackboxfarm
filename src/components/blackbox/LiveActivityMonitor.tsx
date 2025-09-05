import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ArrowUpDown, Clock, DollarSign } from "lucide-react";

interface ActivityLog {
  id: string;
  message: string;
  log_level: string;
  timestamp: string;
  metadata?: any;
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount_sol: number;
  status: string;
  executed_at: string;
  signature?: string;
}

interface CampaignStats {
  total_commands: number;
  active_commands: number;
  total_transactions: number;
  buy_count: number;
  sell_count: number;
  total_fees: number;
}

interface LiveActivityMonitorProps {
  campaignId: string;
}

export function LiveActivityMonitor({ campaignId }: LiveActivityMonitorProps) {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<CampaignStats>({
    total_commands: 0,
    active_commands: 0,
    total_transactions: 0,
    buy_count: 0,
    sell_count: 0,
    total_fees: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
    setupRealtimeSubscriptions();
  }, [campaignId]);

  const loadInitialData = async () => {
    setIsLoading(true);
    
    // Load campaign stats
    const { data: wallets } = await supabase
      .from('blackbox_wallets')
      .select(`
        id,
        blackbox_command_codes(id, is_active),
        blackbox_transactions(id, transaction_type, amount_sol, status, executed_at, gas_fee, service_fee)
      `)
      .eq('campaign_id', campaignId);

    if (wallets) {
      const totalCommands = wallets.reduce((acc, wallet) => acc + (wallet.blackbox_command_codes?.length || 0), 0);
      const activeCommands = wallets.reduce((acc, wallet) => 
        acc + (wallet.blackbox_command_codes?.filter((cmd: any) => cmd.is_active).length || 0), 0);
      
      const allTransactions = wallets.flatMap(wallet => wallet.blackbox_transactions || []);
      const buyCount = allTransactions.filter((tx: any) => tx.transaction_type === 'buy').length;
      const sellCount = allTransactions.filter((tx: any) => tx.transaction_type === 'sell').length;
      const totalFees = allTransactions.reduce((acc: number, tx: any) => 
        acc + (Number(tx.gas_fee) || 0) + (Number(tx.service_fee) || 0), 0);

      setStats({
        total_commands: totalCommands,
        active_commands: activeCommands,
        total_transactions: allTransactions.length,
        buy_count: buyCount,
        sell_count: sellCount,
        total_fees: totalFees,
      });

      // Set recent transactions
      const recentTransactions = allTransactions
        .sort((a: any, b: any) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())
        .slice(0, 10);
      setTransactions(recentTransactions);
    }

    // Load recent activity logs
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(20);

    if (logs) {
      setActivityLogs(logs);
    }

    setIsLoading(false);
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to new transactions
    const transactionChannel = supabase
      .channel('transaction-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'blackbox_transactions'
      }, (payload) => {
        setTransactions(prev => [payload.new as Transaction, ...prev.slice(0, 9)]);
        // Update stats
        setStats(prev => ({
          ...prev,
          total_transactions: prev.total_transactions + 1,
          buy_count: payload.new.transaction_type === 'buy' ? prev.buy_count + 1 : prev.buy_count,
          sell_count: payload.new.transaction_type === 'sell' ? prev.sell_count + 1 : prev.sell_count,
          total_fees: prev.total_fees + (Number(payload.new.gas_fee) || 0) + (Number(payload.new.service_fee) || 0),
        }));
      })
      .subscribe();

    // Subscribe to activity logs
    const activityChannel = supabase
      .channel('activity-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_logs'
      }, (payload) => {
        setActivityLogs(prev => [payload.new as ActivityLog, ...prev.slice(0, 19)]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(transactionChannel);
      supabase.removeChannel(activityChannel);
    };
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'info': return 'text-blue-500';
      case 'warning': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.active_commands}</div>
            <div className="text-sm text-muted-foreground">Active Commands</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{stats.buy_count}</div>
            <div className="text-sm text-muted-foreground">Total Buys</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{stats.sell_count}</div>
            <div className="text-sm text-muted-foreground">Total Sells</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-500">{stats.total_fees.toFixed(4)}</div>
            <div className="text-sm text-muted-foreground">SOL Fees</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5" />
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {transactions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No transactions yet
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(tx.status)}`} />
                        <Badge variant={tx.transaction_type === 'buy' ? 'default' : 'destructive'}>
                          {tx.transaction_type.toUpperCase()}
                        </Badge>
                        <span className="text-sm">{tx.amount_sol} SOL</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(tx.executed_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Live Activity Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {activityLogs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No activity logs yet
                  </div>
                ) : (
                  activityLogs.map((log) => (
                    <div key={log.id} className="p-2 border rounded text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className={getLogLevelColor(log.log_level)}>
                          {log.log_level}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(log.timestamp)}
                        </span>
                      </div>
                      <div className="text-sm break-words">{log.message}</div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}