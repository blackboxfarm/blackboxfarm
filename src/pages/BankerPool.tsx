import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  RefreshCw, DollarSign, TrendingUp, TrendingDown, 
  Target, Shield, Activity, Zap, RotateCcw, Play, 
  Pause, X, AlertTriangle, CheckCircle, Clock, Wallet,
  Search, Radar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PoolData {
  id: string;
  starting_capital: number;
  current_capital: number;
  total_pnl: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  largest_win: number;
  largest_loss: number;
  max_drawdown_pct: number;
  peak_capital: number;
  max_position_pct: number;
  max_open_positions: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  trailing_stop_pct: number;
  min_score_to_enter: number;
  daily_loss_limit_pct: number;
  is_active: boolean;
  unrealized_pnl?: number;
  total_equity?: number;
}

interface Trade {
  id: string;
  token_mint: string;
  token_symbol: string;
  token_name: string;
  entry_price_usd: number;
  exit_price_usd: number | null;
  position_size_usd: number;
  position_size_pct: number;
  pnl_usd: number | null;
  pnl_pct: number | null;
  current_price_usd: number | null;
  current_multiplier: number | null;
  peak_multiplier: number | null;
  entry_score: number | null;
  entry_reason: string | null;
  exit_reason: string | null;
  status: string;
  entered_at: string;
  exited_at: string | null;
  stop_loss_price: number | null;
  take_profit_price: number | null;
  trailing_stop_price: number | null;
}

interface DailyStat {
  date: string;
  closing_capital: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  trades_opened: number;
  trades_closed: number;
  wins: number;
  losses: number;
  open_positions: number;
  capital_at_risk: number;
}

export default function BankerPool() {
  const [pool, setPool] = useState<PoolData | null>(null);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycling, setCycling] = useState(false);
  const [winRate, setWinRate] = useState('0');
  const [totalReturn, setTotalReturn] = useState('0');
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any>(null);
  const navigate = useNavigate();

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('banker-pool-engine', {
        body: {},
        headers: { 'Content-Type': 'application/json' },
      });
      // Parse action from query param hack - we need to use the URL approach
      // Actually, let's use a POST body approach
      const res = await fetch(
        `${(supabase as any).supabaseUrl}/functions/v1/banker-pool-engine?action=stats`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
            'apikey': (supabase as any).supabaseKey,
          },
          body: JSON.stringify({}),
        }
      );
      const result = await res.json();
      
      if (result.success) {
        setPool(result.pool);
        setOpenTrades(result.openTrades || []);
        setClosedTrades(result.recentClosed || []);
        setDailyStats(result.dailyStats || []);
        setWinRate(result.winRate || '0');
        setTotalReturn(result.totalReturn || '0');
      } else if (result.error === 'No pool') {
        // Auto-init
        await callEngine('init');
        await fetchStats();
        return;
      }
    } catch (e) {
      console.error('Failed to fetch banker pool stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const callEngine = async (action: string, body: any = {}) => {
    try {
      const res = await fetch(
        `${(supabase as any).supabaseUrl}/functions/v1/banker-pool-engine?action=${action}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
            'apikey': (supabase as any).supabaseKey,
          },
          body: JSON.stringify(body),
        }
      );
      return await res.json();
    } catch (e) {
      console.error(`Engine ${action} error:`, e);
      return { error: String(e) };
    }
  };

  const handleCycle = async () => {
    setCycling(true);
    try {
      const result = await callEngine('cycle');
      if (result.success) {
        if (result.scan) setScanResults(result.scan);
        const desc = (result.actions || []).join('\n') || 'No actions taken';
        toast.success('Cycle complete', { description: desc });
        await fetchStats();
      } else {
        toast.error('Cycle failed', { description: result.error });
      }
    } finally {
      setCycling(false);
    }
  };

  const handleScanOnly = async () => {
    setScanning(true);
    try {
      const result = await callEngine('scan-only');
      if (result.success) {
        setScanResults(result);
        toast.success(`Scanner found ${result.candidatesFound} candidates`);
      }
    } finally {
      setScanning(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset pool to $250? All trades will be closed.')) return;
    const result = await callEngine('reset');
    if (result.success) {
      toast.success('Pool reset to $250');
      await fetchStats();
    }
  };

  const handleClosePosition = async (tradeId: string) => {
    const result = await callEngine('close-position', { trade_id: tradeId, reason: 'manual' });
    if (result.success) {
      toast.success(`Position closed: $${result.pnlUsd?.toFixed(2)} (${result.pnlPct?.toFixed(1)}%)`);
      await fetchStats();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const equity = pool?.total_equity || pool?.current_capital || 0;
  const pnlColor = (pool?.total_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400';
  const unrealizedColor = (pool?.unrealized_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Wallet className="w-8 h-8 text-primary" />
              Banker Pool
            </h1>
            <p className="text-muted-foreground mt-1">$250 Autonomous Bankroll — Self-Scanning DexScreener Engine</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchStats} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleScanOnly} disabled={scanning}>
              <Radar className={`w-4 h-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning...' : 'Scan Only'}
            </Button>
            <Button onClick={handleCycle} disabled={cycling} className="bg-primary">
              <Zap className={`w-4 h-4 mr-2 ${cycling ? 'animate-pulse' : ''}`} />
              {cycling ? 'Running...' : 'Run Cycle'}
            </Button>
            <Button variant="destructive" onClick={handleReset} size="sm">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard 
            label="Total Equity" 
            value={`$${equity.toFixed(2)}`} 
            icon={<DollarSign className="w-5 h-5" />}
            highlight
          />
          <StatCard 
            label="Cash Available" 
            value={`$${(pool?.current_capital || 0).toFixed(2)}`} 
            icon={<Wallet className="w-5 h-5" />}
          />
          <StatCard 
            label="Realized P&L" 
            value={`$${(pool?.total_pnl || 0).toFixed(2)}`}
            valueColor={pnlColor}
            icon={(pool?.total_pnl || 0) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          />
          <StatCard 
            label="Unrealized P&L" 
            value={`$${(pool?.unrealized_pnl || 0).toFixed(2)}`}
            valueColor={unrealizedColor}
            icon={<Activity className="w-5 h-5" />}
          />
          <StatCard 
            label="Win Rate" 
            value={`${winRate}%`}
            icon={<Target className="w-5 h-5" />}
          />
          <StatCard 
            label="Total Return" 
            value={`${totalReturn}%`}
            valueColor={parseFloat(totalReturn) >= 0 ? 'text-green-400' : 'text-red-400'}
            icon={<TrendingUp className="w-5 h-5" />}
          />
        </div>

        {/* Risk Parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Risk Parameters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-sm">
              <RiskParam label="Position Size" value={`${pool?.max_position_pct || 4}%`} />
              <RiskParam label="Max Positions" value={`${pool?.max_open_positions || 5}`} />
              <RiskParam label="Stop-Loss" value={`-${pool?.stop_loss_pct || 25}%`} />
              <RiskParam label="Take Profit" value={`+${pool?.take_profit_pct || 100}%`} />
              <RiskParam label="Trailing Stop" value={`${pool?.trailing_stop_pct || 15}%`} />
              <RiskParam label="Min Score" value={`${pool?.min_score_to_enter || 70}`} />
              <RiskParam label="Daily Loss Limit" value={`-${pool?.daily_loss_limit_pct || 10}%`} />
            </div>
          </CardContent>
        </Card>

        {/* Scanner Results */}
        {scanResults && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Radar className="w-5 h-5 text-primary" />
                Autonomous Scanner Results
              </CardTitle>
              <CardDescription>
                Self-discovered from DexScreener — no watchlist dependency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm mb-3 text-muted-foreground">
                Found <span className="text-primary font-bold">{scanResults.candidatesFound ?? scanResults.found ?? 0}</span> candidates
                {scanResults.passedSafety !== undefined && (
                  <> · <span className="text-green-400 font-bold">{scanResults.passedSafety}</span> passed safety</>
                )}
              </div>
              {(scanResults.candidates || scanResults.topCandidates || []).length > 0 && (
                <ScrollArea className="max-h-[250px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>MCap</TableHead>
                        <TableHead>Liquidity</TableHead>
                        <TableHead>5m Δ</TableHead>
                        <TableHead>1h Δ</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Signals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(scanResults.candidates || scanResults.topCandidates || []).map((c: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{c.symbol}</TableCell>
                          <TableCell>
                            <Badge variant={c.score >= 70 || c.bankerScore >= 70 ? 'default' : 'outline'}>
                              {c.score || c.bankerScore}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">${((c.mcap || 0) / 1000).toFixed(0)}k</TableCell>
                          <TableCell className="font-mono text-xs">{c.liquidity ? `$${(c.liquidity / 1000).toFixed(0)}k` : '-'}</TableCell>
                          <TableCell className={`font-mono text-xs ${(c.priceChange5m || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(c.priceChange5m || 0) >= 0 ? '+' : ''}{(c.priceChange5m || 0).toFixed(1)}%
                          </TableCell>
                          <TableCell className={`font-mono text-xs ${(c.priceChange1h || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(c.priceChange1h || 0) >= 0 ? '+' : ''}{(c.priceChange1h || 0).toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{c.source || '-'}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {(c.reasons || []).join(', ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="positions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="positions">
              Open Positions ({openTrades.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              Trade History ({closedTrades.length})
            </TabsTrigger>
            <TabsTrigger value="daily">
              Daily Report ({dailyStats.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="positions">
            <Card>
              <CardContent className="pt-6">
                {openTrades.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No open positions. Run a cycle to enter trades.</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Token</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Entry</TableHead>
                          <TableHead>Current</TableHead>
                          <TableHead>P&L</TableHead>
                          <TableHead>Peak</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Age</TableHead>
                          <TableHead>Stops</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {openTrades.map(trade => {
                          const mult = trade.current_multiplier || 1;
                          const pnlPct = (mult - 1) * 100;
                          const pnlUsd = trade.position_size_usd * (mult - 1);
                          const ageH = (Date.now() - new Date(trade.entered_at).getTime()) / 3600000;
                          return (
                            <TableRow key={trade.id}>
                              <TableCell>
                                <div className="font-medium">{trade.token_symbol || 'Unknown'}</div>
                                <div className="text-xs text-muted-foreground font-mono">{trade.token_mint?.slice(0, 8)}…</div>
                              </TableCell>
                              <TableCell>${trade.position_size_usd.toFixed(2)}</TableCell>
                              <TableCell className="font-mono text-xs">${trade.entry_price_usd.toFixed(8)}</TableCell>
                              <TableCell className="font-mono text-xs">${(trade.current_price_usd || 0).toFixed(8)}</TableCell>
                              <TableCell>
                                <span className={pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                  <br />${pnlUsd.toFixed(2)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-yellow-400">{((trade.peak_multiplier || 1) - 1) * 100 > 0 ? `+${(((trade.peak_multiplier || 1) - 1) * 100).toFixed(1)}%` : '-'}</span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{trade.entry_score || '-'}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">{ageH.toFixed(1)}h</TableCell>
                              <TableCell className="text-xs">
                                <div>SL: ${(trade.stop_loss_price || 0).toFixed(8)}</div>
                                <div>TS: ${(trade.trailing_stop_price || 0).toFixed(8)}</div>
                              </TableCell>
                              <TableCell>
                                <Button size="sm" variant="destructive" onClick={() => handleClosePosition(trade.id)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardContent className="pt-6">
                {closedTrades.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No closed trades yet.</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Token</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Entry</TableHead>
                          <TableHead>Exit</TableHead>
                          <TableHead>P&L</TableHead>
                          <TableHead>Peak</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {closedTrades.map(trade => {
                          const isWin = trade.status === 'closed_win';
                          const durationH = trade.exited_at && trade.entered_at 
                            ? (new Date(trade.exited_at).getTime() - new Date(trade.entered_at).getTime()) / 3600000 
                            : 0;
                          return (
                            <TableRow key={trade.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {isWin ? <CheckCircle className="w-4 h-4 text-green-400" /> : <X className="w-4 h-4 text-red-400" />}
                                  <span className="font-medium">{trade.token_symbol || 'Unknown'}</span>
                                </div>
                              </TableCell>
                              <TableCell>${trade.position_size_usd.toFixed(2)}</TableCell>
                              <TableCell className="font-mono text-xs">${trade.entry_price_usd.toFixed(8)}</TableCell>
                              <TableCell className="font-mono text-xs">${(trade.exit_price_usd || 0).toFixed(8)}</TableCell>
                              <TableCell>
                                <span className={isWin ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                  {(trade.pnl_pct || 0) >= 0 ? '+' : ''}{(trade.pnl_pct || 0).toFixed(1)}%
                                  <br />${(trade.pnl_usd || 0).toFixed(2)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-yellow-400">{((trade.peak_multiplier || 1) - 1) * 100 > 0 ? `${(((trade.peak_multiplier || 1) - 1) * 100).toFixed(1)}%` : '-'}</span>
                              </TableCell>
                              <TableCell>
                                <ExitReasonBadge reason={trade.exit_reason} />
                              </TableCell>
                              <TableCell className="text-xs">{durationH.toFixed(1)}h</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="daily">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Daily Equity Curve</CardTitle>
                <CardDescription>30-day performance history</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyStats.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No daily stats yet. Run cycles to generate data.</p>
                  </div>
                ) : (
                  <>
                    {/* Simple text-based equity curve */}
                    <div className="mb-6 p-4 rounded-lg bg-muted/50">
                      <div className="flex items-end gap-1 h-32">
                        {[...dailyStats].reverse().map((stat, i) => {
                          const maxCap = Math.max(...dailyStats.map(s => s.closing_capital), 250);
                          const minCap = Math.min(...dailyStats.map(s => s.closing_capital), 200);
                          const range = maxCap - minCap || 1;
                          const heightPct = ((stat.closing_capital - minCap) / range) * 100;
                          const isProfit = stat.daily_pnl >= 0;
                          return (
                            <div key={stat.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${stat.date}: $${stat.closing_capital.toFixed(2)} (${stat.daily_pnl >= 0 ? '+' : ''}${stat.daily_pnl.toFixed(2)})`}>
                              <div 
                                className={`w-full rounded-t ${isProfit ? 'bg-green-500/70' : 'bg-red-500/70'}`}
                                style={{ height: `${Math.max(heightPct, 5)}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-2">
                        <span>{dailyStats[dailyStats.length - 1]?.date}</span>
                        <span>{dailyStats[0]?.date}</span>
                      </div>
                    </div>

                    <ScrollArea className="max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Capital</TableHead>
                            <TableHead>Daily P&L</TableHead>
                            <TableHead>Trades</TableHead>
                            <TableHead>W/L</TableHead>
                            <TableHead>Open</TableHead>
                            <TableHead>At Risk</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dailyStats.map(stat => (
                            <TableRow key={stat.date}>
                              <TableCell className="font-medium">{stat.date}</TableCell>
                              <TableCell>${stat.closing_capital.toFixed(2)}</TableCell>
                              <TableCell>
                                <span className={stat.daily_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {stat.daily_pnl >= 0 ? '+' : ''}${stat.daily_pnl.toFixed(2)}
                                </span>
                              </TableCell>
                              <TableCell>{stat.trades_opened}↑ {stat.trades_closed}↓</TableCell>
                              <TableCell>
                                <span className="text-green-400">{stat.wins}W</span> / <span className="text-red-400">{stat.losses}L</span>
                              </TableCell>
                              <TableCell>{stat.open_positions}</TableCell>
                              <TableCell>${stat.capital_at_risk.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Pool Stats Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Pool Lifetime Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Total Trades</div>
                <div className="text-xl font-bold">{pool?.total_trades || 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Wins / Losses</div>
                <div className="text-xl font-bold">
                  <span className="text-green-400">{pool?.winning_trades || 0}</span>
                  {' / '}
                  <span className="text-red-400">{pool?.losing_trades || 0}</span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Largest Win</div>
                <div className="text-xl font-bold text-green-400">${(pool?.largest_win || 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Largest Loss</div>
                <div className="text-xl font-bold text-red-400">${(pool?.largest_loss || 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Max Drawdown</div>
                <div className="text-xl font-bold text-yellow-400">{(pool?.max_drawdown_pct || 0).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-muted-foreground">Peak Capital</div>
                <div className="text-xl font-bold">${(pool?.peak_capital || 250).toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value, icon, valueColor, highlight }: { 
  label: string; value: string; icon: React.ReactNode; valueColor?: string; highlight?: boolean 
}) {
  return (
    <Card className={highlight ? 'border-primary/50 bg-primary/5' : ''}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-xl font-bold ${valueColor || ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function RiskParam({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-2 rounded bg-muted/50">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}

function ExitReasonBadge({ reason }: { reason: string | null }) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    stop_loss: { label: '🔴 Stop Loss', variant: 'destructive' },
    trailing_stop: { label: '🟡 Trail Stop', variant: 'secondary' },
    take_profit: { label: '🟢 Take Profit', variant: 'default' },
    time_decay: { label: '⏰ Time Decay', variant: 'outline' },
    time_limit: { label: '⏰ Time Limit', variant: 'outline' },
    manual: { label: '✋ Manual', variant: 'outline' },
    daily_loss_limit: { label: '🛑 Daily Limit', variant: 'destructive' },
    pool_reset: { label: '🔄 Reset', variant: 'outline' },
  };
  const c = config[reason || ''] || { label: reason || 'Unknown', variant: 'outline' as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
