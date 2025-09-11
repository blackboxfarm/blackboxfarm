import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Transaction {
  id: string;
  transaction_type: string;
  amount_sol: number;
  status: string;
  executed_at: string;
  signature?: string;
  command_code_id?: string;
  wallet_id?: string;
}

export function BumpBotStatus() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSchedulerStalled, setIsSchedulerStalled] = useState(false);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('blackbox_transactions')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching transactions:', error);
        return;
      }

      setTransactions(data || []);
      
      // Check for stalled scheduler - if no transactions in last 5 minutes (scheduler runs every minute)
      if (data && data.length > 0) {
        const latestTx = new Date(data[0].executed_at);
        setLastActivity(latestTx);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        setIsSchedulerStalled(latestTx < fiveMinutesAgo);
      } else {
        setIsSchedulerStalled(true);
      }
    } catch (error) {
      console.error('Error in fetchTransactions:', error);
    }
  };

  useEffect(() => {
    fetchTransactions();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('blackbox_transactions_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'blackbox_transactions' },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchTransactions, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'success':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const truncateSignature = (sig?: string) => {
    if (!sig) return 'N/A';
    return `${sig.slice(0, 8)}...${sig.slice(-8)}`;
  };

  return (
    <div className="fixed bottom-4 left-4 w-96 z-50">
      <Card className="bg-background/95 backdrop-blur-sm border">
        <CardHeader 
          className="pb-2 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Bump Bot Status
              {isSchedulerStalled && (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
            </CardTitle>
            <Button variant="ghost" size="sm">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          {isSchedulerStalled && (
            <div className="text-xs text-destructive font-medium">
              ⚠️ Scheduler stalled - No activity in 5+ minutes
            </div>
          )}
          {lastActivity && (
            <div className="text-xs text-muted-foreground">
              Last activity: {formatTime(lastActivity.toISOString())}
            </div>
          )}
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="pt-0 max-h-80 overflow-y-auto">
            <div className="space-y-2">
              {transactions.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No transactions yet
                </div>
              ) : (
                transactions.map((tx) => (
                  <div 
                    key={tx.id}
                    className="flex items-center justify-between text-xs p-2 rounded bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={getStatusBadgeVariant(tx.status)}
                        className="text-xs"
                      >
                        {tx.transaction_type.toUpperCase()}
                      </Badge>
                      <span className="font-mono">
                        {tx.amount_sol.toFixed(6)} SOL
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-muted-foreground">
                        {formatTime(tx.executed_at)}
                      </span>
                      {tx.signature && (
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-mono"
                        >
                          {truncateSignature(tx.signature)}
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}