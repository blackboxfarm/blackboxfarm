import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, TrendingUp, Flame, Clock, Database } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TokenLifecycle {
  token_mint: string;
  symbol?: string;
  name?: string;
  liquidity_usd?: number;
  volume_24h?: number;
  market_cap?: number;
  fdv?: number;
  price_usd?: number;
  pair_created_at?: string;
  active_boosts?: number;
  image_url?: string;
  discovery_source?: string;
  first_seen_at?: string;
  last_fetched_at?: string;
  dex_id?: string;
}

export function DexCompilesView() {
  // Fetch top 500 by liquidity
  const { data: top500, isLoading: loadingTop500, refetch: refetchTop500 } = useQuery({
    queryKey: ['dex-compiles-top-500'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_lifecycle')
        .select('*')
        .not('liquidity_usd', 'is', null)
        .order('liquidity_usd', { ascending: false })
        .limit(500);
      
      if (error) throw error;
      return data as TokenLifecycle[];
    }
  });

  // Fetch recently discovered tokens
  const { data: recentTokens, isLoading: loadingRecent, refetch: refetchRecent } = useQuery({
    queryKey: ['dex-compiles-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_lifecycle')
        .select('*')
        .order('first_seen_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as TokenLifecycle[];
    }
  });

  // Fetch boosted tokens
  const { data: boostedTokens, isLoading: loadingBoosted, refetch: refetchBoosted } = useQuery({
    queryKey: ['dex-compiles-boosted'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_lifecycle')
        .select('*')
        .gt('active_boosts', 0)
        .order('active_boosts', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as TokenLifecycle[];
    }
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['dex-compiles-stats'],
    queryFn: async () => {
      const [totalResult, recentResult, boostedResult] = await Promise.all([
        supabase.from('token_lifecycle').select('*', { count: 'exact', head: true }),
        supabase.from('token_lifecycle').select('*', { count: 'exact', head: true })
          .gte('first_seen_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('token_lifecycle').select('*', { count: 'exact', head: true })
          .gt('active_boosts', 0)
      ]);

      return {
        total: totalResult.count || 0,
        last24h: recentResult.count || 0,
        boosted: boostedResult.count || 0
      };
    }
  });

  const runCollector = async () => {
    const { data, error } = await supabase.functions.invoke('dexscreener-top-200-scraper');
    if (error) {
      console.error('Failed to run collector:', error);
    } else {
      console.log('Collector run:', data);
      // Refetch all queries
      refetchTop500();
      refetchRecent();
      refetchBoosted();
    }
  };

  const formatNumber = (num?: number) => {
    if (!num) return '-';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const getSourceBadge = (source?: string) => {
    if (!source) return null;
    const variants: Record<string, { variant: any; icon: any }> = {
      'boosted': { variant: 'default', icon: <Flame className="h-3 w-3" /> },
      'boosted+search': { variant: 'default', icon: <Flame className="h-3 w-3" /> },
      'search': { variant: 'secondary', icon: <TrendingUp className="h-3 w-3" /> },
      'profile': { variant: 'outline', icon: <Database className="h-3 w-3" /> }
    };
    
    const config = variants[source] || { variant: 'outline', icon: null };
    return (
      <Badge variant={config.variant as any} className="flex items-center gap-1">
        {config.icon}
        {source}
      </Badge>
    );
  };

  const formatSymbol = (t: TokenLifecycle) => {
    const raw = t.symbol?.trim();
    if (raw && raw !== '-' && raw !== 'No Symbol') {
      return raw.startsWith('$') ? raw : `$${raw}`;
    }
    // Fallback: try first word of name, otherwise "Unknown"
    const nameGuess = t.name?.split(/\s|-/)[0]?.replace(/[^A-Za-z0-9]/g, '');
    return nameGuess ? `$${nameGuess}` : '$Unknown';
  };

  const renderTokenRow = (token: TokenLifecycle) => (
    <TableRow key={token.token_mint}>
      <TableCell>
        <div className="flex items-center gap-2">
          {token.image_url && (
            <img src={token.image_url} alt={token.symbol || ''} className="w-6 h-6 rounded-full" />
          )}
          <div className="flex flex-col">
            <span className="font-medium text-base">{formatSymbol(token)}</span>
            <span className="text-xs text-muted-foreground">
              {token.name || '-'}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <code className="text-xs">{token.token_mint}</code>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {token.first_seen_at ? formatDistanceToNow(new Date(token.first_seen_at), { addSuffix: true }) : '-'}
      </TableCell>
      <TableCell>{getSourceBadge(token.discovery_source)}</TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Dex Compiles</h2>
          <p className="text-muted-foreground">Multi-source token discovery and tracking</p>
        </div>
        <Button onClick={runCollector} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Run Collector
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Ever-growing database</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last 24 Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.last24h.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Newly discovered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Boosted Tokens</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.boosted.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Currently promoted</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="top500" className="space-y-4">
        <TabsList>
          <TabsTrigger value="top500">Top 500 by Liquidity</TabsTrigger>
          <TabsTrigger value="recent">Recently Discovered</TabsTrigger>
          <TabsTrigger value="boosted">Boosted Tokens</TabsTrigger>
        </TabsList>

        <TabsContent value="top500" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top 500 Tokens by Liquidity</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTop500 ? (
                <div className="text-center py-8">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Token Address (Mint)</TableHead>
                        <TableHead>First Seen</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {top500?.map(renderTokenRow)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recently Discovered Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRecent ? (
                <div className="text-center py-8">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Token Address (Mint)</TableHead>
                        <TableHead>First Seen</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentTokens?.map(renderTokenRow)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="boosted" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Boosted Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBoosted ? (
                <div className="text-center py-8">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Token Address (Mint)</TableHead>
                        <TableHead>First Seen</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {boostedTokens?.map(renderTokenRow)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
