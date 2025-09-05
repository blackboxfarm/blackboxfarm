import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, TrendingUp, TrendingDown, Wallet, Play, Pause } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSolPrice } from '@/hooks/useSolPrice';
import { useRealtimeBalances } from '@/hooks/useRealtimeBalances';

interface TradeConfig {
  tokenMint: string;
  buyAmount: number;
  sellPercentage: number;
  maxTrades: number;
  enabled: boolean;
}

export function RealTimeTrading() {
  const { toast } = useToast();
  const { price: solPrice, isLoading: priceLoading } = useSolPrice();
  const { wallets, totalBalance, isLoading: balanceLoading, refreshBalances } = useRealtimeBalances();
  
  const [config, setConfig] = useState<TradeConfig>({
    tokenMint: '',
    buyAmount: 0.01,
    sellPercentage: 20,
    maxTrades: 10,
    enabled: false
  });

  const [activeSession, setActiveSession] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  
  const handleStartTrading = async () => {
    if (!config.tokenMint) {
      toast({
        title: "Missing Token",
        description: "Please enter a token mint address",
        variant: "destructive",
      });
      return;
    }

    if (totalBalance < config.buyAmount) {
      toast({
        title: "Insufficient Balance",
        description: `Need at least ${config.buyAmount} SOL to start trading`,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsExecuting(true);
      
      // Create trading session
      const { data: session, error } = await supabase
        .from('trading_sessions')
        .insert({
          token_mint: config.tokenMint,
          config: {
            buyAmount: config.buyAmount,
            sellPercentage: config.sellPercentage,
            maxTrades: config.maxTrades,
            solPrice: solPrice
          },
          is_active: true,
          session_start_time: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      setActiveSession(session);
      setConfig(prev => ({ ...prev, enabled: true }));
      
      toast({
        title: "Trading Started",
        description: `Started trading session for ${config.tokenMint.slice(0, 8)}...`,
      });

    } catch (error: any) {
      console.error('Failed to start trading:', error);
      toast({
        title: "Failed to Start Trading",
        description: error.message || 'Failed to start trading session',
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleStopTrading = async () => {
    if (!activeSession) return;

    try {
      setIsExecuting(true);
      
      const { error } = await supabase
        .from('trading_sessions')
        .update({ 
          is_active: false,
          session_start_time: null 
        })
        .eq('id', activeSession.id);

      if (error) throw error;

      setActiveSession(null);
      setConfig(prev => ({ ...prev, enabled: false }));
      
      toast({
        title: "Trading Stopped",
        description: "Trading session has been stopped",
      });

    } catch (error: any) {
      console.error('Failed to stop trading:', error);
      toast({
        title: "Failed to Stop Trading",
        description: error.message || 'Failed to stop trading session',
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const executeTrade = async (side: 'buy' | 'sell', amount?: number) => {
    if (!activeSession) return;

    try {
      setIsExecuting(true);
      
      const tradeData = {
        side,
        tokenMint: config.tokenMint,
        ...(side === 'buy' ? {
          usdcAmount: amount || config.buyAmount * solPrice,
          buyWithSol: true
        } : {
          sellAll: true
        })
      };

      const { data, error } = await supabase.functions.invoke('raydium-swap', {
        body: tradeData
      });

      if (error) throw error;

      toast({
        title: `${side === 'buy' ? 'Buy' : 'Sell'} Order Executed`,
        description: `Successfully executed ${side} order`,
      });

      // Refresh balances after trade
      refreshBalances();

    } catch (error: any) {
      console.error('Trade execution failed:', error);
      toast({
        title: "Trade Failed",
        description: error.message || 'Failed to execute trade',
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Real-Time Trading Engine
          </CardTitle>
          <CardDescription>
            Execute live trades with real-time monitoring
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Price & Balance Display */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">SOL Price</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-lg font-mono">
                  ${priceLoading ? '...' : solPrice.toFixed(2)}
                </Badge>
                {!priceLoading && (
                  <Badge variant="secondary">
                    Live
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Total Balance</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-lg font-mono">
                  {balanceLoading ? '...' : totalBalance.toFixed(4)} SOL
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshBalances}
                  disabled={balanceLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${balanceLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Trading Configuration */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Trading Configuration</Label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tokenMint">Token Mint Address</Label>
                <Input
                  id="tokenMint"
                  placeholder="Enter token mint address..."
                  value={config.tokenMint}
                  onChange={(e) => setConfig(prev => ({ ...prev, tokenMint: e.target.value }))}
                  disabled={config.enabled}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="buyAmount">Buy Amount (SOL)</Label>
                <Input
                  id="buyAmount"
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={config.buyAmount}
                  onChange={(e) => setConfig(prev => ({ ...prev, buyAmount: parseFloat(e.target.value) || 0.001 }))}
                  disabled={config.enabled}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="sellPercentage">Sell Percentage (%)</Label>
                <Input
                  id="sellPercentage"
                  type="number"
                  min="1"
                  max="100"
                  value={config.sellPercentage}
                  onChange={(e) => setConfig(prev => ({ ...prev, sellPercentage: parseInt(e.target.value) || 20 }))}
                  disabled={config.enabled}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="maxTrades">Max Trades</Label>
                <Input
                  id="maxTrades"
                  type="number"
                  min="1"
                  value={config.maxTrades}
                  onChange={(e) => setConfig(prev => ({ ...prev, maxTrades: parseInt(e.target.value) || 10 }))}
                  disabled={config.enabled}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Trading Controls */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Trading Controls</Label>
            
            <div className="flex gap-4">
              {!config.enabled ? (
                <Button 
                  onClick={handleStartTrading}
                  disabled={isExecuting || !config.tokenMint}
                  className="flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Start Trading
                </Button>
              ) : (
                <Button 
                  onClick={handleStopTrading}
                  disabled={isExecuting}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Pause className="h-4 w-4" />
                  Stop Trading
                </Button>
              )}
              
              {config.enabled && (
                <>
                  <Button 
                    onClick={() => executeTrade('buy')}
                    disabled={isExecuting}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Manual Buy
                  </Button>
                  
                  <Button 
                    onClick={() => executeTrade('sell')}
                    disabled={isExecuting}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    Manual Sell
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Active Session Status */}
          {activeSession && (
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="default">Active Session</Badge>
                <Badge variant="outline">{activeSession.id.slice(0, 8)}...</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Token: {config.tokenMint.slice(0, 8)}...{config.tokenMint.slice(-8)}
              </div>
              <div className="text-sm text-muted-foreground">
                Started: {new Date(activeSession.session_start_time).toLocaleTimeString()}
              </div>
            </div>
          )}

          {/* Wallet Overview */}
          {wallets.length > 0 && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">Active Wallets</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {wallets.map((wallet) => (
                  <div key={wallet.pubkey} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      <button
                        onClick={() => navigator.clipboard.writeText(wallet.pubkey)}
                        className="font-mono text-sm hover:text-muted-foreground transition-colors cursor-pointer"
                        title="Click to copy full address"
                      >
                        {wallet.pubkey}
                      </button>
                      <Badge variant="secondary" className="text-xs">
                        {wallet.wallet_type}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="font-mono">
                      {wallet.sol_balance.toFixed(4)} SOL
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}