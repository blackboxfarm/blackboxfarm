import { useSolPrice } from '@/hooks/useSolPrice';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SolPriceDisplayProps {
  className?: string;
  showSource?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function SolPriceDisplay({ className, showSource = false, size = 'md' }: SolPriceDisplayProps) {
  const { price, isLoading, error, source, timestamp, refetch } = useSolPrice();

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

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* SOL Token Icon */}
      <img 
        src="/lovable-uploads/fce64802-aa0f-4a71-bd5a-d57fb764caea.png"
        alt="Solana"
        className={cn('rounded-full',
          size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
        )}
      />
      
      {/* Price Display */}
      <div className="flex items-center gap-1">
        <span className={cn(sizeClasses[size], error ? 'text-destructive' : 'text-foreground')}>
          ${price.toFixed(2)}
        </span>
        
        {isLoading && (
          <RefreshCw className={cn(iconSize[size], 'animate-spin text-muted-foreground')} />
        )}
        
        {!isLoading && (
          <Badge variant="secondary" className="text-xs px-1 py-0">
            Live
          </Badge>
        )}
      </div>
      
      {showSource && source && (
        <span className="text-xs text-muted-foreground">
          {source}
        </span>
      )}
      
      {error && (
        <span className="text-xs text-destructive">
          (Offline)
        </span>
      )}
    </div>
  );
}