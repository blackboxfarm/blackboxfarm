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

export function BaglessHoldersReport() {
  const [tokenMint, setTokenMint] = useState('GvkxeDmoghdjdrmMtc7EZQVobTgV7JiBLEkmPdVyBAGS');
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

  useEffect(() => {
    if (report) {
      let filtered = report.holders;
      
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

      if (error) throw error;
      
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
      toast({
        title: "Price Discovery Failed",
        description: "Could not fetch token price automatically. Please enter manually.",
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
        throw new Error(error.message || 'Report generation failed');
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Token Holders Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="tokenMint">Token Mint Address</Label>
            <Input
              id="tokenMint"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="Token mint address"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-pricing"
              checked={useAutoPricing}
              onCheckedChange={setUseAutoPricing}
            />
            <Label htmlFor="auto-pricing">Use automatic price discovery</Label>
          </div>
          
          {!useAutoPricing && (
            <div>
              <Label htmlFor="tokenPrice">Token Price (USD)</Label>
              <Input
                id="tokenPrice"
                type="number"
                step="0.0001"
                value={tokenPrice}
                onChange={(e) => setTokenPrice(e.target.value)}
                placeholder="0.001"
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
              className="flex-1"
            >
              {isLoading || isFetchingPrice ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isFetchingPrice ? 'Fetching Price...' : 'Generating Report...'}
                </>
              ) : (
                'Generate Holders Report'
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

      {report && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Report Summary
                <Button 
                  onClick={exportToCSV}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
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

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold">{report.totalHolders}</div>
                  <div className="text-xs text-muted-foreground">Total Holders</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">{report.liquidityPoolsDetected || 0}</div>
                  <div className="text-xs text-muted-foreground">LP Detected</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{report.trueWhaleWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">True Whale (≥$5K)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-500">{report.babyWhaleWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Baby Whale ($2K-$5K)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-500">{report.superBossWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Super Boss ($1K-$2K)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-cyan-500">{report.kingpinWallets || 0}</div>
                  <div className="text-xs text-muted-foreground">Kingpin ($500-$1K)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-500">{report.bossWallets}</div>
                  <div className="text-xs text-muted-foreground">Boss ($200-$500)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">{report.realWallets}</div>
                  <div className="text-xs text-muted-foreground">Real ($50-$199)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-500">{report.largeWallets}</div>
                  <div className="text-xs text-muted-foreground">Large ($5-$49)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{formatBalance(report.totalBalance)}</div>
                  <div className="text-xs text-muted-foreground">Total Tokens</div>
                </div>
              </div>

              {/* Sediment Layer Chart */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Wallet Distribution (Sediment Layers)</h3>
                
                {/* Chart - Full width */}
                <div className="mb-4">
                  <div className="bg-muted/30 rounded-lg p-4 h-80 flex flex-col justify-end">
                    {(() => {
                      const totalRealWallets = (report.trueWhaleWallets || 0) + 
                                              (report.babyWhaleWallets || 0) + 
                                              (report.superBossWallets || 0) + 
                                              (report.kingpinWallets || 0) + 
                                              (report.bossWallets || 0) + 
                                              (report.realWallets || 0) + 
                                              (report.largeWallets || 0);
                      
                      const layers = [
                        { name: 'True Whale', count: report.trueWhaleWallets || 0, color: 'bg-red-500', textColor: 'text-red-500' },
                        { name: 'Super Boss', count: report.superBossWallets || 0, color: 'bg-indigo-500', textColor: 'text-indigo-500' },
                        { name: 'Baby Whale', count: report.babyWhaleWallets || 0, color: 'bg-purple-500', textColor: 'text-purple-500' },
                        { name: 'Kingpin', count: report.kingpinWallets || 0, color: 'bg-cyan-500', textColor: 'text-cyan-500' },
                        { name: 'Boss', count: report.bossWallets || 0, color: 'bg-orange-500', textColor: 'text-orange-500' },
                        { name: 'Real', count: report.realWallets || 0, color: 'bg-green-500', textColor: 'text-green-500' },
                        { name: 'Large', count: report.largeWallets || 0, color: 'bg-emerald-500', textColor: 'text-emerald-500' }
                      ];

                      return layers.map((layer, index) => {
                        const percentage = totalRealWallets > 0 ? (layer.count / totalRealWallets) * 100 : 0;
                        const minHeight = percentage > 0 ? Math.max(percentage * 2.5, 8) : 0; // Minimum 8px height if any wallets
                        
                        return (
                          <div
                            key={layer.name}
                            className={`${layer.color} border border-white/20 flex items-center justify-center text-white text-xs font-medium transition-all duration-300 hover:opacity-80`}
                            style={{ 
                              height: `${minHeight}px`,
                              minHeight: percentage > 0 ? '8px' : '0px'
                            }}
                            title={`${layer.name}: ${layer.count} wallets (${percentage.toFixed(1)}%)`}
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
                
                {/* Legend and Analysis - Side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Layer Legend */}
                  <div>
                    <h4 className="font-medium mb-2">Layer Legend</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                        <span>True Whale (≥$5K)</span>
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
                        <div className="w-3 h-3 bg-cyan-500 rounded"></div>
                        <span>Kingpin ($500-$1K)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded"></div>
                        <span>Boss ($200-$500)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                        <span>Real ($50-$199)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                        <span>Large ($5-$49)</span>
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
                    </div>
                  </div>
                </div>
              </div>
              
              {/* LP Filter Controls */}
              <div className="flex gap-2 mb-3 flex-wrap text-sm">
                <Button
                  variant={excludeLPs ? "default" : "outline"}
                  size="sm"
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
                  onClick={() => {
                    setShowLPOnly(!showLPOnly);
                    setExcludeLPs(false);
                  }}
                >
                  Show LPs Only ({report.liquidityPoolsDetected})
                </Button>
              </div>

              <div className="flex gap-1 mb-4 flex-wrap text-sm">
                <Button
                  variant={!showDustOnly && !showSmallOnly && !showMediumOnly && !showLargeOnly && !showRealOnly && !showBossOnly && !showKingpinOnly && !showSuperBossOnly && !showBabyWhaleOnly && !showTrueWhaleOnly && !showLPOnly ? "default" : "outline"}
                  size="sm"
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
                  True Whale (≥$5K)
                </Button>
                <Button
                  variant={showBabyWhaleOnly ? "default" : "outline"}
                  size="sm"
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
                  Baby Whale ($2K-$5K)
                </Button>
                <Button
                  variant={showSuperBossOnly ? "default" : "outline"}
                  size="sm"
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
                  Super Boss ($1K-$2K)
                </Button>
                <Button
                  variant={showKingpinOnly ? "default" : "outline"}
                  size="sm"
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
                  Kingpin ($500-$1K)
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
              
              <p className="text-sm text-muted-foreground">{report.summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Holders List ({filteredHolders.length} wallets)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                  <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>Rank</TableHead>
                         <TableHead>Wallet Address</TableHead>
                         <TableHead>% of Supply</TableHead>
                        <TableHead>Token Balance</TableHead>
                        <TableHead>USD Value</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {filteredHolders.map((holder) => (
                      <TableRow key={holder.owner}>
                         <TableCell className="font-mono">#{holder.rank}</TableCell>
                          <TableCell className="font-mono">
                            <button
                              onClick={() => navigator.clipboard.writeText(holder.owner)}
                              className="hover:text-muted-foreground transition-colors cursor-pointer break-all text-left"
                              title="Click to copy full address"
                            >
                              {holder.owner}
                            </button>
                          </TableCell>
                         <TableCell className="font-mono text-xs">
                           {holder.percentageOfSupply?.toFixed(2)}%
                         </TableCell>
                         <TableCell className="font-mono">
                           {formatBalance(holder.balance)}
                         </TableCell>
                         <TableCell className="font-mono">
                           ${(holder.usdValue || 0).toFixed(4)}
                         </TableCell>
                          <TableCell>
                            {holder.isLiquidityPool ? (
                              <div className="space-y-1">
                                <Badge variant="destructive" className="bg-yellow-500 hover:bg-yellow-600">
                                  LP ({holder.lpConfidence}%)
                                </Badge>
                                <div className="text-xs text-muted-foreground">
                                  {holder.detectedPlatform && (
                                    <div>Platform: {holder.detectedPlatform}</div>
                                  )}
                                  <div>Reason: {holder.lpDetectionReason}</div>
                                </div>
                              </div>
                            ) : (
                              <Badge variant={
                                holder.isDustWallet ? "secondary" : 
                                holder.isSmallWallet ? "outline" : 
                                holder.isMediumWallet ? "outline" : 
                                holder.isLargeWallet ? "outline" : 
                                holder.isBossWallet ? "destructive" : 
                                holder.isKingpinWallet ? "destructive" : 
                                holder.isSuperBossWallet ? "destructive" : 
                                holder.isBabyWhaleWallet ? "destructive" : 
                                holder.isTrueWhaleWallet ? "destructive" : 
                                "default"
                              }>
                                {holder.isDustWallet ? 'Dust' : 
                                 holder.isSmallWallet ? 'Small' : 
                                 holder.isMediumWallet ? 'Medium' : 
                                 holder.isLargeWallet ? 'Large' : 
                                 holder.isBossWallet ? 'Boss' : 
                                 holder.isKingpinWallet ? 'Kingpin' : 
                                 holder.isSuperBossWallet ? 'Super Boss' : 
                                 holder.isBabyWhaleWallet ? 'Baby Whale' : 
                                 holder.isTrueWhaleWallet ? 'True Whale' : 
                                 'Real'}
                              </Badge>
                            )}
                         </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}