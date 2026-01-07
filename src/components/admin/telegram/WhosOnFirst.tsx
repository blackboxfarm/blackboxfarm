import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Timer, Zap, Clock, RefreshCw, TrendingUp, Medal } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface FirstCallerStats {
  channel_config_id: string;
  channel_name: string;
  channel_username: string;
  total_first_calls: number;
  total_calls: number;
  first_call_rate: number; // % of times this channel called first
  avg_lead_time_seconds: number; // How much earlier on avg compared to next caller
  tokens_called_first: string[]; // Recent tokens they called first
}

interface TokenFirstCall {
  token_mint: string;
  token_symbol: string;
  first_caller_channel_id: string;
  first_caller_channel_name: string;
  first_call_time: string;
  total_callers: number;
  caller_details: {
    channel_id: string;
    channel_name: string;
    call_time: string;
    lag_seconds: number;
  }[];
}

export function WhosOnFirst() {
  const [channelStats, setChannelStats] = useState<FirstCallerStats[]>([]);
  const [recentFirstCalls, setRecentFirstCalls] = useState<TokenFirstCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Get all channels that have first_enabled = true
      const { data: enabledChannels, error: channelsError } = await supabase
        .from('telegram_channel_config')
        .select('id, channel_name, channel_username, first_enabled')
        .eq('first_enabled', true);

      if (channelsError) throw channelsError;

      if (!enabledChannels || enabledChannels.length === 0) {
        setChannelStats([]);
        setRecentFirstCalls([]);
        setLoading(false);
        return;
      }

      // Get all calls for these channels, ordered by created_at
      const channelIds = enabledChannels.map(c => c.id);
      const { data: calls, error: callsError } = await supabase
        .from('telegram_channel_calls')
        .select('*')
        .in('channel_id', channelIds)
        .order('created_at', { ascending: true });

      if (callsError) throw callsError;

      // Group calls by token_mint to find first caller per token
      const tokenCalls = new Map<string, typeof calls>();
      (calls || []).forEach(call => {
        if (!call.token_mint) return;
        if (!tokenCalls.has(call.token_mint)) {
          tokenCalls.set(call.token_mint, []);
        }
        tokenCalls.get(call.token_mint)!.push(call);
      });

      // Track first caller stats
      const firstCallerCount = new Map<string, number>();
      const totalCallCount = new Map<string, number>();
      const leadTimes = new Map<string, number[]>();
      const tokensCalledFirst = new Map<string, string[]>();

      // Process token first calls for display
      const tokenFirstCallsData: TokenFirstCall[] = [];

      tokenCalls.forEach((tokenCallsArr, tokenMint) => {
        // Sort by timestamp
        tokenCallsArr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        if (tokenCallsArr.length === 0) return;
        
        const firstCall = tokenCallsArr[0];
        const firstChannel = enabledChannels.find(c => c.id === firstCall.channel_id);
        
        // Track first caller
        if (firstChannel) {
          firstCallerCount.set(firstCall.channel_id, (firstCallerCount.get(firstCall.channel_id) || 0) + 1);
          
          // Track token symbol for this channel
          const tokensList = tokensCalledFirst.get(firstCall.channel_id) || [];
          if (firstCall.token_symbol) {
            tokensList.push(firstCall.token_symbol);
          }
          tokensCalledFirst.set(firstCall.channel_id, tokensList.slice(-10)); // Keep last 10
          
          // Calculate lead time if there's a second caller
          if (tokenCallsArr.length > 1) {
            const secondCallTime = new Date(tokenCallsArr[1].created_at).getTime();
            const firstCallTime = new Date(firstCall.created_at).getTime();
            const leadTime = (secondCallTime - firstCallTime) / 1000; // seconds
            
            const channelLeadTimes = leadTimes.get(firstCall.channel_id) || [];
            channelLeadTimes.push(leadTime);
            leadTimes.set(firstCall.channel_id, channelLeadTimes);
          }
        }

        // Track all callers
        tokenCallsArr.forEach(call => {
          totalCallCount.set(call.channel_id, (totalCallCount.get(call.channel_id) || 0) + 1);
        });

        // Build token first call record for recent display
        if (tokenCallsArr.length >= 1) {
          const callerDetails = tokenCallsArr.map((call, idx) => {
            const channel = enabledChannels.find(c => c.id === call.channel_id);
            const firstTime = new Date(firstCall.created_at).getTime();
            const callTime = new Date(call.created_at).getTime();
            return {
              channel_id: call.channel_id,
              channel_name: channel?.channel_name || 'Unknown',
              call_time: call.created_at,
              lag_seconds: (callTime - firstTime) / 1000
            };
          });

          tokenFirstCallsData.push({
            token_mint: tokenMint,
            token_symbol: firstCall.token_symbol || 'Unknown',
            first_caller_channel_id: firstCall.channel_id,
            first_caller_channel_name: firstChannel?.channel_name || 'Unknown',
            first_call_time: firstCall.created_at,
            total_callers: tokenCallsArr.length,
            caller_details: callerDetails
          });
        }
      });

      // Build channel stats
      const stats: FirstCallerStats[] = enabledChannels.map(channel => {
        const firstCalls = firstCallerCount.get(channel.id) || 0;
        const totalCalls = totalCallCount.get(channel.id) || 0;
        const channelLeadTimes = leadTimes.get(channel.id) || [];
        const avgLeadTime = channelLeadTimes.length > 0 
          ? channelLeadTimes.reduce((a, b) => a + b, 0) / channelLeadTimes.length 
          : 0;

        return {
          channel_config_id: channel.id,
          channel_name: channel.channel_name || 'Unknown',
          channel_username: channel.channel_username || '',
          total_first_calls: firstCalls,
          total_calls: totalCalls,
          first_call_rate: totalCalls > 0 ? (firstCalls / totalCalls) * 100 : 0,
          avg_lead_time_seconds: avgLeadTime,
          tokens_called_first: tokensCalledFirst.get(channel.id) || []
        };
      });

      // Sort by first call count descending
      stats.sort((a, b) => b.total_first_calls - a.total_first_calls);
      
      // Sort recent first calls by time, most recent first
      tokenFirstCallsData.sort((a, b) => 
        new Date(b.first_call_time).getTime() - new Date(a.first_call_time).getTime()
      );

      setChannelStats(stats);
      setRecentFirstCalls(tokenFirstCallsData.slice(0, 20)); // Last 20
    } catch (error) {
      console.error('Error loading first caller stats:', error);
      toast.error('Failed to load first caller statistics');
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Zap className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Timer className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground font-mono">#{rank}</span>;
  };

  const formatLeadTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
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
            <Zap className="h-5 w-5 text-yellow-500" />
            Who's on First
          </h2>
          <p className="text-sm text-muted-foreground">
            Which channel is calling tokens first before others echo them
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
              <Zap className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{channelStats[0]?.channel_name || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Fastest Caller</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{channelStats[0]?.total_first_calls || 0}</p>
                <p className="text-xs text-muted-foreground">First Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">
                  {formatLeadTime(channelStats[0]?.avg_lead_time_seconds || 0)}
                </p>
                <p className="text-xs text-muted-foreground">Avg Lead Time</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{recentFirstCalls.length}</p>
                <p className="text-xs text-muted-foreground">Tokens Tracked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* First Caller Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">First Caller Leaderboard</CardTitle>
          <CardDescription>
            Channels ranked by how often they call tokens first
          </CardDescription>
        </CardHeader>
        <CardContent>
          {channelStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No channels opted in to FIRST tracking</p>
              <p className="text-sm">Enable FIRST on channels in Channel Config</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-center">First Calls</TableHead>
                  <TableHead className="text-center">Total Calls</TableHead>
                  <TableHead className="text-center">First Rate</TableHead>
                  <TableHead className="text-center">Avg Lead</TableHead>
                  <TableHead>Recent First Calls</TableHead>
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
                    <TableCell className="text-center font-bold text-yellow-500">
                      {channel.total_first_calls}
                    </TableCell>
                    <TableCell className="text-center">{channel.total_calls}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={channel.first_call_rate >= 50 ? 'default' : 'secondary'}>
                        {channel.first_call_rate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono text-green-500">
                      +{formatLeadTime(channel.avg_lead_time_seconds)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {channel.tokens_called_first.slice(-5).map((symbol, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            ${symbol}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent First Calls Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent First Calls</CardTitle>
          <CardDescription>
            Who called each token first and who echoed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentFirstCalls.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">No cross-channel calls detected yet</p>
          ) : (
            <div className="space-y-3">
              {recentFirstCalls.slice(0, 10).map((token) => (
                <div key={token.token_mint} className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-bold">${token.token_symbol}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(token.first_call_time), { addSuffix: true })}
                      </span>
                    </div>
                    <Badge variant="secondary">{token.total_callers} caller{token.total_callers > 1 ? 's' : ''}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {token.caller_details.map((caller, idx) => (
                      <div 
                        key={caller.channel_id} 
                        className={`px-2 py-1 rounded text-xs ${idx === 0 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-muted text-muted-foreground'}`}
                      >
                        {idx === 0 && <Zap className="h-3 w-3 inline mr-1" />}
                        {caller.channel_name}
                        {idx > 0 && <span className="ml-1 text-muted-foreground">+{formatLeadTime(caller.lag_seconds)}</span>}
                      </div>
                    ))}
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
