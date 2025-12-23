import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, Zap, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

interface FlipItFeeCalculatorProps {
  buyAmountSol: number;
  solPrice: number;
  priorityFeeMode: 'low' | 'medium' | 'high' | 'turbo' | 'ultra';
  slippageBps: number;
  targetMultiplier: number;
}

interface CostBreakdown {
  fixedCosts: {
    baseFee: number;
    priorityFee: number;
    pumpPortalFee: number;
    totalFixed: number;
  };
  variableCosts: {
    slippageEstimate: number;
    priceImpact: number;
    totalVariable: number;
  };
  totals: {
    buyTotalCost: number;
    sellTotalCost: number;
    roundTripCost: number;
    roundTripPercent: number;
    breakEvenMultiplier: number;
    profitAtTarget: number;
  };
}

const PRIORITY_FEES: Record<string, number> = {
  low: 0.0001,
  medium: 0.0005,
  high: 0.001,
  turbo: 0.0075,
  ultra: 0.009,
};

const BASE_FEE = 0.000005; // 5000 lamports
const PUMP_PORTAL_FEE = 0.0005; // Fixed per trade

export function FlipItFeeCalculator({
  buyAmountSol,
  solPrice,
  priorityFeeMode,
  slippageBps,
  targetMultiplier,
}: FlipItFeeCalculatorProps) {
  const breakdown = useMemo<CostBreakdown>(() => {
    const priorityFee = PRIORITY_FEES[priorityFeeMode] || 0.0005;
    const slippagePercent = slippageBps / 10000;
    
    // Fixed costs (per transaction)
    const fixedCosts = {
      baseFee: BASE_FEE,
      priorityFee: priorityFee,
      pumpPortalFee: PUMP_PORTAL_FEE,
      totalFixed: BASE_FEE + priorityFee + PUMP_PORTAL_FEE,
    };
    
    // Variable costs (percentage-based)
    // Slippage is a worst-case estimate - usually less
    const slippageEstimate = buyAmountSol * slippagePercent * 0.5; // 50% of max slippage
    // Price impact for small trades is minimal
    const priceImpact = buyAmountSol < 0.5 ? buyAmountSol * 0.001 : buyAmountSol * 0.005;
    
    const variableCosts = {
      slippageEstimate,
      priceImpact,
      totalVariable: slippageEstimate + priceImpact,
    };
    
    // Total costs
    const buyTotalCost = fixedCosts.totalFixed + variableCosts.totalVariable;
    const sellTotalCost = fixedCosts.totalFixed + variableCosts.totalVariable; // Similar for sell
    const roundTripCost = buyTotalCost + sellTotalCost;
    
    // Net investment after buy fees
    const netInvestment = buyAmountSol - buyTotalCost;
    const roundTripPercent = (roundTripCost / buyAmountSol) * 100;
    
    // Break-even: need to cover round-trip costs
    const breakEvenMultiplier = 1 + (roundTripCost / netInvestment);
    
    // Profit at target (assuming target is hit)
    const grossAtTarget = netInvestment * targetMultiplier;
    const profitAtTarget = grossAtTarget - netInvestment - sellTotalCost;
    
    return {
      fixedCosts,
      variableCosts,
      totals: {
        buyTotalCost,
        sellTotalCost,
        roundTripCost,
        roundTripPercent,
        breakEvenMultiplier,
        profitAtTarget,
      },
    };
  }, [buyAmountSol, priorityFeeMode, slippageBps, targetMultiplier]);
  
  const formatSol = (sol: number) => sol.toFixed(6);
  const formatUsd = (sol: number) => `$${(sol * solPrice).toFixed(4)}`;
  
  const isHighCostRatio = breakdown.totals.roundTripPercent > 20;
  const isVeryHighCostRatio = breakdown.totals.roundTripPercent > 40;
  const isProfitable = breakdown.totals.profitAtTarget > 0;
  
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Calculator className="h-4 w-4" />
          Fee Calculator
          {isVeryHighCostRatio && (
            <Badge variant="destructive" className="ml-auto">High Fees!</Badge>
          )}
          {!isVeryHighCostRatio && isHighCostRatio && (
            <Badge variant="secondary" className="ml-auto">Watch Fees</Badge>
          )}
          {!isHighCostRatio && (
            <Badge variant="outline" className="ml-auto text-green-600">Optimal</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Fixed Costs */}
        <div>
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
            <Zap className="h-3 w-3" />
            FIXED COSTS (per tx)
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Base Fee:</span>
            <span className="text-right font-mono">{formatSol(breakdown.fixedCosts.baseFee)} SOL</span>
            <span className="text-muted-foreground">Priority Fee:</span>
            <span className="text-right font-mono">{formatSol(breakdown.fixedCosts.priorityFee)} SOL</span>
            <span className="text-muted-foreground">PumpPortal Fee:</span>
            <span className="text-right font-mono">{formatSol(breakdown.fixedCosts.pumpPortalFee)} SOL</span>
          </div>
        </div>
        
        <Separator />
        
        {/* Variable Costs */}
        <div>
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
            <TrendingUp className="h-3 w-3" />
            VARIABLE COSTS (estimated)
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Slippage (~{(slippageBps / 100 * 0.5).toFixed(1)}%):</span>
            <span className="text-right font-mono">{formatSol(breakdown.variableCosts.slippageEstimate)} SOL</span>
            <span className="text-muted-foreground">Price Impact:</span>
            <span className="text-right font-mono">{formatSol(breakdown.variableCosts.priceImpact)} SOL</span>
          </div>
        </div>
        
        <Separator />
        
        {/* Totals */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="font-medium">Buy Cost:</span>
            <span className="font-mono">
              {formatSol(breakdown.totals.buyTotalCost)} SOL
              <span className="text-muted-foreground ml-1">({formatUsd(breakdown.totals.buyTotalCost)})</span>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Sell Cost:</span>
            <span className="font-mono">
              {formatSol(breakdown.totals.sellTotalCost)} SOL
              <span className="text-muted-foreground ml-1">({formatUsd(breakdown.totals.sellTotalCost)})</span>
            </span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>Round-Trip:</span>
            <span className={isVeryHighCostRatio ? 'text-destructive' : isHighCostRatio ? 'text-yellow-500' : 'text-green-600'}>
              {formatSol(breakdown.totals.roundTripCost)} SOL
              <span className="text-sm font-normal ml-1">
                ({breakdown.totals.roundTripPercent.toFixed(1)}% of trade)
              </span>
            </span>
          </div>
        </div>
        
        <Separator />
        
        {/* Profitability Analysis */}
        <div className="space-y-2 p-2 rounded-md bg-muted/50">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Break-Even Multiplier:</span>
            <span className="font-mono font-medium">
              {breakdown.totals.breakEvenMultiplier.toFixed(3)}x
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Target ({targetMultiplier}x) Profit:</span>
            <span className={`font-mono font-medium flex items-center gap-1 ${isProfitable ? 'text-green-600' : 'text-destructive'}`}>
              {isProfitable ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {isProfitable ? '+' : ''}{formatSol(breakdown.totals.profitAtTarget)} SOL
              <span className="text-muted-foreground">({formatUsd(breakdown.totals.profitAtTarget)})</span>
            </span>
          </div>
        </div>
        
        {/* Warning for small trades */}
        {isVeryHighCostRatio && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              Fees are {breakdown.totals.roundTripPercent.toFixed(0)}% of your trade. 
              Consider increasing trade size or lowering priority fee.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
