import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Users, Trophy, AlertTriangle, Terminal } from 'lucide-react';
import { useTopDevelopers } from '@/hooks/useDeveloperIntegrity';

export const TokenGenealogyDashboard = () => {
  const [selectedTab, setSelectedTab] = useState('overview');

  // Fetch top 200 current rankings
  const { data: currentTop200 } = useQuery({
    queryKey: ['current-top-200'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_rankings')
        .select('*')
        .eq('is_in_top_200', true)
        .order('captured_at', { ascending: false })
        .limit(200);
      
      if (error) throw error;
      
      // Get only the most recent capture
      const latestCapture = data[0]?.captured_at;
      return data.filter(r => r.captured_at === latestCapture);
    },
    refetchInterval: 5 * 60 * 1000 // Refresh every 5 minutes
  });

  const { data: topDevelopers } = useTopDevelopers(10);

  // Fetch DexScreener scraper logs
  const { data: scraperlogs } = useQuery({
    queryKey: ['dexscreener-logs'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('dexscreener-top-200-scraper', {
        body: { getLogs: true }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60 * 1000 // Refresh every minute
  });

  // Stats
  const stats = {
    totalTokensTracked: currentTop200?.length || 0,
    newTokensToday: 0, // Will be calculated from lifecycle table separately
    topDevelopers: topDevelopers?.length || 0
  };

  const getTrustBadge = (trustLevel: string, score: number) => {
    const variants: Record<string, any> = {
      trusted: { variant: 'default' as const, icon: <Trophy className="h-3 w-3" /> },
      verified: { variant: 'secondary' as const, icon: <TrendingUp className="h-3 w-3" /> },
      neutral: { variant: 'outline' as const, icon: <Users className="h-3 w-3" /> },
      suspicious: { variant: 'destructive' as const, icon: <AlertTriangle className="h-3 w-3" /> },
      scammer: { variant: 'destructive' as const, icon: <TrendingDown className="h-3 w-3" /> }
    };

    const config = variants[trustLevel] || variants.neutral;

    return (
      <Badge variant={config.variant} className="gap-1">
        {config.icon}
        {trustLevel} ({score})
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Tracked</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTokensTracked}</div>
            <p className="text-xs text-muted-foreground">
              Currently in top 200
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.newTokensToday}</div>
            <p className="text-xs text-muted-foreground">
              First seen in rankings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Developers</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.topDevelopers}</div>
            <p className="text-xs text-muted-foreground">
              Verified creators
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="overview">Top 200 Tokens</TabsTrigger>
          <TabsTrigger value="developers">Top Developers</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Top 200 Trending Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {currentTop200?.map((ranking) => (
                  <div 
                    key={ranking.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="w-12 justify-center">
                        #{ranking.rank}
                      </Badge>
                      <div>
                        <p className="font-medium">
                          {typeof ranking.metadata === 'object' && ranking.metadata && 'symbol' in ranking.metadata 
                            ? String((ranking.metadata as any).symbol)
                            : ranking.token_mint.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ranking.token_mint}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          ${ranking.price_usd?.toFixed(6) || 'N/A'}
                        </p>
                        <p className={`text-xs ${
                          (ranking.price_change_24h || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {(ranking.price_change_24h || 0).toFixed(2)}%
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Vol: ${(ranking.volume_24h || 0).toLocaleString()}</p>
                        <p>MCap: ${(ranking.market_cap || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="developers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Developers by Integrity Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topDevelopers?.map((dev, idx) => (
                  <div 
                    key={dev.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="w-12 justify-center">
                        #{idx + 1}
                      </Badge>
                      <div>
                        <p className="font-medium">{dev.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {dev.master_wallet_address.slice(0, 16)}...
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">Tokens in Top 10: <span className="font-medium text-foreground">{dev.tokens_in_top_10_count || 0}</span></p>
                        <p className="text-muted-foreground">Tokens in Top 200: <span className="font-medium text-foreground">{dev.tokens_in_top_200_count || 0}</span></p>
                      </div>
                      {getTrustBadge(dev.trust_level, dev.integrity_score || 50)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                DexScreener API Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] w-full rounded-md border p-4 font-mono text-xs">
                <div className="space-y-1">
                  {scraperlogs?.logs?.map((log: any, idx: number) => (
                    <div key={idx} className={`${
                      log.level === 'error' ? 'text-red-500' :
                      log.level === 'warning' ? 'text-yellow-500' :
                      log.level === 'info' ? 'text-blue-500' :
                      'text-muted-foreground'
                    }`}>
                      <span className="text-muted-foreground">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.event_message}
                    </div>
                  )) || <p className="text-muted-foreground">Loading logs...</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
};
