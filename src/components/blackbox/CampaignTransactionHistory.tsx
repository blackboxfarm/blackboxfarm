import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Clock, ExternalLink, X, List, Activity, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useSolPrice } from "@/hooks/useSolPrice";

interface CampaignTransaction {
  id: string;
  transaction_type: string;
  amount_sol: number;
  status: string | null;
  executed_at: string | null;
  signature?: string | null;
  gas_fee?: number | null;
  service_fee?: number | null;
  wallet_id?: string | null;
  command_code_id?: string | null;
}

interface CampaignTransactionHistoryProps {
  campaignId: string;
  className?: string;
}

function formatTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch {
    return ts ?? "—";
  }
}

function truncate(str?: string | null, head = 8, tail = 6) {
  if (!str) return "—";
  if (str.length <= head + tail) return str;
  return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

function statusBadgeVariant(status?: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch ((status || "").toLowerCase()) {
    case "confirmed":
    case "success":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

export function CampaignTransactionHistory({ campaignId, className }: CampaignTransactionHistoryProps) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
  const [transactions, setTransactions] = useState<CampaignTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [isStalled, setIsStalled] = useState(false);
  const [clearBefore, setClearBefore] = useState<Date | null>(null);
  const { price: solPrice } = useSolPrice();

  const visibleCount = 20;

  const loadTransactions = async () => {
    setLoading(true);
    try {
      // Get all wallet IDs for this campaign
      const { data: campaignWallets, error: walletError } = await supabase
        .from('campaign_wallets')
        .select('wallet_id')
        .eq('campaign_id', campaignId);

      if (walletError) {
        console.error('Error fetching campaign wallets:', walletError);
        return;
      }

      if (!campaignWallets || campaignWallets.length === 0) {
        setTransactions([]);
        setLoading(false);
        return;
      }

      const walletIds = campaignWallets.map(cw => cw.wallet_id);

      // Get transactions for this specific campaign only
      const { data, error } = await supabase
        .from('blackbox_transactions')
        .select('id, transaction_type, amount_sol, status, executed_at, signature, gas_fee, service_fee, wallet_id, command_code_id, campaign_id')
        .eq('campaign_id', campaignId)
        .order('executed_at', { ascending: false })
        .limit(visibleCount);

      if (error) {
        console.error('Error fetching transactions:', error);
        return;
      }

      setTransactions(data || []);

      // Check for stalled activity
      if (data && data.length > 0) {
        const latestTx = new Date(data[0].executed_at!);
        setLastActivity(latestTx);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        setIsStalled(latestTx < fiveMinutesAgo);
      } else {
        setIsStalled(true);
      }
    } catch (error) {
      console.error('Error in loadTransactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();

    // Set up real-time subscription
    const channel = supabase
      .channel(`campaign-tx-history-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blackbox_transactions' },
        () => {
          loadTransactions();
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(loadTransactions, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [campaignId]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

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

  const recentTransactions = useMemo(() => {
    let filtered = transactions.slice(0, 7); // Show last 7 for status view
    if (clearBefore) {
      filtered = filtered.filter(tx => new Date(tx.executed_at!) > clearBefore);
    }
    return filtered;
  }, [transactions, clearBefore]);

  const filteredTransactions = useMemo(() => {
    if (clearBefore) {
      return transactions.filter(tx => new Date(tx.executed_at!) > clearBefore);
    }
    return transactions;
  }, [transactions, clearBefore]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Campaign Status */}
      <Card className="bg-background/95 backdrop-blur-sm border">
        <CardHeader 
          className="pb-2 cursor-pointer"
          onClick={() => setStatusOpen(!statusOpen)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Campaign Status
              {isStalled && (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
            </CardTitle>
            <Button variant="ghost" size="sm">
              {statusOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          {isStalled && (
            <div className="text-xs text-destructive font-medium">
              ⚠️ No activity in 5+ minutes
            </div>
          )}
          {lastActivity && (
            <div className="text-xs text-muted-foreground">
              Last activity: {formatTime(lastActivity.toISOString())}
            </div>
          )}
        </CardHeader>
        
        {statusOpen && (
          <CardContent className="pt-0 max-h-60 overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground">Recent activity</span>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setClearBefore(new Date())}
                disabled={recentTransactions.length === 0}
                className="h-6 text-xs"
              >
                Clear
              </Button>
            </div>
            <div className="space-y-2">
              {recentTransactions.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  {clearBefore ? "No new transactions" : "No transactions yet"}
                </div>
              ) : (
                recentTransactions.map((tx) => (
                  <div 
                    key={tx.id}
                    className="flex items-center justify-between text-xs p-2 rounded bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={getStatusBadgeVariant(tx.status || '')}
                        className="text-xs"
                      >
                        {tx.transaction_type.toUpperCase()}
                      </Badge>
                      <span className="font-mono">
                        {tx.amount_sol.toFixed(6)} SOL
                        <span className="text-muted-foreground ml-1">
                          (${(tx.amount_sol * solPrice).toFixed(4)})
                        </span>
                      </span>
                      {tx.status === 'failed' && (
                        <span className="text-destructive text-xs">
                          ⚠️ Failed
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-muted-foreground">
                        {formatTime(tx.executed_at!)}
                      </span>
                      {tx.signature ? (
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-mono"
                        >
                          {truncate(tx.signature)}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No signature
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Transaction History */}
      <Card className="shadow-lg">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <List className="h-4 w-4" /> Campaign Transaction History
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">live</Badge>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setClearBefore(new Date())}
                disabled={filteredTransactions.length === 0}
              >
                Clear
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setHistoryOpen(o => !o)} 
                aria-label={historyOpen ? "Collapse" : "Expand"}
              >
                {historyOpen ? <X className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        {historyOpen && (
          <CardContent className="pt-0">
            {loading ? (
              <div className="py-6 text-sm text-muted-foreground">Loading…</div>
            ) : (
              <ScrollArea className="max-h-80">
                <ul className="divide-y">
                  {filteredTransactions.map((tx) => (
                    <li key={tx.id} className="py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={tx.transaction_type === "sell" ? "secondary" : "default"}>
                              {tx.transaction_type.toUpperCase()}
                            </Badge>
                            <Badge variant={statusBadgeVariant(tx.status || undefined)}>
                              {tx.status ?? "unknown"}
                            </Badge>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {tx.amount_sol} SOL (${(tx.amount_sol * solPrice).toFixed(4)}) • gas {tx.gas_fee ?? 0} • fee {tx.service_fee ?? 0}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatTs(tx.executed_at)}</span>
                          </div>
                          {tx.signature && (
                            <div className="mt-1 text-xs flex items-center gap-2">
                              <a
                                className="underline hover:no-underline text-primary"
                                href={`https://solscan.io/tx/${tx.signature}`}
                                target="_blank"
                                rel="noreferrer"
                                title={`View on Solscan: ${tx.signature}`}
                              >
                                Solscan <ExternalLink className="inline h-3 w-3" />
                              </a>
                              <a
                                className="underline hover:no-underline text-primary"
                                href={`https://explorer.solana.com/tx/${tx.signature}`}
                                target="_blank"
                                rel="noreferrer"
                                title={`View on Solana Explorer: ${tx.signature}`}
                              >
                                Explorer <ExternalLink className="inline h-3 w-3" />
                              </a>
                              <span className="font-mono text-muted-foreground">
                                {truncate(tx.signature)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                  {(!loading && filteredTransactions.length === 0) && (
                    <li className="py-6 text-sm text-muted-foreground text-center">
                      {clearBefore ? "No new transactions since clear" : "No transactions yet"}
                    </li>
                  )}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}