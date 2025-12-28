import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WalletBalance {
  pubkey: string;
  sol_balance: number;
  last_balance_check: string;
  wallet_type: 'pool' | 'blackbox' | 'super_admin';
  label?: string;
  sub_type?: string;
}

interface BalanceState {
  wallets: WalletBalance[];
  totalBalance: number;
  isLoading: boolean;
  error: string | null;
  lastUpdate: string | null;
}

// Debounce helper
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function useRealtimeBalances(autoLoad = false) {
  const { toast } = useToast();
  const [state, setState] = useState<BalanceState>({
    wallets: [],
    totalBalance: 0,
    isLoading: false,
    error: null,
    lastUpdate: null
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const subscriptionsRef = useRef<{ unsubscribe: () => void }[]>([]);

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
      setState(prev => ({ ...prev, isLoading: true }));
      
      // Load from different wallet types (including super_admin_wallets)
      const [poolWallets, blackboxWallets, superAdminWallets] = await Promise.all([
        supabase
          .from('wallet_pools')
          .select('pubkey, sol_balance, last_balance_check')
          .eq('is_active', true),
        supabase
          .from('blackbox_wallets')
          .select('pubkey, sol_balance, updated_at')
          .eq('is_active', true),
        supabase
          .from('super_admin_wallets')
          .select('pubkey, label, wallet_type, updated_at')
          .eq('is_active', true)
      ]);

      const wallets: WalletBalance[] = [
        ...(superAdminWallets.data || []).map((w: any) => ({
          pubkey: w.pubkey,
          sol_balance: 0, // No sol_balance column yet - will fetch on demand
          last_balance_check: w.updated_at || new Date().toISOString(),
          wallet_type: 'super_admin' as const,
          label: w.label,
          sub_type: w.wallet_type
        })),
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
      setIsInitialized(true);
    } catch (error: any) {
      console.error('Failed to load wallet balances:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to load wallet balances'
      }));
    }
  }, []);

  // Debounced version of loadWalletBalances to prevent rapid reloads
  const debouncedLoad = useCallback(
    debounce(() => {
      if (isInitialized) {
        loadWalletBalances();
      }
    }, 3000),
    [loadWalletBalances, isInitialized]
  );

  // Subscribe to realtime updates - only after initial load
  const subscribeToUpdates = useCallback(() => {
    // Cleanup any existing subscriptions
    subscriptionsRef.current.forEach(sub => sub.unsubscribe());
    subscriptionsRef.current = [];

    const poolSubscription = supabase
      .channel('wallet_pools_balance_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'wallet_pools' },
        debouncedLoad
      )
      .subscribe();

    const blackboxSubscription = supabase
      .channel('blackbox_wallets_balance_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'blackbox_wallets' },
        debouncedLoad
      )
      .subscribe();

    subscriptionsRef.current = [poolSubscription, blackboxSubscription];
  }, [debouncedLoad]);

  // Only auto-load if explicitly requested
  useEffect(() => {
    if (autoLoad && !isInitialized) {
      loadWalletBalances();
    }
  }, [autoLoad, isInitialized, loadWalletBalances]);

  // Subscribe to updates only after initialized
  useEffect(() => {
    if (isInitialized) {
      subscribeToUpdates();
    }

    return () => {
      subscriptionsRef.current.forEach(sub => sub.unsubscribe());
      subscriptionsRef.current = [];
    };
  }, [isInitialized, subscribeToUpdates]);

  return {
    wallets: state.wallets,
    totalBalance: state.totalBalance,
    isLoading: state.isLoading,
    error: state.error,
    lastUpdate: state.lastUpdate,
    isInitialized,
    refreshBalances,
    reload: loadWalletBalances
  };
}
