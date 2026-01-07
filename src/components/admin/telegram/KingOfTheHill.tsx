import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Trophy, Crown, TrendingUp, Target, RefreshCw, Award } from 'lucide-react';
import { toast } from 'sonner';

interface ChannelStats {
  channel_config_id: string;
  channel_name: string;
  channel_username: string;
  total_calls: number;
  winning_calls: number; // Positions that hit 1.5x
  losing_calls: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl_per_call: number;
  best_call_pnl: number;
  best_call_symbol: string | null;
  koth_score: number; // Weighted score combining win rate + volume
}

export function KingOfTheHill() {
  const [channelStats, setChannelStats] = useState<ChannelStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Get all channels that have koth_enabled = true
      const { data: enabledChannels, error: channelsError } = await supabase
        .from('telegram_channel_config')
        .select('id, channel_name, channel_username, koth_enabled')
        .eq('koth_enabled', true);

      if (channelsError) throw channelsError;

      if (!enabledChannels || enabledChannels.length === 0) {
        setChannelStats([]);
        setLoading(false);
        return;
      }

      // Get all fantasy positions for these channels
      const channelIds = enabledChannels.map(c => c.id);
      const { data: positions, error: positionsError } = await supabase
        .from('telegram_fantasy_positions')
        .select('*')
        .in('channel_config_id', channelIds);

      if (positionsError) throw positionsError;

      // Calculate stats per channel
      const stats: ChannelStats[] = enabledChannels.map(channel => {
        const channelPositions = (positions || []).filter(p => p.channel_config_id === channel.id);
        const soldPositions = channelPositions.filter(p => p.status === 'sold');
        
        // A win = realized PnL >= 50% (1.5x moonbag target)
        const winningCalls = soldPositions.filter(p => (p.realized_pnl_percent || 0) >= 50).length;
        const losingCalls = soldPositions.filter(p => (p.realized_pnl_percent || 0) < 50).length;
        const totalCalls = channelPositions.length;
        const winRate = soldPositions.length > 0 ? (winningCalls / soldPositions.length) * 100 : 0;
        
        const totalPnl = soldPositions.reduce((sum, p) => sum + (p.realized_pnl_usd || 0), 0);
        const avgPnl = soldPositions.length > 0 ? totalPnl / soldPositions.length : 0;
        
        // Find best call
        const bestCall = soldPositions.reduce((best, p) => 
          (p.realized_pnl_usd || 0) > (best?.realized_pnl_usd || 0) ? p : best, 
          null as typeof soldPositions[0] | null
        );
        
        // KOTH Score = (win_rate * 0.6) + (log10(total_calls) * 20) + (avg_pnl > 0 ? 20 : 0)
        // Higher score = better channel
        const volumeBonus = Math.log10(Math.max(totalCalls, 1)) * 20;
        const profitBonus = avgPnl > 0 ? 20 : 0;
        const kothScore = (winRate * 0.6) + volumeBonus + profitBonus;

        return {
          channel_config_id: channel.id,
          channel_name: channel.channel_name || 'Unknown',
          channel_username: channel.channel_username || '',
          total_calls: totalCalls,
          winning_calls: winningCalls,
          losing_calls: losingCalls,
          win_rate: winRate,
          total_pnl: totalPnl,
          avg_pnl_per_call: avgPnl,
          best_call_pnl: bestCall?.realized_pnl_usd || 0,
          best_call_symbol: bestCall?.token_symbol || null,
          koth_score: kothScore
        };
      });

      // Sort by KOTH score descending
      stats.sort((a, b) => b.koth_score - a.koth_score);
      setChannelStats(stats);
    } catch (error) {
      console.error('Error loading KOTH stats:', error);
      toast.error('Failed to load channel statistics');
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground font-mono">#{rank}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            King of the Hill
          </h2>
          <p className="text-sm text-muted-foreground">
            Which channel has the best win rate based on 1.5x moonbag protocol
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{channelStats[0]?.channel_name || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Current Leader</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {channelStats[0]?.win_rate?.toFixed(1) || '0'}%
                </p>
                <p className="text-xs text-muted-foreground">Best Win Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{channelStats.length}</p>
                <p className="text-xs text-muted-foreground">Tracked Channels</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {channelStats.reduce((sum, c) => sum + c.total_calls, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Channel Leaderboard</CardTitle>
          <CardDescription>
            Ranked by KOTH Score (60% win rate + volume bonus + profitability)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {channelStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Crown className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No channels opted in to KOTH tracking</p>
              <p className="text-sm">Enable KOTH on channels in Channel Config</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-center">Calls</TableHead>
                  <TableHead className="text-center">Wins</TableHead>
                  <TableHead className="text-center">Win Rate</TableHead>
                  <TableHead className="text-right">Total P&L</TableHead>
                  <TableHead className="text-right">Avg P&L</TableHead>
                  <TableHead className="text-center">Best Call</TableHead>
                  <TableHead className="text-right">KOTH Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channelStats.map((channel, index) => (
                  <TableRow key={channel.channel_config_id} className={index === 0 ? 'bg-yellow-500/5' : ''}>
                    <TableCell className="text-center">{getRankBadge(index + 1)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{channel.channel_name}</p>
                        <p className="text-xs text-muted-foreground">@{channel.channel_username}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{channel.total_calls}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-500">{channel.winning_calls}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-red-500">{channel.losing_calls}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant={channel.win_rate >= 50 ? 'default' : 'secondary'}
                        className={channel.win_rate >= 50 ? 'bg-green-500' : ''}
                      >
                        {channel.win_rate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono ${channel.total_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {channel.total_pnl >= 0 ? '+' : ''}${channel.total_pnl.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${channel.avg_pnl_per_call >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {channel.avg_pnl_per_call >= 0 ? '+' : ''}${channel.avg_pnl_per_call.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      {channel.best_call_symbol ? (
                        <span className="text-sm">
                          {channel.best_call_symbol}
                          <span className="text-green-500 ml-1">+${channel.best_call_pnl.toFixed(0)}</span>
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {channel.koth_score.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
