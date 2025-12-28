import React from 'react';
import { useRealtimeBalances } from '@/hooks/useRealtimeBalances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wallet, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function WalletBalanceMonitor() {
  const { 
    wallets, 
    totalBalance, 
    isLoading, 
    error, 
    lastUpdate, 
    isInitialized,
    refreshBalances,
    reload 
  } = useRealtimeBalances(false); // Don't auto-load

  // Load data on first click
  const handleLoadData = async () => {
    console.log('📊 Loading wallet balances on demand...');
    await reload();
  };

  // Manual refresh for existing data
  const handleManualRefresh = async () => {
    console.log('🔄 Manual refresh triggered...');
    await refreshBalances();
  };

  // Show load button if not initialized
  if (!isInitialized) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Click to load wallet balance data
            </p>
            <Button onClick={handleLoadData} disabled={isLoading}>
              <Download className={`h-4 w-4 mr-2 ${isLoading ? 'animate-pulse' : ''}`} />
              {isLoading ? 'Loading...' : 'Load Balances'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Wallet Balances
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-destructive text-sm mb-4 p-3 bg-destructive/10 rounded-md">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          <div className="p-4 bg-primary/5 rounded-lg">
            <div className="text-sm text-muted-foreground">Total Balance</div>
            <div className="text-2xl font-bold">{totalBalance.toFixed(4)} SOL</div>
            {lastUpdate && (
              <div className="text-xs text-muted-foreground mt-1">
                Last updated {formatDistanceToNow(new Date(lastUpdate), { addSuffix: true })}
              </div>
            )}
          </div>

          {wallets.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Individual Wallets ({wallets.length})</div>
              {wallets.map((wallet) => (
                <div key={wallet.pubkey} className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                  <div className="flex-1">
                    {wallet.label && (
                      <div className="font-medium text-sm mb-1">{wallet.label}</div>
                    )}
                    <button
                      onClick={() => navigator.clipboard.writeText(wallet.pubkey)}
                      className="font-mono text-xs hover:text-muted-foreground transition-colors cursor-pointer text-left break-all"
                      title="Click to copy full address"
                    >
                      {wallet.pubkey}
                    </button>
                    <div className="text-xs text-muted-foreground capitalize">
                      {wallet.sub_type ? `${wallet.sub_type} (${wallet.wallet_type})` : `${wallet.wallet_type} wallet`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{wallet.sol_balance.toFixed(4)} SOL</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(wallet.last_balance_check), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No wallets found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
