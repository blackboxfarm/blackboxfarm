import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, RefreshCw, Flag, AlertTriangle, Shield, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
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
  accountOwnerProgram?: string;
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

interface PotentialDevWallet {
  address: string;
  balance: number;
  usdValue: number;
  percentageOfSupply: number;
  confidence: number;
  reason: string;
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
  potentialDevWallet?: PotentialDevWallet;
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
  const [walletFlags, setWalletFlags] = useState<{[address: string]: { flag: 'dev' | 'team' | 'suspicious'; timestamp: number }}>({});
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const { toast } = useToast();
  const { tokenData, fetchTokenMetadata } = useTokenMetadata();

  // Load wallet flags from localStorage when tokenMint changes
  useEffect(() => {
    if (tokenMint.trim()) {
      const stored = localStorage.getItem(`wallet-flags-${tokenMint.trim()}`);
      if (stored) {
        try {
          setWalletFlags(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to load wallet flags:', e);
        }
      } else {
        setWalletFlags({});
      }
    }
  }, [tokenMint]);

  // Save wallet flags to localStorage when they change
  useEffect(() => {
    if (tokenMint.trim() && Object.keys(walletFlags).length > 0) {
      localStorage.setItem(`wallet-flags-${tokenMint.trim()}`, JSON.stringify(walletFlags));
    }
  }, [walletFlags, tokenMint]);

  // Sync tokenMint state when initialToken prop changes (handles URL param after mount)
  useEffect(() => {
    if (initialToken && initialToken.trim() && tokenMint.trim() !== initialToken.trim()) {
      setTokenMint(initialToken.trim());
    }
  }, [initialToken]);

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

  // Calculate top 10 holder stats (excluding LP and dev)
  const calculateTop10Stats = () => {
    if (!report) return { top10: [], cumulativePercentage: 0 };
    const devWallet = report.potentialDevWallet?.address;
    const nonLPHolders = report.holders.filter(h => !h.isLiquidityPool && h.owner !== devWallet);
    const top10 = nonLPHolders.slice(0, 10);
    const cumulativePercentage = top10.reduce((sum, h) => sum + h.percentageOfSupply, 0);
    return { top10, cumulativePercentage };
  };

  // Calculate LP vs Unlocked Supply
  const calculateLPAnalysis = () => {
    if (!report) return { unlockedSupply: 0, unlockedPercentage: 0, lpPercentage: 0 };
    const unlockedSupply = report.totalBalance - report.lpBalance;
    const unlockedPercentage = report.totalBalance > 0 ? (unlockedSupply / report.totalBalance) * 100 : 0;
    return {
      unlockedSupply,
      unlockedPercentage,
      lpPercentage: report.lpPercentageOfSupply
    };
  };

  // Calculate Stability Score
  const calculateStabilityScore = () => {
    if (!report) return null;
    
    const nonLPHolders = report.holders.filter(h => !h.isLiquidityPool);
    const whalePercentage = nonLPHolders
      .filter(h => h.percentageOfSupply >= 1)
      .reduce((sum, h) => sum + h.percentageOfSupply, 0);
    
    const top10Stats = calculateTop10Stats();
    const lpAnalysis = calculateLPAnalysis();
    
    // Whale concentration score (40 points max)
    const whaleScore = Math.max(0, Math.min(40, 40 - (whalePercentage * 1.33)));
    
    // Top 10 distribution score (30 points max)
    const top10Percentage = top10Stats.cumulativePercentage;
    let distributionScore = 30;
    if (top10Percentage > 40) {
      distributionScore = Math.max(0, 30 - ((top10Percentage - 40) * 0.75));
    } else if (top10Percentage > 20) {
      distributionScore = 15 + ((40 - top10Percentage) * 0.75);
    } else {
      distributionScore = 25 + ((20 - top10Percentage) * 0.25);
    }
    
    // LP percentage score (20 points max) - ideal range 5-15%
    const lpPct = lpAnalysis.lpPercentage;
    let lpScore = 0;
    if (lpPct >= 5 && lpPct <= 15) {
      lpScore = 18 + ((15 - Math.abs(lpPct - 10)) * 0.2);
    } else if ((lpPct >= 2 && lpPct < 5) || (lpPct > 15 && lpPct <= 25)) {
      lpScore = 10 + (8 * (1 - Math.abs(lpPct - 10) / 15));
    } else {
      lpScore = Math.max(0, 10 - (Math.abs(lpPct - 10) / 3));
    }
    
    // Holder count score (10 points max)
    let holderScore = 0;
    if (report.totalHolders > 1000) holderScore = 10;
    else if (report.totalHolders > 500) holderScore = 7 + ((report.totalHolders - 500) / 500) * 3;
    else if (report.totalHolders > 100) holderScore = 4 + ((report.totalHolders - 100) / 400) * 3;
    else holderScore = (report.totalHolders / 100) * 4;
    
    const totalScore = Math.round(whaleScore + distributionScore + lpScore + holderScore);
    
    // Determine risk level based on whale concentration
    let riskLevel: 'low' | 'medium' | 'high';
    let emoji: string;
    let label: string;
    
    if (whalePercentage < 10) {
      riskLevel = 'low';
      emoji = '🟢';
      label = 'Community-owned';
    } else if (whalePercentage < 30) {
      riskLevel = 'medium';
      emoji = '🟡';
      label = 'Neutral';
    } else {
      riskLevel = 'high';
      emoji = '🔴';
      label = 'High Risk';
    }
    
    return {
      score: totalScore,
      riskLevel,
      emoji,
      label,
      whalePercentage,
      breakdown: {
        whaleScore: Math.round(whaleScore),
        distributionScore: Math.round(distributionScore),
        lpScore: Math.round(lpScore),
        holderCountScore: Math.round(holderScore)
      }
    };
  };

  // Detect suspicious patterns
  const detectSuspiciousPatterns = () => {
    if (!report) return [];
    const alerts: Array<{ type: 'critical' | 'warning' | 'info'; message: string; flagged?: boolean }> = [];
    const nonLPHolders = report.holders.filter(h => !h.isLiquidityPool);
    
    // Dev wallet detection
    if (report.potentialDevWallet) {
      const devFlag = walletFlags[report.potentialDevWallet.address];
      alerts.push({
        type: devFlag?.flag === 'dev' ? 'info' : 'warning',
        message: `Potential Dev: ${truncateAddress(report.potentialDevWallet.address)} holds ${report.potentialDevWallet.percentageOfSupply.toFixed(1)}% - ${report.potentialDevWallet.reason}`,
        flagged: devFlag?.flag === 'dev'
      });
    }
    
    // Single wallet >10%
    const largeHolders = nonLPHolders.filter(h => h.percentageOfSupply > 10);
    largeHolders.forEach(h => {
      alerts.push({
        type: 'warning',
        message: `Wallet ${truncateAddress(h.owner)} holds ${h.percentageOfSupply.toFixed(1)}% of supply`
      });
    });
    
    // Top 3 combined
    const top3 = nonLPHolders.slice(0, 3);
    const top3Percentage = top3.reduce((sum, h) => sum + h.percentageOfSupply, 0);
    if (top3Percentage > 50) {
      alerts.push({
        type: 'critical',
        message: `Top 3 wallets control ${top3Percentage.toFixed(1)}% of supply`
      });
    }
    
    // Flagged wallets
    Object.entries(walletFlags).forEach(([address, data]) => {
      const holder = report.holders.find(h => h.owner === address);
      if (holder && !holder.isLiquidityPool && address !== report.potentialDevWallet?.address) {
        const label = data.flag === 'dev' ? 'Dev wallet' : 
                     data.flag === 'team' ? 'Team wallet' : 'Suspicious wallet';
        alerts.push({
          type: 'info',
          message: `${label} holds ${holder.percentageOfSupply.toFixed(1)}% of supply`,
          flagged: true
        });
      }
    });
    
    return alerts;
  };

  const handleFlagWallet = (address: string) => {
    setSelectedWallet(address);
    setFlagModalOpen(true);
  };

  const setWalletFlag = (flag: 'dev' | 'team' | 'suspicious' | null) => {
    if (!selectedWallet) return;
    
    if (flag === null) {
      const newFlags = { ...walletFlags };
      delete newFlags[selectedWallet];
      setWalletFlags(newFlags);
    } else {
      setWalletFlags({
        ...walletFlags,
        [selectedWallet]: { flag, timestamp: Date.now() }
      });
    }
    
    setFlagModalOpen(false);
    setSelectedWallet(null);
    
    toast({
      title: flag ? "Wallet Flagged" : "Flag Removed",
      description: flag ? `Wallet marked as ${flag}` : "Wallet flag cleared"
    });
  };

  const getFlagBadge = (address: string) => {
    const flag = walletFlags[address];
    if (!flag) return null;
    
    const badgeConfig = {
      dev: { label: 'Dev', className: 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30' },
      team: { label: 'Team', className: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30' },
      suspicious: { label: 'Sus', className: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30' }
    };
    
    const config = badgeConfig[flag.flag];
    return (
      <Badge variant="outline" className={`text-xs ${config.className}`}>
        <Flag className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
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
                        className="w-12 h-12 md:w-14 md:h-14 rounded-full flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-base md:text-lg font-bold text-yellow-600 dark:text-yellow-500">
                          ${tokenData.metadata.symbol || 'UNK'}
                        </span>
                        <span className="text-base md:text-lg font-bold text-yellow-600 dark:text-yellow-500">
                          {tokenData.metadata.name || 'Unknown Token'}
                        </span>
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
                        <p className="text-sm md:text-base text-muted-foreground line-clamp-2">
                          "{tokenData.metadata.description}"
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground break-all">
                        Decimals: {tokenData.metadata.decimals} | Mint: {tokenData.metadata.mint}
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

              {/* Stability Score Card */}
              {(() => {
                const stabilityData = calculateStabilityScore();
                if (!stabilityData) return null;
                
                const { score, emoji, label, riskLevel, whalePercentage, breakdown } = stabilityData;
                const top10Stats = calculateTop10Stats();
                const lpAnalysis = calculateLPAnalysis();
                
                const getBgColor = () => {
                  if (riskLevel === 'low') return 'bg-green-500/10 border-green-500/30';
                  if (riskLevel === 'medium') return 'bg-yellow-500/10 border-yellow-500/30';
                  return 'bg-red-500/10 border-red-500/30';
                };
                
                const getTextColor = () => {
                  if (riskLevel === 'low') return 'text-green-700 dark:text-green-300';
                  if (riskLevel === 'medium') return 'text-yellow-700 dark:text-yellow-300';
                  return 'text-red-700 dark:text-red-300';
                };
                
                const getStars = (value: number, max: number) => {
                  const percentage = (value / max) * 100;
                  if (percentage >= 90) return '⭐⭐⭐⭐⭐';
                  if (percentage >= 75) return '⭐⭐⭐⭐';
                  if (percentage >= 50) return '⭐⭐⭐';
                  if (percentage >= 25) return '⭐⭐';
                  return '⭐';
                };
                
                return (
                  <Card className={`mb-6 border-2 ${getBgColor()}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="text-4xl">{emoji}</div>
                        <div className="flex-1">
                          <CardTitle className={`text-xl ${getTextColor()}`}>
                            {label}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            Token Distribution Analysis
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Score Display */}
                        <div className="text-center py-4">
                          <div className="flex items-center justify-center gap-2 mb-3">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <span className="text-sm font-medium text-muted-foreground">
                              Stability Score
                            </span>
                          </div>
                          <div className="text-5xl font-bold text-primary mb-2">
                            {score}
                          </div>
                          <div className="text-muted-foreground text-sm">out of 100</div>
                          <div className="max-w-xs mx-auto mt-4">
                            <Progress value={score} className="h-3" />
                          </div>
                        </div>
                        
                        {/* Score Breakdown */}
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold mb-3">Score Breakdown</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                Whale concentration: {whalePercentage.toFixed(1)}%
                              </span>
                              <span className="font-medium">
                                {getStars(breakdown.whaleScore, 40)} ({breakdown.whaleScore}/40)
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                Top 10 holders: {top10Stats.cumulativePercentage.toFixed(1)}%
                              </span>
                              <span className="font-medium">
                                {getStars(breakdown.distributionScore, 30)} ({breakdown.distributionScore}/30)
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                LP percentage: {lpAnalysis.lpPercentage.toFixed(1)}%
                              </span>
                              <span className="font-medium">
                                {getStars(breakdown.lpScore, 20)} ({breakdown.lpScore}/20)
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                Holder count: {report.totalHolders.toLocaleString()}
                              </span>
                              <span className="font-medium">
                                {getStars(breakdown.holderCountScore, 10)} ({breakdown.holderCountScore}/10)
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Distribution Quality Summary */}
                        <div className="border-t pt-4">
                          <div className={`text-sm font-medium ${getTextColor()}`}>
                            Distribution quality: {
                              score >= 70 ? 'Excellent' :
                              score >= 50 ? 'Good' :
                              score >= 30 ? 'Fair' :
                              'Poor'
                            }
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {score >= 70 && 'Strong community ownership with minimal concentration risk.'}
                            {score >= 50 && score < 70 && 'Moderate distribution with some whale presence.'}
                            {score >= 30 && score < 50 && 'Uneven distribution may pose risks.'}
                            {score < 30 && 'High concentration risk - proceed with caution.'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Functional Wallets Header */}
              <div className="mb-4 p-4 bg-primary/10 rounded-lg border-2 border-primary/30">
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-primary">
                    {filteredHolders.length.toLocaleString()}
                  </div>
                  <div className="text-sm md:text-base font-semibold text-foreground">
                    Functional Wallets above $1
                  </div>
                </div>
              </div>

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

              {/* Security Alerts Card */}
              {(() => {
                const alerts = detectSuspiciousPatterns();
                if (alerts.length === 0) return null;
                
                return (
                  <div className="mb-4 md:mb-6">
                    <Card className="border-2 border-orange-500/30 bg-orange-500/5">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-orange-500" />
                          Security Alerts
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {alerts.map((alert, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg text-sm ${
                              alert.type === 'critical' 
                                ? 'bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300'
                                : alert.type === 'warning'
                                ? 'bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-300'
                                : 'bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {alert.flagged && <Flag className="inline h-3 w-3 mr-1" />}
                            {alert.message}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Top 10 Holders Analysis */}
              {(() => {
                const { top10, cumulativePercentage } = calculateTop10Stats();
                if (top10.length === 0) return null;
                
                return (
                  <div className="mb-4 md:mb-6">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Shield className="h-5 w-5" />
                          Top 10 Holders Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
                          <div className="text-2xl font-bold text-primary">
                            {cumulativePercentage.toFixed(1)}%
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Top 10 wallets hold {cumulativePercentage.toFixed(1)}% of total supply
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          {top10.map((holder, idx) => (
                            <div key={holder.owner} className="flex items-center gap-2">
                              <div className="text-xs text-muted-foreground w-6">#{idx + 1}</div>
                              <div className="flex-1 bg-muted/30 rounded-full h-6 relative overflow-hidden">
                                <div
                                  className="absolute inset-y-0 left-0 bg-primary/70 transition-all"
                                  style={{ width: `${Math.min(holder.percentageOfSupply, 100)}%` }}
                                />
                                <div className="absolute inset-0 flex items-center justify-between px-2 text-xs">
                                  <span className="font-mono">{truncateAddress(holder.owner)}</span>
                                  <span className="font-semibold">{holder.percentageOfSupply.toFixed(2)}%</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* LP vs Unlocked Supply Analysis */}
              {report.liquidityPoolsDetected > 0 && (() => {
                const { unlockedSupply, unlockedPercentage, lpPercentage } = calculateLPAnalysis();
                
                return (
                  <div className="mb-4 md:mb-6">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Liquidity vs Unlocked Supply</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="text-center p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                            <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
                              {lpPercentage.toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">In Liquidity Pools</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatBalance(report.lpBalance)} tokens
                            </div>
                          </div>
                          <div className="text-center p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                            <div className="text-xl font-bold text-green-700 dark:text-green-300">
                              {unlockedPercentage.toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">Unlocked Supply</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatBalance(unlockedSupply)} tokens
                            </div>
                          </div>
                        </div>
                        
                        <div className="w-full bg-muted/30 rounded-full h-8 relative overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-blue-500/70 flex items-center justify-center text-xs font-semibold text-white"
                            style={{ width: `${lpPercentage}%` }}
                          >
                            {lpPercentage > 10 && `LP ${lpPercentage.toFixed(1)}%`}
                          </div>
                          <div
                            className="absolute inset-y-0 bg-green-500/70 flex items-center justify-center text-xs font-semibold text-white"
                            style={{ left: `${lpPercentage}%`, width: `${unlockedPercentage}%` }}
                          >
                            {unlockedPercentage > 10 && `Unlocked ${unlockedPercentage.toFixed(1)}%`}
                          </div>
                        </div>
                        
                        <div className="mt-3 text-xs text-muted-foreground text-center">
                          Ratio: {(unlockedSupply / report.lpBalance).toFixed(2)}:1 (Unlocked:LP)
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* First 10 Buyers (including LP and Dev) */}
              {(() => {
                const devWallet = report.potentialDevWallet?.address;
                
                // Build the display list: LP first, then Dev, then first 10 regular buyers
                const displayList = [];
                
                // Add LP wallet(s) as position 1
                const lpWallets = report.holders.filter(h => h.isLiquidityPool);
                if (lpWallets.length > 0) {
                  lpWallets.forEach((lp, idx) => {
                    displayList.push({
                      ...lp,
                      displayLabel: lpWallets.length > 1 ? `LP${idx + 1}` : 'LP',
                      position: displayList.length + 1
                    });
                  });
                }
                
                // Add Dev wallet as position 2 (or after LPs)
                if (devWallet) {
                  const devWalletData = report.holders.find(h => h.owner === devWallet);
                  if (devWalletData) {
                    displayList.push({
                      ...devWalletData,
                      displayLabel: 'DEV',
                      position: displayList.length + 1
                    });
                  }
                }
                
                // Add first 10 regular buyers (excluding LP and Dev)
                const regularBuyers = report.holders
                  .filter(h => !h.isLiquidityPool && h.owner !== devWallet)
                  .slice(0, 10);
                
                regularBuyers.forEach((buyer, idx) => {
                  displayList.push({
                    ...buyer,
                    displayLabel: `${idx + 1}`,
                    position: displayList.length + 1
                  });
                });
                
                if (displayList.length === 0) return null;
                
                return (
                  <div className="mb-4 md:mb-6">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">First 10 Buyers (including LP & Dev)</CardTitle>
                        <p className="text-xs text-muted-foreground">Early investors including liquidity pools and potential Dev wallet</p>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs md:text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left p-2">#</th>
                                <th className="text-left p-2">Wallet</th>
                                <th className="text-right p-2">Token Balance</th>
                                <th className="text-right p-2">% Supply</th>
                                <th className="text-right p-2">USD Value</th>
                                <th className="text-center p-2">Social</th>
                              </tr>
                            </thead>
                            <tbody>
                              {displayList.map((holder) => (
                                <tr key={holder.owner} className="border-b hover:bg-muted/20">
                                  <td className="p-2 font-mono">
                                    {holder.displayLabel === 'LP' || holder.displayLabel.startsWith('LP') ? (
                                      <span className="font-bold text-yellow-500">#{holder.displayLabel}</span>
                                    ) : holder.displayLabel === 'DEV' ? (
                                      <span className="font-bold text-purple-500">#{holder.displayLabel}</span>
                                    ) : (
                                      `#${holder.displayLabel}`
                                    )}
                                  </td>
                                  <td className="p-2">
                                    <a 
                                      href={`https://solscan.io/account/${holder.owner}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-primary hover:underline"
                                    >
                                      {truncateAddress(holder.owner)}
                                    </a>
                                  </td>
                                  <td className="p-2 text-right font-mono">{Math.floor(holder.balance).toLocaleString()}</td>
                                  <td className="p-2 text-right font-semibold">{holder.percentageOfSupply.toFixed(2)}%</td>
                                  <td className="p-2 text-right text-green-600 dark:text-green-400 font-medium">
                                    ${holder.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-2 text-center">
                                    <a 
                                      href={`https://solscan.io/account/${holder.owner}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 hover:text-blue-600 text-xs"
                                      title="View on Solscan to check for linked Twitter/X account"
                                    >
                                      View
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          💡 Tip: Click "View" to check Solscan for any linked Twitter/X accounts
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

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
              <CardTitle className="text-base md:text-lg">
                Holders List ({filteredHolders.length} wallets) - excluding Small and Dust Wallets for a better SnapShot!
              </CardTitle>
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
                        <TableHead className="text-xs w-20">Flag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHolders.map((holder) => (
                        <TableRow key={holder.owner}>
                          <TableCell className="font-mono text-xs">#{holder.rank}</TableCell>
                          <TableCell className="font-mono text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => navigator.clipboard.writeText(holder.owner)}
                                className="hover:text-muted-foreground transition-colors cursor-pointer text-left"
                                title="Click to copy full address"
                              >
                                {truncateAddress(holder.owner)}
                              </button>
                              {getFlagBadge(holder.owner)}
                            </div>
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
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleFlagWallet(holder.owner)}
                              className="h-7 w-7 p-0"
                            >
                              <Flag className="h-3 w-3" />
                            </Button>
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
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-sm font-bold">#{holder.rank}</div>
                          {getFlagBadge(holder.owner)}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-sm font-bold text-green-600">
                            ${(holder.usdValue || 0).toFixed(2)}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleFlagWallet(holder.owner)}
                            className="h-7 w-7 p-0"
                          >
                            <Flag className="h-3 w-3" />
                          </Button>
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

      {/* Flag Wallet Modal */}
      <Dialog open={flagModalOpen} onOpenChange={setFlagModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedWallet && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Wallet Address</div>
                <div className="font-mono text-sm break-all">{selectedWallet}</div>
              </div>
            )}
            
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start border-red-500/30 hover:bg-red-500/10"
                onClick={() => setWalletFlag('dev')}
              >
                <Flag className="h-4 w-4 mr-2 text-red-500" />
                Mark as Dev Wallet
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start border-blue-500/30 hover:bg-blue-500/10"
                onClick={() => setWalletFlag('team')}
              >
                <Flag className="h-4 w-4 mr-2 text-blue-500" />
                Mark as Team Wallet
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start border-orange-500/30 hover:bg-orange-500/10"
                onClick={() => setWalletFlag('suspicious')}
              >
                <Flag className="h-4 w-4 mr-2 text-orange-500" />
                Mark as Suspicious
              </Button>
              
              {selectedWallet && walletFlags[selectedWallet] && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-muted-foreground/30"
                  onClick={() => setWalletFlag(null)}
                >
                  Clear Flag
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}