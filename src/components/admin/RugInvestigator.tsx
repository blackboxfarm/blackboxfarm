import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Search, AlertTriangle, Shield, Users, Wallet, TrendingDown, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface InvestigationReport {
  token: {
    mint: string;
    name: string;
    symbol: string;
    priceUsd: number;
    liquidityUsd: number;
    marketCapUsd: number;
    priceChange24h: number;
  };
  holders: {
    total: number;
    topHolders: any[];
  };
  sellers: {
    total: number;
    topSellers: any[];
    totalSold: number;
  };
  bundles: {
    detected: number;
    details: any[];
  };
  cexTraces: {
    found: number;
    traces: any[];
  };
  riskAssessment: {
    score: number;
    level: string;
    factors: string[];
  };
  investigatedAt: string;
}

export default function RugInvestigator() {
  const [tokenMint, setTokenMint] = useState('');
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const { toast } = useToast();

  // Fetch investigation history
  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['rug-investigations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rug_investigations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    },
  });

  const investigate = async () => {
    if (!tokenMint.trim()) {
      toast({ title: 'Enter a token mint address', variant: 'destructive' });
      return;
    }

    setIsInvestigating(true);
    setReport(null);

    try {
      const { data, error } = await supabase.functions.invoke('rug-investigator', {
        body: { tokenMint: tokenMint.trim(), maxSellers: 50, traceDepth: 3 },
      });

      if (error) throw error;

      setReport(data);
      refetchHistory();
      toast({ title: 'Investigation complete' });
    } catch (error: any) {
      console.error('Investigation error:', error);
      toast({ 
        title: 'Investigation failed', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setIsInvestigating(false);
    }
  };

  const loadInvestigation = (investigation: any) => {
    if (investigation.full_report) {
      setReport(investigation.full_report as InvestigationReport);
      setTokenMint(investigation.token_mint);
    }
  };

  const retryInvestigation = async (inv: any) => {
    setTokenMint(inv.token_mint);
    // Delete the failed record first
    await supabase
      .from('rug_investigations')
      .delete()
      .eq('id', inv.id);
    
    refetchHistory();
    // Then start a new investigation
    investigate();
  };

  const deleteInvestigation = async (id: string) => {
    await supabase
      .from('rug_investigations')
      .delete()
      .eq('id', id);
    
    refetchHistory();
    toast({ title: 'Investigation deleted' });
  };

  const getRiskBadgeVariant = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'secondary';
      default: return 'outline';
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Rug Investigator
          </CardTitle>
          <CardDescription>
            Deep analysis of suspected rug pulls with wallet bundling and CEX genealogy tracing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter token mint address..."
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              className="font-mono"
            />
            <Button onClick={investigate} disabled={isInvestigating}>
              {isInvestigating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Investigating...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Investigate
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {report && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Risk Score Card */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Risk Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-4xl font-bold">{report.riskAssessment.score}/100</div>
                  <Badge variant={getRiskBadgeVariant(report.riskAssessment.level)} className="mt-1">
                    {report.riskAssessment.level} RISK
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{report.token.symbol}</div>
                  <div className="text-sm text-muted-foreground">{report.token.name}</div>
                </div>
              </div>
              <div className="mt-4 space-y-1">
                {report.riskAssessment.factors.map((factor, i) => (
                  <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3" />
                    {factor}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Token Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Token Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span>${report.token.priceUsd?.toFixed(8) || '0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Liquidity</span>
                <span className={report.token.liquidityUsd === 0 ? 'text-destructive font-bold' : ''}>
                  ${report.token.liquidityUsd?.toLocaleString() || '0'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Market Cap</span>
                <span>${report.token.marketCapUsd?.toLocaleString() || '0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">24h Change</span>
                <span className={report.token.priceChange24h < 0 ? 'text-destructive' : 'text-green-500'}>
                  {report.token.priceChange24h?.toFixed(2) || 0}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Investigation Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Investigation Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Holders</span>
                <span>{report.holders.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sellers Found</span>
                <span>{report.sellers.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bundles Detected</span>
                <Badge variant={report.bundles.detected > 0 ? 'destructive' : 'outline'}>
                  {report.bundles.detected}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CEX Traces</span>
                <Badge variant={report.cexTraces.found > 0 ? 'secondary' : 'outline'}>
                  {report.cexTraces.found}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Tabs */}
      {report && (
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="sellers">
              <TabsList>
                <TabsTrigger value="sellers">
                  <Users className="h-4 w-4 mr-2" />
                  Sellers ({report.sellers.total})
                </TabsTrigger>
                <TabsTrigger value="bundles">
                  <Wallet className="h-4 w-4 mr-2" />
                  Bundles ({report.bundles.detected})
                </TabsTrigger>
                <TabsTrigger value="cex">
                  <Shield className="h-4 w-4 mr-2" />
                  CEX Traces ({report.cexTraces.found})
                </TabsTrigger>
                <TabsTrigger value="holders">
                  <Users className="h-4 w-4 mr-2" />
                  Holders
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sellers" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Wallet</TableHead>
                        <TableHead className="text-right">Total Sold</TableHead>
                        <TableHead className="text-right">Sell Count</TableHead>
                        <TableHead className="text-right">Avg Size</TableHead>
                        <TableHead>Last Sell</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.sellers.topSellers.map((seller: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">
                            {formatAddress(seller.wallet)}
                          </TableCell>
                          <TableCell className="text-right">
                            {seller.totalSold?.toLocaleString() || 0}
                          </TableCell>
                          <TableCell className="text-right">{seller.sellCount}</TableCell>
                          <TableCell className="text-right">
                            {seller.avgSellSize?.toLocaleString() || 0}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {seller.lastSell ? new Date(seller.lastSell).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell>
                            <a 
                              href={`https://solscan.io/account/${seller.wallet}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="bundles" className="mt-4">
                {report.bundles.details.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No wallet bundles detected
                  </div>
                ) : (
                  <div className="space-y-4">
                    {report.bundles.details.map((bundle: any, i: number) => (
                      <Card key={i}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">
                              Bundle #{i + 1} - {bundle.wallets.length} wallets
                            </CardTitle>
                            {bundle.isCex && (
                              <Badge variant="secondary">{bundle.cexName}</Badge>
                            )}
                          </div>
                          <CardDescription className="font-mono text-xs">
                            Funding Source: {formatAddress(bundle.fundingSource)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {bundle.wallets.map((wallet: string, j: number) => (
                              <Badge key={j} variant="outline" className="font-mono text-xs">
                                {formatAddress(wallet)}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="cex" className="mt-4">
                {report.cexTraces.traces.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                    No CEX traces found - sellers may be anonymized
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Wallet</TableHead>
                        <TableHead>CEX</TableHead>
                        <TableHead>Trace Depth</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.cexTraces.traces.map((trace: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">
                            {formatAddress(trace.wallet)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{trace.cex}</Badge>
                          </TableCell>
                          <TableCell>{trace.depth} hops</TableCell>
                          <TableCell>
                            <a 
                              href={`https://solscan.io/account/${trace.wallet}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="holders" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Wallet</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">% Supply</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.holders.topHolders.slice(0, 20).map((holder: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatAddress(holder.wallet || holder.owner)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(holder.balance || holder.amount)?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          {(holder.percentage || holder.pct || 0).toFixed(2)}%
                        </TableCell>
                        <TableCell>
                          <a 
                            href={`https://solscan.io/account/${holder.wallet || holder.owner}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* History Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Investigation History</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetchHistory()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history?.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{inv.token_symbol || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatAddress(inv.token_mint)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        inv.rug_risk_score >= 70 ? 'destructive' :
                        inv.rug_risk_score >= 50 ? 'secondary' : 'outline'
                      }>
                        {inv.rug_risk_score || 0}/100
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={inv.status === 'completed' ? 'outline' : 'secondary'}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {inv.status === 'completed' ? (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => loadInvestigation(inv)}
                        >
                          View
                        </Button>
                      ) : inv.status === 'in_progress' ? (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteInvestigation(inv.id)}
                          className="text-yellow-500"
                        >
                          Cancel
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => retryInvestigation(inv)}
                          className="text-orange-500"
                        >
                          Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
