import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, TrendingUp, TrendingDown, Clock, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface KOLActivity {
  id: string;
  kol_wallet: string;
  token_mint: string;
  token_symbol?: string;
  action: 'buy' | 'sell';
  amount_sol?: number;
  amount_tokens?: number;
  price_at_trade?: number;
  market_cap_at_trade?: number;
  bonding_curve_pct?: number;
  buy_zone?: string;
  time_since_mint_mins?: number;
  hold_time_mins?: number;
  profit_pct?: number;
  profit_sol?: number;
  chart_killed?: boolean;
  detected_at: string;
  kol?: {
    wallet_address: string;
    display_name?: string;
    twitter_handle?: string;
    kol_tier: string;
    trust_score: number;
  };
}

export default function PumpfunKOLActivity() {
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const { data: activity, isLoading } = useQuery({
    queryKey: ['pumpfun-kol-activity', actionFilter],
    queryFn: async () => {
      let query = supabase
        .from('pumpfun_kol_activity')
        .select(`
          *,
          kol:pumpfun_kol_registry(wallet_address, display_name, twitter_handle, kol_tier, trust_score)
        `)
        .order('detected_at', { ascending: false })
        .limit(100);
      
      if (actionFilter !== 'all') query = query.eq('action', actionFilter);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as KOLActivity[];
    }
  });

  const { data: stats } = useQuery({
    queryKey: ['kol-activity-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pumpfun_kol_activity')
        .select('action, chart_killed, profit_pct')
        .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const buys = data?.filter(a => a.action === 'buy').length || 0;
      const sells = data?.filter(a => a.action === 'sell').length || 0;
      const kills = data?.filter(a => a.chart_killed).length || 0;
      const profits = data?.filter(a => a.action === 'sell' && (a.profit_pct || 0) > 0);
      const avgProfit = profits && profits.length > 0
        ? profits.reduce((sum, p) => sum + (p.profit_pct || 0), 0) / profits.length
        : 0;

      return { buys, sells, kills, avgProfit };
    }
  });

  const filteredActivity = activity?.filter(a => 
    a.kol_wallet.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.token_mint.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.token_symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.kol?.twitter_handle?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getZoneBadge = (zone?: string) => {
    const colors: Record<string, string> = {
      early_curve: 'bg-green-500/20 text-green-400',
      mid_curve: 'bg-yellow-500/20 text-yellow-400',
      late_curve: 'bg-orange-500/20 text-orange-400',
      graduated: 'bg-purple-500/20 text-purple-400'
    };
    return zone ? <Badge className={colors[zone] || 'bg-muted'}>{zone.replace('_', ' ')}</Badge> : null;
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">24h Buys</p>
                <p className="text-lg font-bold">{stats?.buys || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">24h Sells</p>
                <p className="text-lg font-bold">{stats?.sells || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-400" />
              <div>
                <p className="text-xs text-muted-foreground">Chart Kills</p>
                <p className="text-lg font-bold text-red-400">{stats?.kills || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Profit</p>
                <p className={`text-lg font-bold ${(stats?.avgProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats?.avgProfit?.toFixed(1) || 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search wallet, token, twitter..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="buy">Buys Only</SelectItem>
            <SelectItem value="sell">Sells Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Activity Table */}
      <Card className="border-border/50">
        <CardHeader className="py-3">
          <CardTitle className="text-base">Recent KOL Activity ({filteredActivity?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KOL</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>MCap</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filteredActivity?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No activity found</TableCell></TableRow>
                ) : filteredActivity?.map((a) => (
                  <TableRow key={a.id} className={`hover:bg-muted/30 ${a.chart_killed ? 'bg-red-500/5' : ''}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{a.kol_wallet.slice(0, 6)}...{a.kol_wallet.slice(-4)}</span>
                        {a.kol?.twitter_handle && (
                          <a href={`https://twitter.com/${a.kol.twitter_handle}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                            @{a.kol.twitter_handle}
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{a.token_mint.slice(0, 6)}...{a.token_mint.slice(-4)}</span>
                        {a.token_symbol && <span className="text-xs text-muted-foreground">${a.token_symbol}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={a.action === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                        {a.action.toUpperCase()}
                      </Badge>
                      {a.chart_killed && <Badge className="ml-1 bg-red-500/30 text-red-300">KILL</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {a.amount_sol ? `${a.amount_sol.toFixed(2)} SOL` : '-'}
                    </TableCell>
                    <TableCell>{getZoneBadge(a.buy_zone)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.market_cap_at_trade ? `$${(a.market_cap_at_trade / 1000).toFixed(0)}K` : '-'}
                    </TableCell>
                    <TableCell>
                      {a.action === 'sell' && a.profit_pct !== undefined ? (
                        <span className={`font-mono ${a.profit_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {a.profit_pct >= 0 ? '+' : ''}{a.profit_pct.toFixed(1)}%
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(a.detected_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
