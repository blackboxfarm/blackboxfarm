import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Flame, RefreshCw, TrendingUp, DollarSign, Wallet, Clock, CheckCircle2, XCircle, Loader2, Plus, Copy, ArrowUpRight, Key, Settings, Zap, Activity, Radio, Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSolPrice } from '@/hooks/useSolPrice';
import { FlipItFeeCalculator } from './flipit/FlipItFeeCalculator';

interface FlipPosition {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  buy_amount_usd: number;
  buy_price_usd: number | null;
  quantity_tokens: number | null;
  buy_signature: string | null;
  buy_executed_at: string | null;
  target_multiplier: number;
  target_price_usd: number | null;
  sell_price_usd: number | null;
  sell_signature: string | null;
  sell_executed_at: string | null;
  profit_usd: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  wallet_id: string | null;
}

interface SuperAdminWallet {
  id: string;
  label: string;
  pubkey: string;
  wallet_type?: string;
}

export function FlipItDashboard() {
  const [positions, setPositions] = useState<FlipPosition[]>([]);
  const [wallets, setWallets] = useState<SuperAdminWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [buyAmount, setBuyAmount] = useState('0.1');
  const [buyAmountMode, setBuyAmountMode] = useState<'usd' | 'sol'>('sol');
  const [targetMultiplier, setTargetMultiplier] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [isGeneratingWallet, setIsGeneratingWallet] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  
  // SOL price for USD conversion
  const { price: solPrice, isLoading: solPriceLoading } = useSolPrice();
  
  // Settings
  const [slippageBps, setSlippageBps] = useState(500); // 5% default
  const [priorityFeeMode, setPriorityFeeMode] = useState<'low' | 'medium' | 'high' | 'turbo' | 'ultra'>('medium');
  const [autoMonitorEnabled, setAutoMonitorEnabled] = useState(true);
  const [lastAutoCheck, setLastAutoCheck] = useState<string | null>(null);
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [countdown, setCountdown] = useState(60);
  const countdownRef = useRef(60);

  useEffect(() => {
    loadWallets();
    loadPositions();
  }, []);

  // Real-time subscription to flip_positions changes
  useEffect(() => {
    const channel = supabase
      .channel('flip-positions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flip_positions' },
        (payload) => {
          console.log('Position changed:', payload);
          loadPositions(); // Reload when CRON updates positions
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-refresh polling with countdown
  useEffect(() => {
    if (!autoRefreshEnabled) {
      setCountdown(60);
      return;
    }

    const activeHoldings = positions.filter(p => p.status === 'holding');
    if (activeHoldings.length === 0) {
      setCountdown(60);
      return;
    }

    // Countdown timer
    const countdownInterval = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      
      if (countdownRef.current <= 0) {
        countdownRef.current = 60;
        setCountdown(60);
        // Trigger price refresh
        handleAutoRefresh();
      }
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
  }, [autoRefreshEnabled, positions]);

  const handleAutoRefresh = useCallback(async () => {
    const holdingPositions = positions.filter(p => p.status === 'holding');
    if (holdingPositions.length === 0 || isMonitoring) return;

    setIsMonitoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-price-monitor', {
        body: { 
          action: 'check',
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.prices) {
        setCurrentPrices(data.prices);
      }
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
      }
      if (data?.executed?.length > 0) {
        toast.success(`Auto-sold ${data.executed.length} position(s) at target!`);
        loadPositions();
      }
    } catch (err) {
      console.error('Auto-refresh failed:', err);
    } finally {
      setIsMonitoring(false);
    }
  }, [positions, slippageBps, priorityFeeMode, isMonitoring]);

  useEffect(() => {
    if (selectedWallet) {
      refreshWalletBalance();
    }
  }, [selectedWallet]);

  const loadWallets = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const { data: response, error } = await supabase.functions.invoke('super-admin-wallet-generator', {
      method: 'GET',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });

    if (error) {
      toast.error('Failed to load wallets');
      return;
    }

    const allWallets = (response as any)?.data as SuperAdminWallet[] | undefined;
    const flipitWallets = (allWallets || []).filter((w: any) => w.wallet_type === 'flipit' && w.is_active);

    setWallets(flipitWallets);
    if (flipitWallets.length > 0 && !selectedWallet) {
      setSelectedWallet(flipitWallets[0].id);
    }
  };

  const refreshWalletBalance = async () => {
    if (!selectedWallet) return;
    
    const wallet = wallets.find(w => w.id === selectedWallet);
    if (!wallet) return;

    setIsRefreshingBalance(true);
    try {
      // Use edge function to fetch balance via Helius (avoids browser CORS/rate limits)
      const { data, error } = await supabase.functions.invoke('get-wallet-balance', {
        body: { walletAddress: wallet.pubkey }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setWalletBalance(data.balance);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      toast.error('Failed to fetch wallet balance');
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  const handleGenerateWallet = async () => {
    setIsGeneratingWallet(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-wallet-generator');

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Wallet generated: ${data.wallet.pubkey.slice(0, 8)}...`);
        loadWallets();
        setSelectedWallet(data.wallet.id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate wallet');
    } finally {
      setIsGeneratingWallet(false);
    }
  };

  const handleWithdraw = async () => {
    if (!selectedWallet) {
      toast.error('Select a wallet first');
      return;
    }

    setIsWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-wallet-withdrawal', {
        body: { walletId: selectedWallet }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Withdrawn ${data.amountSol.toFixed(4)} SOL! TX: ${data.signature.slice(0, 8)}...`);
        refreshWalletBalance();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to withdraw');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const loadPositions = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('flip_positions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load positions');
      setIsLoading(false);
      return;
    }

    const loadedPositions = (data || []) as FlipPosition[];
    setPositions(loadedPositions);
    setIsLoading(false);
    
    // Fetch current prices for active positions
    const holdingPositions = loadedPositions.filter(p => p.status === 'holding');
    if (holdingPositions.length > 0) {
      fetchCurrentPrices(holdingPositions.map(p => p.token_mint));
    }
  };
  
  const fetchCurrentPrices = async (tokenMints: string[]) => {
    if (tokenMints.length === 0) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('flipit-price-monitor', {
        body: { 
          action: 'check',
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.prices) {
        setCurrentPrices(data.prices);
      }
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
      }
    } catch (err) {
      console.error('Failed to fetch prices:', err);
    }
  };

  const handleFlip = async () => {
    if (!tokenAddress.trim()) {
      toast.error('Enter a token address');
      return;
    }

    if (!selectedWallet) {
      toast.error('Select a source wallet');
      return;
    }

    const parsedAmount = parseFloat(buyAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid buy amount');
      return;
    }

    // Convert to USD if in SOL mode
    const buyAmountUsd = buyAmountMode === 'sol' && solPrice 
      ? parsedAmount * solPrice 
      : parsedAmount;

    setIsFlipping(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-execute', {
        body: {
          action: 'buy',
          tokenMint: tokenAddress.trim(),
          walletId: selectedWallet,
          buyAmountUsd: buyAmountUsd,
          targetMultiplier: targetMultiplier,
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Flip initiated! ${data?.signature ? 'TX: ' + data.signature.slice(0, 8) + '...' : ''}`);
        setTokenAddress('');
        loadPositions();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute flip');
    } finally {
      setIsFlipping(false);
    }
  };

  const handleRefreshPrices = async () => {
    const holdingPositions = positions.filter(p => p.status === 'holding');
    if (holdingPositions.length === 0) {
      toast.info('No active positions to monitor');
      return;
    }

    setIsMonitoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-price-monitor', {
        body: { 
          action: 'check',
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.prices) {
        setCurrentPrices(data.prices);
      }
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
      }
      if (data?.executed?.length > 0) {
        toast.success(`Sold ${data.executed.length} position(s) at target!`);
        loadPositions();
      } else {
        toast.success('Prices refreshed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to refresh prices');
    } finally {
      setIsMonitoring(false);
    }
  };

  const handleForceSell = async (positionId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('flipit-execute', {
        body: {
          action: 'sell',
          positionId: positionId,
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success('Sold!');
        loadPositions();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sell');
    }
  };

  const handleUpdateTarget = async (positionId: string, newMultiplier: number, buyPriceUsd: number) => {
    const newTargetPrice = buyPriceUsd * newMultiplier;
    
    const { error } = await supabase
      .from('flip_positions')
      .update({ 
        target_multiplier: newMultiplier, 
        target_price_usd: newTargetPrice 
      })
      .eq('id', positionId);

    if (error) {
      toast.error('Failed to update target');
      return;
    }

    toast.success(`Target updated to ${newMultiplier}x ($${newTargetPrice.toFixed(8)})`);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      pending_buy: { variant: 'secondary', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      holding: { variant: 'default', icon: <Clock className="w-3 h-3" /> },
      pending_sell: { variant: 'secondary', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      sold: { variant: 'outline', icon: <CheckCircle2 className="w-3 h-3 text-green-500" /> },
      failed: { variant: 'destructive', icon: <XCircle className="w-3 h-3" /> }
    };

    const config = statusConfig[status] || statusConfig.pending_buy;
    return (
      <Badge variant={config.variant} className="gap-1">
        {config.icon}
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const calculateProgress = (position: FlipPosition) => {
    if (!position.buy_price_usd || position.status !== 'holding') return 0;
    const currentPrice = currentPrices[position.token_mint] || position.buy_price_usd;
    const targetPrice = position.buy_price_usd * position.target_multiplier;
    const progress = ((currentPrice - position.buy_price_usd) / (targetPrice - position.buy_price_usd)) * 100;
    return Math.min(Math.max(progress, -50), 100);
  };

  const activePositions = positions.filter(p => ['pending_buy', 'holding', 'pending_sell'].includes(p.status));
  const completedPositions = positions.filter(p => ['sold', 'failed'].includes(p.status));

  const totalProfit = completedPositions
    .filter(p => p.profit_usd !== null)
    .reduce((sum, p) => sum + (p.profit_usd || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Flame className="h-6 w-6 text-orange-500" />
            FlipIt - Quick Token Flipper
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Source Wallet Section */}
          <div className="mb-6 p-4 rounded-lg border border-border bg-card/50">
            <Label className="flex items-center gap-1 mb-3 text-lg">
              <Key className="h-5 w-5" />
              Source Wallet
            </Label>
            
            {wallets.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">No FlipIt wallet configured yet</p>
                <Button 
                  onClick={handleGenerateWallet} 
                  disabled={isGeneratingWallet}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                >
                  {isGeneratingWallet ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Generate Source Wallet
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    onClick={handleGenerateWallet}
                    disabled={isGeneratingWallet}
                    title="Generate new wallet"
                  >
                    {isGeneratingWallet ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                
                {selectedWallet && wallets.find(w => w.id === selectedWallet) && (
                  <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">
                        {wallets.find(w => w.id === selectedWallet)?.pubkey}
                      </code>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(wallets.find(w => w.id === selectedWallet)?.pubkey || '', 'Address')}
                        title="Copy wallet address"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <a
                        className="inline-flex"
                        href={`https://solscan.io/account/${wallets.find(w => w.id === selectedWallet)?.pubkey}`}
                        target="_blank"
                        rel="noreferrer"
                        title="View on Solscan"
                      >
                        <Button size="icon" variant="ghost" className="h-6 w-6">
                          <ArrowUpRight className="h-3 w-3" />
                        </Button>
                      </a>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3 bg-muted/50 px-3 py-2 rounded-lg">
                        <Wallet className="h-4 w-4 text-primary" />
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">Balance</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-lg">
                              {walletBalance !== null ? `${walletBalance.toFixed(5)} SOL` : '...'}
                            </span>
                            {walletBalance !== null && !solPriceLoading && (
                              <span className="text-sm text-green-500 font-medium">
                                (${(walletBalance * solPrice).toFixed(2)})
                              </span>
                            )}
                          </div>
                        </div>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-7 w-7 ml-auto"
                          onClick={refreshWalletBalance}
                          disabled={isRefreshingBalance}
                          title="Refresh balance"
                        >
                          <RefreshCw className={`h-4 w-4 ${isRefreshingBalance ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                      
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={handleWithdraw}
                        disabled={isWithdrawing || !walletBalance || walletBalance < 0.001}
                      >
                        {isWithdrawing ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 mr-1" />
                        )}
                        Withdraw All
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Settings Panel */}
          <div className="mb-6 p-4 rounded-lg border border-border bg-card/50">
            <Label className="flex items-center gap-1 mb-3 text-lg">
              <Settings className="h-5 w-5" />
              Trading Settings
            </Label>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Slippage */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Activity className="h-4 w-4" />
                  Slippage Tolerance
                </Label>
                <Select value={slippageBps.toString()} onValueChange={v => setSlippageBps(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">1% (Conservative)</SelectItem>
                    <SelectItem value="300">3% (Standard)</SelectItem>
                    <SelectItem value="500">5% (Default)</SelectItem>
                    <SelectItem value="1000">10% (Aggressive)</SelectItem>
                    <SelectItem value="1500">15% (Very Aggressive)</SelectItem>
                    <SelectItem value="2000">20% (High Risk)</SelectItem>
                    <SelectItem value="3000">30% (Maximum)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Priority Fee */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Zap className="h-4 w-4" />
                  Priority Fee (Gas)
                </Label>
                <Select value={priorityFeeMode} onValueChange={(v: 'low' | 'medium' | 'high' | 'turbo' | 'ultra') => setPriorityFeeMode(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (~0.0001 SOL)</SelectItem>
                    <SelectItem value="medium">Medium (~0.0005 SOL)</SelectItem>
                    <SelectItem value="high">High (~0.001 SOL)</SelectItem>
                    <SelectItem value="turbo">Turbo (~0.0075 SOL)</SelectItem>
                    <SelectItem value="ultra">ULTRA (~0.009 SOL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Auto-Refresh Control */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Radio className="h-4 w-4" />
                  Auto-Refresh Prices
                </Label>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 h-10">
                  <Switch 
                    checked={autoRefreshEnabled} 
                    onCheckedChange={setAutoRefreshEnabled}
                  />
                  {autoRefreshEnabled && positions.filter(p => p.status === 'holding').length > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm font-medium text-green-500">
                        Refreshing in {countdown}s
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {autoRefreshEnabled ? 'Waiting for positions...' : 'Paused'}
                    </span>
                  )}
                  {lastAutoCheck && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      Last: {new Date(lastAutoCheck).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Token Input */}
            <div className="space-y-2">
              <Label>Token Address</Label>
              <Input
                placeholder="Paste token address..."
                value={tokenAddress}
                onChange={e => setTokenAddress(e.target.value)}
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                {buyAmountMode === 'usd' ? <DollarSign className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                Buy Amount
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  placeholder={buyAmountMode === 'usd' ? '0.00' : '0.001'}
                  className="flex-1"
                />
                <Select value={buyAmountMode} onValueChange={(v: 'usd' | 'sol') => setBuyAmountMode(v)}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sol">SOL</SelectItem>
                    <SelectItem value="usd">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {solPrice && buyAmount && (
                <p className="text-xs text-muted-foreground">
                  {buyAmountMode === 'usd' 
                    ? `≈ ${(parseFloat(buyAmount) / solPrice).toFixed(4)} SOL`
                    : `≈ $${(parseFloat(buyAmount) * solPrice).toFixed(2)} USD`
                  }
                </p>
              )}
            </div>

            {/* Target Multiplier */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Target
              </Label>
              <Select value={targetMultiplier.toString()} onValueChange={v => setTargetMultiplier(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1.5">1.5x (+50%)</SelectItem>
                  <SelectItem value="2">2x (+100%)</SelectItem>
                  <SelectItem value="3">3x (+200%)</SelectItem>
                  <SelectItem value="5">5x (+400%)</SelectItem>
                  <SelectItem value="10">10x (+900%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fee Calculator Widget */}
          {buyAmount && parseFloat(buyAmount) > 0 && solPrice && (
            <div className="mt-4">
              <FlipItFeeCalculator
                buyAmountSol={buyAmountMode === 'sol' ? parseFloat(buyAmount) : parseFloat(buyAmount) / solPrice}
                solPrice={solPrice}
                priorityFeeMode={priorityFeeMode}
                slippageBps={slippageBps}
                targetMultiplier={targetMultiplier}
              />
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <Button
              onClick={handleFlip}
              disabled={isFlipping || !tokenAddress.trim() || !selectedWallet}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
              {isFlipping ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Flame className="h-4 w-4 mr-2" />
              )}
              FLIP IT
            </Button>

            <Button variant="outline" onClick={handleRefreshPrices} disabled={isMonitoring}>
              {isMonitoring ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh Prices
            </Button>

            <Button variant="ghost" onClick={loadPositions} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Active Positions</div>
            <div className="text-2xl font-bold">{activePositions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Completed Flips</div>
            <div className="text-2xl font-bold">{completedPositions.filter(p => p.status === 'sold').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Total P&L</div>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Positions */}
      {activePositions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Flips ({activePositions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Invested</TableHead>
                  <TableHead>Current Value</TableHead>
                  <TableHead>Target Value</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePositions.map(position => {
                  const progress = calculateProgress(position);
                  const currentPrice = currentPrices[position.token_mint];
                  const pnlPercent = position.buy_price_usd && currentPrice
                    ? ((currentPrice - position.buy_price_usd) / position.buy_price_usd) * 100
                    : null;
                  
                  // Calculate current value based on quantity and current price
                  const currentValue = position.quantity_tokens && currentPrice
                    ? position.quantity_tokens * currentPrice
                    : null;
                  const pnlUsd = currentValue && position.buy_amount_usd
                    ? currentValue - position.buy_amount_usd
                    : null;
                  
                  // Target value
                  const targetValue = position.buy_amount_usd * position.target_multiplier;
                  const targetProfit = position.buy_amount_usd * (position.target_multiplier - 1);

                  return (
                    <TableRow key={position.id}>
                      <TableCell>
                        <button
                          onClick={() => copyToClipboard(position.token_mint, 'Token address')}
                          className="font-mono text-xs hover:text-primary cursor-pointer flex items-center gap-1"
                          title={position.token_mint}
                        >
                          {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
                          <Copy className="h-3 w-3 opacity-50" />
                        </button>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Entry: ${position.buy_price_usd?.toFixed(8) || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">${position.buy_amount_usd?.toFixed(2) || '-'}</div>
                        {position.quantity_tokens && (
                          <div className="text-xs text-muted-foreground">
                            {position.quantity_tokens.toLocaleString()} tokens
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {currentValue !== null ? (
                          <div>
                            <span className={pnlUsd && pnlUsd >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
                              ${currentValue.toFixed(2)}
                            </span>
                            {pnlUsd !== null && (
                              <div className={`text-xs ${pnlUsd >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)} ({pnlPercent?.toFixed(1)}%)
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div>
                            <span className="font-medium">${targetValue.toFixed(2)}</span>
                            <span className="text-muted-foreground ml-1">({position.target_multiplier}x)</span>
                            <div className="text-green-500 text-xs">
                              +${targetProfit.toFixed(2)} profit
                            </div>
                          </div>
                          {position.status === 'holding' && position.buy_price_usd && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2" align="start">
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground mb-2">Change target:</p>
                                  {[1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(mult => (
                                    <Button
                                      key={mult}
                                      variant={position.target_multiplier === mult ? "default" : "ghost"}
                                      size="sm"
                                      className="w-full justify-between"
                                      onClick={() => handleUpdateTarget(position.id, mult, position.buy_price_usd!)}
                                    >
                                      <span>{mult}x</span>
                                      <span className="text-green-500 text-xs">+${(position.buy_amount_usd * (mult - 1)).toFixed(2)}</span>
                                    </Button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-32">
                        <Progress 
                          value={Math.max(0, progress)} 
                          className={`h-2 ${progress >= 100 ? 'bg-green-500' : progress < 0 ? 'bg-red-500' : ''}`}
                        />
                        <span className="text-xs text-muted-foreground">{progress.toFixed(0)}%</span>
                      </TableCell>
                      <TableCell>{getStatusBadge(position.status)}</TableCell>
                      <TableCell>
                        {position.status === 'holding' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleForceSell(position.id)}
                          >
                            Sell Now
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Completed Positions */}
      {completedPositions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Completed Flips (Last 50)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedPositions.slice(0, 50).map(position => (
                  <TableRow key={position.id}>
                    <TableCell>
                      <button
                        onClick={() => copyToClipboard(position.token_mint, 'Token address')}
                        className="font-mono text-xs hover:text-primary cursor-pointer flex items-center gap-1"
                        title={position.token_mint}
                      >
                        {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
                        <Copy className="h-3 w-3 opacity-50" />
                      </button>
                    </TableCell>
                    <TableCell>${position.buy_price_usd?.toFixed(8) || '-'}</TableCell>
                    <TableCell>${position.sell_price_usd?.toFixed(8) || '-'}</TableCell>
                    <TableCell>
                      {position.profit_usd !== null ? (
                        <span className={position.profit_usd >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {position.profit_usd >= 0 ? '+' : ''}${position.profit_usd.toFixed(2)}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(position.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {position.sell_executed_at 
                        ? new Date(position.sell_executed_at).toLocaleString()
                        : new Date(position.created_at).toLocaleString()
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
