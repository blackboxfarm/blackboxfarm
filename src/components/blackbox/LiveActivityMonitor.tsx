import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

// Simple client to avoid type recursion issues
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
  gas_fee?: number;
  service_fee?: number;
  platform_fee?: number;
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
    const setupSubscriptions = async () => {
      await setupRealtimeSubscriptions();
    };
    setupSubscriptions();
  }, [campaignId]);

  const loadInitialData = async () => {
    setIsLoading(true);
    
    // First get wallet IDs for this campaign through the junction table
    const { data: campaignWallets } = await supabase
      .from('campaign_wallets')
      .select('wallet_id')
      .eq('campaign_id', campaignId);

    const walletIds = campaignWallets?.map(cw => cw.wallet_id) || [];

    if (!walletIds || walletIds.length === 0) {
      setIsLoading(false);
      return;
    }

    const walletIdArray = walletIds;

    // Load campaign stats using junction table
    const { data: wallets } = await supabase
      .from('campaign_wallets')
      .select(`
        blackbox_wallets!inner(
          id,
          blackbox_command_codes(id, is_active)
        )
      `)
      .eq('campaign_id', campaignId);

    // Load transactions separately for better control
    const { data: allTransactions } = await supabase
      .from('blackbox_transactions')
      .select('id, transaction_type, amount_sol, status, executed_at, signature, gas_fee, service_fee')
      .in('wallet_id', walletIdArray)
      .order('executed_at', { ascending: false });

    if (wallets) {
      // Extract wallet data from the junction table result
      const walletData = wallets.map((cw: any) => cw.blackbox_wallets).filter(Boolean);
      
      const totalCommands = walletData.reduce((acc: number, wallet: any) => acc + (wallet.blackbox_command_codes?.length || 0), 0);
      const activeCommands = walletData.reduce((acc: number, wallet: any) => 
        acc + (wallet.blackbox_command_codes?.filter((cmd: any) => cmd.is_active).length || 0), 0);
      
      const buyCount = allTransactions?.filter((tx: any) => tx.transaction_type === 'buy').length || 0;
      const sellCount = allTransactions?.filter((tx: any) => tx.transaction_type === 'sell').length || 0;
      const totalFees = allTransactions?.reduce((acc: number, tx: any) => 
        acc + (Number(tx.gas_fee) || 0), 0) || 0;

      setStats({
        total_commands: totalCommands,
        active_commands: activeCommands,
        total_transactions: allTransactions?.length || 0,
        buy_count: buyCount,
        sell_count: sellCount,
        total_fees: totalFees,
      });

      // Set recent transactions
      if (allTransactions) {
        setTransactions(allTransactions.slice(0, 10));
      }
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

  const setupRealtimeSubscriptions = async () => {
    // Get wallet IDs for filtering real-time updates through junction table
    const { data: campaignWallets } = await supabase
      .from('campaign_wallets')
      .select('wallet_id')
      .eq('campaign_id', campaignId);

    const walletIds = campaignWallets?.map(cw => cw.wallet_id) || [];

    if (!walletIds || walletIds.length === 0) return;

    // Subscribe to new transactions for this campaign's wallets
    const transactionChannel = supabase
      .channel('transaction-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'blackbox_transactions'
      }, (payload) => {
        // Only update if transaction belongs to one of this campaign's wallets
        if (walletIds.includes(payload.new.wallet_id)) {
          setTransactions(prev => [payload.new as Transaction, ...prev.slice(0, 9)]);
          // Update stats
          setStats(prev => ({
            ...prev,
            total_transactions: prev.total_transactions + 1,
            buy_count: payload.new.transaction_type === 'buy' ? prev.buy_count + 1 : prev.buy_count,
            sell_count: payload.new.transaction_type === 'sell' ? prev.sell_count + 1 : prev.sell_count,
            total_fees: prev.total_fees + (Number(payload.new.gas_fee) || 0),
          }));
        }
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

  const getLogLevelBadgeVariant = (level: string) => {
    switch (level) {
      case 'info': return 'default';
      case 'warning': return 'secondary';
      case 'error': return 'destructive';
      default: return 'outline';
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
      {/* Error Summary */}
      {activityLogs.filter(log => log.log_level === 'error').length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Activity className="h-5 w-5" />
              Execution Issues Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-red-700 mb-3">
              <strong>{activityLogs.filter(log => log.log_level === 'error').length}</strong> execution errors detected. 
              Common causes: Invalid configuration, network issues, or insufficient funds.
            </div>
            <div className="text-xs text-red-600">
              Recent error: {activityLogs.find(log => log.log_level === 'error')?.message}
            </div>
          </CardContent>
        </Card>
      )}

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
                    <div key={tx.id} className="p-3 border rounded space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(tx.status)}`} />
                          <Badge variant={tx.transaction_type === 'buy' ? 'default' : 'destructive'}>
                            {tx.transaction_type.toUpperCase()}
                          </Badge>
                          <span className="text-sm font-mono">
                            ${(Number(tx.amount_sol) * 150).toFixed(4)} USD ({Number(tx.amount_sol).toFixed(9)} SOL)
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(tx.executed_at)}
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <div className="space-y-1">
                          <div className="text-muted-foreground">
                            Blockchain Fee: <span className="font-mono">{Number(tx.gas_fee || 0).toFixed(9)} SOL</span>
                          </div>
                          <div className="text-muted-foreground">
                            Service Fee (Normal): <span className="font-mono">{Number(tx.service_fee || 0).toFixed(9)} SOL</span>
                            <span className="text-green-500 ml-1">(Waived for test)</span>
                          </div>
                        </div>
                        {tx.signature && (
                          <button
                            onClick={() => navigator.clipboard.writeText(tx.signature!)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border"
                            title="Copy transaction signature"
                          >
                            Copy Sig
                          </button>
                        )}
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
              {activityLogs.filter(log => log.log_level === 'error').length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {activityLogs.filter(log => log.log_level === 'error').length} Errors
                </Badge>
              )}
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
                    <div key={log.id} className={`p-2 border rounded text-sm ${
                      log.log_level === 'error' ? 'border-red-200 bg-red-50' : ''
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant={getLogLevelBadgeVariant(log.log_level)} className={getLogLevelColor(log.log_level)}>
                          {log.log_level.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(log.timestamp)}
                        </span>
                      </div>
                      <div className="text-sm break-words">{log.message}</div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer text-muted-foreground">
                            View Details
                          </summary>
                          <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
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