import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ExternalLink, Shield, ShieldCheck, TrendingUp, TrendingDown, Zap, Info } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";

interface LaunchpadInfo {
  name: string;
  detected: boolean;
  confidence: string;
}

interface RaydiumPool {
  pairAddress: string;
  baseSymbol: string;
  quoteSymbol: string;
  liquidityUsd: number;
  url: string;
}

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
  launchpad?: LaunchpadInfo;
}

interface OnChainData {
  decimals: number;
  supply: string;
  isPumpFun?: boolean;
}

interface PriceInfo {
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap?: number;
  fdv?: number;
  dexUrl?: string;
  pairAddress?: string;
  dexId?: string;
}

interface TokenMetadataDisplayProps {
  metadata: TokenMetadata;
  priceInfo: PriceInfo | null;
  onChainData?: OnChainData | null;
  pools?: RaydiumPool[];
  isLoading?: boolean;
  compact?: boolean;
}

const LAUNCHPAD_LOGOS: Record<string, string> = {
  'pump.fun': '/launchpad-logos/pumpfun.png',
  'pumpfun': '/launchpad-logos/pumpfun.png',
  'bonk.fun': '/launchpad-logos/bonkfun.png',
  'bonkfun': '/launchpad-logos/bonkfun.png',
  'bags.fm': '/launchpad-logos/bagsfm.png',
  'bagsfm': '/launchpad-logos/bagsfm.png',
  'raydium': '/launchpad-logos/raydium.png',
};

export function TokenMetadataDisplay({ 
  metadata, 
  priceInfo,
  onChainData,
  pools = [],
  isLoading = false, 
  compact = false 
}: TokenMetadataDisplayProps) {
  if (isLoading) {
    return <TokenMetadataSkeleton compact={compact} />;
  }

  // Fallback resolver for image/description via metadata.uri
  const [resolvedImage, setResolvedImage] = useState<string | undefined>();
  const [resolvedDescription, setResolvedDescription] = useState<string | undefined>();
  const normalizeUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('ipfs://')) return `https://cloudflare-ipfs.com/ipfs/${url.replace('ipfs://','')}`;
    if (url.startsWith('ar://')) return `https://arweave.net/${url.slice(5)}`;
    return url;
  };
  const displayImage = normalizeUrl(metadata.image || metadata.logoURI || resolvedImage);
  const descriptionText = metadata.description || resolvedDescription;

  useEffect(() => {
    const needsImage = !metadata.image && !metadata.logoURI;
    const needsDescription = !metadata.description;
    if (metadata.uri && (needsImage || needsDescription)) {
      try {
        fetch(metadata.uri)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('uri fetch failed'))))
          .then((json) => {
            const img = normalizeUrl(
              json?.image || json?.logo || json?.image_url || json?.icon || json?.picture || json?.properties?.files?.[0]?.uri
            );
            const desc = json?.description || json?.data?.description;
            if (img) setResolvedImage(img);
            if (desc) setResolvedDescription(desc);
          })
          .catch(() => {/* ignore */});
      } catch { /* ignore */ }
    }
  }, [metadata.mint, metadata.uri, metadata.image, metadata.logoURI, metadata.description]);

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
        <div className="flex items-center gap-3">
          {displayImage && (
            <img 
              src={displayImage} 
              alt={`${metadata.symbol} token logo`}
              loading="lazy"
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
                No price data available
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
          
          <div className="flex items-start gap-6">
            {displayImage && (
              <img 
                src={displayImage} 
                alt={`${metadata.symbol} token logo`}
                loading="lazy"
                className="w-32 h-32 rounded-2xl flex-shrink-0 object-cover border-4 border-primary/20 shadow-xl"
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

              {descriptionText && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Description</p>
                  <p className="text-sm leading-relaxed">{descriptionText}</p>
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

                {priceInfo.marketCap && priceInfo.marketCap > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Market Cap</p>
                    <p className="text-lg font-semibold">${formatLargeNumber(priceInfo.marketCap)}</p>
                  </div>
                )}

                {priceInfo.fdv && priceInfo.fdv > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">FDV</p>
                    <p className="text-lg font-semibold">${formatLargeNumber(priceInfo.fdv)}</p>
                  </div>
                )}
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

              {/* COMPREHENSIVE METADATA DUMP */}
              <Separator className="my-4" />
              
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  <h4 className="font-semibold">Complete Metadata</h4>
                </div>

                {/* Launchpad Information */}
                {metadata.launchpad && metadata.launchpad.detected && (
                  <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      {LAUNCHPAD_LOGOS[metadata.launchpad.name.toLowerCase()] && (
                        <img 
                          src={LAUNCHPAD_LOGOS[metadata.launchpad.name.toLowerCase()]}
                          alt={metadata.launchpad.name}
                          className="w-8 h-8 rounded object-contain"
                        />
                      )}
                      <div>
                        <p className="text-sm font-medium">Launchpad</p>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{metadata.launchpad.name}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Token Identity */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Token Name</p>
                    <p className="font-mono text-sm">{metadata.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Symbol</p>
                    <p className="font-mono text-sm">{metadata.symbol}</p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Mint Address</p>
                    <p className="font-mono text-xs break-all">{metadata.mint}</p>
                  </div>
                </div>

                {/* Images & Assets - LARGE DISPLAY */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground uppercase tracking-wide">Token Images</p>
                  <div className="flex flex-wrap gap-6">
                    {metadata.image && (
                      <div className="space-y-2">
                        <img 
                          src={metadata.image} 
                          alt="Token Image" 
                          className="w-32 h-32 rounded-lg border-2 border-primary/20 object-cover shadow-lg hover:scale-105 transition-transform cursor-pointer" 
                          onClick={() => window.open(metadata.image, '_blank')}
                        />
                        <p className="text-xs text-muted-foreground text-center font-medium">Primary Image</p>
                        <a 
                          href={metadata.image}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline block text-center break-all px-2"
                        >
                          {metadata.image}
                        </a>
                      </div>
                    )}
                    {metadata.logoURI && metadata.logoURI !== metadata.image && (
                      <div className="space-y-2">
                        <img 
                          src={metadata.logoURI} 
                          alt="Logo URI" 
                          className="w-32 h-32 rounded-lg border-2 border-primary/20 object-cover shadow-lg hover:scale-105 transition-transform cursor-pointer" 
                          onClick={() => window.open(metadata.logoURI, '_blank')}
                        />
                        <p className="text-xs text-muted-foreground text-center font-medium">Logo URI</p>
                        <a 
                          href={metadata.logoURI}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline block text-center break-all px-2"
                        >
                          {metadata.logoURI}
                        </a>
                      </div>
                    )}
                    {!metadata.image && !metadata.logoURI && (
                      <p className="text-sm text-muted-foreground">No images found for this token</p>
                    )}
                  </div>
                </div>

                {/* Metadata URI */}
                {metadata.uri && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Metadata URI</p>
                    <a 
                      href={metadata.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs break-all text-primary hover:underline flex items-center gap-1"
                    >
                      {metadata.uri}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                )}

                {/* On-Chain Data */}
                {onChainData && (
                  <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                    <p className="text-sm font-medium">On-Chain Data</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Decimals</p>
                        <p className="font-mono">{onChainData.decimals}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Supply</p>
                        <p className="font-mono">{onChainData.supply || 'Unknown'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Raydium Pools */}
                {pools && pools.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Raydium Pools ({pools.length})</p>
                    <div className="space-y-2">
                      {pools.map((pool, idx) => (
                        <div key={pool.pairAddress} className="p-3 bg-muted/30 rounded-lg space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <img 
                                src="/launchpad-logos/raydium.png"
                                alt="Raydium"
                                className="w-5 h-5"
                              />
                              <span className="font-mono text-sm">
                                {pool.baseSymbol}/{pool.quoteSymbol}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              ${formatLargeNumber(pool.liquidityUsd)} Liquidity
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono break-all">
                            {pool.pairAddress}
                          </p>
                          {pool.url && (
                            <a 
                              href={pool.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                            >
                              View Pool
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Verification Status */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Verification Status</p>
                  <div className="flex items-center gap-2">
                    {metadata.verified ? (
                      <>
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600">Verified Token</span>
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm text-yellow-600">Unverified Token</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Raw Data */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Raw Data</p>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <pre className="text-xs font-mono overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                      {JSON.stringify({ metadata, priceInfo, onChainData, pools }, null, 2)}
                    </pre>
                  </div>
                </div>
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