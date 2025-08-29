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
    
    // UPDATED Fee structure (competitive market rates)
    const baseFee = 0.15; // Premium setup fee
    const gasFeePerTx = 0.000005; // Solana network fee
    const serviceFeePercent = 0.35; // 35% markup on gas
    const serviceFeeFlat = 0.003; // Premium flat fee per transaction
    
    const totalGasFees = gasFeePerTx * totalTrades;
    const totalServiceFees = (totalGasFees * serviceFeePercent) + (serviceFeeFlat * totalTrades);
    const totalFees = baseFee + totalGasFees + totalServiceFees;
    
    // Competitor comparison (estimated)
    const smithiiEquivalent = totalTrades * 0.0025 + (totalVolume * 0.002);
    const bumpiEquivalent = totalTrades * 0.003 + (totalVolume * 0.0015);
    const competitorAvg = (smithiiEquivalent + bumpiEquivalent) / 2;
    const savings = competitorAvg - totalFees;
    const savingsPercent = (savings / competitorAvg) * 100;

    return {
      totalTrades,
      totalVolume,
      totalFees,
      totalGasFees,
      totalServiceFees,
      baseFee,
      totalCostUSD: totalFees * solPrice,
      volumeUSD: totalVolume * solPrice,
      smithiiEquivalent,
      bumpiEquivalent,
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
            Fee Calculator - See Why We're 15% Cheaper
          </CardTitle>
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
                <h3 className="font-medium">BlackBox Fees</h3>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Setup Fee:</span>
                  <span>{formatSOL(calculations.baseFee)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>Gas Fees:</span>
                  <span>{formatSOL(calculations.totalGasFees)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>Service Fees:</span>
                  <span>{formatSOL(calculations.totalServiceFees)} SOL</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>Total:</span>
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
                <h3 className="font-medium">Competitor Average</h3>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Smithii (~):</span>
                  <span>{formatSOL(calculations.smithiiEquivalent)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>Bumpi (~):</span>
                  <span>{formatSOL(calculations.bumpiEquivalent)} SOL</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>Average:</span>
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
            <h3 className="font-medium mb-3">Our Pricing Packages vs Competition</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Starter</h4>
                  <Badge variant="secondary">100 bumps</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>BlackBox:</span>
                    <span className="text-primary font-medium">0.02 SOL</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Smithii:</span>
                    <span>0.025 SOL</span>
                  </div>
                  <div className="text-green-600 text-xs">20% cheaper</div>
                </div>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Growth</h4>
                  <Badge variant="secondary">500 bumps</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>BlackBox:</span>
                    <span className="text-primary font-medium">0.09 SOL</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Bumpi:</span>
                    <span>0.125 SOL</span>
                  </div>
                  <div className="text-green-600 text-xs">28% cheaper</div>
                </div>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Pro</h4>
                  <Badge variant="secondary">1000 bumps</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>BlackBox:</span>
                    <span className="text-primary font-medium">0.15 SOL</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Average:</span>
                    <span>0.19 SOL</span>
                  </div>
                  <div className="text-green-600 text-xs">21% cheaper</div>
                </div>
              </div>
            </div>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}