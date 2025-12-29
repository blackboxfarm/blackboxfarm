import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  ExternalLink,
  Activity,
  Zap,
  AlertTriangle,
  Eye,
  EyeOff
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
  is_active: boolean | null;
  target_sell_multiplier: number | null;
  stop_loss_pct: number | null;
  stop_loss_enabled: boolean | null;
  auto_sell_triggered: boolean | null;
  peak_price_usd: number | null;
  peak_price_at: string | null;
  peak_multiplier: number | null;
}

interface PortfolioStats {
  totalPositions: number;
  openPositions: number;
  closedPositions: number;
  activePositions: number;
  totalInvested: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  winRate: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  nearTargetCount: number;
  missedOpportunities: number;
}

const SELL_MULTIPLIERS = [
  { value: 1.25, label: '1.25x (+25%)' },
  { value: 1.35, label: '1.35x (+35%)' },
  { value: 1.5, label: '1.5x (+50%)' },
  { value: 1.75, label: '1.75x (+75%)' },
  { value: 2, label: '2x (+100%)' },
  { value: 2.5, label: '2.5x (+150%)' },
  { value: 3, label: '3x (+200%)' },
  { value: 5, label: '5x (+400%)' },
  { value: 10, label: '10x (+900%)' },
  { value: 20, label: '20x' },
  { value: 40, label: '40x' },
];

export function FantasyPortfolioDashboard() {
  const [positions, setPositions] = useState<FantasyPosition[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [backfillingPeaks, setBackfillingPeaks] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadPositions();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('fantasy-positions-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'telegram_fantasy_positions'
      }, () => {
        loadPositions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      monitorPrices();
      intervalRef.current = setInterval(() => {
        monitorPrices();
      }, 5000); // 5 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

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
    const active = open.filter(p => p.is_active !== false); // null treated as active
    
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

    // Count positions near target (>80% progress)
    const nearTargetCount = open.filter(p => {
      if (!p.current_price_usd || !p.entry_price_usd) return false;
      const multiplier = p.current_price_usd / p.entry_price_usd;
      const target = p.target_sell_multiplier || 2;
      return (multiplier / target) >= 0.8;
    }).length;

    // Count missed opportunities - positions where peak exceeded target
    const missedOpportunities = open.filter(p => {
      const peakMult = p.peak_multiplier || 0;
      const targetMult = p.target_sell_multiplier || 2;
      return peakMult >= targetMult;
    }).length;

    setStats({
      totalPositions: positions.length,
      openPositions: open.length,
      closedPositions: closed.length,
      activePositions: active.length,
      totalInvested,
      totalUnrealizedPnl: totalUnrealized,
      totalRealizedPnl: totalRealized,
      winRate,
      bestTrade,
      worstTrade,
      nearTargetCount,
      missedOpportunities
    });
  };

  const monitorPrices = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-fantasy-price-monitor', {});
      if (error) throw error;
      
      setLastUpdate(new Date());
      
      if (data?.autoSold > 0) {
        toast.success(`🎯 Auto-sold ${data.autoSold} position(s)!`, {
          description: data.autoSells?.map((s: any) => `${s.token}: ${s.reason === 'target_hit' ? `+${s.pnlPercent}%` : `${s.pnlPercent}%`}`).join(', ')
        });
      }
      
      await loadPositions();
    } catch (err) {
      console.error('Error monitoring prices:', err);
    }
  };

  const updatePrices = async () => {
    setUpdatingPrices(true);
    try {
      await monitorPrices();
      toast.success('Prices updated');
    } catch (err) {
      console.error('Error updating prices:', err);
      toast.error('Failed to update prices');
    } finally {
      setUpdatingPrices(false);
    }
  };

  const toggleActive = async (positionId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({ is_active: isActive })
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(isActive ? 'Position activated' : 'Position deactivated');
      await loadPositions();
    } catch (err) {
      console.error('Error toggling active:', err);
      toast.error('Failed to update position');
    }
  };

  const updateMultiplier = async (positionId: string, multiplier: number) => {
    try {
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({ target_sell_multiplier: multiplier })
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(`Target updated to ${multiplier}x`);
      await loadPositions();
    } catch (err) {
      console.error('Error updating multiplier:', err);
      toast.error('Failed to update target');
    }
  };

  const setAllActive = async (active: boolean) => {
    try {
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({ is_active: active })
        .eq('status', 'open');

      if (error) throw error;
      
      toast.success(active ? 'All positions activated' : 'All positions deactivated');
      await loadPositions();
    } catch (err) {
      console.error('Error bulk updating:', err);
      toast.error('Failed to update positions');
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
          realized_pnl_percent: realizedPnlPercent,
          is_active: false
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

  const getProgressToTarget = (pos: FantasyPosition) => {
    if (!pos.current_price_usd || !pos.entry_price_usd) return 0;
    const multiplier = pos.current_price_usd / pos.entry_price_usd;
    const target = pos.target_sell_multiplier || 2;
    return Math.min((multiplier / target) * 100, 100);
  };

  const getCurrentMultiplier = (pos: FantasyPosition) => {
    if (!pos.current_price_usd || !pos.entry_price_usd) return 0;
    return pos.current_price_usd / pos.entry_price_usd;
  };

  const backfillPeaks = async () => {
    try {
      setBackfillingPeaks(true);
      toast.info('Backfilling historical peaks...');
      
      const { data, error } = await supabase.functions.invoke('telegram-fantasy-peak-backfill');
      
      if (error) throw error;
      
      if (data?.missedOpportunities > 0) {
        toast.success(`Found ${data.missedOpportunities} missed opportunities! 🏆`);
      } else {
        toast.success(`Processed ${data?.updated || 0} positions`);
      }
      
      await loadPositions();
    } catch (err) {
      console.error('Error backfilling peaks:', err);
      toast.error('Failed to backfill peaks');
    } finally {
      setBackfillingPeaks(false);
    }
  };

  const formatPeakDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status === 'sold' || p.status === 'closed');
  
  // Filter open positions based on active/inactive filter (null treated as active)
  const filteredOpenPositions = openPositions.filter(p => {
    if (filter === 'active') return p.is_active !== false;
    if (filter === 'inactive') return p.is_active === false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
              <Activity className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Active Monitoring</span>
            </div>
            <p className="text-2xl font-bold text-green-500">{stats?.activePositions || 0}</p>
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

        <Card className={stats?.nearTargetCount ? 'border-yellow-500/50 bg-yellow-500/5' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Near Target</span>
            </div>
            <p className="text-2xl font-bold text-yellow-500">{stats?.nearTargetCount || 0}</p>
          </CardContent>
        </Card>

        <Card className={stats?.missedOpportunities ? 'border-amber-500/50 bg-amber-500/5' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Missed Sells</span>
            </div>
            <p className="text-2xl font-bold text-amber-500">{stats?.missedOpportunities || 0}</p>
            <p className="text-xs text-muted-foreground">Already hit target</p>
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
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Open Positions ({filteredOpenPositions.length})
            </CardTitle>
            
            <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'active' | 'inactive')}>
              <TabsList className="h-8">
                <TabsTrigger value="active" className="text-xs">
                  <Eye className="h-3 w-3 mr-1" />
                  Active
                </TabsTrigger>
                <TabsTrigger value="inactive" className="text-xs">
                  <EyeOff className="h-3 w-3 mr-1" />
                  Inactive
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-refresh toggle */}
            <div className="flex items-center gap-2">
              <Switch
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                id="auto-refresh"
              />
              <label htmlFor="auto-refresh" className="text-sm flex items-center gap-1">
                {autoRefresh ? (
                  <>
                    <Activity className="h-3 w-3 text-green-500 animate-pulse" />
                    <span className="text-green-500">Monitoring (5s)</span>
                  </>
                ) : (
                  <>
                    <Activity className="h-3 w-3" />
                    <span>Auto-Monitor</span>
                  </>
                )}
              </label>
            </div>

            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
              </span>
            )}
            
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

            <Button
              onClick={() => setAllActive(true)}
              size="sm"
              variant="outline"
              className="text-green-500"
            >
              Activate All
            </Button>

            <Button
              onClick={() => setAllActive(false)}
              size="sm"
              variant="outline"
              className="text-muted-foreground"
            >
              Deactivate All
            </Button>

            <Button
              onClick={backfillPeaks}
              disabled={backfillingPeaks}
              size="sm"
              variant="outline"
              className="text-amber-500"
            >
              {backfillingPeaks ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trophy className="h-4 w-4 mr-2" />
              )}
              Backfill Peaks
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOpenPositions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {filter === 'active' ? 'No active positions being monitored' : 
               filter === 'inactive' ? 'No inactive positions' : 
               'No open positions'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Active</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Peak 🏆</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="w-32">Progress</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOpenPositions.map((pos) => {
                  const pnl = pos.unrealized_pnl_usd || 0;
                  const pnlPercent = pos.unrealized_pnl_percent || 0;
                  const progress = getProgressToTarget(pos);
                  const currentMult = getCurrentMultiplier(pos);
                  
                    return (
                      <TableRow key={pos.id} className={pos.is_active === false ? 'opacity-60' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={pos.is_active !== false}
                            onCheckedChange={(checked) => toggleActive(pos.id, !!checked)}
                          />
                        </TableCell>
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
                          <p className="text-xs text-muted-foreground truncate max-w-[100px]">
                            {pos.token_mint?.slice(0, 6)}...
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {pos.caller_display_name || pos.caller_username || 'Unknown'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-xs">${pos.entry_price_usd?.toFixed(8) || '0'}</span>
                          <p className="text-xs text-muted-foreground">${pos.entry_amount_usd}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-xs">${pos.current_price_usd?.toFixed(8) || 'N/A'}</span>
                          <p className="text-xs text-muted-foreground">
                            {currentMult > 0 ? `${currentMult.toFixed(2)}x` : '-'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {pos.peak_multiplier ? (
                          <div className={pos.peak_multiplier >= (pos.target_sell_multiplier || 2) ? 'text-amber-500' : 'text-muted-foreground'}>
                            <div className="flex items-center gap-1">
                              {pos.peak_multiplier >= (pos.target_sell_multiplier || 2) && (
                                <Trophy className="h-3 w-3" />
                              )}
                              <span className="font-medium text-xs">{pos.peak_multiplier.toFixed(2)}x</span>
                            </div>
                            <p className="text-xs">
                              {formatPeakDate(pos.peak_price_at)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={String(pos.target_sell_multiplier || 2)}
                          onValueChange={(v) => updateMultiplier(pos.id, parseFloat(v))}
                        >
                          <SelectTrigger className="h-8 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SELL_MULTIPLIERS.map(m => (
                              <SelectItem key={m.value} value={String(m.value)}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="w-full">
                          <Progress 
                            value={progress} 
                            className={`h-2 ${progress >= 80 ? 'bg-yellow-200' : ''}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {progress.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                          <span className="font-medium text-sm">
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </span>
                          <p className="text-xs">
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(pos.created_at), { addSuffix: false })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sellPosition(pos.id)}
                            className="h-7 text-xs"
                          >
                            Sell
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive h-7"
                            onClick={() => deletePosition(pos.id)}
                          >
                            <Trash2 className="h-3 w-3" />
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
                  <TableHead>Type</TableHead>
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
                        <span className="text-sm">
                          {pos.caller_display_name || pos.caller_username || 'Unknown'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">${pos.entry_price_usd?.toFixed(8) || '0'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">${pos.realized_pnl_usd !== null ? (pos.entry_price_usd + (pos.realized_pnl_usd / (pos.token_amount || 1))).toFixed(8) : 'N/A'}</span>
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
                        {pos.sold_at && pos.created_at && (
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(pos.sold_at), { addSuffix: false })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {pos.auto_sell_triggered ? (
                          <Badge variant="secondary" className="text-xs">
                            <Zap className="h-3 w-3 mr-1" />
                            Auto
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Manual</Badge>
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
