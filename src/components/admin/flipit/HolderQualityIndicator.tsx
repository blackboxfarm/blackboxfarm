import React from 'react';
import { Loader2, Users, AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import { HolderQuality } from '@/hooks/useHolderQualityCheck';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HolderQualityIndicatorProps {
  quality: HolderQuality;
  isLoading: boolean;
  summary: string;
  totalHolders: number;
  realBuyersCount: number;
  dustPercent: number;
  whaleCount: number;
  error: string | null;
  className?: string;
}

export function HolderQualityIndicator({
  quality,
  isLoading,
  summary,
  totalHolders,
  realBuyersCount,
  dustPercent,
  whaleCount,
  error,
  className,
}: HolderQualityIndicatorProps) {
  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Checking holders...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
        <span>Holder check failed</span>
      </div>
    );
  }

  if (quality === null) {
    return null;
  }

  const qualityConfig = {
    good: {
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/40',
      textColor: 'text-green-500',
      label: 'Good',
    },
    neutral: {
      icon: <MinusCircle className="h-4 w-4 text-amber-500" />,
      bgColor: 'bg-amber-500/20',
      borderColor: 'border-amber-500/40',
      textColor: 'text-amber-500',
      label: 'Normal',
    },
    bad: {
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      bgColor: 'bg-red-500/20',
      borderColor: 'border-red-500/40',
      textColor: 'text-red-500',
      label: 'Warning',
    },
  };

  const config = qualityConfig[quality];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-help transition-colors",
              config.bgColor,
              config.borderColor,
              className
            )}
          >
            {config.icon}
            <span className={cn("text-xs font-medium", config.textColor)}>
              {config.label}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-medium flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Holder Distribution
            </p>
            <div className="text-xs space-y-1">
              <p>{summary}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground pt-1 border-t border-border/50">
                <span>Total Holders:</span>
                <span className="font-mono">{totalHolders.toLocaleString()}</span>
                <span>Real Buyers ($5+):</span>
                <span className="font-mono">{realBuyersCount.toLocaleString()}</span>
                <span>Dust Wallets:</span>
                <span className="font-mono">{dustPercent.toFixed(0)}%</span>
                {whaleCount > 0 && (
                  <>
                    <span>Whales:</span>
                    <span className="font-mono">{whaleCount}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
