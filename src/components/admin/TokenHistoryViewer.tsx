import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, History, TrendingUp, DollarSign, Users, 
  Twitter, Globe, MessageCircle, Shield, Star 
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export function TokenHistoryViewer() {
  const [searchMint, setSearchMint] = useState('');
  const [selectedToken, setSelectedToken] = useState<string | null>(null);

  // Fetch tokens with historical data
  const { data: tokensWithHistory, isLoading: loadingTokens } = useQuery({
    queryKey: ['tokens-with-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_search_results')
        .select('token_mint, symbol, name, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Group by token and count
      const tokenMap = new Map<string, { symbol: string; name: string; count: number; lastSeen: string }>();
      
      for (const row of data || []) {
        const existing = tokenMap.get(row.token_mint);
        if (existing) {
          existing.count++;
        } else {
          tokenMap.set(row.token_mint, {
            symbol: row.symbol || '',
            name: row.name || '',
            count: 1,
            lastSeen: row.created_at,
          });
        }
      }
      
      return Array.from(tokenMap.entries())
        .map(([mint, data]) => ({ mint, ...data }))
        .sort((a, b) => b.count - a.count);
    },
  });

  // Fetch history for selected token
  const { data: tokenHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ['token-history', selectedToken],
    queryFn: async () => {
      if (!selectedToken) return null;
      
      // Fetch price history
      const { data: prices } = await supabase
        .from('token_price_history')
        .select('*')
        .eq('token_mint', selectedToken)
        .order('captured_at', { ascending: true });
      
      // Fetch search results history
      const { data: results } = await supabase
        .from('token_search_results')
        .select('*')
        .eq('token_mint', selectedToken)
        .order('created_at', { ascending: true });
      
      // Fetch socials history
      const { data: socials } = await supabase
        .from('token_socials_history')
        .select('*')
        .eq('token_mint', selectedToken)
        .order('captured_at', { ascending: true });
      
      // Fetch DEX status history
      const { data: dexStatus } = await supabase
        .from('token_dex_status_history')
        .select('*')
        .eq('token_mint', selectedToken)
        .order('captured_at', { ascending: true });
      
      return { prices, results, socials, dexStatus };
    },
    enabled: !!selectedToken,
  });

  const filteredTokens = tokensWithHistory?.filter(t => 
    searchMint === '' || 
    t.mint.toLowerCase().includes(searchMint.toLowerCase()) ||
    t.symbol?.toLowerCase().includes(searchMint.toLowerCase()) ||
    t.name?.toLowerCase().includes(searchMint.toLowerCase())
  );

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (price: number) => {
    if (price < 0.0001) return price.toExponential(4);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Token History Viewer</h2>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Token List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Tokens with History</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tokens..."
                value={searchMint}
                onChange={(e) => setSearchMint(e.target.value)}
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingTokens ? (
              <div className="p-4 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-1 p-2">
                  {filteredTokens?.map((token) => (
                    <button
                      key={token.mint}
                      onClick={() => setSelectedToken(token.mint)}
                      className={`w-full p-3 rounded-md text-left transition-colors ${
                        selectedToken === token.mint 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {token.symbol || token.mint.slice(0, 8) + '...'}
                          </div>
                          <div className="text-xs opacity-70">
                            {token.name || 'Unknown'}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {token.count} records
                        </Badge>
                      </div>
                    </button>
                  ))}
                  {filteredTokens?.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground">
                      No tokens with history found
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Token Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              {selectedToken 
                ? `History for ${tokensWithHistory?.find(t => t.mint === selectedToken)?.symbol || selectedToken.slice(0, 12) + '...'}`
                : 'Select a token to view history'
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedToken ? (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a token from the list to view its historical data</p>
                </div>
              </div>
            ) : loadingHistory ? (
              <Skeleton className="h-[400px] w-full" />
            ) : (
              <Tabs defaultValue="price" className="h-[400px]">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="price">
                    <DollarSign className="h-4 w-4 mr-1" />
                    Price
                  </TabsTrigger>
                  <TabsTrigger value="health">
                    <Shield className="h-4 w-4 mr-1" />
                    Health
                  </TabsTrigger>
                  <TabsTrigger value="socials">
                    <Twitter className="h-4 w-4 mr-1" />
                    Socials
                  </TabsTrigger>
                  <TabsTrigger value="dex">
                    <Star className="h-4 w-4 mr-1" />
                    DEX Status
                  </TabsTrigger>
                </TabsList>

                {/* Price Tab */}
                <TabsContent value="price" className="h-[340px]">
                  {(tokenHistory?.prices?.length || 0) > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={tokenHistory?.prices}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="captured_at" 
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => formatDate(v)}
                        />
                        <YAxis 
                          tick={{ fontSize: 10 }} 
                          tickFormatter={(v) => `$${formatPrice(v)}`}
                        />
                        <Tooltip 
                          labelFormatter={(v) => formatDate(v as string)}
                          formatter={(v: number) => [`$${formatPrice(v)}`, 'Price']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="price_usd" 
                          stroke="hsl(var(--primary))" 
                          fill="hsl(var(--primary) / 0.2)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No price history available
                    </div>
                  )}
                </TabsContent>

                {/* Health Tab */}
                <TabsContent value="health" className="h-[340px]">
                  {(tokenHistory?.results?.length || 0) > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={tokenHistory?.results}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="created_at" 
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => formatDate(v)}
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip 
                          labelFormatter={(v) => formatDate(v as string)}
                          formatter={(v: number, name: string) => [
                            name === 'health_score' ? `${v}/100` : v,
                            name === 'health_score' ? 'Health Score' : name
                          ]}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="health_score" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No health score history available
                    </div>
                  )}
                </TabsContent>

                {/* Socials Tab */}
                <TabsContent value="socials" className="h-[340px]">
                  <ScrollArea className="h-full">
                    {(tokenHistory?.socials?.length || 0) > 0 ? (
                      <div className="space-y-3">
                        {tokenHistory?.socials?.map((social, idx) => (
                          <div key={idx} className="p-3 rounded-md bg-muted/50">
                            <div className="text-xs text-muted-foreground mb-2">
                              {formatDate(social.captured_at)}
                            </div>
                            <div className="space-y-1">
                              {social.twitter && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Twitter className="h-4 w-4" />
                                  <a href={social.twitter} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {social.twitter}
                                  </a>
                                </div>
                              )}
                              {social.telegram && (
                                <div className="flex items-center gap-2 text-sm">
                                  <MessageCircle className="h-4 w-4" />
                                  <a href={social.telegram} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {social.telegram}
                                  </a>
                                </div>
                              )}
                              {social.website && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Globe className="h-4 w-4" />
                                  <a href={social.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {social.website}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        No socials history available
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                {/* DEX Status Tab */}
                <TabsContent value="dex" className="h-[340px]">
                  <ScrollArea className="h-full">
                    {(tokenHistory?.dexStatus?.length || 0) > 0 ? (
                      <div className="space-y-3">
                        {tokenHistory?.dexStatus?.map((status, idx) => (
                          <div key={idx} className="p-3 rounded-md bg-muted/50">
                            <div className="text-xs text-muted-foreground mb-2">
                              {formatDate(status.captured_at)}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {status.has_paid_profile && (
                                <Badge variant="default">Paid Profile</Badge>
                              )}
                              {status.has_cto && (
                                <Badge variant="secondary">CTO</Badge>
                              )}
                              {(status.active_boosts || 0) > 0 && (
                                <Badge variant="outline">
                                  {status.active_boosts} Boosts
                                </Badge>
                              )}
                              {status.has_active_ads && (
                                <Badge variant="destructive">Ads Active</Badge>
                              )}
                              {!status.has_paid_profile && !status.has_cto && !status.active_boosts && !status.has_active_ads && (
                                <Badge variant="outline">No DEX Features</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        No DEX status history available
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
