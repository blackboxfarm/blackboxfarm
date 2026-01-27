import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, Database, Clock, TrendingUp, Diamond, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TokenHistoryStats {
  token_mint: string;
  symbol: string | null;
  snapshot_count: number;
  first_snapshot: string;
  last_snapshot: string;
  days_tracked: number;
  total_wallets_tracked: number;
  avg_holder_count: number;
}

interface OverallStats {
  totalTokens: number;
  totalSnapshots: number;
  tokensWithWeekData: number;
  tokensWithMonthData: number;
  totalWalletsTracked: number;
}

export function HistoricalTokenDataDashboard() {
  const [tokens, setTokens] = useState<TokenHistoryStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [overallStats, setOverallStats] = useState<OverallStats>({
    totalTokens: 0,
    totalSnapshots: 0,
    tokensWithWeekData: 0,
    tokensWithMonthData: 0,
    totalWalletsTracked: 0,
  });
  const { toast } = useToast();

  const fetchTokenHistory = async () => {
    setLoading(true);
    try {
      // Fetch snapshot statistics grouped by token
      // Note: holder_snapshots has: token_mint, snapshot_date, wallet_address, balance, usd_value, tier
      const { data: snapshots, error: snapshotError } = await supabase
        .from('holder_snapshots')
        .select('token_mint, snapshot_date, wallet_address')
        .order('snapshot_date', { ascending: false })
        .limit(10000);

      if (snapshotError) throw snapshotError;

      // Process snapshots into per-token stats
      const tokenMap = new Map<string, {
        dates: Set<string>;
        wallets: Set<string>;
      }>();

      for (const snapshot of snapshots || []) {
        const existing = tokenMap.get(snapshot.token_mint);
        if (existing) {
          existing.dates.add(snapshot.snapshot_date);
          existing.wallets.add(snapshot.wallet_address);
        } else {
          tokenMap.set(snapshot.token_mint, {
            dates: new Set([snapshot.snapshot_date]),
            wallets: new Set([snapshot.wallet_address]),
          });
        }
      }

      // Convert to stats array
      const tokenStats: TokenHistoryStats[] = [];
      let totalWallets = 0;
      let tokensWeek = 0;
      let tokensMonth = 0;

      tokenMap.forEach((data, mint) => {
        const sortedDates = Array.from(data.dates).sort();
        const firstDate = new Date(sortedDates[0]);
        const lastDate = new Date(sortedDates[sortedDates.length - 1]);
        const daysTracked = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
        const walletCount = data.wallets.size;
        
        totalWallets += walletCount;
        if (daysTracked >= 7) tokensWeek++;
        if (daysTracked >= 30) tokensMonth++;

        tokenStats.push({
          token_mint: mint,
          symbol: null, // We don't have symbol in holder_snapshots
          snapshot_count: data.dates.size,
          first_snapshot: firstDate.toISOString(),
          last_snapshot: lastDate.toISOString(),
          days_tracked: daysTracked,
          total_wallets_tracked: walletCount,
          avg_holder_count: walletCount,
        });
      });

      // Sort by snapshot count descending
      tokenStats.sort((a, b) => b.snapshot_count - a.snapshot_count);

      setTokens(tokenStats);
      setOverallStats({
        totalTokens: tokenStats.length,
        totalSnapshots: snapshots?.length || 0,
        tokensWithWeekData: tokensWeek,
        tokensWithMonthData: tokensMonth,
        totalWalletsTracked: totalWallets,
      });
    } catch (error) {
      console.error('Failed to fetch token history:', error);
      toast({
        title: "Error",
        description: "Failed to load historical token data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenHistory();
  }, []);

  const filteredTokens = tokens.filter((token) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      token.token_mint.toLowerCase().includes(query) ||
      (token.symbol?.toLowerCase().includes(query) ?? false)
    );
  });

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Historical Token Data
          </h2>
          <p className="text-muted-foreground">Track holder changes and Diamond Hands over time</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchTokenHistory} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tracked Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalTokens}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalSnapshots.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Diamond className="h-3 w-3" />
              7+ Days Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{overallStats.tokensWithWeekData}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Diamond className="h-3 w-3" />
              30+ Days Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">{overallStats.tokensWithMonthData}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Wallets Tracked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalWalletsTracked.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            Tokens with Historical Data
            <Badge variant="secondary">{filteredTokens.length} tokens</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by token address or symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredTokens.map((token) => (
              <div 
                key={token.token_mint}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {token.symbol && (
                        <Badge variant="outline" className="font-mono">
                          ${token.symbol}
                        </Badge>
                      )}
                      <code className="text-xs font-mono text-muted-foreground">
                        {token.token_mint.slice(0, 8)}...{token.token_mint.slice(-4)}
                      </code>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {token.snapshot_count} snapshots
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {token.days_tracked} days tracked
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      ~{token.avg_holder_count.toLocaleString()} holders
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last: {formatTimeAgo(token.last_snapshot)}
                    </div>
                  </div>
                  {token.days_tracked >= 7 && (
                    <Badge 
                      variant="default" 
                      className={token.days_tracked >= 30 ? 'bg-purple-500' : 'bg-blue-500'}
                    >
                      <Diamond className="h-3 w-3 mr-1" />
                      Diamond Ready
                    </Badge>
                  )}
                </div>
              </div>
            ))}

            {filteredTokens.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No historical data yet</p>
                <p className="text-sm">Token snapshots will appear here after analyses</p>
              </div>
            )}

            {loading && (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading historical data...</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
