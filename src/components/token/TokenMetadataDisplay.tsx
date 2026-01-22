import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DeveloperRiskBadge } from "./DeveloperRiskBadge";
import { ExternalLink, TrendingUp, TrendingDown, Zap, Clock, CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { SocialIcon, DexScreenerIcon } from "./SocialIcon";
import { detectSocialPlatform } from "@/utils/socialPlatformDetector";
import { ShareToXButton } from "@/components/ShareToXButton";
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
  isOnCurve?: boolean;
}

interface DexStatus {
  hasDexPaid: boolean;
  hasCTO: boolean;
  activeBoosts: number;
  hasAds: boolean;
}

interface CreatorInfo {
  wallet?: string;
  balance?: number;
  balanceUsd?: number;
  bondingCurveProgress?: number;
  xAccount?: string;
  feeSplit?: { wallet1?: string; wallet2?: string; splitPercent?: number };
}

interface ShareData {
  totalHolders?: number;
  realWallets?: number;
  dustWallets?: number;
  trueWhaleWallets?: number;
  babyWhaleWallets?: number;
  superBossWallets?: number;
  kingpinWallets?: number;
  bossWallets?: number;
  largeWallets?: number;
  mediumWallets?: number;
  healthScore?: { grade: string; score: number };
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
  dexStatus?: DexStatus;
  creatorInfo?: CreatorInfo;
  shareData?: ShareData;
  shareCardPageUrl?: string;
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
  websiteUrl,
  dexStatus,
  creatorInfo,
  shareData,
  shareCardPageUrl
}: TokenMetadataDisplayProps) {
  
  if (isLoading) {
    return <TokenMetadataSkeleton compact={compact} />;
  }

  // Normalize IPFS/Arweave URLs with better gateway support
  const normalizeUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('ipfs://')) {
      const cid = url.replace('ipfs://', '');
      return `https://gateway.pinata.cloud/ipfs/${cid}`;
    }
    // Convert ipfs.io to faster gateway
    if (url.includes('ipfs.io/ipfs/')) {
      const cid = url.split('ipfs.io/ipfs/')[1];
      return `https://gateway.pinata.cloud/ipfs/${cid}`;
    }
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
          {/* Quick Snapshot Title */}
          <h3 className="text-base md:text-lg font-bold text-white">Quick Snapshot</h3>
          
          {/* 3-Column Layout: MINT IMAGE | BOX1 | BOX2 - always side by side */}
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2 md:gap-4">
            {/* MINT IMAGE */}
            <div className="flex justify-center md:justify-start">
              <img 
                src={displayImage || '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png'} 
                alt={displayImage ? `${metadata.symbol} token logo` : 'Token placeholder'}
                loading="lazy"
                className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl flex-shrink-0 object-cover border-4 border-primary/20 shadow-xl ${!displayImage ? 'opacity-40 grayscale' : ''}`}
                onError={(e) => {
                  const img = e.currentTarget;
                  const currentSrc = img.src;
                  
                  // Try alternative IPFS gateways
                  if (currentSrc.includes('gateway.pinata.cloud')) {
                    const cid = currentSrc.split('/ipfs/')[1];
                    if (cid) {
                      img.src = `https://cloudflare-ipfs.com/ipfs/${cid}`;
                      return;
                    }
                  }
                  if (currentSrc.includes('cloudflare-ipfs.com')) {
                    const cid = currentSrc.split('/ipfs/')[1];
                    if (cid) {
                      img.src = `https://ipfs.io/ipfs/${cid}`;
                      return;
                    }
                  }
                  
                  // Final fallback to placeholder
                  if (!currentSrc.includes('lovable-uploads')) {
                    img.src = '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png';
                    img.className = 'w-20 h-20 md:w-24 md:h-24 rounded-2xl flex-shrink-0 object-cover border-4 border-primary/20 shadow-xl opacity-40 grayscale';
                  }
                }}
              />
            </div>
            
            {/* BOX 1: $TOKEN, Launchpad, DEX Status */}
            <div className="space-y-2">
              {/* Token Symbol */}
              <Badge variant="outline" className="text-sm md:text-base font-bold px-3 py-1">
                ${metadata.symbol}
              </Badge>
              
              {/* Launchpad Link */}
              <div className="flex items-center gap-2 flex-wrap">
                {metadata.launchpad?.detected && metadata.launchpad.name.toLowerCase().includes('pump') && (
                  <a
                    href={`https://pump.fun/coin/${metadata.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                    title="View on Pump.fun"
                  >
                    <img src="/launchpad-logos/pumpfun.png" alt="Pump.fun" className="h-5 w-5 rounded" />
                    <span className="text-xs md:text-sm font-medium">pump.fun</span>
                  </a>
                )}
                {metadata.launchpad?.detected && metadata.launchpad.name.toLowerCase().includes('bonk') && (
                  <a
                    href={`https://bonk.fun/token/${metadata.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                    title="View on Bonk.fun"
                  >
                    <img src="/launchpad-logos/bonkfun.png" alt="Bonk.fun" className="h-5 w-5 rounded" />
                    <span className="text-xs md:text-sm font-medium">bonk.fun</span>
                  </a>
                )}
                {metadata.launchpad?.detected && metadata.launchpad.name.toLowerCase().includes('bags') && (
                  <a
                    href={`https://bags.fm/token/${metadata.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                    title="View on Bags.fm"
                  >
                    <img src="/launchpad-logos/bagsfm.png" alt="Bags.fm" className="h-5 w-5 rounded" />
                    <span className="text-xs md:text-sm font-medium">bags.fm</span>
                  </a>
                )}
                {metadata.isPumpFun && !metadata.launchpad?.detected && (
                  <a
                    href={`https://pump.fun/coin/${metadata.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                    title="View on Pump.fun"
                  >
                    <img src="/launchpad-logos/pumpfun.png" alt="Pump.fun" className="h-5 w-5 rounded" />
                    <span className="text-xs md:text-sm font-medium">pump.fun</span>
                  </a>
                )}
              </div>

              {/* DEX Status with DexScreener Icon */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {priceInfo?.dexUrl && (
                  <a 
                    href={priceInfo.dexUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center hover:opacity-80 transition-opacity"
                    title="View on DexScreener"
                  >
                    <DexScreenerIcon className="h-5 w-5" />
                  </a>
                )}
                {dexStatus?.hasDexPaid && (
                  <Badge className="text-[10px] px-1.5 py-0.5 bg-green-600 hover:bg-green-500 text-white">
                    DEX PAID
                  </Badge>
                )}
                {dexStatus?.hasCTO && (
                  <Badge className="text-[10px] px-1.5 py-0.5 bg-yellow-600 hover:bg-yellow-500 text-white">
                    CTO
                  </Badge>
                )}
                {dexStatus && dexStatus.activeBoosts > 0 && (
                  <Badge className="text-[10px] px-1.5 py-0.5 bg-orange-500 hover:bg-orange-400 text-white">
                    🚀 x{dexStatus.activeBoosts}
                  </Badge>
                )}
                {dexStatus?.hasAds && (
                  <Badge className="text-[10px] px-1.5 py-0.5 bg-purple-600 hover:bg-purple-500 text-white">
                    📢 ADS
                  </Badge>
                )}
              </div>

              {/* Age badge */}
              {tokenAge !== undefined && (
                <Badge variant="outline" className="flex items-center gap-1 text-xs w-fit">
                  <Clock className="h-3 w-3" />
                  {tokenAge < 1 
                    ? `${Math.round(tokenAge * 60)}m old`
                    : tokenAge < 24 
                      ? `${Math.round(tokenAge)}h old`
                      : `${Math.round(tokenAge / 24)}d old`
                  }
                </Badge>
              )}

              {creatorWallet && (
                <DeveloperRiskBadge creatorWallet={creatorWallet} showDetails />
              )}
            </div>

            {/* BOX 2: External Links & Socials */}
            <div className="space-y-2">
              {/* Padre.gg trading terminal */}
              <a
                href={`https://trade.padre.gg/trade/solana/${metadata.mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center hover:opacity-80 transition-opacity"
                title="Trade on Padre.gg"
              >
                <img src="https://trade.padre.gg/logo.svg" alt="Padre.gg" className="h-5 w-auto max-w-[100px]" />
              </a>

              {/* External Explorer Links - Icons only */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <a
                  href={`https://www.coingecko.com/en/coins/${metadata.symbol.toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  title="CoinGecko"
                >
                  <img src="/external-icons/coingecko.png" alt="CoinGecko" className="h-6 w-6 rounded-full object-cover" />
                </a>
                <a
                  href={`https://coinmarketcap.com/search/?q=${metadata.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  title="CoinMarketCap"
                >
                  <img src="/external-icons/coinmarketcap.png" alt="CoinMarketCap" className="h-6 w-6 rounded object-contain" />
                </a>
                <a
                  href={`https://birdeye.so/token/${metadata.mint}?chain=solana`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  title="Birdeye"
                >
                  <img src="/external-icons/birdeye.ico" alt="Birdeye" className="h-6 w-6 rounded object-contain" />
                </a>
                <a
                  href={`https://www.dextools.io/app/solana/pair-explorer/${metadata.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  title="DexTools"
                >
                  <img src="/assets/dextools-logo.svg" alt="DexTools" className="h-6 w-6 rounded object-contain" />
                </a>
              </div>

              {/* Social Links - Icons only */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {twitterUrl && (() => {
                  const platformInfo = detectSocialPlatform(twitterUrl);
                  return (
                    <a
                      href={twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center hover:opacity-80 transition-opacity"
                      title={platformInfo.label}
                    >
                      <SocialIcon platform={platformInfo.platform} className="h-6 w-6" />
                    </a>
                  );
                })()}
                {telegramUrl && (() => {
                  const platformInfo = detectSocialPlatform(telegramUrl);
                  return (
                    <a
                      href={telegramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center hover:opacity-80 transition-opacity"
                      title={platformInfo.label}
                    >
                      <SocialIcon platform={platformInfo.platform} className="h-6 w-6" />
                    </a>
                  );
                })()}
                {websiteUrl && (() => {
                  const platformInfo = detectSocialPlatform(websiteUrl);
                  return (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center hover:opacity-80 transition-opacity"
                      title={platformInfo.label}
                    >
                      <SocialIcon platform={platformInfo.platform} className="h-6 w-6" />
                    </a>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Creator/Dev Info Section */}
          {creatorInfo?.wallet && (
            <div className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                👨‍💻 Creator / Dev Wallet
                {creatorInfo.bondingCurveProgress !== undefined && creatorInfo.bondingCurveProgress < 100 && (
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    On Curve: {creatorInfo.bondingCurveProgress.toFixed(1)}%
                  </Badge>
                )}
                {creatorInfo.bondingCurveProgress !== undefined && creatorInfo.bondingCurveProgress >= 100 && (
                  <span title="Graduated">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={`https://solscan.io/account/${creatorInfo.wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-primary hover:underline"
                >
                  {creatorInfo.wallet.slice(0, 6)}...{creatorInfo.wallet.slice(-6)}
                </a>
                {creatorInfo.xAccount && (
                  <a
                    href={creatorInfo.xAccount}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title="Creator's X/Twitter"
                  >
                    <SocialIcon platform="twitter" className="h-4 w-4" />
                  </a>
                )}
              </div>
              {creatorInfo.feeSplit && (
                <div className="text-xs text-muted-foreground">
                  <span className="text-yellow-500">⚠️ Fee Split:</span>{' '}
                  <a
                    href={`https://solscan.io/account/${creatorInfo.feeSplit.wallet1}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-mono"
                  >
                    {creatorInfo.feeSplit.wallet1?.slice(0, 4)}...
                  </a>
                  {' '}({creatorInfo.feeSplit.splitPercent || 50}%) / {' '}
                  <a
                    href={`https://solscan.io/account/${creatorInfo.feeSplit.wallet2}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-mono"
                  >
                    {creatorInfo.feeSplit.wallet2?.slice(0, 4)}...
                  </a>
                  {' '}({100 - (creatorInfo.feeSplit.splitPercent || 50)}%)
                </div>
              )}
            </div>
          )}

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
                  <p className="text-lg font-semibold">
                    {priceInfo.isOnCurve ? (
                      <span className="text-amber-500">On Curve</span>
                    ) : (
                      `$${formatLargeNumber(priceInfo.liquidity)}`
                    )}
                  </p>
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

          {/* Share Report Button */}
          <ShareToXButton
            ticker={metadata.symbol || 'TOKEN'}
            tokenMint={metadata.mint}
            totalWallets={shareData?.totalHolders || 0}
            realHolders={shareData?.realWallets || 0}
            dustWallets={shareData?.dustWallets || 0}
            whales={(shareData?.trueWhaleWallets || 0) + (shareData?.babyWhaleWallets || 0)}
            strong={(shareData?.superBossWallets || 0) + (shareData?.kingpinWallets || 0) + (shareData?.bossWallets || 0)}
            active={(shareData?.largeWallets || 0) + (shareData?.mediumWallets || 0)}
            healthGrade={shareData?.healthScore?.grade || 'C'}
            healthScore={shareData?.healthScore?.score || 50}
            shareCardPageUrl={shareCardPageUrl}
          />
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