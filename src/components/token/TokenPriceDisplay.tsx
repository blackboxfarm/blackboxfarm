import React from 'react';
import { useTokenMetadata } from '@/hooks/useTokenMetadata';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TokenPriceDisplayProps {
  tokenMint: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
}

export function TokenPriceDisplay({ 
  tokenMint, 
  className, 
  size = 'md', 
  showDetails = false 
}: TokenPriceDisplayProps) {
  const { tokenData, isLoading, error, fetchTokenMetadata } = useTokenMetadata();

  // Fetch metadata on mount if tokenMint is provided
  React.useEffect(() => {
    if (tokenMint) {
      fetchTokenMetadata(tokenMint);
    }
  }, [tokenMint, fetchTokenMetadata]);

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg font-semibold'
  };

  const iconSize = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4', 
    lg: 'h-5 w-5'
  };

  if (!tokenMint) return null;

  const formatPrice = (price: number) => {
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toExponential(2)}`;
  };

  const formatLargeNumber = (num: number) => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toFixed(0);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Token Icon */}
      {(tokenData?.metadata?.image || tokenData?.metadata?.logoURI) ? (
        <img 
          src={tokenData.metadata.image || tokenData.metadata.logoURI}
          alt={tokenData.metadata.name}
          className={cn('rounded-full bg-muted object-cover',
            size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
          )}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <div className={cn('rounded-full bg-muted flex items-center justify-center',
          size === 'sm' ? 'h-4 w-4 text-xs' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5 text-sm'
        )}>
          {tokenData?.metadata?.symbol?.[0] || '?'}
        </div>
      )}
      
      {/* Token Info */}
      <div className="flex items-center gap-2">
        {tokenData?.metadata && (
          <div className="flex items-center gap-1">
            <span className={cn(sizeClasses[size], 'font-medium')}>
              {tokenData.metadata.symbol}
            </span>
            {tokenData.metadata.verified && (
              <Badge variant="secondary" className="text-xs px-1 py-0">
                ✓
              </Badge>
            )}
          </div>
        )}

        {/* Price Info */}
        {tokenData?.priceInfo ? (
          <div className="flex items-center gap-2">
            <span className={cn(sizeClasses[size], 'text-foreground')}>
              {formatPrice(tokenData.priceInfo.priceUsd)}
            </span>
            
            {tokenData.priceInfo.priceChange24h !== 0 && (
              <div className={cn(
                'flex items-center gap-1',
                tokenData.priceInfo.priceChange24h > 0 ? 'text-green-500' : 'text-red-500'
              )}>
                {tokenData.priceInfo.priceChange24h > 0 ? (
                  <TrendingUp className={iconSize[size]} />
                ) : (
                  <TrendingDown className={iconSize[size]} />
                )}
                <span className="text-xs">
                  {Math.abs(tokenData.priceInfo.priceChange24h).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <span className={cn(sizeClasses[size], 'text-muted-foreground')}>
            No price data
          </span>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <RefreshCw className={cn(iconSize[size], 'animate-spin text-muted-foreground')} />
        )}

        {/* Refresh button */}
        {!isLoading && tokenMint && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchTokenMetadata(tokenMint)}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Additional details for expanded view */}
      {showDetails && tokenData?.priceInfo && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Vol: ${formatLargeNumber(tokenData.priceInfo.volume24h)}</span>
          <span>Liq: ${formatLargeNumber(tokenData.priceInfo.liquidity)}</span>
        </div>
      )}
      
      {error && (
        <span className="text-xs text-destructive">
          (Error)
        </span>
      )}
    </div>
  );
}