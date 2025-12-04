import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  Gamepad2, TrendingUp, TrendingDown, RefreshCw, 
  DollarSign, Target, Award, AlertTriangle 
} from 'lucide-react';

interface FantasyTrade {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  entry_price_sol: number;
  entry_amount_sol: number;
  entry_timestamp: string;
  current_price_sol: number | null;
  unrealized_pnl_sol: number;
  unrealized_pnl_percent: number;
  status: string;
}

interface FantasyConfig {
  fantasy_mode: boolean;
  fantasy_buy_amount: number;
}

interface FantasyTradesPanelProps {
  userId: string;
}

export function FantasyTradesPanel({ userId }: FantasyTradesPanelProps) {
  const [trades, setTrades] = useState<FantasyTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [config, setConfig] = useState<FantasyConfig>({
    fantasy_mode: true,
    fantasy_buy_amount: 1
  });

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load fantasy trades
      const { data: tradesData } = await supabase
        .from('fantasy_trades')
        .select('*')
        .eq('user_id', userId)
        .order('entry_timestamp', { ascending: false });

      setTrades(tradesData || []);

      // Load config
      const { data: configData } = await supabase
        .from('whale_frenzy_config')
        .select('fantasy_mode, fantasy_buy_amount')
        .eq('user_id', userId)
        .single();

      if (configData) {
        setConfig({
          fantasy_mode: configData.fantasy_mode ?? true,
          fantasy_buy_amount: configData.fantasy_buy_amount ?? 1
        });
      }
    } catch (error) {
      console.error('Error loading fantasy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePrices = async () => {
    setUpdating(true);
    try {
      const { error } = await supabase.functions.invoke('update-fantasy-prices', {
        body: { user_id: userId }
      });

      if (error) throw error;
      toast.success('Prices updated');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update prices');
    } finally {
      setUpdating(false);
    }
  };

  const saveConfig = async () => {
    try {
      const { error } = await supabase
        .from('whale_frenzy_config')
        .update({
          fantasy_mode: config.fantasy_mode,
          fantasy_buy_amount: config.fantasy_buy_amount
        })
        .eq('user_id', userId);

      if (error) throw error;
      toast.success('Fantasy settings saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    }
  };

  const closeTrade = async (tradeId: string, currentPrice: number) => {
    try {
      const { error } = await supabase
        .from('fantasy_trades')
        .update({
          status: 'closed',
          exit_price_sol: currentPrice,
          exit_timestamp: new Date().toISOString()
        })
        .eq('id', tradeId);

      if (error) throw error;
      toast.success('Trade closed');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to close trade');
    }
  };

  // Calculate summary stats
  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');
  
  const totalUnrealizedPnl = openTrades.reduce((sum, t) => sum + (t.unrealized_pnl_sol || 0), 0);
  const totalInvested = openTrades.reduce((sum, t) => sum + t.entry_amount_sol, 0);
  const avgPnlPercent = openTrades.length > 0 
    ? openTrades.reduce((sum, t) => sum + (t.unrealized_pnl_percent || 0), 0) / openTrades.length 
    : 0;
  
  const winningTrades = trades.filter(t => (t.unrealized_pnl_sol || 0) > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Fantasy Mode Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-purple-500" />
            Fantasy Mode Settings
          </CardTitle>
          <CardDescription>
            Paper trade frenzies without risking real funds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Fantasy Mode</Label>
              <p className="text-xs text-muted-foreground">
                Track virtual trades instead of real auto-buys
              </p>
            </div>
            <Switch
              checked={config.fantasy_mode}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, fantasy_mode: checked }))}
            />
          </div>
          
          <div className="flex items-center gap-4">
            <div className="space-y-1 flex-1">
              <Label>Fantasy Buy Amount (SOL)</Label>
              <Input
                type="number"
                min={0.1}
                max={100}
                step={0.1}
                value={config.fantasy_buy_amount}
                onChange={(e) => setConfig(prev => ({ 
                  ...prev, 
                  fantasy_buy_amount: parseFloat(e.target.value) || 1 
                }))}
              />
            </div>
            <Button onClick={saveConfig} className="mt-6">
              Save
            </Button>
          </div>
          
          {config.fantasy_mode && (
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-purple-500">
                <Gamepad2 className="h-4 w-4" />
                <span className="font-medium">Fantasy Mode Active</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                All frenzy detections will create virtual trades at {config.fantasy_buy_amount} SOL each.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Total P&L</span>
            </div>
            <p className={`text-2xl font-bold ${totalUnrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}{totalUnrealizedPnl.toFixed(3)} SOL
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Target className="h-4 w-4" />
              <span className="text-xs">Invested</span>
            </div>
            <p className="text-2xl font-bold">
              {totalInvested.toFixed(2)} SOL
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Avg Return</span>
            </div>
            <p className={`text-2xl font-bold ${avgPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {avgPnlPercent >= 0 ? '+' : ''}{avgPnlPercent.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Award className="h-4 w-4" />
              <span className="text-xs">Win Rate</span>
            </div>
            <p className="text-2xl font-bold">
              {winRate.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trades Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Fantasy Trades</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={updatePrices}
            disabled={updating}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${updating ? 'animate-spin' : ''}`} />
            Update Prices
          </Button>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Gamepad2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No fantasy trades yet</p>
              <p className="text-sm">Enable fantasy mode and wait for frenzies!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => {
                  const pnlColor = (trade.unrealized_pnl_sol || 0) >= 0 ? 'text-green-500' : 'text-red-500';
                  return (
                    <TableRow key={trade.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">
                            {trade.token_symbol || trade.token_mint.slice(0, 8)}...
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(trade.entry_timestamp), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {trade.entry_price_sol?.toFixed(8)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {trade.current_price_sol?.toFixed(8) || '-'}
                      </TableCell>
                      <TableCell>
                        {trade.entry_amount_sol} SOL
                      </TableCell>
                      <TableCell>
                        <div className={pnlColor}>
                          <div className="flex items-center gap-1">
                            {(trade.unrealized_pnl_sol || 0) >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            <span className="font-medium">
                              {(trade.unrealized_pnl_sol || 0) >= 0 ? '+' : ''}
                              {(trade.unrealized_pnl_sol || 0).toFixed(3)} SOL
                            </span>
                          </div>
                          <span className="text-xs">
                            ({(trade.unrealized_pnl_percent || 0) >= 0 ? '+' : ''}
                            {(trade.unrealized_pnl_percent || 0).toFixed(1)}%)
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={trade.status === 'open' ? 'default' : 'secondary'}>
                          {trade.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {trade.status === 'open' && trade.current_price_sol && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => closeTrade(trade.id, trade.current_price_sol!)}
                          >
                            Close
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
