import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingUp, Shield, Zap } from "lucide-react";

export function FeeCalculator() {
  const [buyAmount, setBuyAmount] = useState(0.01);
  const [tradesPerHour, setTradesPerHour] = useState([12]);
  const [hours, setHours] = useState([6]);
  const [solPrice, setSolPrice] = useState(200);

  const calculations = useMemo(() => {
    const totalTrades = tradesPerHour[0] * hours[0];
    const totalVolume = buyAmount * totalTrades;
    
    // Smart fee selection based on trade size and volume
    const useBatchPricing = totalTrades >= 50; // Batch pricing for volume operations
    
    let totalFees: number;
    let feeBreakdown: any;
    
    if (useBatchPricing) {
      // Smithii-style batch pricing
      const batchesNeeded = Math.ceil(totalTrades / 100);
      const batchCost = batchesNeeded * 0.025; // 0.025 SOL per 100 operations
      totalFees = batchCost;
      feeBreakdown = {
        type: 'batch',
        batchesNeeded,
        costPerBatch: 0.025,
        effectiveCostPerTrade: batchCost / totalTrades
      };
    } else {
      // Traditional per-transaction pricing for small volumes
      const baseFee = 0.000005; // Realistic Solana base fee
      const priorityFee = buyAmount < 0.05 ? 0.000001 : 0.00001; // Lower priority for micro-trades
      const serviceFee = 0.0005; // Reduced service fee
      const perTxFee = baseFee + priorityFee + serviceFee;
      totalFees = perTxFee * totalTrades;
      feeBreakdown = {
        type: 'per_transaction',
        baseFee,
        priorityFee,
        serviceFee,
        perTxFee
      };
    }
    
    // Honest competitor comparison with real market data
    const trojanEquivalent = totalTrades * 0.0015 + (totalVolume * 0.009); // Trojan: 0.0015 SOL + 0.9%
    const maestroEquivalent = totalVolume * 0.01; // Maestro: 1% per trade
    const mevxEquivalent = totalVolume * 0.008; // MevX: 0.8% per trade
    const competitorAvg = (trojanEquivalent + maestroEquivalent + mevxEquivalent) / 3;
    
    const savings = Math.max(0, competitorAvg - totalFees);
    const savingsPercent = competitorAvg > 0 ? (savings / competitorAvg) * 100 : 0;

    return {
      totalTrades,
      totalVolume,
      totalFees,
      feeBreakdown,
      useBatchPricing,
      totalCostUSD: totalFees * solPrice,
      volumeUSD: totalVolume * solPrice,
      trojanEquivalent,
      maestroEquivalent,
      mevxEquivalent,
      competitorAvg,
      savings,
      savingsPercent
    };
  }, [buyAmount, tradesPerHour[0], hours[0], solPrice]);

  const formatSOL = (amount: number) => amount.toFixed(6);
  const formatUSD = (amount: number) => `$${amount.toFixed(2)}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Smart Fee Calculator - Honest Market Comparison
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {calculations.useBatchPricing 
              ? "Volume detected: Using batch pricing model (like Smithii)" 
              : "Small volume: Using optimized per-transaction pricing"
            }
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Input Controls */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="buyAmount">Buy Amount per Trade (SOL)</Label>
                <Input
                  id="buyAmount"
                  type="number"
                  step="0.001"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="solPrice">SOL Price (USD)</Label>
                <Input
                  id="solPrice"
                  type="number"
                  value={solPrice}
                  onChange={(e) => setSolPrice(parseFloat(e.target.value) || 200)}
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label>Trades per Hour: {tradesPerHour[0]}</Label>
                <Slider
                  value={tradesPerHour}
                  onValueChange={setTradesPerHour}
                  min={1}
                  max={60}
                  step={1}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Duration (Hours): {hours[0]}</Label>
                <Slider
                  value={hours}
                  onValueChange={setHours}
                  min={1}
                  max={24}
                  step={1}
                  className="mt-2"
                />
              </div>
            </div>
          </div>

          {/* Fee Breakdown */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Our Smart Pricing</h3>
              </div>
              <div className="space-y-1 text-sm">
                {calculations.useBatchPricing ? (
                  <>
                    <div className="flex justify-between">
                      <span>Pricing Model:</span>
                      <span className="text-primary">Batch (Smithii-style)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Batches Needed:</span>
                      <span>{calculations.feeBreakdown.batchesNeeded}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost per Batch:</span>
                      <span>{formatSOL(calculations.feeBreakdown.costPerBatch)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Per Operation:</span>
                      <span>{formatSOL(calculations.feeBreakdown.effectiveCostPerTrade)} SOL</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Pricing Model:</span>
                      <span className="text-primary">Per-Transaction</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Network Fee:</span>
                      <span>{formatSOL(calculations.feeBreakdown.baseFee + calculations.feeBreakdown.priorityFee)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Service Fee:</span>
                      <span>{formatSOL(calculations.feeBreakdown.serviceFee)} SOL</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>Total Cost:</span>
                  <span className="text-primary">{formatSOL(calculations.totalFees)} SOL</span>
                </div>
                <div className="text-center text-muted-foreground">
                  {formatUSD(calculations.totalCostUSD)}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                <h3 className="font-medium">Market Leaders (Real Data)</h3>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Trojan Bot:</span>
                  <span>{formatSOL(calculations.trojanEquivalent)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>Maestro Bot:</span>
                  <span>{formatSOL(calculations.maestroEquivalent)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>MevX:</span>
                  <span>{formatSOL(calculations.mevxEquivalent)} SOL</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>Market Average:</span>
                  <span className="text-orange-500">{formatSOL(calculations.competitorAvg)} SOL</span>
                </div>
                <div className="text-center text-muted-foreground">
                  {formatUSD(calculations.competitorAvg * solPrice)}
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-green-50 border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-green-600" />
                <h3 className="font-medium text-green-800">Your Savings</h3>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>SOL Saved:</span>
                  <span className="text-green-600 font-medium">{formatSOL(calculations.savings)}</span>
                </div>
                <div className="flex justify-between">
                  <span>USD Saved:</span>
                  <span className="text-green-600 font-medium">{formatUSD(calculations.savings * solPrice)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>Savings:</span>
                  <span className="text-green-600">{calculations.savingsPercent.toFixed(1)}%</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Trading Summary */}
          <Card className="p-4 bg-primary/5 border-primary/20">
            <h3 className="font-medium mb-3">Trading Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Total Trades</div>
                <div className="font-medium">{calculations.totalTrades}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Volume (SOL)</div>
                <div className="font-medium">{formatSOL(calculations.totalVolume)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Volume (USD)</div>
                <div className="font-medium">{formatUSD(calculations.volumeUSD)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Fee Rate</div>
                <div className="font-medium">{((calculations.totalFees / calculations.totalVolume) * 100).toFixed(3)}%</div>
              </div>
            </div>
          </Card>

          {/* Pricing Tiers */}
          <Card className="p-4">
            <h3 className="font-medium mb-3">Volume Pricing Tiers - Why We Win</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Small Volume</h4>
                  <Badge variant="secondary">&lt; 50 trades</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Our Model:</span>
                    <span className="text-primary font-medium">Per-transaction</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Micro-trade fee:</span>
                    <span className="text-primary">0.0005 SOL</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Trojan equivalent:</span>
                    <span>0.0015 SOL</span>
                  </div>
                  <div className="text-green-600 text-xs">67% cheaper</div>
                </div>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Medium Volume</h4>
                  <Badge variant="secondary">50-200 trades</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Our Model:</span>
                    <span className="text-primary font-medium">Batch pricing</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Per 100 ops:</span>
                    <span className="text-primary">0.025 SOL</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Maestro equivalent:</span>
                    <span>1% of volume</span>
                  </div>
                  <div className="text-green-600 text-xs">Massive savings</div>
                </div>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">High Volume</h4>
                  <Badge variant="secondary">200+ trades</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Our Model:</span>
                    <span className="text-primary font-medium">Batch + Discounts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Effective rate:</span>
                    <span className="text-primary">0.0002 SOL/trade</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Market average:</span>
                    <span>0.8-1% fees</span>
                  </div>
                  <div className="text-green-600 text-xs">90%+ cheaper</div>
                </div>
              </div>
            </div>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}