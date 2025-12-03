import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Activity, TrendingUp, TrendingDown, Copy, Edit, Check, ExternalLink, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { RequireAuth } from '@/components/RequireAuth';
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
  const [editingWallet, setEditingWallet] = useState<MonitoredWallet | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [whaleDumpLoading, setWhaleDumpLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);

  // Execute whale dump script
  const executeWhaleDump = async () => {
    const wallet = prompt('Enter whale wallet address:', '2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f');
    if (!wallet) return;
    
    const daysStr = prompt('How many days back?', '90');
    const days = parseInt(daysStr || '90', 10);
    if (isNaN(days) || days < 1) return;

    // Calculate suggested maxTx based on days (estimate ~500 txs/day for active whale)
    const suggestedMax = Math.max(10000, days * 500);
    const maxTxStr = prompt(`Max transactions to fetch? (suggested: ${suggestedMax} for ${days} days)`, suggestedMax.toString());
    const maxTx = parseInt(maxTxStr || suggestedMax.toString(), 10);
    if (isNaN(maxTx) || maxTx < 100) return;

    setWhaleDumpLoading(true);
    toast({ title: 'Whale Dump', description: `Fetching up to ${maxTx} transactions over ${days} days...` });

    try {
      const { data, error } = await supabase.functions.invoke('whale-transaction-dump', {
        body: { wallet, days, maxTx }
      });

      if (error) throw error;

      // Download as CSV
      const blob = new Blob([data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whale_${days}d_raw.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Success', description: 'CSV downloaded!' });
    } catch (err: any) {
      toast({ title: 'Whale Dump Failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setWhaleDumpLoading(false);
    }
  };

  // Load monitored wallets
  const loadWallets = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('monitored_wallets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWallets(data || []);
    } catch (err: any) {
      toast({ title: 'Error loading wallets', description: err?.message || 'Failed to load wallets', variant: 'destructive' });
    }
  };

  // Load transaction history
  const loadTransactions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          monitored_wallets!inner(wallet_address, label)
        `)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransactions((data || []) as WalletTransaction[]);
    } catch (err: any) {
      toast({ title: 'Error loading transactions', description: err?.message || 'Failed to load transactions', variant: 'destructive' });
    }
  };

  // Add new wallet
  const addWallet = async () => {
    if (!user || !newWalletAddress.trim()) return;

    // Always persist via Edge Function (handles both auth and preview)
    const { data, error } = await supabase.functions.invoke('add-monitored-wallet', {
      body: {
        wallet_address: newWalletAddress.trim(),
        label: newWalletLabel.trim() || newWalletAddress.substring(0, 8) + '...',
        is_active: true,
      },
    });

    let duplicateHandled = false;
    if (error || (data && (data as any).error)) {
      const errMsg = error?.message || (data as any)?.error || 'Failed to add wallet';
      if (errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('already exists')) {
        duplicateHandled = true; // treat as success
      } else {
        toast({ title: 'Error adding wallet', description: errMsg, variant: 'destructive' });
        return;
      }
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

    const status = (data as any)?.status;
    toast({ 
      title: duplicateHandled || status === 'already_exists' ? 'Wallet already monitored' : 'Wallet added',
      description: 'Monitoring wallet transactions'
    });
  };

  // Remove wallet
  const removeWallet = async (walletId: string) => {
    const confirmed = window.confirm('Remove this wallet from monitoring?');
    if (!confirmed) return;


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

  // Update wallet label
  const updateWalletLabel = async () => {
    if (!editingWallet || !editLabel.trim()) return;

    const { error } = await supabase
      .from('monitored_wallets')
      .update({ label: editLabel.trim() })
      .eq('id', editingWallet.id);

    if (error) {
      toast({ title: 'Error updating wallet', description: error.message, variant: 'destructive' });
      return;
    }

    await loadWallets();
    setEditingWallet(null);
    setEditLabel('');
    toast({ title: 'Wallet updated', description: 'Label has been updated' });
  };

  // Copy address to clipboard
  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast({ title: 'Copied', description: 'Wallet address copied to clipboard' });
    setTimeout(() => setCopiedAddress(null), 2000);
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
      try { ws.send(JSON.stringify({ type: 'refresh_wallets' })); } catch {}
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
    if (!user) return;

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
  }, [user]);

  // Initialize
  useEffect(() => {
    if (user) {
      loadWallets();
      loadTransactions();
      setupWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    const time = date.toLocaleTimeString();
    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return `${date.toLocaleDateString()} ${time}`;
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

  return (
    <RequireAuth>
      <div className="space-y-6">
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Activity className="h-5 w-5" />
            Wallet Monitor
            <Badge variant={isConnected ? "default" : "destructive"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={executeWhaleDump}
              disabled={whaleDumpLoading}
              className="ml-auto"
            >
              {whaleDumpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
              Whale Dump
            </Button>
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
                <div key={wallet.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{wallet.label}</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <code className="font-mono text-xs bg-background/50 px-1 py-0.5 rounded truncate max-w-[200px] sm:max-w-none">
                        {wallet.wallet_address}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => copyAddress(wallet.wallet_address)}
                      >
                        {copiedAddress === wallet.wallet_address ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                      <a
                        href={`https://solscan.io/account/${wallet.wallet_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        <Button size="icon" variant="ghost" className="h-6 w-6">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingWallet(wallet);
                        setEditLabel(wallet.label);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeWallet(wallet.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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

    {/* Edit Wallet Dialog */}
    <Dialog open={!!editingWallet} onOpenChange={(open) => !open && setEditingWallet(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Monitored Wallet</DialogTitle>
        </DialogHeader>
        {editingWallet && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Wallet Address</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs font-mono bg-muted p-2 rounded flex-1 break-all">
                  {editingWallet.wallet_address}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyAddress(editingWallet.wallet_address)}
                >
                  {copiedAddress === editingWallet.wallet_address ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Label</label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Enter a label"
                className="mt-1"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingWallet(null)}>
            Cancel
          </Button>
          <Button onClick={updateWalletLabel} disabled={!editLabel.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
    </RequireAuth>
  );
};