import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Flame, RefreshCw, TrendingUp, DollarSign, Wallet, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

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
}

export function FlipItDashboard() {
  const [positions, setPositions] = useState<FlipPosition[]>([]);
  const [wallets, setWallets] = useState<SuperAdminWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [buyAmount, setBuyAmount] = useState(10);
  const [targetMultiplier, setTargetMultiplier] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    loadWallets();
    loadPositions();
  }, []);

  const loadWallets = async () => {
    const { data, error } = await supabase
      .from('super_admin_wallets')
      .select('id, label, pubkey')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load wallets');
      return;
    }

    setWallets(data || []);
    if (data && data.length > 0 && !selectedWallet) {
      setSelectedWallet(data[0].id);
    }
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

    setPositions((data || []) as FlipPosition[]);
    setIsLoading(false);
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

    setIsFlipping(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-execute', {
        body: {
          action: 'buy',
          tokenMint: tokenAddress.trim(),
          walletId: selectedWallet,
          buyAmountUsd: buyAmount,
          targetMultiplier: targetMultiplier
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
        body: { action: 'check' }
      });

      if (error) throw error;

      if (data?.prices) {
        setCurrentPrices(data.prices);
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
          positionId: positionId
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Wallet Selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Wallet className="h-4 w-4" />
                Source Wallet
              </Label>
              <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label} ({w.pubkey.slice(0, 4)}...{w.pubkey.slice(-4)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                <DollarSign className="h-4 w-4" />
                Buy Amount (USD)
              </Label>
              <Select value={buyAmount.toString()} onValueChange={v => setBuyAmount(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">$5</SelectItem>
                  <SelectItem value="10">$10</SelectItem>
                  <SelectItem value="25">$25</SelectItem>
                  <SelectItem value="50">$50</SelectItem>
                  <SelectItem value="100">$100</SelectItem>
                </SelectContent>
              </Select>
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
                  <TableHead>Entry</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Target</TableHead>
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

                  return (
                    <TableRow key={position.id}>
                      <TableCell>
                        <div className="font-mono text-xs">
                          {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
                        </div>
                      </TableCell>
                      <TableCell>
                        ${position.buy_price_usd?.toFixed(8) || '-'}
                      </TableCell>
                      <TableCell>
                        {currentPrice ? (
                          <span className={pnlPercent && pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                            ${currentPrice.toFixed(8)}
                            {pnlPercent !== null && ` (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        ${position.target_price_usd?.toFixed(8) || '-'} ({position.target_multiplier}x)
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
                      <div className="font-mono text-xs">
                        {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
                      </div>
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
