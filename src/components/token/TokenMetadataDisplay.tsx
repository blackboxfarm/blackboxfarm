import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Shield, ShieldCheck, TrendingUp, TrendingDown, Zap } from "lucide-react";

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  totalSupply?: number;
  verified?: boolean;
  image?: string;
  description?: string;
  uri?: string;
  isPumpFun?: boolean;
}

interface PriceInfo {
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  dexUrl?: string;
}

interface TokenMetadataDisplayProps {
  metadata: TokenMetadata;
  priceInfo: PriceInfo | null;
  isLoading?: boolean;
  compact?: boolean;
}

export function TokenMetadataDisplay({ 
  metadata, 
  priceInfo, 
  isLoading = false, 
  compact = false 
}: TokenMetadataDisplayProps) {
  if (isLoading) {
    return <TokenMetadataSkeleton compact={compact} />;
  }

  const formatPrice = (price: number) => {
    if (price < 0.001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(4)}`;
  };

  const formatLargeNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const isPositiveChange = priceInfo ? priceInfo.priceChange24h >= 0 : null;

  if (compact) {
    return (
      <div className="space-y-2">
        {metadata.isPumpFun && (
          <Alert>
            <Zap className="h-4 w-4" />
            <AlertDescription>
              This appears to be a pump.fun token currently on the bonding curve. Price data may be limited.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-3">
          {(metadata.image || metadata.logoURI) && (
            <img 
              src={metadata.image || metadata.logoURI} 
              alt={metadata.symbol}
              className="w-8 h-8 rounded-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{metadata.name}</span>
              <Badge variant="outline" className="text-xs">
                {metadata.symbol}
              </Badge>
              {metadata.isPumpFun && (
                <Badge variant="secondary" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Pump.fun
                </Badge>
              )}
              {metadata.verified && (
                <ShieldCheck className="h-4 w-4 text-green-500" />
              )}
            </div>
            {priceInfo ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{formatPrice(priceInfo.priceUsd)}</span>
                {isPositiveChange !== null && (
                  <span className={`flex items-center gap-1 ${
                    isPositiveChange ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {isPositiveChange ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(priceInfo.priceChange24h).toFixed(2)}%
                  </span>
                )}
              </div>
            ) : metadata.isPumpFun ? (
              <div className="text-sm text-muted-foreground">
                No price data (bonding curve)
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No price data available
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {metadata.isPumpFun && (
            <Alert>
              <Zap className="h-4 w-4" />
              <AlertDescription>
                This is a pump.fun token currently on the bonding curve. It may not have traditional liquidity pools yet.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex items-start gap-4">
            {(metadata.image || metadata.logoURI) && (
              <img 
                src={metadata.image || metadata.logoURI} 
                alt={metadata.symbol}
                className="w-12 h-12 rounded-full flex-shrink-0 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            
            <div className="flex-1 space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold">{metadata.name}</h3>
                  <Badge variant="outline">{metadata.symbol}</Badge>
                  {metadata.isPumpFun && (
                    <Badge variant="secondary">
                      <Zap className="h-3 w-3 mr-1" />
                      Pump.fun
                    </Badge>
                  )}
                  <div title={metadata.verified ? "Verified Token" : "Unverified Token"}>
                    {metadata.verified ? (
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                    ) : (
                      <Shield className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground font-mono">
                  {metadata.mint}
                </p>
              </div>

              {metadata.description && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Description</p>
                  <p className="text-sm leading-relaxed">{metadata.description}</p>
                </div>
              )}

              {priceInfo && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-lg font-semibold">{formatPrice(priceInfo.priceUsd)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">24h Change</p>
                  <div className={`flex items-center gap-1 text-lg font-semibold ${
                    isPositiveChange ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {isPositiveChange ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {Math.abs(priceInfo.priceChange24h).toFixed(2)}%
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Volume 24h</p>
                  <p className="text-lg font-semibold">${formatLargeNumber(priceInfo.volume24h)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Liquidity</p>
                  <p className="text-lg font-semibold">${formatLargeNumber(priceInfo.liquidity)}</p>
                </div>
              </div>
              )}

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Decimals: {metadata.decimals}</span>
                {metadata.totalSupply && (
                  <span>Supply: {formatLargeNumber(metadata.totalSupply)}</span>
                )}
                {priceInfo?.dexUrl && (
                  <a 
                    href={priceInfo.dexUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View on DEX
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TokenMetadataSkeleton({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-3">
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-4 w-16 mb-1" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}