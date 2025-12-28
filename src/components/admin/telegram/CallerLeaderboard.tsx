import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Trophy, 
  User,
  TrendingUp,
  TrendingDown,
  Target,
  Loader2,
  Medal,
  Star
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Caller {
  id: string;
  username: string;
  display_name: string | null;
  channel_usernames: string[] | null;
  total_calls: number;
  successful_calls: number;
  average_gain_percent: number | null;
  best_call_gain_percent: number | null;
  best_call_token_symbol: string | null;
  worst_call_loss_percent: number | null;
  total_pnl_usd: number | null;
  win_rate: number | null;
  first_seen_at: string;
  last_call_at: string | null;
}

interface RecentCall {
  id: string;
  token_symbol: string | null;
  token_mint: string;
  caller_username: string | null;
  caller_display_name: string | null;
  channel_name: string | null;
  price_at_call: number | null;
  is_first_call: boolean;
  status: string;
  created_at: string;
}

export function CallerLeaderboard() {
  const [callers, setCallers] = useState<Caller[]>([]);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load callers
      const { data: callersData, error: callersError } = await supabase
        .from('telegram_callers')
        .select('*')
        .order('total_calls', { ascending: false })
        .limit(50);

      if (callersError) throw callersError;
      setCallers((callersData || []) as Caller[]);

      // Load recent first calls
      const { data: callsData, error: callsError } = await supabase
        .from('telegram_channel_calls')
        .select('id, token_symbol, token_mint, caller_username, caller_display_name, channel_name, price_at_call, is_first_call, status, created_at')
        .eq('is_first_call', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (callsError) throw callsError;
      setRecentCalls((callsData || []) as RecentCall[]);
    } catch (err) {
      console.error('Error loading caller data:', err);
      toast.error('Failed to load caller data');
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return <Medal className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground">#{index + 1}</span>;
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
      {/* Recent First Calls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Recent First Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No first calls recorded yet</p>
          ) : (
            <div className="space-y-3">
              {recentCalls.map((call) => (
                <div 
                  key={call.id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                      1st
                    </Badge>
                    <div>
                      <span className="font-medium">{call.token_symbol || 'Unknown'}</span>
                      <p className="text-xs text-muted-foreground">
                        by {call.caller_display_name || call.caller_username || 'Unknown'} in {call.channel_name || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={call.status === 'fantasy_bought' ? 'default' : 'secondary'}>
                      {call.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Caller Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Caller Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          {callers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No callers tracked yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead className="text-center">Calls</TableHead>
                  <TableHead className="text-center">Win Rate</TableHead>
                  <TableHead>Best Call</TableHead>
                  <TableHead>Total P&L</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callers.map((caller, index) => (
                  <TableRow key={caller.id}>
                    <TableCell className="text-center">
                      {getRankBadge(index)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="font-medium">
                            {caller.display_name || caller.username}
                          </span>
                          {caller.display_name && (
                            <p className="text-xs text-muted-foreground">@{caller.username}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(caller.channel_usernames || []).slice(0, 2).map((ch, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {ch}
                          </Badge>
                        ))}
                        {(caller.channel_usernames || []).length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{(caller.channel_usernames || []).length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium">{caller.total_calls}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {caller.win_rate !== null ? (
                        <Badge variant={caller.win_rate >= 50 ? 'default' : 'secondary'}>
                          {caller.win_rate.toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {caller.best_call_gain_percent !== null ? (
                        <div className="flex items-center gap-1 text-green-500">
                          <TrendingUp className="h-4 w-4" />
                          <span>+{caller.best_call_gain_percent.toFixed(0)}%</span>
                          {caller.best_call_token_symbol && (
                            <span className="text-xs text-muted-foreground">
                              ({caller.best_call_token_symbol})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {caller.total_pnl_usd !== null ? (
                        <span className={caller.total_pnl_usd >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {caller.total_pnl_usd >= 0 ? '+' : ''}${caller.total_pnl_usd.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {caller.last_call_at ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(caller.last_call_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
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
