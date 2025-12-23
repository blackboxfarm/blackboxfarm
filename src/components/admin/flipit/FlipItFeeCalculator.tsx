import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator, Zap, TrendingUp, AlertTriangle, CheckCircle, Info, Route } from 'lucide-react';

interface FlipItFeeCalculatorProps {
  buyAmountSol: number;
  solPrice: number;
  priorityFeeMode: 'low' | 'medium' | 'high' | 'turbo' | 'ultra';
  slippageBps: number;
  targetMultiplier: number;
  isBondingCurve?: boolean; // Whether token is still on bonding curve
}

interface CostBreakdown {
  fixedCosts: {
    baseFee: number;
    priorityFee: number;
    pumpPortalFee: number;
    totalFixed: number;
  };
  variableCosts: {
    slippageBest: number;
    slippageAvg: number;
    slippageWorst: number;
    priceImpact: number;
    totalVariableBest: number;
    totalVariableAvg: number;
    totalVariableWorst: number;
  };
  totals: {
    buyTotalCostAvg: number;
    sellTotalCostAvg: number;
    roundTripCostBest: number;
    roundTripCostAvg: number;
    roundTripCostWorst: number;
    roundTripPercentAvg: number;
    breakEvenMultiplier: number;
    profitAtTargetBest: number;
    profitAtTargetAvg: number;
    profitAtTargetWorst: number;
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
const PUMP_PORTAL_FEE = 0.0005; // Fixed per trade on bonding curve

export function FlipItFeeCalculator({
  buyAmountSol,
  solPrice,
  priorityFeeMode,
  slippageBps,
  targetMultiplier,
  isBondingCurve = true, // Default to bonding curve (PumpPortal)
}: FlipItFeeCalculatorProps) {
  const breakdown = useMemo<CostBreakdown>(() => {
    const priorityFee = PRIORITY_FEES[priorityFeeMode] || 0.0005;
    const slippagePercent = slippageBps / 10000;
    
    // Fixed costs (per transaction)
    const pumpPortalFee = isBondingCurve ? PUMP_PORTAL_FEE : 0;
    const fixedCosts = {
      baseFee: BASE_FEE,
      priorityFee: priorityFee,
      pumpPortalFee: pumpPortalFee,
      totalFixed: BASE_FEE + priorityFee + pumpPortalFee,
    };
    
    // Variable costs - slippage as a RANGE
    // Best case: near 0% slippage (good liquidity, no competition)
    // Average case: ~50% of max slippage
    // Worst case: full slippage tolerance hit
    const slippageBest = buyAmountSol * slippagePercent * 0.1;
    const slippageAvg = buyAmountSol * slippagePercent * 0.5;
    const slippageWorst = buyAmountSol * slippagePercent;
    
    // Price impact for small trades is minimal
    const priceImpact = buyAmountSol < 0.5 ? buyAmountSol * 0.001 : buyAmountSol * 0.005;
    
    const variableCosts = {
      slippageBest,
      slippageAvg,
      slippageWorst,
      priceImpact,
      totalVariableBest: slippageBest + priceImpact,
      totalVariableAvg: slippageAvg + priceImpact,
      totalVariableWorst: slippageWorst + priceImpact,
    };
    
    // Total costs for each scenario
    const buyTotalCostBest = fixedCosts.totalFixed + variableCosts.totalVariableBest;
    const buyTotalCostAvg = fixedCosts.totalFixed + variableCosts.totalVariableAvg;
    const buyTotalCostWorst = fixedCosts.totalFixed + variableCosts.totalVariableWorst;
    
    const sellTotalCostBest = fixedCosts.totalFixed + variableCosts.totalVariableBest;
    const sellTotalCostAvg = fixedCosts.totalFixed + variableCosts.totalVariableAvg;
    const sellTotalCostWorst = fixedCosts.totalFixed + variableCosts.totalVariableWorst;
    
    const roundTripCostBest = buyTotalCostBest + sellTotalCostBest;
    const roundTripCostAvg = buyTotalCostAvg + sellTotalCostAvg;
    const roundTripCostWorst = buyTotalCostWorst + sellTotalCostWorst;
    
    const roundTripPercentAvg = (roundTripCostAvg / buyAmountSol) * 100;
    
    // Net investment after buy fees (using average)
    const netInvestmentBest = buyAmountSol - buyTotalCostBest;
    const netInvestmentAvg = buyAmountSol - buyTotalCostAvg;
    const netInvestmentWorst = buyAmountSol - buyTotalCostWorst;
    
    // Break-even: need to cover round-trip costs (using average)
    const breakEvenMultiplier = 1 + (roundTripCostAvg / netInvestmentAvg);
    
    // Profit at target for each scenario
    // Formula: (netInvestment × targetMultiplier) - netInvestment - sellCost
    // = netInvestment × (targetMultiplier - 1) - sellCost
    const profitAtTargetBest = netInvestmentBest * (targetMultiplier - 1) - sellTotalCostBest;
    const profitAtTargetAvg = netInvestmentAvg * (targetMultiplier - 1) - sellTotalCostAvg;
    const profitAtTargetWorst = netInvestmentWorst * (targetMultiplier - 1) - sellTotalCostWorst;
    
    return {
      fixedCosts,
      variableCosts,
      totals: {
        buyTotalCostAvg,
        sellTotalCostAvg,
        roundTripCostBest,
        roundTripCostAvg,
        roundTripCostWorst,
        roundTripPercentAvg,
        breakEvenMultiplier,
        profitAtTargetBest,
        profitAtTargetAvg,
        profitAtTargetWorst,
      },
    };
  }, [buyAmountSol, priorityFeeMode, slippageBps, targetMultiplier, isBondingCurve]);
  
  const formatSol = (sol: number) => sol.toFixed(6);
  const formatUsd = (sol: number) => `$${(sol * solPrice).toFixed(4)}`;
  const formatSolWithUsd = (sol: number) => `${formatSol(sol)} SOL ($${(sol * solPrice).toFixed(4)})`;
  
  const isHighCostRatio = breakdown.totals.roundTripPercentAvg > 20;
  const isVeryHighCostRatio = breakdown.totals.roundTripPercentAvg > 40;
  const isProfitable = breakdown.totals.profitAtTargetAvg > 0;
  
  return (
    <TooltipProvider>
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
          {/* Trading Route Indicator */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs">
            <Route className="h-3 w-3" />
            <span className="font-medium">Route:</span>
            <Badge variant={isBondingCurve ? "default" : "secondary"} className="text-xs">
              {isBondingCurve ? "Pump.fun (Bonding Curve)" : "Raydium/Jupiter"}
            </Badge>
            {isBondingCurve && (
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>PumpPortal fee (0.0005 SOL) applies for bonding curve trades. Once migrated to Raydium, this fee is not charged.</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Fixed Costs */}
          <div>
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
              <Zap className="h-3 w-3" />
              FIXED COSTS (per tx)
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Base Fee:</span>
              <span className="text-right font-mono">{formatSolWithUsd(breakdown.fixedCosts.baseFee)}</span>
              <span className="text-muted-foreground">Priority Fee:</span>
              <span className="text-right font-mono">{formatSolWithUsd(breakdown.fixedCosts.priorityFee)}</span>
              <span className="text-muted-foreground flex items-center gap-1">
                PumpPortal Fee:
                {!isBondingCurve && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Not applicable for Raydium/Jupiter trades</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
              <span className={`text-right font-mono ${!isBondingCurve ? 'text-muted-foreground line-through' : ''}`}>
                {formatSolWithUsd(isBondingCurve ? PUMP_PORTAL_FEE : 0)}
              </span>
            </div>
          </div>
          
          <Separator />
          
          {/* Variable Costs with Range */}
          <div>
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              VARIABLE COSTS
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Slippage is your tolerance setting, not a guaranteed cost. Actual slippage depends on market conditions, liquidity, and competition for the trade.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="space-y-2 text-xs">
              {/* Slippage Range */}
              <div>
                <div className="flex justify-between text-muted-foreground mb-1">
                  <span>Slippage (max {(slippageBps / 100).toFixed(1)}%):</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div className="p-1 rounded bg-green-500/10 border border-green-500/20">
                    <div className="text-[10px] text-muted-foreground">Best</div>
                    <div className="font-mono text-green-600">{formatSol(breakdown.variableCosts.slippageBest)}</div>
                    <div className="text-[10px] text-muted-foreground">{formatUsd(breakdown.variableCosts.slippageBest)}</div>
                  </div>
                  <div className="p-1 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <div className="text-[10px] text-muted-foreground">Average</div>
                    <div className="font-mono text-yellow-600">{formatSol(breakdown.variableCosts.slippageAvg)}</div>
                    <div className="text-[10px] text-muted-foreground">{formatUsd(breakdown.variableCosts.slippageAvg)}</div>
                  </div>
                  <div className="p-1 rounded bg-red-500/10 border border-red-500/20">
                    <div className="text-[10px] text-muted-foreground">Worst</div>
                    <div className="font-mono text-red-600">{formatSol(breakdown.variableCosts.slippageWorst)}</div>
                    <div className="text-[10px] text-muted-foreground">{formatUsd(breakdown.variableCosts.slippageWorst)}</div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price Impact:</span>
                <span className="font-mono">{formatSolWithUsd(breakdown.variableCosts.priceImpact)}</span>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* Totals */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">Buy Cost (avg):</span>
              <span className="font-mono">
                {formatSolWithUsd(breakdown.totals.buyTotalCostAvg)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Sell Cost (avg):</span>
              <span className="font-mono">
                {formatSolWithUsd(breakdown.totals.sellTotalCostAvg)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>Round-Trip (avg):</span>
              <span className={isVeryHighCostRatio ? 'text-destructive' : isHighCostRatio ? 'text-yellow-500' : 'text-green-600'}>
                {formatSol(breakdown.totals.roundTripCostAvg)} SOL
                <span className="text-sm font-normal ml-1">
                  ({breakdown.totals.roundTripPercentAvg.toFixed(1)}%)
                </span>
              </span>
            </div>
            <div className="text-xs text-muted-foreground text-right">
              Range: {formatSol(breakdown.totals.roundTripCostBest)} - {formatSol(breakdown.totals.roundTripCostWorst)} SOL
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
            
            <div className="text-xs">
              <div className="flex justify-between text-muted-foreground mb-1">
                <span>Profit at {targetMultiplier}x Target:</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className={`p-1 rounded ${breakdown.totals.profitAtTargetBest > 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  <div className="text-[10px] text-muted-foreground">Best</div>
                  <div className={`font-mono font-medium ${breakdown.totals.profitAtTargetBest > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {breakdown.totals.profitAtTargetBest > 0 ? '+' : ''}{formatSol(breakdown.totals.profitAtTargetBest)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{formatUsd(breakdown.totals.profitAtTargetBest)}</div>
                </div>
                <div className={`p-1 rounded border-2 ${breakdown.totals.profitAtTargetAvg > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                  <div className="text-[10px] text-muted-foreground">Average</div>
                  <div className={`font-mono font-medium ${breakdown.totals.profitAtTargetAvg > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {breakdown.totals.profitAtTargetAvg > 0 ? '+' : ''}{formatSol(breakdown.totals.profitAtTargetAvg)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{formatUsd(breakdown.totals.profitAtTargetAvg)}</div>
                </div>
                <div className={`p-1 rounded ${breakdown.totals.profitAtTargetWorst > 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  <div className="text-[10px] text-muted-foreground">Worst</div>
                  <div className={`font-mono font-medium ${breakdown.totals.profitAtTargetWorst > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {breakdown.totals.profitAtTargetWorst > 0 ? '+' : ''}{formatSol(breakdown.totals.profitAtTargetWorst)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{formatUsd(breakdown.totals.profitAtTargetWorst)}</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Warning for small trades */}
          {isVeryHighCostRatio && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Fees are {breakdown.totals.roundTripPercentAvg.toFixed(0)}% of your trade. 
                Consider increasing trade size or lowering priority fee.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
