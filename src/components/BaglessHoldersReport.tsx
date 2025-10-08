import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, RefreshCw } from 'lucide-react';
import { useTokenMetadata } from '@/hooks/useTokenMetadata';
import { AdBanner } from '@/components/AdBanner';

interface TokenHolder {
  owner: string;
  balance: number;
  usdValue: number;
  balanceRaw: string;
  percentageOfSupply: number;
  isLiquidityPool: boolean;
  lpDetectionReason: string;
  lpConfidence: number;
  detectedPlatform: string;
  isDustWallet: boolean;
  isSmallWallet: boolean;
  isMediumWallet: boolean;
  isLargeWallet: boolean;
  isBossWallet: boolean;
  isKingpinWallet: boolean;
  isSuperBossWallet: boolean;
  isBabyWhaleWallet: boolean;
  isTrueWhaleWallet: boolean;
  tokenAccount: string;
  rank: number;
}

interface HoldersReport {
  tokenMint: string;
  totalHolders: number;
  liquidityPoolsDetected: number;
  lpBalance: number;
  lpPercentageOfSupply: number;
  nonLpHolders: number;
  nonLpBalance: number;
  realWallets: number;
  bossWallets: number;
  kingpinWallets: number;
  superBossWallets: number;
  babyWhaleWallets: number;
  trueWhaleWallets: number;
  largeWallets: number;
  mediumWallets: number;
  smallWallets: number;
  dustWallets: number;
  totalBalance: number;
  tokenPriceUSD: number;
  priceSource?: string;
  priceDiscoveryFailed?: boolean;
  holders: TokenHolder[];
  liquidityPools: TokenHolder[];
  summary: string;
}

interface BaglessHoldersReportProps {
  initialToken?: string;
}

export function BaglessHoldersReport({ initialToken }: BaglessHoldersReportProps) {
  const [tokenMint, setTokenMint] = useState(initialToken || '');
  const [tokenPrice, setTokenPrice] = useState('');
  const [useAutoPricing, setUseAutoPricing] = useState(true);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [discoveredPrice, setDiscoveredPrice] = useState<number | null>(null);
  const [priceSource, setPriceSource] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<HoldersReport | null>(null);
  const [filteredHolders, setFilteredHolders] = useState<TokenHolder[]>([]);
  const [showDustOnly, setShowDustOnly] = useState(false);
  const [showSmallOnly, setShowSmallOnly] = useState(false);
  const [showMediumOnly, setShowMediumOnly] = useState(false);
  const [showLargeOnly, setShowLargeOnly] = useState(false);
  const [showRealOnly, setShowRealOnly] = useState(false);
  const [showBossOnly, setShowBossOnly] = useState(false);
  const [showKingpinOnly, setShowKingpinOnly] = useState(false);
  const [showSuperBossOnly, setShowSuperBossOnly] = useState(false);
  const [showBabyWhaleOnly, setShowBabyWhaleOnly] = useState(false);
  const [showTrueWhaleOnly, setShowTrueWhaleOnly] = useState(false);
  const [showLPOnly, setShowLPOnly] = useState(false);
  const [excludeLPs, setExcludeLPs] = useState(false);
  const { toast } = useToast();
  const { tokenData, fetchTokenMetadata } = useTokenMetadata();

  // Fetch token metadata when tokenMint changes
  useEffect(() => {
    if (tokenMint.trim()) {
      fetchTokenMetadata(tokenMint.trim());
    }
  }, [tokenMint, fetchTokenMetadata]);

  // Auto-generate report when initialToken is provided and tokenMint is set
  useEffect(() => {
    if (initialToken && initialToken.trim() && tokenMint && tokenMint.trim() && !report && !isLoading) {
      // Small delay to ensure token metadata is fetched first
      const timer = setTimeout(() => {
        generateReport();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [initialToken, tokenMint]);

  useEffect(() => {
    if (report) {
      let filtered = report.holders;
      
      // Filter to only show wallets above $1 USD
      filtered = filtered.filter(h => (h.usdValue || 0) >= 1);
      
      // Apply LP filtering first
      if (excludeLPs) {
        filtered = filtered.filter(h => !h.isLiquidityPool);
      } else if (showLPOnly) {
        filtered = filtered.filter(h => h.isLiquidityPool);
      }
      
      // Apply category filtering (only if not showing LP only)
      if (!showLPOnly) {
        if (showDustOnly) {
          filtered = filtered.filter(h => h.isDustWallet);
        } else if (showSmallOnly) {
          filtered = filtered.filter(h => h.isSmallWallet);
        } else if (showMediumOnly) {
          filtered = filtered.filter(h => h.isMediumWallet);
        } else if (showLargeOnly) {
          filtered = filtered.filter(h => h.isLargeWallet);
        } else if (showRealOnly) {
          filtered = filtered.filter(h => !h.isDustWallet && !h.isSmallWallet && !h.isMediumWallet && !h.isLargeWallet && !h.isBossWallet && !h.isKingpinWallet && !h.isSuperBossWallet && !h.isBabyWhaleWallet && !h.isTrueWhaleWallet && !h.isLiquidityPool);
        } else if (showBossOnly) {
          filtered = filtered.filter(h => h.isBossWallet);
        } else if (showKingpinOnly) {
          filtered = filtered.filter(h => h.isKingpinWallet);
        } else if (showSuperBossOnly) {
          filtered = filtered.filter(h => h.isSuperBossWallet);
        } else if (showBabyWhaleOnly) {
          filtered = filtered.filter(h => h.isBabyWhaleWallet);
        } else if (showTrueWhaleOnly) {
          filtered = filtered.filter(h => h.isTrueWhaleWallet);
        }
      }
      
      setFilteredHolders(filtered);
    }
  }, [report, showDustOnly, showSmallOnly, showMediumOnly, showLargeOnly, showRealOnly, showBossOnly, showKingpinOnly, showSuperBossOnly, showBabyWhaleOnly, showTrueWhaleOnly, showLPOnly, excludeLPs]);

  const fetchTokenPrice = async () => {
    if (!tokenMint.trim()) return;
    
    setIsFetchingPrice(true);
    setDiscoveredPrice(null);
    setPriceSource('');
    
    try {
      const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
        body: {
          tokenMint: tokenMint.trim(),
          manualPrice: 0 // Force price discovery
        }
      });

      if (error) {
        const ctx = (error as any)?.context?.body;
        let message = (error as any)?.message || 'Price discovery failed';
        if (ctx) {
          try {
            const parsed = JSON.parse(ctx);
            message = parsed?.details || parsed?.error || message;
          } catch {}
        }
        throw new Error(message);
      }
      
      if (data.tokenPriceUSD > 0) {
        setDiscoveredPrice(data.tokenPriceUSD);
        setPriceSource(data.priceSource || 'API');
        toast({
          title: "Price Discovered",
          description: `Found price: $${data.tokenPriceUSD.toFixed(8)} from ${data.priceSource || 'API'}`,
        });
      } else {
        throw new Error('Price discovery failed');
      }
    } catch (error) {
      console.error('Price discovery failed:', error);
      const msg = error instanceof Error ? error.message : 'Could not fetch token price automatically. Please enter manually.';
      toast({
        title: "Price Discovery Failed",
        description: msg,
        variant: "destructive"
      });
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const generateReport = async () => {
    if (!tokenMint) {
      toast({
        title: "Missing Information",
        description: "Please provide token mint address",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setReport(null);
    
    try {
      console.log('Generating holders report...');
      const priceToUse = useAutoPricing ? 0 : parseFloat(tokenPrice) || 0;
      
      if (useAutoPricing) {
        setIsFetchingPrice(true);
      }
      
      const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
        body: {
          tokenMint: tokenMint.trim(),
          manualPrice: priceToUse
        }
      });

      if (error) {
        console.error('Report generation error:', error);
        let message = (error as any)?.message || 'Report generation failed';
        const ctx = (error as any)?.context?.body;
        if (ctx) {
          try {
            const parsed = JSON.parse(ctx);
            message = parsed?.details || parsed?.error || message;
          } catch {}
        }
        throw new Error(message);
      }

      console.log('Report generated:', data);
      setReport(data);
      
      // Update discovered price info if auto pricing was used
      if (useAutoPricing) {
        setDiscoveredPrice(data.tokenPriceUSD);
        setPriceSource(data.priceSource || 'Multiple APIs');
      }
      
      const priceInfo = data.tokenPriceUSD > 0 ? 
        ` (Price: $${data.tokenPriceUSD.toFixed(8)}${data.priceSource ? ` from ${data.priceSource}` : ''})` : 
        ' (Price: Failed to fetch)';
      
      toast({
        title: "Report Generated",
        description: `Found ${data.totalHolders} total holders${priceInfo}`,
      });
    } catch (error) {
      console.error('Report generation failed:', error);
      toast({
        title: "Report Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate holders report",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsFetchingPrice(false);
    }
  };

  const exportToCSV = () => {
    if (!report) return;
    
    const csvContent = [
      ['Rank', 'Wallet Address', 'Token Balance', 'USD Value', 'Wallet Type', 'Token Account'].join(','),
      ...filteredHolders.map(holder => [
        holder.rank,
        holder.owner,
        holder.balance,
        (holder.usdValue || 0).toFixed(4),
        holder.isLiquidityPool ? `LP (${holder.detectedPlatform || 'Unknown'})` : holder.isDustWallet ? 'Dust' : holder.isSmallWallet ? 'Small' : holder.isMediumWallet ? 'Medium' : holder.isLargeWallet ? 'Large' : holder.isBossWallet ? 'Boss' : holder.isKingpinWallet ? 'Kingpin' : holder.isSuperBossWallet ? 'Super Boss' : holder.isBabyWhaleWallet ? 'Baby Whale' : holder.isTrueWhaleWallet ? 'True Whale' : 'Real',
        holder.tokenAccount
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-holders-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatBalance = (balance: number) => {
    return balance.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg md:text-xl">Token Holders Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-4">
          <div>
            <Label htmlFor="tokenMint" className="text-sm">Token Mint Address</Label>
            <Input
              id="tokenMint"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="Token mint address"
              className="mt-1 text-sm"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-pricing"
              checked={useAutoPricing}
              onCheckedChange={setUseAutoPricing}
            />
            <Label htmlFor="auto-pricing" className="text-sm">Use automatic price discovery</Label>
          </div>
          
          {!useAutoPricing && (
            <div>
              <Label htmlFor="tokenPrice" className="text-sm">Token Price (USD)</Label>
              <Input
                id="tokenPrice"
                type="number"
                step="0.0001"
                value={tokenPrice}
                onChange={(e) => setTokenPrice(e.target.value)}
                placeholder="0.001"
                className="mt-1 text-sm"
              />
            </div>
          )}
          
          {useAutoPricing && discoveredPrice !== null && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium">
                Discovered Price: ${discoveredPrice.toFixed(8)}
              </div>
              {priceSource && (
                <div className="text-xs text-muted-foreground">
                  Source: {priceSource}
                </div>
              )}
            </div>
          )}
          
          <div className="flex gap-2">
            <Button 
              onClick={generateReport} 
              disabled={isLoading || isFetchingPrice}
              className="flex-1 text-sm h-10"
            >
              {isLoading || isFetchingPrice ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">{isFetchingPrice ? 'Fetching Price...' : 'Generating Report...'}</span>
                  <span className="sm:hidden">{isFetchingPrice ? 'Fetching...' : 'Generating...'}</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Generate Holders Report</span>
                  <span className="sm:hidden">Generate Report</span>
                </>
              )}
            </Button>
            
            {useAutoPricing && (
              <Button 
                variant="outline"
                onClick={fetchTokenPrice}
                disabled={!tokenMint.trim() || isFetchingPrice}
                size="icon"
              >
                <RefreshCw className={`h-4 w-4 ${isFetchingPrice ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ad Banner under Generate Button */}
      <AdBanner size="mobile" position={1} />

      {report && (
        <>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <span className="text-lg md:text-xl">Report Summary</span>
                <Button 
                  onClick={exportToCSV}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 text-xs h-8 self-end sm:self-auto"
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden xs:inline">Export CSV</span>
                  <span className="xs:hidden">CSV</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Token Metadata Display */}
              {tokenData && (
                <div className="mb-4 md:mb-6 p-3 md:p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-start gap-3 md:gap-4">
                    {tokenData.metadata.logoURI && (
                      <img 
                        src={tokenData.metadata.logoURI} 
                        alt={`${tokenData.metadata.name} logo`}
                        className="w-10 h-10 md:w-12 md:h-12 rounded-full flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1 md:gap-2 mb-2">
                        <h3 className="text-base md:text-lg font-semibold truncate">
                          {tokenData.metadata.name || 'Unknown Token'}
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          {tokenData.metadata.symbol || 'UNK'}
                        </Badge>
                        {tokenData.metadata.verified && (
                          <Badge variant="outline" className="text-green-600 text-xs">
                            ✓ Verified
                          </Badge>
                        )}
                        {tokenData.metadata.isPumpFun && (
                          <Badge variant="outline" className="text-orange-600 text-xs">
                            Pump.fun
                          </Badge>
                        )}
                      </div>
                      {tokenData.metadata.description && (
                        <p className="text-xs md:text-sm text-muted-foreground mb-2 line-clamp-2">
                          {tokenData.metadata.description}
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground">
                        <div className="block sm:hidden">Decimals: {tokenData.metadata.decimals}</div>
                        <div className="hidden sm:block">Decimals: {tokenData.metadata.decimals} | Mint: {tokenData.metadata.mint.slice(0, 8)}...{tokenData.metadata.mint.slice(-8)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Ad Banner #1 - After Token Metadata */}
              <div className="block md:hidden">
                <AdBanner size="mobile" position={1} />
              </div>
              <div className="hidden md:block">
                <AdBanner size="leaderboard" position={1} />
              </div>
              
              {report.tokenPriceUSD > 0 && (
                <div className="mb-4 p-3 bg-muted rounded-lg">
                  <div className="text-sm font-medium">
                    Token Price: ${report.tokenPriceUSD.toFixed(8)}
                    {report.priceSource && (
                      <span className="text-muted-foreground ml-2">
                        (from {report.priceSource})
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              {report.priceDiscoveryFailed && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="text-sm text-yellow-700 dark:text-yellow-300">
                    ⚠️ Price discovery failed - USD values may be inaccurate
                  </div>
                </div>
              )}
              
              {/* LP Detection Summary */}
              {report.liquidityPoolsDetected > 0 && (
                <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                    🔍 LP Detection Results
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">
                    Detected {report.liquidityPoolsDetected} liquidity pool wallet{report.liquidityPoolsDetected > 1 ? 's' : ''} 
                    ({report.lpPercentageOfSupply.toFixed(1)}% of total supply)
                  </div>
                </div>
              )}

              {/* Primary Statistics - Total Holders and Total Tokens on one line */}
              <div className="grid grid-cols-2 gap-3 md:gap-4 mb-3 md:mb-4">
                <div className="text-center">
                  <div className="text-2xl md:text-3xl font-bold">{report.totalHolders}</div>
                  <div className="text-xs md:text-sm text-muted-foreground">Total Holders</div>
                </div>
                <div className="text-center">
                  <div className="text-xl md:text-3xl font-bold break-all">{Math.round(report.totalBalance).toLocaleString()}</div>
                  <div className="text-xs md:text-sm text-muted-foreground">Total Tokens</div>
                </div>
              </div>

              {/* LP Detection and Wallet Categories */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 mb-4 md:mb-6">
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-yellow-500">{report.liquidityPoolsDetected || 0}</div>
                  <div className="text-xs text-muted-foreground">LP Detected</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-red-500">{report.trueWhaleWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">True Whale (≥$5K)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-purple-500">{report.babyWhaleWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Baby Whale ($2K-$5K)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-indigo-500">{report.superBossWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Super Boss ($1K-$2K)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-cyan-500">{report.kingpinWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Kingpin ($500-$1K)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-orange-500">{report.bossWallets}</div>
                  <div className="text-xs text-muted-foreground">Boss ($200-$500)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-green-500">{report.realWallets}</div>
                  <div className="text-xs text-muted-foreground">Real ($50-$199)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-emerald-500">{report.largeWallets}</div>
                  <div className="text-xs text-muted-foreground">Large ($25-$49)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-blue-500">{report.mediumWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Medium ($12-$25)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-gray-500">{report.smallWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Small ($1-$12)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <div className="text-lg md:text-2xl font-bold text-slate-500">{report.dustWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Dust (&lt;$1)</div>
                </div>
              </div>

              {/* Sediment Layer Chart */}
              <div className="mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Wallet Distribution (Sediment Layers)</h3>
                
                {/* Chart - Full width with Market Cap Y-axis */}
                <div className="mb-4">
                  <div className="flex">
                    {/* Y-axis Market Cap Labels */}
                    <div className="flex flex-col justify-between h-60 md:h-80 pr-1 md:pr-2 py-2 md:py-4 text-xs text-muted-foreground">
                      {(() => {
                        // Calculate total market cap
                        const totalMarketCap = report.totalBalance * report.tokenPriceUSD;
                        
                        // Determine appropriate intervals based on market cap size
                        let interval;
                        let numTicks = 5;
                        
                        if (totalMarketCap < 50000) { // Under $50K
                          interval = 10000; // $10K intervals
                        } else if (totalMarketCap < 250000) { // Under $250K
                          interval = 25000; // $25K intervals
                        } else if (totalMarketCap < 1000000) { // Under $1M
                          interval = 100000; // $100K intervals
                        } else if (totalMarketCap < 5000000) { // Under $5M
                          interval = 500000; // $500K intervals
                        } else if (totalMarketCap < 20000000) { // Under $20M
                          interval = 2000000; // $2M intervals
                        } else {
                          interval = 5000000; // $5M intervals
                        }
                        
                        // Generate tick marks from 0 to totalMarketCap
                        const ticks = [];
                        const maxTick = Math.ceil(totalMarketCap / interval) * interval;
                        
                        for (let i = 0; i <= numTicks; i++) {
                          const value = (maxTick / numTicks) * (numTicks - i);
                          ticks.push(value);
                        }
                        
                        return ticks.map((tick, index) => (
                          <div key={index} className="text-right">
                            {tick >= 1000000 
                              ? `$${(tick / 1000000).toFixed(1)}M` 
                              : `$${(tick / 1000).toFixed(0)}K`
                            }
                          </div>
                        ));
                      })()}
                    </div>
                    
                    {/* Chart Container */}
                    <div className="bg-muted/30 rounded-lg p-2 md:p-4 h-60 md:h-80 flex-1 flex flex-col justify-end relative">
                      {/* Horizontal grid lines */}
                      <div className="absolute inset-4 flex flex-col justify-between pointer-events-none">
                        {Array.from({length: 6}).map((_, i) => (
                          <div key={i} className="border-t border-muted-foreground/20 w-full" />
                        ))}
                      </div>
                      
                      {(() => {
                        // Calculate token balance for each category from holders data
                          const getTokenBalanceForCategory = (categoryFilter: (holder: TokenHolder) => boolean) => {
                            return report.holders
                              .filter(h => !h.isLiquidityPool && categoryFilter(h))
                              .reduce((sum, holder) => sum + holder.balance, 0);
                          };
                        
                        // Calculate LP balance from liquidity pools
                        const lpBalance = report.liquidityPools?.reduce((sum, lp) => sum + lp.balance, 0) || 0;
                        
                        const trueWhaleBalance = getTokenBalanceForCategory(h => h.isTrueWhaleWallet);
                        const babyWhaleBalance = getTokenBalanceForCategory(h => h.isBabyWhaleWallet);
                        const superBossBalance = getTokenBalanceForCategory(h => h.isSuperBossWallet);
                        const kingpinBalance = getTokenBalanceForCategory(h => h.isKingpinWallet);
                        const bossBalance = getTokenBalanceForCategory(h => h.isBossWallet);
                        const realBalance = getTokenBalanceForCategory(h => !h.isDustWallet && !h.isSmallWallet && !h.isMediumWallet && !h.isLargeWallet && !h.isBossWallet && !h.isKingpinWallet && !h.isSuperBossWallet && !h.isBabyWhaleWallet && !h.isTrueWhaleWallet && !h.isLiquidityPool);
                        const largeBalance = getTokenBalanceForCategory(h => h.isLargeWallet);
                        const mediumBalance = getTokenBalanceForCategory(h => h.isMediumWallet);
                        const smallBalance = getTokenBalanceForCategory(h => h.isSmallWallet);
                        const dustBalance = getTokenBalanceForCategory(h => h.isDustWallet);

                        // Include LP balance in total for proper percentage calculations
                        const totalTokenBalance = lpBalance + trueWhaleBalance + babyWhaleBalance + superBossBalance + kingpinBalance + bossBalance + realBalance + largeBalance + mediumBalance + smallBalance + dustBalance;
                        
                        // Layers ordered top to bottom (largest holders at top, smallest at bottom) - REVERSED ORDER
                        // LP is added as the foundational layer (bottom/largest)
                        const layers = [
                          { name: 'Liquidity Pool', count: report.liquidityPoolsDetected || 0, balance: lpBalance, color: 'bg-yellow-600', textColor: 'text-yellow-600' },
                          { name: 'True Whale', count: report.trueWhaleWallets || 0, balance: trueWhaleBalance, color: 'bg-red-500', textColor: 'text-red-500' },
                          { name: 'Baby Whale', count: report.babyWhaleWallets || 0, balance: babyWhaleBalance, color: 'bg-purple-500', textColor: 'text-purple-500' },
                          { name: 'Super Boss', count: report.superBossWallets || 0, balance: superBossBalance, color: 'bg-indigo-500', textColor: 'text-indigo-500' },
                          { name: 'Kingpin', count: report.kingpinWallets || 0, balance: kingpinBalance, color: 'bg-cyan-500', textColor: 'text-cyan-500' },
                          { name: 'Boss', count: report.bossWallets || 0, balance: bossBalance, color: 'bg-orange-500', textColor: 'text-orange-500' },
                          { name: 'Real', count: report.realWallets || 0, balance: realBalance, color: 'bg-green-500', textColor: 'text-green-500' },
                          { name: 'Large', count: report.largeWallets || 0, balance: largeBalance, color: 'bg-emerald-500', textColor: 'text-emerald-500' },
                          { name: 'Medium', count: report.mediumWallets || 0, balance: mediumBalance, color: 'bg-blue-500', textColor: 'text-blue-500' },
                          { name: 'Small', count: report.smallWallets || 0, balance: smallBalance, color: 'bg-gray-500', textColor: 'text-gray-500' },
                          { name: 'Dust', count: report.dustWallets || 0, balance: dustBalance, color: 'bg-slate-500', textColor: 'text-slate-500' }
                        ];

                        return [...layers].reverse().map((layer, index) => {
                          // Calculate percentage based on token balance, not holder count
                          const percentage = totalTokenBalance > 0 ? (layer.balance / totalTokenBalance) * 100 : 0;
                          const minHeight = percentage > 0 ? Math.max(percentage * 2.5, 8) : 0; // Minimum 8px height if any tokens
                          
                          return (
                            <div
                              key={layer.name}
                              className={`${layer.color} border border-white/20 flex items-center justify-center text-white text-xs font-medium transition-all duration-300 hover:opacity-80 relative z-10`}
                              style={{ 
                                height: `${minHeight}px`,
                                minHeight: percentage > 0 ? '8px' : '0px'
                              }}
                              title={`${layer.name}: ${layer.count} wallets (${percentage.toFixed(1)}% of tokens)`}
                            >
                              {percentage > 3 && ( // Only show text if layer is thick enough
                                <span className="text-center px-2">
                                  {layer.count} ({percentage.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
                
                {/* Legend and Analysis - Side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Layer Legend */}
                  <div>
                    <h4 className="font-medium mb-2">Layer Legend</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-slate-500 rounded"></div>
                        <span>Dust (&lt;$1) - Top Layer</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-gray-500 rounded"></div>
                        <span>Small ($1-$12)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded"></div>
                        <span>Medium ($12-$25)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                        <span>Large ($25-$49)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                        <span>Real ($50-$199)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded"></div>
                        <span>Boss ($200-$500)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-cyan-500 rounded"></div>
                        <span>Kingpin ($500-$1K)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-indigo-500 rounded"></div>
                        <span>Super Boss ($1K-$2K)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-purple-500 rounded"></div>
                        <span>Baby Whale ($2K-$5K)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                        <span>True Whale (≥$5K)</span>
                </div>
                
                {/* Ad Banner #2 - Between Sediment Chart and Filter Controls */}
                <div className="block md:hidden">
                  <AdBanner size="mobile" position={2} />
                </div>
                <div className="hidden md:block">
                  <AdBanner size="rectangle" position={2} />
                </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-600 rounded"></div>
                        <span>Liquidity Pool - Foundation Layer</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Layer Analysis */}
                  <div>
                    <h4 className="font-medium mb-2">Layer Analysis</h4>
                    <div className="space-y-2 text-sm">
                      <div className="p-2 bg-red-500/10 border border-red-500/20 rounded">
                        <div className="font-medium text-red-700 dark:text-red-300">Surface (Unstable)</div>
                        <div className="text-xs text-muted-foreground">
                          Real + Large
                        </div>
                        <div className="text-xs">
                          {((report.realWallets || 0) + (report.largeWallets || 0))} wallets
                        </div>
                      </div>
                      
                      <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
                        <div className="font-medium text-yellow-700 dark:text-yellow-300">Ceiling (Volatile)</div>
                        <div className="text-xs text-muted-foreground">
                          Kingpin + Boss
                        </div>
                        <div className="text-xs">
                          {((report.kingpinWallets || 0) + (report.bossWallets || 0))} wallets
                        </div>
                      </div>
                      
                      <div className="p-2 bg-green-500/10 border border-green-500/20 rounded">
                        <div className="font-medium text-green-700 dark:text-green-300">Floor (Stable)</div>
                        <div className="text-xs text-muted-foreground">
                          True Whale + Super Boss + Baby Whale
                        </div>
                        <div className="text-xs">
                          {((report.trueWhaleWallets || 0) + (report.superBossWallets || 0) + (report.babyWhaleWallets || 0))} wallets
                        </div>
                      </div>
                      
                      <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
                        <div className="font-medium text-yellow-700 dark:text-yellow-300">Foundation (LP)</div>
                        <div className="text-xs text-muted-foreground">
                          Liquidity Pool - Price Stability Base
                        </div>
                        <div className="text-xs">
                          {report.liquidityPoolsDetected || 0} pool{(report.liquidityPoolsDetected || 0) !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base md:text-lg">Holders List ({filteredHolders.length} wallets)</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Report Summary */}
              <p className="text-xs md:text-sm text-muted-foreground mb-4 md:mb-6">{report.summary}</p>
              
              {/* LP Filter Controls */}
              <div className="flex gap-1 md:gap-2 mb-3 flex-wrap text-xs md:text-sm">
                <Button
                  variant={excludeLPs ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setExcludeLPs(!excludeLPs);
                    setShowLPOnly(false);
                  }}
                >
                  Exclude LPs
                </Button>
                <Button
                  variant={showLPOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowLPOnly(!showLPOnly);
                    setExcludeLPs(false);
                  }}
                >
                  Show LPs Only ({report.liquidityPoolsDetected})
                </Button>
              </div>

              <div className="flex gap-1 mb-4 flex-wrap text-xs md:text-sm">
                <Button
                  variant={!showDustOnly && !showSmallOnly && !showMediumOnly && !showLargeOnly && !showRealOnly && !showBossOnly && !showKingpinOnly && !showSuperBossOnly && !showBabyWhaleOnly && !showTrueWhaleOnly && !showLPOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowDustOnly(false);
                    setShowSmallOnly(false);
                    setShowMediumOnly(false);
                    setShowLargeOnly(false);
                    setShowRealOnly(false);
                    setShowBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowLPOnly(false);
                  }}
                >
                  All Categories
                </Button>
                <Button
                  variant={showTrueWhaleOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowTrueWhaleOnly(true);
                    setShowBabyWhaleOnly(false);
                    setShowSuperBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowBossOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  <span className="hidden sm:inline">True Whale (≥$5K)</span>
                  <span className="sm:hidden">Whale</span>
                </Button>
                <Button
                  variant={showBabyWhaleOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowBabyWhaleOnly(true);
                    setShowTrueWhaleOnly(false);
                    setShowSuperBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowBossOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  <span className="hidden sm:inline">Baby Whale ($2K-$5K)</span>
                  <span className="sm:hidden">Baby Whale</span>
                </Button>
                <Button
                  variant={showSuperBossOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowSuperBossOnly(true);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowKingpinOnly(false);
                    setShowBossOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  <span className="hidden sm:inline">Super Boss ($1K-$2K)</span>
                  <span className="sm:hidden">Super Boss</span>
                </Button>
                <Button
                  variant={showKingpinOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowKingpinOnly(true);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowBossOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  <span className="hidden sm:inline">Kingpin ($500-$1K)</span>
                  <span className="sm:hidden">Kingpin</span>
                </Button>
                <Button
                  variant={showBossOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowBossOnly(true);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Boss ($200-$500)
                </Button>
                <Button
                  variant={showRealOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowRealOnly(true);
                    setShowBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Real ($50-$199)
                </Button>
                <Button
                  variant={showLargeOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowLargeOnly(true);
                    setShowBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowRealOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Large ($5-$49)
                </Button>
                <Button
                  variant={showMediumOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowMediumOnly(true);
                    setShowBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowLargeOnly(false);
                    setShowRealOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Medium ($1-$4)
                </Button>
              </div>
              {/* Mobile-optimized table display */}
              <div className="max-h-96 overflow-auto">
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Rank</TableHead>
                        <TableHead className="text-xs">Wallet Address</TableHead>
                        <TableHead className="text-xs">% Supply</TableHead>
                        <TableHead className="text-xs">Balance</TableHead>
                        <TableHead className="text-xs">USD Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHolders.map((holder) => (
                        <TableRow key={holder.owner}>
                          <TableCell className="font-mono text-xs">#{holder.rank}</TableCell>
                          <TableCell className="font-mono text-xs">
                            <button
                              onClick={() => navigator.clipboard.writeText(holder.owner)}
                              className="hover:text-muted-foreground transition-colors cursor-pointer text-left"
                              title="Click to copy full address"
                            >
                              {truncateAddress(holder.owner)}
                            </button>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {holder.percentageOfSupply?.toFixed(2)}%
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {Math.floor(holder.balance).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            ${(holder.usdValue || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card List */}
                <div className="md:hidden space-y-2">
                  {filteredHolders.map((holder) => (
                    <div key={holder.owner} className="bg-muted/30 rounded-lg p-3 border">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-mono text-sm font-bold">#{holder.rank}</div>
                        <div className="font-mono text-sm font-bold text-green-600">
                          ${(holder.usdValue || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <button
                          onClick={() => navigator.clipboard.writeText(holder.owner)}
                          className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-left w-full"
                          title="Click to copy full address"
                        >
                          {truncateAddress(holder.owner)}
                        </button>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {holder.percentageOfSupply?.toFixed(2)}% supply
                          </span>
                          <span className="font-mono">
                            {Math.floor(holder.balance).toLocaleString()} tokens
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Ad Banner #3 - After Holders List Table */}
          <div className="block md:hidden">
            <AdBanner size="mobile" position={3} />
          </div>
          <div className="hidden md:block">
            <AdBanner size="leaderboard" position={3} />
          </div>
        </>
      )}
    </div>
  );
}