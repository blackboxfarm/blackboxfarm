import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeveloperRiskBadge } from "./DeveloperRiskBadge";
import { ExternalLink, Shield, ShieldCheck, TrendingUp, TrendingDown, Zap, Clock, Twitter, Globe, Send } from "lucide-react";
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
  creatorWallet?: string;
  tokenAge?: number; // Age in hours
  twitterUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
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
  compact = false,
  creatorWallet,
  tokenAge,
  twitterUrl,
  telegramUrl,
  websiteUrl
}: TokenMetadataDisplayProps) {
  if (isLoading) {
    return <TokenMetadataSkeleton compact={compact} />;
  }

  // Normalize IPFS/Arweave URLs
  const normalizeUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('ipfs://')) return `https://cloudflare-ipfs.com/ipfs/${url.replace('ipfs://','')}`;
    if (url.startsWith('ar://')) return `https://arweave.net/${url.slice(5)}`;
    return url;
  };
  const displayImage = normalizeUrl(metadata.image || metadata.logoURI);
  const descriptionText = metadata.description;

  const formatPrice = (price: number) => {
    // Always human-readable, never scientific notation
    if (price === 0) return '$0';
    if (price < 0.0000001) return `$${price.toFixed(12).replace(/\.?0+$/, '')}`;
    if (price < 0.000001) return `$${price.toFixed(10).replace(/\.?0+$/, '')}`;
    if (price < 0.00001) return `$${price.toFixed(9).replace(/\.?0+$/, '')}`;
    if (price < 0.0001) return `$${price.toFixed(8).replace(/\.?0+$/, '')}`;
    if (price < 0.001) return `$${price.toFixed(7).replace(/\.?0+$/, '')}`;
    if (price < 0.01) return `$${price.toFixed(6).replace(/\.?0+$/, '')}`;
    if (price < 1) return `$${price.toFixed(4).replace(/\.?0+$/, '')}`;
    return `$${price.toFixed(2)}`;
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
      <Card className="overflow-hidden">
        <CardContent className="p-2 md:p-4">
          <div className="flex items-center gap-3">
          <img 
            src={displayImage || '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png'} 
            alt={displayImage ? `${metadata.symbol} token logo` : 'Token placeholder'}
            loading="lazy"
            className={`w-8 h-8 rounded-full object-cover ${!displayImage ? 'opacity-40 grayscale' : ''}`}
            onError={(e) => {
              if (e.currentTarget.src !== '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png') {
                e.currentTarget.src = '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png';
                e.currentTarget.className = 'w-8 h-8 rounded-full object-cover opacity-40 grayscale';
              }
            }}
          />
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
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 md:p-6">
        <div className="space-y-3 md:space-y-4">
          
          {/* Mobile: Image left, Symbol + Launchpad right stacked */}
          <div className="flex gap-3 md:gap-6">
            <img 
              src={displayImage || '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png'} 
              alt={displayImage ? `${metadata.symbol} token logo` : 'Token placeholder'}
              loading="lazy"
              className={`w-20 h-20 md:w-32 md:h-32 rounded-2xl flex-shrink-0 object-cover border-4 border-primary/20 shadow-xl ${!displayImage ? 'opacity-40 grayscale' : ''}`}
              onError={(e) => {
                if (e.currentTarget.src !== '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png') {
                  e.currentTarget.src = '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png';
                  e.currentTarget.className = 'w-20 h-20 md:w-32 md:h-32 rounded-2xl flex-shrink-0 object-cover border-4 border-primary/20 shadow-xl opacity-40 grayscale';
                }
              }}
            />
            
            <div className="flex-1 space-y-2">
              {/* Symbol with $ */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-sm md:text-base font-bold px-3 py-1">
                  ${metadata.symbol}
                </Badge>
                <div title={metadata.verified ? "Verified Token" : "Unverified Token"}>
                  {metadata.verified ? (
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                  ) : (
                    <Shield className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
              </div>

              {/* Launchpad Info */}
              {metadata.launchpad && metadata.launchpad.detected && (
                <div className="flex items-center gap-2">
                  {LAUNCHPAD_LOGOS[metadata.launchpad.name.toLowerCase()] && (
                    <img 
                      src={LAUNCHPAD_LOGOS[metadata.launchpad.name.toLowerCase()]}
                      alt={metadata.launchpad.name}
                      className="w-5 h-5 md:w-6 md:h-6 rounded object-contain"
                    />
                  )}
                  <span className="text-xs md:text-sm font-medium">{metadata.launchpad.name}</span>
                </div>
              )}
              {metadata.isPumpFun && !metadata.launchpad?.detected && (
                <Badge variant="secondary" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Pump.fun
                </Badge>
              )}

              {creatorWallet && (
                <DeveloperRiskBadge creatorWallet={creatorWallet} showDetails />
              )}
            </div>
          </div>

          {/* Token Address */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Token Address</p>
            <p className="text-xs md:text-sm text-muted-foreground font-mono break-all">
              {metadata.mint}
            </p>
          </div>

          {/* Token Name */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Token Name</p>
            <h3 className="text-base md:text-lg font-semibold">{metadata.name}</h3>
          </div>

          {/* Token Description */}
          {descriptionText && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Description</p>
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

          {/* Links Row - Launchpad, Padre, DexScreener, Socials, Age */}
          <div className="flex items-center gap-3 text-sm flex-wrap">
                {/* Age badge */}
                {tokenAge !== undefined && (
                  <Badge variant="outline" className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" />
                    {tokenAge < 1 
                      ? `${Math.round(tokenAge * 60)}m old`
                      : tokenAge < 24 
                        ? `${Math.round(tokenAge)}h old`
                        : `${Math.round(tokenAge / 24)}d old`
                    }
                  </Badge>
                )}

                {/* Launchpad link with icon */}
                {metadata.launchpad?.detected && metadata.launchpad.name.toLowerCase().includes('pump') && (
                  <a
                    href={`https://pump.fun/coin/${metadata.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title="View on Pump.fun"
                  >
                    <img src="/launchpad-logos/pumpfun.png" alt="Pump.fun" className="h-5 w-5 rounded" />
                  </a>
                )}
                {metadata.launchpad?.detected && metadata.launchpad.name.toLowerCase().includes('bonk') && (
                  <a
                    href={`https://bonk.fun/token/${metadata.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title="View on Bonk.fun"
                  >
                    <img src="/launchpad-logos/bonkfun.png" alt="Bonk.fun" className="h-5 w-5 rounded" />
                  </a>
                )}
                {metadata.launchpad?.detected && metadata.launchpad.name.toLowerCase().includes('bags') && (
                  <a
                    href={`https://bags.fm/token/${metadata.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title="View on Bags.fm"
                  >
                    <img src="/launchpad-logos/bagsfm.png" alt="Bags.fm" className="h-5 w-5 rounded" />
                  </a>
                )}
                {metadata.isPumpFun && !metadata.launchpad?.detected && (
                  <a
                    href={`https://pump.fun/coin/${metadata.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title="View on Pump.fun"
                  >
                    <img src="/launchpad-logos/pumpfun.png" alt="Pump.fun" className="h-5 w-5 rounded" />
                  </a>
                )}

                {/* Padre.gg trading terminal */}
                <a
                  href={`https://trade.padre.gg/trade/solana/${metadata.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                  title="Trade on Padre.gg"
                >
                  <img src="https://trade.padre.gg/logo.svg" alt="Padre.gg" className="h-5 w-5" />
                </a>

                {/* DexScreener */}
                {priceInfo?.dexUrl && (
                  <a 
                    href={priceInfo.dexUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title="View on DexScreener"
                  >
                    <img src="/launchpad-logos/dexscreener.png" alt="DexScreener" className="h-5 w-5 rounded" />
                  </a>
                )}

                {/* Social links */}
                {twitterUrl && (
                  <a
                    href={twitterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                    title="Twitter/X"
                  >
                    <Twitter className="h-4 w-4" />
                  </a>
                )}
                {telegramUrl && (
                  <a
                    href={telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                    title="Telegram"
                  >
                    <Send className="h-4 w-4" />
                  </a>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-500 hover:text-blue-400 transition-colors"
                    title="Website"
                  >
                    <Globe className="h-4 w-4" />
                  </a>
                )}

                <Separator orientation="vertical" className="h-4" />

                <span className="text-muted-foreground text-xs">Decimals: {metadata.decimals}</span>
                {metadata.totalSupply && (
                  <span className="text-muted-foreground text-xs">Supply: {formatLargeNumber(metadata.totalSupply)}</span>
                )}
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