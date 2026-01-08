import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  Trophy, 
  TrendingUp,
  TrendingDown,
  Target,
  Loader2,
  Medal,
  RefreshCw,
  Flame,
  Skull,
  Rocket
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface WhaleStats {
  whale_name: string;
  total_calls: number;
  first_calls: number;
  winning_calls: number;
  losing_calls: number;
  total_pnl_usd: number;
  avg_entry_curve_percent: number | null;
  best_call_token: string | null;
  best_call_pnl_percent: number | null;
  worst_call_token: string | null;
  worst_call_pnl_percent: number | null;
  graduated_tokens: number;
  dead_tokens: number;
  last_call_at: string | null;
}

interface WhaleCall {
  whale_name: string;
  token_symbol: string;
  token_mint: string;
  price_at_detection: number;
  call_sequence: number;
  created_at: string;
  position_status: string | null;
  pnl_percent: number | null;
  ath_multiplier: number | null;
}

export function WhaleLeaderboard() {
  const [whaleStats, setWhaleStats] = useState<WhaleStats[]>([]);
  const [recentCalls, setRecentCalls] = useState<WhaleCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load whale stats from the stats table
      const { data: statsData, error: statsError } = await supabase
        .from('telegram_whale_stats')
        .select('*')
        .order('total_pnl_usd', { ascending: false });

      if (statsError) throw statsError;
      
      // If no stats yet, compute from interpretations + positions
      if (!statsData || statsData.length === 0) {
        await computeWhaleStats();
      } else {
        setWhaleStats(statsData as WhaleStats[]);
      }

      // Load recent whale calls with position outcomes
      const { data: callsData, error: callsError } = await supabase
        .from('telegram_message_interpretations')
        .select(`
          whale_name,
          token_symbol,
          token_mint,
          price_at_detection,
          call_sequence,
          created_at
        `)
        .not('whale_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30);

      if (callsError) throw callsError;

      // Enrich with position data
      const enrichedCalls = await Promise.all((callsData || []).map(async (call) => {
        const { data: position } = await supabase
          .from('telegram_fantasy_positions')
          .select('status, realized_pnl_percent, unrealized_pnl_percent, ath_multiplier')
          .eq('token_mint', call.token_mint)
          .maybeSingle();

        return {
          ...call,
          position_status: position?.status || null,
          pnl_percent: position?.realized_pnl_percent || position?.unrealized_pnl_percent || null,
          ath_multiplier: position?.ath_multiplier || null
        };
      }));

      setRecentCalls(enrichedCalls as WhaleCall[]);
    } catch (err) {
      console.error('Error loading whale data:', err);
      toast.error('Failed to load whale data');
    } finally {
      setLoading(false);
    }
  };

  const computeWhaleStats = async () => {
    setRefreshing(true);
    try {
      // Get all whale calls with position outcomes
      const { data: interpretations } = await supabase
        .from('telegram_message_interpretations')
        .select('whale_name, token_mint, token_symbol, call_sequence, created_at')
        .not('whale_name', 'is', null);

      if (!interpretations) return;

      // Group by whale
      const whaleMap = new Map<string, {
        calls: typeof interpretations;
        tokens: Set<string>;
      }>();

      interpretations.forEach(int => {
        if (!int.whale_name) return;
        if (!whaleMap.has(int.whale_name)) {
          whaleMap.set(int.whale_name, { calls: [], tokens: new Set() });
        }
        const whale = whaleMap.get(int.whale_name)!;
        whale.calls.push(int);
        if (int.token_mint) whale.tokens.add(int.token_mint);
      });

      // Get position outcomes for each whale's tokens
      const stats: WhaleStats[] = [];

      for (const [whaleName, data] of whaleMap) {
        const tokenMints = Array.from(data.tokens);
        
        const { data: positions } = await supabase
          .from('telegram_fantasy_positions')
          .select('token_mint, token_symbol, status, realized_pnl_percent, unrealized_pnl_percent, ath_multiplier')
          .in('token_mint', tokenMints);

        let winningCalls = 0;
        let losingCalls = 0;
        let totalPnl = 0;
        let bestPnl = -Infinity;
        let worstPnl = Infinity;
        let bestToken = '';
        let worstToken = '';
        let graduated = 0;
        let dead = 0;

        (positions || []).forEach(pos => {
          const pnl = pos.realized_pnl_percent || pos.unrealized_pnl_percent || 0;
          if (pnl > 0) winningCalls++;
          else losingCalls++;
          totalPnl += pnl;

          if (pnl > bestPnl) {
            bestPnl = pnl;
            bestToken = pos.token_symbol || '';
          }
          if (pnl < worstPnl) {
            worstPnl = pnl;
            worstToken = pos.token_symbol || '';
          }

          // Check if graduated (ATH > 2x typically means bonded)
          if (pos.ath_multiplier && pos.ath_multiplier > 2) graduated++;
          if (pnl < -80) dead++;
        });

        const firstCalls = data.calls.filter(c => c.call_sequence === 1).length;
        const lastCall = data.calls.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        stats.push({
          whale_name: whaleName,
          total_calls: data.calls.length,
          first_calls: firstCalls,
          winning_calls: winningCalls,
          losing_calls: losingCalls,
          total_pnl_usd: totalPnl,
          avg_entry_curve_percent: null,
          best_call_token: bestToken || null,
          best_call_pnl_percent: bestPnl !== -Infinity ? bestPnl : null,
          worst_call_token: worstToken || null,
          worst_call_pnl_percent: worstPnl !== Infinity ? worstPnl : null,
          graduated_tokens: graduated,
          dead_tokens: dead,
          last_call_at: lastCall?.created_at || null
        });

        // Upsert to stats table
        await supabase
          .from('telegram_whale_stats')
          .upsert({
            whale_name: whaleName,
            total_calls: data.calls.length,
            first_calls: firstCalls,
            winning_calls: winningCalls,
            losing_calls: losingCalls,
            total_pnl_usd: totalPnl,
            best_call_token: bestToken || null,
            best_call_pnl_percent: bestPnl !== -Infinity ? bestPnl : null,
            worst_call_token: worstToken || null,
            worst_call_pnl_percent: worstPnl !== Infinity ? worstPnl : null,
            graduated_tokens: graduated,
            dead_tokens: dead,
            last_call_at: lastCall?.created_at || null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'whale_name' });
      }

      stats.sort((a, b) => b.total_pnl_usd - a.total_pnl_usd);
      setWhaleStats(stats);
      toast.success('Whale stats refreshed');
    } catch (err) {
      console.error('Error computing whale stats:', err);
      toast.error('Failed to compute whale stats');
    } finally {
      setRefreshing(false);
    }
  };

  const getWinRate = (whale: WhaleStats) => {
    const total = whale.winning_calls + whale.losing_calls;
    if (total === 0) return null;
    return (whale.winning_calls / total) * 100;
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return <Medal className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground text-sm">#{index + 1}</span>;
  };

  const getWhaleEmoji = (whale: WhaleStats) => {
    const winRate = getWinRate(whale);
    if (winRate && winRate >= 70) return <Flame className="h-4 w-4 text-orange-500" />;
    if (whale.graduated_tokens > whale.dead_tokens) return <Rocket className="h-4 w-4 text-green-500" />;
    if (whale.dead_tokens > whale.graduated_tokens) return <Skull className="h-4 w-4 text-red-500" />;
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Whale Performance Tracker
        </h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={computeWhaleStats}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Stats
        </Button>
      </div>

      {/* Whale Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Whale Leaderboard</CardTitle>
          <p className="text-sm text-muted-foreground">
            Track which whales call early winners vs. pump-and-dumps
          </p>
        </CardHeader>
        <CardContent>
          {whaleStats.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No whale data yet. Whale names are extracted from INSIDER WALLET TRACKING alerts.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Whale</TableHead>
                  <TableHead className="text-center">Calls</TableHead>
                  <TableHead className="text-center">1st Calls</TableHead>
                  <TableHead className="text-center">Win Rate</TableHead>
                  <TableHead className="text-center">🚀 / 💀</TableHead>
                  <TableHead>Best Call</TableHead>
                  <TableHead>Total P&L</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {whaleStats.map((whale, index) => {
                  const winRate = getWinRate(whale);
                  return (
                    <TableRow key={whale.whale_name}>
                      <TableCell className="text-center">
                        {getRankBadge(index)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getWhaleEmoji(whale)}
                          <span className="font-medium">{whale.whale_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{whale.total_calls}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                          {whale.first_calls}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {winRate !== null ? (
                          <Badge variant={winRate >= 50 ? 'default' : 'destructive'}>
                            {winRate.toFixed(0)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-green-500">{whale.graduated_tokens}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-red-500">{whale.dead_tokens}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {whale.best_call_pnl_percent !== null ? (
                          <div className="flex items-center gap-1 text-green-500">
                            <TrendingUp className="h-4 w-4" />
                            <span>+{whale.best_call_pnl_percent.toFixed(0)}%</span>
                            {whale.best_call_token && (
                              <span className="text-xs text-muted-foreground">
                                ({whale.best_call_token})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={whale.total_pnl_usd >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {whale.total_pnl_usd >= 0 ? '+' : ''}{whale.total_pnl_usd.toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {whale.last_call_at ? (
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(whale.last_call_at), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
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

      {/* Recent Whale Calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5" />
            Recent Whale Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No whale calls recorded yet</p>
          ) : (
            <div className="space-y-2">
              {recentCalls.slice(0, 15).map((call, idx) => (
                <div 
                  key={`${call.token_mint}-${idx}`} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant="outline" 
                      className={call.call_sequence === 1 
                        ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" 
                        : "bg-muted"
                      }
                    >
                      {call.call_sequence === 1 ? '1st' : `#${call.call_sequence}`}
                    </Badge>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{call.token_symbol || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground">by</span>
                        <Badge variant="secondary">{call.whale_name}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        @ ${call.price_at_detection?.toFixed(8) || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      {call.pnl_percent !== null ? (
                        <span className={call.pnl_percent >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {call.pnl_percent >= 0 ? '+' : ''}{call.pnl_percent.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                      {call.ath_multiplier && call.ath_multiplier > 1.5 && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500">
                          ATH {call.ath_multiplier.toFixed(1)}x
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
