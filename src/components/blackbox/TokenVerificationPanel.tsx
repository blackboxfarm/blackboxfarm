import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, TrendingUp, TrendingDown, DollarSign, Users, Droplets } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  totalSupply?: number;
  verified?: boolean;
}

interface PriceInfo {
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  dexUrl: string;
}

interface OnChainData {
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

interface TokenData {
  metadata: TokenMetadata;
  priceInfo: PriceInfo | null;
  onChainData: OnChainData;
}

interface RecentTrade {
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: number;
  txHash: string;
}

interface TokenVerificationPanelProps {
  tokenAddress: string;
  className?: string;
}

export function TokenVerificationPanel({ tokenAddress, className }: TokenVerificationPanelProps) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    if (tokenAddress) {
      fetchTokenData();
      // Auto-refresh every 30 seconds
      const interval = setInterval(fetchTokenData, 30000);
      return () => clearInterval(interval);
    }
  }, [tokenAddress]);

  const fetchTokenData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('token-metadata', {
        body: { tokenMint: tokenAddress }
      });

      if (error) throw error;

      if (data.success) {
        setTokenData(data);
        await fetchRecentTrades();
      } else {
        throw new Error(data.error || 'Failed to fetch token data');
      }
    } catch (error: any) {
      toast({
        title: "Error fetching token data",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setLastRefresh(new Date());
    }
  };

  const fetchRecentTrades = async () => {
    try {
      // Mock recent trades data - in production, integrate with DexScreener or Birdeye API
      const mockTrades: RecentTrade[] = [
        { type: 'buy', amount: 1250, price: 0.0045, timestamp: Date.now() - 120000, txHash: 'abc123' },
        { type: 'sell', amount: 890, price: 0.0043, timestamp: Date.now() - 180000, txHash: 'def456' },
        { type: 'buy', amount: 2100, price: 0.0044, timestamp: Date.now() - 240000, txHash: 'ghi789' },
        { type: 'buy', amount: 560, price: 0.0042, timestamp: Date.now() - 300000, txHash: 'jkl012' },
        { type: 'sell', amount: 1800, price: 0.0041, timestamp: Date.now() - 360000, txHash: 'mno345' },
        { type: 'buy', amount: 750, price: 0.0043, timestamp: Date.now() - 420000, txHash: 'pqr678' },
        { type: 'sell', amount: 920, price: 0.0040, timestamp: Date.now() - 480000, txHash: 'stu901' },
        { type: 'buy', amount: 1350, price: 0.0041, timestamp: Date.now() - 540000, txHash: 'vwx234' },
        { type: 'buy', amount: 680, price: 0.0039, timestamp: Date.now() - 600000, txHash: 'yzab567' },
        { type: 'sell', amount: 1100, price: 0.0038, timestamp: Date.now() - 660000, txHash: 'cdef890' }
      ];
      setRecentTrades(mockTrades);
    } catch (error) {
      console.error('Error fetching recent trades:', error);
    }
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
    return num.toFixed(decimals);
  };

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  if (!tokenAddress) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center text-muted-foreground">
          <p>Enter a token address to verify and view live data</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !tokenData) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p>Loading token data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!tokenData) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center text-destructive">
          <p>Failed to load token data. Please check the token address and try again.</p>
          <Button onClick={fetchTokenData} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { metadata, priceInfo, onChainData } = tokenData;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Token Overview */}
      <Card className="overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                {metadata.logoURI ? (
                  <img 
                    src={metadata.logoURI} 
                    alt={metadata.name}
                    className="h-16 w-16 rounded-full border-2 border-primary/20"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-xl">
                    {metadata.symbol.charAt(0)}
                  </div>
                )}
                {metadata.verified && (
                  <div className="absolute -top-1 -right-1 h-6 w-6 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{metadata.name}</h2>
                <div className="flex items-center gap-2">
                  <Badge variant={metadata.verified ? "default" : "secondary"}>
                    {metadata.symbol}
                  </Badge>
                  {metadata.verified && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Verified
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <Button 
                onClick={fetchTokenData} 
                disabled={isLoading}
                size="sm"
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Last: {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Price and Market Data */}
          {priceInfo && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-background/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-sm">Price (USD)</span>
                </div>
                <p className="text-2xl font-bold">${priceInfo.priceUsd.toFixed(6)}</p>
                <div className={`flex items-center gap-1 text-sm ${
                  priceInfo.priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {priceInfo.priceChange24h >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(priceInfo.priceChange24h).toFixed(2)}%
                </div>
              </div>
              
              <div className="bg-background/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="h-4 w-4" />
                  <span className="text-sm">Volume 24h</span>
                </div>
                <p className="text-xl font-semibold">${formatNumber(priceInfo.volume24h)}</p>
              </div>
              
              <div className="bg-background/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Droplets className="h-4 w-4" />
                  <span className="text-sm">Liquidity</span>
                </div>
                <p className="text-xl font-semibold">${formatNumber(priceInfo.liquidity)}</p>
              </div>
              
              <div className="bg-background/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <span className="text-sm">Market Cap</span>
                </div>
                <p className="text-xl font-semibold">
                  ${formatNumber((metadata.totalSupply || 0) * priceInfo.priceUsd)}
                </p>
              </div>
            </div>
          )}

          {/* On-Chain Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-background/30 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Token Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Decimals:</span>
                  <span className="font-mono">{onChainData.decimals}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Supply:</span>
                  <span className="font-mono">{formatNumber(metadata.totalSupply || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mint Authority:</span>
                  <span className="font-mono text-xs">
                    {onChainData.mintAuthority ? 
                      `${onChainData.mintAuthority.slice(0, 6)}...${onChainData.mintAuthority.slice(-4)}` : 
                      'None'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Freeze Authority:</span>
                  <span className="font-mono text-xs">
                    {onChainData.freezeAuthority ? 
                      `${onChainData.freezeAuthority.slice(0, 6)}...${onChainData.freezeAuthority.slice(-4)}` : 
                      'None'
                    }
                  </span>
                </div>
              </div>
            </div>
            
            <div className="bg-background/30 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Contract Address</h3>
              <div className="space-y-2">
                <div className="bg-muted p-2 rounded font-mono text-xs break-all">
                  {metadata.mint}
                </div>
                {priceInfo?.dexUrl && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => window.open(priceInfo.dexUrl, '_blank')}
                    className="w-full"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on DexScreener
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Trading Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Recent Trading Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentTrades.map((trade, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge 
                    variant={trade.type === 'buy' ? "default" : "destructive"}
                    className="min-w-[50px] justify-center"
                  >
                    {trade.type.toUpperCase()}
                  </Badge>
                  <div>
                    <p className="font-medium">{formatNumber(trade.amount)} {metadata.symbol}</p>
                    <p className="text-sm text-muted-foreground">
                      ${trade.price.toFixed(6)} per token
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    ${(trade.amount * trade.price).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeAgo(trade.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}