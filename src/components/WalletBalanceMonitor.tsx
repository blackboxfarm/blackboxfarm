import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Wallet, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useWalletPool } from '@/hooks/useWalletPool';

type WalletBalance = {
  id: string;
  pubkey: string;
  sol_balance: number;
  last_balance_check: string;
  campaign_id?: string;
  is_active: boolean;
};

export const WalletBalanceMonitor = () => {
  const [walletBalances, setWalletBalances] = useState<WalletBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { wallets } = useWalletPool();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    // Load initial balances
    loadWalletBalances();

    // Set up real-time subscription for wallet balance updates
    const channel = supabase
      .channel('wallet-balances')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallet_pools'
        },
        (payload) => {
          setWalletBalances(prev => 
            prev.map(w => 
              w.id === payload.new.id 
                ? { ...w, sol_balance: payload.new.sol_balance, last_balance_check: payload.new.last_balance_check }
                : w
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'blackbox_wallets'
        },
        (payload) => {
          setWalletBalances(prev => 
            prev.map(w => 
              w.id === payload.new.id 
                ? { ...w, sol_balance: payload.new.sol_balance }
                : w
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadWalletBalances = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Load wallet pool balances
      const { data: poolWallets, error: poolError } = await supabase
        .from('wallet_pools')
        .select('id, pubkey, sol_balance, last_balance_check, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (poolError) throw poolError;

      // Load blackbox wallet balances
      const { data: blackboxWallets, error: blackboxError } = await supabase
        .from('blackbox_wallets')
        .select(`
          id, pubkey, sol_balance, is_active,
          blackbox_campaigns!inner(user_id)
        `)
        .eq('blackbox_campaigns.user_id', user.id)
        .eq('is_active', true);

      if (blackboxError) throw blackboxError;

      const allWallets = [
        ...(poolWallets || []).map(w => ({ ...w, last_balance_check: w.last_balance_check || new Date().toISOString() })),
        ...(blackboxWallets || []).map(w => ({ ...w, last_balance_check: new Date().toISOString() }))
      ];

      setWalletBalances(allWallets);
    } catch (error: any) {
      toast({
        title: "Failed to Load Wallet Balances",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshBalances = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('refresh-wallet-balances');
      
      if (error) throw error;

      toast({
        title: "Balances Updated",
        description: "All wallet balances have been refreshed"
      });
      
      // Reload balances after refresh
      await loadWalletBalances();
    } catch (error: any) {
      toast({
        title: "Failed to Refresh Balances",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const totalBalance = walletBalances.reduce((sum, wallet) => sum + (wallet.sol_balance || 0), 0);
  const activeWallets = walletBalances.filter(w => w.is_active).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Balance Monitor
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshBalances}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {totalBalance.toFixed(4)} SOL
            </div>
            <div className="text-sm text-muted-foreground">Total Balance</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-accent">
              {activeWallets}
            </div>
            <div className="text-sm text-muted-foreground">Active Wallets</div>
          </div>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {walletBalances.map((wallet) => (
            <div key={wallet.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="font-mono text-sm truncate">
                  {wallet.pubkey}
                </div>
                <div className="text-xs text-muted-foreground">
                  Last updated: {new Date(wallet.last_balance_check).toLocaleTimeString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">
                  {(wallet.sol_balance || 0).toFixed(4)} SOL
                </div>
                <Badge variant={wallet.is_active ? "default" : "secondary"}>
                  {wallet.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {walletBalances.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No wallets found. Create some wallets to monitor their balances.
          </div>
        )}
      </CardContent>
    </Card>
  );
};