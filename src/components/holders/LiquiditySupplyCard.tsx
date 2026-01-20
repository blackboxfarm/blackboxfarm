import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplets } from 'lucide-react';

interface LPAnalysisData {
  lpPercentage: number;
  unlockedSupply: number;
  unlockedPercentage: number;
  lpBalance: number;
}

interface LiquiditySupplyCardProps {
  data: LPAnalysisData;
}

export function LiquiditySupplyCard({ data }: LiquiditySupplyCardProps) {
  const formatBalance = (value: number) => {
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toFixed(2);
  };

  const ratio = data.lpBalance > 0 ? (data.unlockedSupply / data.lpBalance).toFixed(2) : '∞';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Droplets className="h-5 w-5 text-blue-500" />
          Liquidity vs Unlocked Supply
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
              {data.lpPercentage.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">In Liquidity Pools</div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatBalance(data.lpBalance)} tokens
            </div>
          </div>
          <div className="text-center p-3 bg-green-500/10 rounded-lg border border-green-500/20">
            <div className="text-xl font-bold text-green-700 dark:text-green-300">
              {data.unlockedPercentage.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Unlocked Supply</div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatBalance(data.unlockedSupply)} tokens
            </div>
          </div>
        </div>
        
        {/* Visual Bar */}
        <div className="w-full bg-muted/30 rounded-full h-6 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-blue-500/70 flex items-center justify-center text-[10px] font-semibold text-white"
            style={{ width: `${Math.min(data.lpPercentage, 100)}%` }}
          >
            {data.lpPercentage > 15 && `LP ${data.lpPercentage.toFixed(1)}%`}
          </div>
          <div
            className="absolute inset-y-0 bg-green-500/70 flex items-center justify-center text-[10px] font-semibold text-white"
            style={{ 
              left: `${Math.min(data.lpPercentage, 100)}%`, 
              width: `${Math.min(data.unlockedPercentage, 100 - data.lpPercentage)}%` 
            }}
          >
            {data.unlockedPercentage > 15 && `Unlocked ${data.unlockedPercentage.toFixed(1)}%`}
          </div>
        </div>
        
        {/* Ratio */}
        <div className="mt-3 text-xs text-muted-foreground text-center">
          Ratio: <span className="font-medium text-foreground">{ratio}:1</span> (Unlocked:LP)
        </div>
      </CardContent>
    </Card>
  );
}
