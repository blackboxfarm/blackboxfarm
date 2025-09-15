import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePreviewSuperAdmin } from '@/hooks/usePreviewSuperAdmin';

interface MonitoredWallet {
  id: string;
  wallet_address: string;
  label: string;
  is_active: boolean;
}

interface WalletTransaction {
  id: string;
  signature: string;
  transaction_type: 'buy' | 'sell';
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  amount_sol: number;
  amount_usd?: number;
  platform?: string;
  is_first_purchase: boolean;
  meets_criteria: boolean;
  timestamp: string;
  monitored_wallet_id: string;
}

export const WalletMonitor = () => {
  const [wallets, setWallets] = useState<MonitoredWallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletLabel, setNewWalletLabel] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isPreviewSuperAdmin = usePreviewSuperAdmin();
  const wsRef = useRef<WebSocket | null>(null);
  
  // Check if user has access (either authenticated or preview super admin)
  const hasAccess = !!user || isPreviewSuperAdmin;

  // Load monitored wallets
  const loadWallets = async () => {
    if (!hasAccess) return;

    const { data, error } = await supabase
      .from('monitored_wallets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error loading wallets', description: error.message, variant: 'destructive' });
      return;
    }

    setWallets(data || []);
  };

  // Load transaction history
  const loadTransactions = async () => {
    if (!hasAccess) return;

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select(`
        *,
        monitored_wallets!inner(wallet_address, label)
      `)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) {
      toast({ title: 'Error loading transactions', description: error.message, variant: 'destructive' });
      return;
    }

    setTransactions((data || []) as WalletTransaction[]);
  };

  // Add new wallet
  const addWallet = async () => {
    if (!hasAccess || !newWalletAddress.trim()) return;

    // Always persist via Edge Function (handles both auth and preview)
    const { data, error } = await supabase.functions.invoke('add-monitored-wallet', {
      body: {
        wallet_address: newWalletAddress.trim(),
        label: newWalletLabel.trim() || newWalletAddress.substring(0, 8) + '...',
        is_active: true,
      },
    });

    if (error || (data && (data as any).error)) {
      const errMsg = error?.message || (data as any)?.error || 'Failed to add wallet';
      toast({ title: 'Error adding wallet', description: errMsg, variant: 'destructive' });
      return;
    }

    setNewWalletAddress('');
    setNewWalletLabel('');

    // Refresh local lists
    await loadWallets();
    await loadTransactions();

    // Notify websocket to refresh monitored set
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'refresh_wallets' }));
    }

    toast({ title: 'Wallet added', description: 'Now monitoring wallet transactions' });
  };

  // Remove wallet
  const removeWallet = async (walletId: string) => {
    const confirmed = window.confirm('Remove this wallet from monitoring?');
    if (!confirmed) return;

    // Preview mode: remove locally and tell server to stop watching
    if (isPreviewSuperAdmin && !user?.id) {
      const w = wallets.find((x) => x.id === walletId);
      setWallets((prev) => prev.filter((x) => x.id !== walletId));
      if (w && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'remove_wallet', address: w.wallet_address }));
      }
      toast({ title: 'Wallet removed', description: 'Stopped monitoring this wallet' });
      return;
    }

    const { error } = await supabase
      .from('monitored_wallets')
      .delete()
      .eq('id', walletId);

    if (error) {
      toast({ title: 'Error removing wallet', description: error.message, variant: 'destructive' });
      return;
    }

    await loadWallets();
    await loadTransactions();
    
    // Notify websocket to refresh
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'refresh_wallets' }));
    }

    toast({ title: 'Wallet removed', description: 'No longer monitoring this wallet' });
  };

  // Setup websocket connection
  const setupWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket('wss://apxauapuusmgwbbzjgfl.functions.supabase.co/wallet-monitor');
    
    ws.onopen = () => {
      console.log('Connected to wallet monitor');
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log('Disconnected from wallet monitor');
      setIsConnected(false);
      // Reconnect after 5 seconds
      setTimeout(setupWebSocket, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    wsRef.current = ws;
  };

  // Setup realtime subscription for new transactions
  useEffect(() => {
    if (!hasAccess) return;

    const channel = supabase
      .channel('wallet-transactions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wallet_transactions'
        },
        (payload) => {
          console.log('New transaction:', payload);
          loadTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasAccess]);

  // Initialize
  useEffect(() => {
    if (hasAccess) {
      loadWallets();
      loadTransactions();
      setupWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [hasAccess]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatAmount = (amountSol: number, amountUsd?: number) => {
    if (amountUsd && amountUsd > 0) {
      return `${amountSol.toFixed(4)} SOL ($${amountUsd.toFixed(2)})`;
    }
    return `${amountSol.toFixed(4)} SOL`;
  };

  const truncateAddress = (address: string) => {
    return address.substring(0, 8) + '...' + address.substring(address.length - 8);
  };

  if (!hasAccess) {
    return (
      <Card>
        <CardContent className="p-6">
          <p>Please log in to use the wallet monitor.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Wallet Monitor
            <Badge variant={isConnected ? "default" : "destructive"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Add New Wallet */}
      <Card>
        <CardHeader>
          <CardTitle>Add Wallet to Monitor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Wallet address"
              value={newWalletAddress}
              onChange={(e) => setNewWalletAddress(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Label (optional)"
              value={newWalletLabel}
              onChange={(e) => setNewWalletLabel(e.target.value)}
              className="w-48"
            />
            <Button onClick={addWallet} disabled={!newWalletAddress.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Monitored Wallets */}
      {wallets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monitored Wallets ({wallets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {wallets.map((wallet) => (
                <div key={wallet.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <div>
                    <div className="font-medium">{wallet.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {truncateAddress(wallet.wallet_address)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeWallet(wallet.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Feed (Last 100)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            {transactions.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No transactions yet. Add wallets to start monitoring.
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className={`p-4 rounded-md border ${
                      tx.meets_criteria
                        ? 'bg-red-100 border-red-500 dark:bg-red-900/20 dark:border-red-500'
                        : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {tx.transaction_type === 'buy' ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <div>
                          <div className={`font-medium ${tx.meets_criteria ? 'text-red-700 dark:text-red-300 font-bold' : ''}`}>
                            {tx.transaction_type.toUpperCase()} {tx.token_symbol || truncateAddress(tx.token_mint)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatTime(tx.timestamp)} • {formatAmount(tx.amount_sol, tx.amount_usd)}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {tx.platform && (
                          <Badge variant="outline">{tx.platform}</Badge>
                        )}
                        {tx.is_first_purchase && (
                          <Badge variant="secondary">FIRST</Badge>
                        )}
                        {tx.meets_criteria && (
                          <Badge variant="destructive" className="font-bold">
                            CRITERIA MET
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Signature: {truncateAddress(tx.signature)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};