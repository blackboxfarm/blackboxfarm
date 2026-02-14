import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Shield } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';

interface AnalysisPosition {
  id: string;
  token_symbol: string | null;
  status: string;
  entry_price_usd: number;
  current_price_usd: number | null;
  main_sold_price_usd: number | null;
  token_amount: number;
  target_multiplier: number;
  created_at: string;
  watchlist_id: string | null;
}

interface WatchlistMetrics {
  rugcheck_score: number | null;
  holder_count: number | null;
  volume_sol: number | null;
  market_cap_usd: number | null;
  socials_count: number | null;
  holder_count_peak: number | null;
}

interface AnalysisData {
  position: AnalysisPosition;
  watchlist: WatchlistMetrics | null;
}

interface MetricComparison {
  metric: string;
  winnersAvg: number;
  losersAvg: number;
  unit: string;
  recommendation: string;
  threshold: number | string;
  winnersAbove: number;
  losersAbove: number;
}

export default function FantasyAnalysisTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalysisData[]>([]);

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      // Fetch all fantasy positions with their watchlist metrics
      const { data: positions, error } = await supabase
        .from('pumpfun_fantasy_positions')
        .select('id, token_symbol, status, entry_price_usd, current_price_usd, main_sold_price_usd, token_amount, target_multiplier, created_at, watchlist_id')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch watchlist data for each position that has a watchlist_id
      const watchlistIds = (positions || []).filter(p => p.watchlist_id).map(p => p.watchlist_id);
      
      let watchlistData: Record<string, WatchlistMetrics> = {};
      if (watchlistIds.length > 0) {
        const { data: wlData } = await supabase
          .from('pumpfun_watchlist')
          .select('id, rugcheck_score, holder_count, volume_sol, market_cap_usd, socials_count, holder_count_peak')
          .in('id', watchlistIds);
        
        if (wlData) {
          wlData.forEach(w => {
            watchlistData[w.id] = w;
          });
        }
      }

      const analysisData: AnalysisData[] = (positions || []).map(p => ({
        position: p as AnalysisPosition,
        watchlist: p.watchlist_id ? watchlistData[p.watchlist_id] || null : null,
      }));

      setData(analysisData);
    } catch (err) {
      console.error('Error fetching analysis data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalysis(); }, []);

  const { winners, losers, comparisons, mcapBuckets, rugcheckBuckets } = useMemo(() => {
    const winners = data.filter(d => d.position.status === 'closed');
    const losers = data.filter(d => d.position.status === 'open');

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const countAbove = (arr: (number | null)[], threshold: number) => arr.filter(v => v !== null && v > threshold).length;
    const countBelow = (arr: (number | null)[], threshold: number) => arr.filter(v => v !== null && v < threshold).length;

    const wRugcheck = winners.map(d => d.watchlist?.rugcheck_score ?? null);
    const lRugcheck = losers.map(d => d.watchlist?.rugcheck_score ?? null);
    const wHolders = winners.map(d => d.watchlist?.holder_count ?? null);
    const lHolders = losers.map(d => d.watchlist?.holder_count ?? null);
    const wVolume = winners.map(d => d.watchlist?.volume_sol ?? null);
    const lVolume = losers.map(d => d.watchlist?.volume_sol ?? null);
    const wMcap = winners.map(d => d.watchlist?.market_cap_usd ?? null);
    const lMcap = losers.map(d => d.watchlist?.market_cap_usd ?? null);

    const comparisons: MetricComparison[] = [
      {
        metric: 'RugCheck Score',
        winnersAvg: avg(wRugcheck.filter(v => v !== null) as number[]),
        losersAvg: avg(lRugcheck.filter(v => v !== null) as number[]),
        unit: '',
        recommendation: 'Reject > 5000',
        threshold: 5000,
        winnersAbove: countAbove(wRugcheck, 5000),
        losersAbove: countAbove(lRugcheck, 5000),
      },
      {
        metric: 'Holder Count',
        winnersAvg: avg(wHolders.filter(v => v !== null) as number[]),
        losersAvg: avg(lHolders.filter(v => v !== null) as number[]),
        unit: '',
        recommendation: 'Require ≥ 100',
        threshold: 100,
        winnersAbove: countBelow(wHolders, 100),
        losersAbove: countBelow(lHolders, 100),
      },
      {
        metric: 'Volume (SOL)',
        winnersAvg: avg(wVolume.filter(v => v !== null) as number[]),
        losersAvg: avg(lVolume.filter(v => v !== null) as number[]),
        unit: ' SOL',
        recommendation: 'Require ≥ 5 SOL',
        threshold: 5,
        winnersAbove: countBelow(wVolume, 5),
        losersAbove: countBelow(lVolume, 5),
      },
      {
        metric: 'Market Cap (USD)',
        winnersAvg: avg(wMcap.filter(v => v !== null) as number[]),
        losersAvg: avg(lMcap.filter(v => v !== null) as number[]),
        unit: '',
        recommendation: 'Require ≥ $5k',
        threshold: '$5,000',
        winnersAbove: countBelow(wMcap, 5000),
        losersAbove: countBelow(lMcap, 5000),
      },
    ];

    // Market cap buckets
    const bucketRanges = [
      { label: '<$5k', min: 0, max: 5000 },
      { label: '$5k-$10k', min: 5000, max: 10000 },
      { label: '$10k-$25k', min: 10000, max: 25000 },
      { label: '$25k-$50k', min: 25000, max: 50000 },
      { label: '$50k+', min: 50000, max: Infinity },
    ];

    const mcapBuckets = bucketRanges.map(b => {
      const w = winners.filter(d => {
        const mc = d.watchlist?.market_cap_usd ?? 0;
        return mc >= b.min && mc < b.max;
      }).length;
      const l = losers.filter(d => {
        const mc = d.watchlist?.market_cap_usd ?? 0;
        return mc >= b.min && mc < b.max;
      }).length;
      const total = w + l;
      return { bucket: b.label, winners: w, losers: l, winRate: total > 0 ? ((w / total) * 100) : 0 };
    });

    // Rugcheck score buckets
    const rcBucketRanges = [
      { label: '0-1k', min: 0, max: 1000 },
      { label: '1k-3k', min: 1000, max: 3000 },
      { label: '3k-5k', min: 3000, max: 5000 },
      { label: '5k-8k', min: 5000, max: 8000 },
      { label: '8k+', min: 8000, max: Infinity },
    ];

    const rugcheckBuckets = rcBucketRanges.map(b => {
      const w = winners.filter(d => {
        const rc = d.watchlist?.rugcheck_score ?? 0;
        return rc >= b.min && rc < b.max;
      }).length;
      const l = losers.filter(d => {
        const rc = d.watchlist?.rugcheck_score ?? 0;
        return rc >= b.min && rc < b.max;
      }).length;
      const total = w + l;
      return { bucket: b.label, winners: w, losers: l, winRate: total > 0 ? ((w / total) * 100) : 0 };
    });

    return { winners, losers, comparisons, mcapBuckets, rugcheckBuckets };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const chartConfig = {
    winners: { label: 'Winners', color: 'hsl(142, 76%, 36%)' },
    losers: { label: 'Losers', color: 'hsl(0, 84%, 60%)' },
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Winners (Closed)</div>
            <div className="text-2xl font-bold text-green-500">{winners.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Losers (Open/Stalled)</div>
            <div className="text-2xl font-bold text-red-500">{losers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className="text-2xl font-bold">{data.length > 0 ? ((winners.length / data.length) * 100).toFixed(1) : 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Positions</div>
            <div className="text-2xl font-bold">{data.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Side-by-side Comparison Table */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Winners vs Losers Entry Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Metric</TableHead>
                <TableHead compact className="text-green-500">Winners Avg</TableHead>
                <TableHead compact className="text-red-500">Losers Avg</TableHead>
                <TableHead compact>Filter Impact</TableHead>
                <TableHead compact>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisons.map((c) => (
                <TableRow key={c.metric}>
                  <TableCell compact className="font-medium text-xs">{c.metric}</TableCell>
                  <TableCell compact className="text-xs text-green-500 font-mono">
                    {c.metric === 'Market Cap (USD)' ? `$${c.winnersAvg.toFixed(0)}` : c.winnersAvg.toFixed(0)}{c.unit}
                  </TableCell>
                  <TableCell compact className="text-xs text-red-500 font-mono">
                    {c.metric === 'Market Cap (USD)' ? `$${c.losersAvg.toFixed(0)}` : c.losersAvg.toFixed(0)}{c.unit}
                  </TableCell>
                  <TableCell compact className="text-xs">
                    <span className="text-red-400">-{c.losersAbove} losers</span>
                    {' / '}
                    <span className="text-amber-400">-{c.winnersAbove} winners</span>
                  </TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                      {c.recommendation}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Market Cap Bucket Win Rates */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Market Cap Bucket Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px]">
              <BarChart data={mcapBuckets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="winners" stackId="a" fill="var(--color-winners)" />
                <Bar dataKey="losers" stackId="a" fill="var(--color-losers)" />
              </BarChart>
            </ChartContainer>
            <div className="mt-2 space-y-1">
              {mcapBuckets.map(b => (
                <div key={b.bucket} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{b.bucket}</span>
                  <span className="font-mono">
                    <span className="text-green-500">{b.winners}W</span>
                    {' / '}
                    <span className="text-red-500">{b.losers}L</span>
                    {' = '}
                    <span className={b.winRate > 20 ? 'text-green-400' : 'text-red-400'}>{b.winRate.toFixed(0)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* RugCheck Score Distribution */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">RugCheck Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px]">
              <BarChart data={rugcheckBuckets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="winners" stackId="a" fill="var(--color-winners)" />
                <Bar dataKey="losers" stackId="a" fill="var(--color-losers)" />
              </BarChart>
            </ChartContainer>
            <div className="mt-2 space-y-1">
              {rugcheckBuckets.map(b => (
                <div key={b.bucket} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{b.bucket}</span>
                  <span className="font-mono">
                    <span className="text-green-500">{b.winners}W</span>
                    {' / '}
                    <span className="text-red-500">{b.losers}L</span>
                    {' = '}
                    <span className={b.winRate > 20 ? 'text-green-400' : 'text-red-400'}>{b.winRate.toFixed(0)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projected Impact */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-500" />
            Projected Impact of Tighter Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p className="text-muted-foreground">
              Applying all 4 filters (rugcheck ≤ 5000, holders ≥ 100, volume ≥ 5 SOL, mcap ≥ $5k):
            </p>
            {(() => {
              // Calculate projected impact
              const wouldRejectWinners = winners.filter(d => {
                const wl = d.watchlist;
                if (!wl) return false;
                return (wl.rugcheck_score !== null && wl.rugcheck_score > 5000) ||
                       (wl.holder_count !== null && wl.holder_count < 100) ||
                       (wl.volume_sol !== null && wl.volume_sol < 5) ||
                       (wl.market_cap_usd !== null && wl.market_cap_usd < 5000);
              }).length;
              const wouldRejectLosers = losers.filter(d => {
                const wl = d.watchlist;
                if (!wl) return false;
                return (wl.rugcheck_score !== null && wl.rugcheck_score > 5000) ||
                       (wl.holder_count !== null && wl.holder_count < 100) ||
                       (wl.volume_sol !== null && wl.volume_sol < 5) ||
                       (wl.market_cap_usd !== null && wl.market_cap_usd < 5000);
              }).length;
              const keptWinners = winners.length - wouldRejectWinners;
              const keptLosers = losers.length - wouldRejectLosers;
              const newTotal = keptWinners + keptLosers;
              const newWinRate = newTotal > 0 ? ((keptWinners / newTotal) * 100) : 0;

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-green-500/10 rounded p-2">
                    <div className="text-xs text-muted-foreground">Winners Kept</div>
                    <div className="font-bold text-green-500">{keptWinners} / {winners.length}</div>
                    <div className="text-xs text-green-400">({winners.length > 0 ? ((keptWinners / winners.length) * 100).toFixed(0) : 0}% retained)</div>
                  </div>
                  <div className="bg-red-500/10 rounded p-2">
                    <div className="text-xs text-muted-foreground">Losers Eliminated</div>
                    <div className="font-bold text-red-500">{wouldRejectLosers} / {losers.length}</div>
                    <div className="text-xs text-red-400">({losers.length > 0 ? ((wouldRejectLosers / losers.length) * 100).toFixed(0) : 0}% rejected)</div>
                  </div>
                  <div className="bg-blue-500/10 rounded p-2">
                    <div className="text-xs text-muted-foreground">New Win Rate</div>
                    <div className="font-bold text-blue-500">{newWinRate.toFixed(1)}%</div>
                    <div className="text-xs text-blue-400">(was {data.length > 0 ? ((winners.length / data.length) * 100).toFixed(1) : 0}%)</div>
                  </div>
                  <div className="bg-amber-500/10 rounded p-2">
                    <div className="text-xs text-muted-foreground">Net Trades</div>
                    <div className="font-bold text-amber-500">{newTotal}</div>
                    <div className="text-xs text-amber-400">(was {data.length})</div>
                  </div>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchAnalysis} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </Button>
      </div>
    </div>
  );
}
