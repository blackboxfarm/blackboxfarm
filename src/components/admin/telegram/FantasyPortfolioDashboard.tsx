import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  RefreshCw, 
  Loader2,
  Trophy,
  Target,
  Wallet,
  BarChart3,
  Clock,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface FantasyPosition {
  id: string;
  channel_config_id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  entry_price_usd: number;
  entry_amount_usd: number;
  token_amount: number | null;
  current_price_usd: number | null;
  unrealized_pnl_usd: number | null;
  unrealized_pnl_percent: number | null;
  realized_pnl_usd: number | null;
  realized_pnl_percent: number | null;
  status: string;
  caller_username: string | null;
  caller_display_name: string | null;
  channel_name: string | null;
  created_at: string;
  sold_at: string | null;
}

interface PortfolioStats {
  totalPositions: number;
  openPositions: number;
  closedPositions: number;
  totalInvested: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  winRate: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
}

export function FantasyPortfolioDashboard() {
  const [positions, setPositions] = useState<FantasyPosition[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingPrices, setUpdatingPrices] = useState(false);

  useEffect(() => {
    loadPositions();
  }, []);

  const loadPositions = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_fantasy_positions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedPositions = (data || []) as FantasyPosition[];
      setPositions(typedPositions);
      calculateStats(typedPositions);
    } catch (err) {
      console.error('Error loading positions:', err);
      toast.error('Failed to load fantasy positions');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (positions: FantasyPosition[]) => {
    const open = positions.filter(p => p.status === 'open');
    const closed = positions.filter(p => p.status === 'closed' || p.status === 'sold');
    
    const totalInvested = positions.reduce((sum, p) => sum + (p.entry_amount_usd || 0), 0);
    const totalUnrealized = open.reduce((sum, p) => sum + (p.unrealized_pnl_usd || 0), 0);
    const totalRealized = closed.reduce((sum, p) => sum + (p.realized_pnl_usd || 0), 0);
    
    const winners = closed.filter(p => (p.realized_pnl_usd || 0) > 0);
    const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : 0;

    // Find best and worst trades
    let bestTrade: { symbol: string; pnl: number } | null = null;
    let worstTrade: { symbol: string; pnl: number } | null = null;
    
    closed.forEach(p => {
      const pnl = p.realized_pnl_usd || 0;
      if (!bestTrade || pnl > bestTrade.pnl) {
        bestTrade = { symbol: p.token_symbol || 'Unknown', pnl };
      }
      if (!worstTrade || pnl < worstTrade.pnl) {
        worstTrade = { symbol: p.token_symbol || 'Unknown', pnl };
      }
    });

    setStats({
      totalPositions: positions.length,
      openPositions: open.length,
      closedPositions: closed.length,
      totalInvested,
      totalUnrealizedPnl: totalUnrealized,
      totalRealizedPnl: totalRealized,
      winRate,
      bestTrade,
      worstTrade
    });
  };

  const updatePrices = async () => {
    setUpdatingPrices(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-fantasy-price-update', {
        body: { action: 'update' }
      });
      if (error) throw error;
      
      toast.success(`Prices updated for ${data?.updated || 0} positions`);
      await loadPositions();
    } catch (err) {
      console.error('Error updating prices:', err);
      toast.error('Failed to update prices');
    } finally {
      setUpdatingPrices(false);
    }
  };

  const sellPosition = async (positionId: string) => {
    try {
      const position = positions.find(p => p.id === positionId);
      if (!position || !position.current_price_usd) {
        toast.error('Cannot sell: no current price');
        return;
      }

      const realizedPnl = (position.current_price_usd - position.entry_price_usd) * (position.token_amount || 0);
      const realizedPnlPercent = ((position.current_price_usd - position.entry_price_usd) / position.entry_price_usd) * 100;

      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({
          status: 'sold',
          sold_at: new Date().toISOString(),
          sold_price_usd: position.current_price_usd,
          realized_pnl_usd: realizedPnl,
          realized_pnl_percent: realizedPnlPercent
        })
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(`Sold ${position.token_symbol} for ${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}`);
      await loadPositions();
    } catch (err) {
      console.error('Error selling position:', err);
      toast.error('Failed to sell position');
    }
  };

  const deletePosition = async (positionId: string) => {
    try {
      const position = positions.find(p => p.id === positionId);
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .delete()
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(`Deleted ${position?.token_symbol || 'position'}`);
      await loadPositions();
    } catch (err) {
      console.error('Error deleting position:', err);
      toast.error('Failed to delete position');
    }
  };

  const getDexScreenerUrl = (mint: string) => `https://dexscreener.com/solana/${mint}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status === 'sold' || p.status === 'closed');

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Invested</span>
            </div>
            <p className="text-2xl font-bold">${stats?.totalInvested.toFixed(2) || '0.00'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Open Positions</span>
            </div>
            <p className="text-2xl font-bold">{stats?.openPositions || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Unrealized P&L</span>
            </div>
            <p className={`text-2xl font-bold ${(stats?.totalUnrealizedPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {(stats?.totalUnrealizedPnl || 0) >= 0 ? '+' : ''}${stats?.totalUnrealizedPnl?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Realized P&L</span>
            </div>
            <p className={`text-2xl font-bold ${(stats?.totalRealizedPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {(stats?.totalRealizedPnl || 0) >= 0 ? '+' : ''}${stats?.totalRealizedPnl?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Win Rate</span>
            </div>
            <p className="text-2xl font-bold">{stats?.winRate.toFixed(1) || 0}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Closed Trades</span>
            </div>
            <p className="text-2xl font-bold">{stats?.closedPositions || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Best/Worst Trades */}
      {(stats?.bestTrade || stats?.worstTrade) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats?.bestTrade && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-500">
                  <TrendingUp className="h-5 w-5" />
                  <span className="font-medium">Best Trade</span>
                </div>
                <p className="text-lg font-bold mt-1">
                  {stats.bestTrade.symbol}: +${stats.bestTrade.pnl.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          )}
          {stats?.worstTrade && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-red-500">
                  <TrendingDown className="h-5 w-5" />
                  <span className="font-medium">Worst Trade</span>
                </div>
                <p className="text-lg font-bold mt-1">
                  {stats.worstTrade.symbol}: ${stats.worstTrade.pnl.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Open Positions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Open Positions ({openPositions.length})
          </CardTitle>
          <Button 
            onClick={updatePrices} 
            disabled={updatingPrices}
            size="sm"
            variant="outline"
          >
            {updatingPrices ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Update Prices
          </Button>
        </CardHeader>
        <CardContent>
          {openPositions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No open positions</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openPositions.map((pos) => {
                  const pnl = pos.unrealized_pnl_usd || 0;
                  const pnlPercent = pos.unrealized_pnl_percent || 0;
                  return (
                    <TableRow key={pos.id}>
                      <TableCell>
                        <div>
                          <a 
                            href={getDexScreenerUrl(pos.token_mint)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {pos.token_symbol || 'Unknown'}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {pos.token_mint?.slice(0, 8)}...
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {pos.caller_display_name || pos.caller_username || 'Unknown'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {pos.channel_name || 'Unknown'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span>${pos.entry_price_usd?.toFixed(8) || '0'}</span>
                          <p className="text-xs text-muted-foreground">${pos.entry_amount_usd}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        ${pos.current_price_usd?.toFixed(8) || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                          <span className="font-medium">
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </span>
                          <p className="text-xs">
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(pos.created_at), { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sellPosition(pos.id)}
                          >
                            Sell
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deletePosition(pos.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Closed Positions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Trade History ({closedPositions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {closedPositions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No closed trades yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedPositions.map((pos) => {
                  const pnl = pos.realized_pnl_usd || 0;
                  const pnlPercent = pos.realized_pnl_percent || 0;
                  return (
                    <TableRow key={pos.id}>
                      <TableCell>
                        <a 
                          href={getDexScreenerUrl(pos.token_mint)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {pos.token_symbol || 'Unknown'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        {pos.caller_display_name || pos.caller_username || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span>${pos.entry_price_usd?.toFixed(8)}</span>
                          <p className="text-xs text-muted-foreground">${pos.entry_amount_usd}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        ${pos.current_price_usd?.toFixed(8) || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pnl >= 0 ? 'default' : 'destructive'}>
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPercent.toFixed(1)}%)
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pos.sold_at && pos.created_at && (
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(pos.created_at), { addSuffix: false })}
                          </span>
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
