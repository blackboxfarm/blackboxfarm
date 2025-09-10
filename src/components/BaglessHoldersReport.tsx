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
  isDustWallet: boolean;
  isSmallWallet: boolean;
  isMediumWallet: boolean;
  isLargeWallet: boolean;
  tokenAccount: string;
  rank: number;
}

interface HoldersReport {
  tokenMint: string;
  totalHolders: number;
  realWallets: number;
  largeWallets: number;
  mediumWallets: number;
  smallWallets: number;
  dustWallets: number;
  totalBalance: number;
  tokenPriceUSD: number;
  priceSource?: string;
  priceDiscoveryFailed?: boolean;
  holders: TokenHolder[];
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
  const { toast } = useToast();

  useEffect(() => {
    if (report) {
      let filtered = report.holders;
      
      if (showDustOnly) {
        filtered = filtered.filter(h => h.isDustWallet);
      } else if (showSmallOnly) {
        filtered = filtered.filter(h => h.isSmallWallet);
      } else if (showMediumOnly) {
        filtered = filtered.filter(h => h.isMediumWallet);
      } else if (showLargeOnly) {
        filtered = filtered.filter(h => h.isLargeWallet);
      } else if (showRealOnly) {
        filtered = filtered.filter(h => !h.isDustWallet && !h.isSmallWallet && !h.isMediumWallet && !h.isLargeWallet);
      }
      
      setFilteredHolders(filtered);
    }
  }, [report, showDustOnly, showSmallOnly, showMediumOnly, showLargeOnly, showRealOnly]);

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
        holder.isDustWallet ? 'Dust' : holder.isSmallWallet ? 'Small' : holder.isMediumWallet ? 'Medium' : holder.isLargeWallet ? 'Large' : 'Real',
        holder.tokenAccount
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bagless-holders-report-${new Date().toISOString().split('T')[0]}.csv`;
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
          <CardTitle>Bagless Token Holders Report</CardTitle>
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
              
              <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{report.totalHolders}</div>
                  <div className="text-sm text-muted-foreground">Total Holders</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">{report.realWallets}</div>
                  <div className="text-sm text-muted-foreground">Real (≥$50)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-500">{report.largeWallets}</div>
                  <div className="text-sm text-muted-foreground">Large ($10-$50)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-500">{report.mediumWallets}</div>
                  <div className="text-sm text-muted-foreground">Medium ($1-$5)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-500">{report.smallWallets}</div>
                  <div className="text-sm text-muted-foreground">Small (&lt;$1)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">{report.dustWallets}</div>
                  <div className="text-sm text-muted-foreground">Dust (&lt;1)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{formatBalance(report.totalBalance)}</div>
                  <div className="text-sm text-muted-foreground">Total Tokens</div>
                </div>
              </div>
              
              <div className="flex gap-2 mb-4 flex-wrap">
                <Button
                  variant={!showDustOnly && !showSmallOnly && !showMediumOnly && !showLargeOnly && !showRealOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowDustOnly(false);
                    setShowSmallOnly(false);
                    setShowMediumOnly(false);
                    setShowLargeOnly(false);
                    setShowRealOnly(false);
                  }}
                >
                  All Wallets
                </Button>
                <Button
                  variant={showRealOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowRealOnly(true);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Real (≥$50)
                </Button>
                <Button
                  variant={showLargeOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowLargeOnly(true);
                    setShowRealOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Large ($10-$50)
                </Button>
                <Button
                  variant={showMediumOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowMediumOnly(true);
                    setShowLargeOnly(false);
                    setShowRealOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Medium ($1-$5)
                </Button>
                <Button
                  variant={showSmallOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowSmallOnly(true);
                    setShowMediumOnly(false);
                    setShowLargeOnly(false);
                    setShowRealOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Small (&lt;$1)
                </Button>
                <Button
                  variant={showDustOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowDustOnly(true);
                    setShowSmallOnly(false);
                    setShowMediumOnly(false);
                    setShowLargeOnly(false);
                    setShowRealOnly(false);
                  }}
                >
                  Dust (&lt;1)
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
                        <TableCell className="font-mono">
                          {formatBalance(holder.balance)}
                        </TableCell>
                        <TableCell className="font-mono">
                          ${(holder.usdValue || 0).toFixed(4)}
                        </TableCell>
                         <TableCell>
                           <Badge variant={
                             holder.isDustWallet ? "secondary" : 
                             holder.isSmallWallet ? "outline" : 
                             holder.isMediumWallet ? "outline" :
                             holder.isLargeWallet ? "outline" : "default"
                           }>
                             {holder.isDustWallet ? "Dust" : holder.isSmallWallet ? "Small" : holder.isMediumWallet ? "Medium" : holder.isLargeWallet ? "Large" : "Real"}
                          </Badge>
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