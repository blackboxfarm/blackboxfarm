import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WalletBalance {
  pubkey: string;
  sol_balance: number;
  last_balance_check: string;
  wallet_type: 'pool' | 'blackbox' | 'super_admin';
}

interface BalanceState {
  wallets: WalletBalance[];
  totalBalance: number;
  isLoading: boolean;
  error: string | null;
  lastUpdate: string | null;
}

export function useRealtimeBalances() {
  const { toast } = useToast();
  const [state, setState] = useState<BalanceState>({
    wallets: [],
    totalBalance: 0,
    isLoading: true,
    error: null,
    lastUpdate: null
  });

  const refreshBalances = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const { data, error } = await supabase.functions.invoke('refresh-wallet-balances');
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data?.success) {
        // After refresh, fetch updated wallet data
        await loadWalletBalances();
        
        toast({
          title: "Balances Updated",
          description: `Successfully updated ${data.updated} wallet balances`,
        });
      }
    } catch (error: any) {
      console.error('Failed to refresh balances:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to refresh balances'
      }));
      
      toast({
        title: "Balance Refresh Failed",
        description: error.message || 'Failed to refresh wallet balances',
        variant: "destructive",
      });
    }
  }, [toast]);

  const loadWalletBalances = useCallback(async () => {
    try {
      // Load from different wallet types
      const [poolWallets, blackboxWallets] = await Promise.all([
        supabase
          .from('wallet_pools')
          .select('pubkey, sol_balance, last_balance_check')
          .eq('is_active', true),
        supabase
          .from('blackbox_wallets')
          .select('pubkey, sol_balance, updated_at')
          .eq('is_active', true)
      ]);

      const wallets: WalletBalance[] = [
        ...(poolWallets.data || []).map(w => ({
          pubkey: w.pubkey,
          sol_balance: w.sol_balance || 0,
          last_balance_check: w.last_balance_check || new Date().toISOString(),
          wallet_type: 'pool' as const
        })),
        ...(blackboxWallets.data || []).map(w => ({
          pubkey: w.pubkey,
          sol_balance: w.sol_balance || 0,
          last_balance_check: w.updated_at || new Date().toISOString(),
          wallet_type: 'blackbox' as const
        }))
      ];

      const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.sol_balance, 0);
      const lastUpdate = wallets.length > 0 
        ? Math.max(...wallets.map(w => new Date(w.last_balance_check).getTime()))
        : Date.now();

      setState({
        wallets,
        totalBalance,
        isLoading: false,
        error: null,
        lastUpdate: new Date(lastUpdate).toISOString()
      });
    } catch (error: any) {
      console.error('Failed to load wallet balances:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to load wallet balances'
      }));
    }
  }, []);

  useEffect(() => {
    // Initial load
    loadWalletBalances();
    
    // Set up real-time subscriptions
    const poolSubscription = supabase
      .channel('wallet_pools_balance_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'wallet_pools' },
        () => loadWalletBalances()
      )
      .subscribe();

    const blackboxSubscription = supabase
      .channel('blackbox_wallets_balance_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'blackbox_wallets' },
        () => loadWalletBalances()
      )
      .subscribe();

    // Auto-refresh every 5 minutes
    const autoRefreshInterval = setInterval(refreshBalances, 5 * 60 * 1000);

    return () => {
      poolSubscription.unsubscribe();
      blackboxSubscription.unsubscribe();
      clearInterval(autoRefreshInterval);
    };
  }, [loadWalletBalances, refreshBalances]);

  return {
    wallets: state.wallets,
    totalBalance: state.totalBalance,
    isLoading: state.isLoading,
    error: state.error,
    lastUpdate: state.lastUpdate,
    refreshBalances,
    reload: loadWalletBalances
  };
}