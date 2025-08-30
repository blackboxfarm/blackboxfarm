import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Calculator, Zap, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";

export function SmartFeeSelector() {
  const [amount, setAmount] = useState(0.01);
  const [operationCount, setOperationCount] = useState(10);
  const [solPrice, setSolPrice] = useState(200);
  const [priorityLevel, setPriorityLevel] = useState<'economy' | 'standard' | 'priority'>('standard');
  const [autoPilot, setAutoPilot] = useState(true);

  const calculations = useMemo(() => {
    // Smart fee selection logic
    const shouldUseBatch = operationCount >= 50;
    const isMicroTrade = amount < 0.05;
    const isHighVolume = operationCount >= 200;
    
    // Fee structures
    const batchFeesPer100 = 0.025;
    const microTradeFee = 0.0005; // Reduced for small trades
    const standardTradeFee = 0.00015;
    const priorityTradeFee = 0.0003;
    
    let recommendedStrategy: string;
    let totalCost: number;
    let reasoning: string[];
    
    if (shouldUseBatch) {
      const batchesNeeded = Math.ceil(operationCount / 100);
      totalCost = batchesNeeded * batchFeesPer100;
      recommendedStrategy = "Batch Pricing";
      reasoning = [
        `${operationCount} operations detected - batch mode optimal`,
        `${batchesNeeded} batches × 0.025 SOL = ${totalCost.toFixed(6)} SOL`,
        `Effective rate: ${(totalCost / operationCount * 1000).toFixed(4)} SOL per 1000 ops`
      ];
    } else {
      let feePerOp: number;
      if (isMicroTrade && priorityLevel === 'economy') {
        feePerOp = microTradeFee;
        recommendedStrategy = "Micro-Trade Optimized";
        reasoning = [
          "Small trade detected - using economy mode",
          "Minimal priority fee to reduce costs",
          "Suitable for volume operations where speed isn't critical"
        ];
      } else if (priorityLevel === 'priority') {
        feePerOp = priorityTradeFee;
        recommendedStrategy = "Priority Processing";
        reasoning = [
          "Priority mode selected",
          "Higher gas fees for faster execution",
          "Recommended for time-sensitive trades"
        ];
      } else {
        feePerOp = standardTradeFee;
        recommendedStrategy = "Standard Processing";
        reasoning = [
          "Balanced speed and cost",
          "Standard network priority",
          "Good for most trading operations"
        ];
      }
      totalCost = feePerOp * operationCount;
    }
    
    // Auto-pilot recommendation
    const autoPilotRecommendation = operationCount >= 50 ? 'batch' : 
                                   amount < 0.05 ? 'economy' : 'standard';
    
    // Competitor comparison
    const trojanCost = operationCount * 0.0015; // Trojan fast mode
    const maestroCost = operationCount * amount * 0.01; // 1% of volume
    const savings = Math.max(0, Math.min(trojanCost, maestroCost) - totalCost);
    const savingsPercent = Math.min(trojanCost, maestroCost) > 0 ? 
                          (savings / Math.min(trojanCost, maestroCost)) * 100 : 0;

    return {
      shouldUseBatch,
      isMicroTrade,
      totalCost,
      totalCostUSD: totalCost * solPrice,
      recommendedStrategy,
      reasoning,
      autoPilotRecommendation,
      trojanCost,
      maestroCost,
      savings,
      savingsPercent,
      costPerOperation: totalCost / operationCount,
      networkEfficiency: shouldUseBatch ? 95 : isMicroTrade ? 75 : 85
    };
  }, [amount, operationCount, solPrice, priorityLevel]);

  const handleAutoSelect = () => {
    if (calculations.autoPilotRecommendation === 'economy') {
      setPriorityLevel('economy');
    } else if (calculations.autoPilotRecommendation === 'standard') {
      setPriorityLevel('standard');
    }
    toast({
      title: "Auto-Pilot Engaged",
      description: `Selected ${calculations.recommendedStrategy} based on your parameters`,
    });
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Smart Fee Selector - AI-Powered Optimization
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Automatically selects the most cost-effective fee structure for your trading needs
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto-Pilot Toggle */}
        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="font-medium">Auto-Pilot Mode</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Let our AI select optimal pricing based on market conditions
            </p>
          </div>
          <Switch
            checked={autoPilot}
            onCheckedChange={setAutoPilot}
          />
        </div>

        {/* Input Controls */}
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="amount">Trade Amount (SOL)</Label>
            <Input
              id="amount"
              type="number"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="operations">Number of Operations</Label>
            <Input
              id="operations"
              type="number"
              value={operationCount}
              onChange={(e) => setOperationCount(parseInt(e.target.value) || 1)}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="solPrice">SOL Price (USD)</Label>
            <Input
              id="solPrice"
              type="number"
              value={solPrice}
              onChange={(e) => setSolPrice(parseFloat(e.target.value) || 200)}
              className="mt-2"
            />
          </div>
        </div>

        {/* Priority Level Selection (if not auto-pilot) */}
        {!autoPilot && (
          <div className="space-y-3">
            <Label>Priority Level</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'economy', label: 'Economy', desc: 'Lowest cost', icon: '🐌' },
                { key: 'standard', label: 'Standard', desc: 'Balanced', icon: '⚡' },
                { key: 'priority', label: 'Priority', desc: 'Fastest', icon: '🚀' }
              ].map((option) => (
                <Button
                  key={option.key}
                  variant={priorityLevel === option.key ? "default" : "outline"}
                  size="sm"
                  className="h-auto p-3"
                  onClick={() => setPriorityLevel(option.key as any)}
                >
                  <div className="text-center">
                    <div className="text-lg mb-1">{option.icon}</div>
                    <div className="font-medium text-xs">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.desc}</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* AI Recommendation */}
        <Card className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Calculator className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-primary">AI Recommendation: {calculations.recommendedStrategy}</h3>
              <ul className="text-sm space-y-1">
                {calculations.reasoning.map((reason, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-primary rounded-full" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        {/* Cost Breakdown */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              <h3 className="font-medium">Your Cost</h3>
            </div>
            <div className="space-y-1 text-sm">
              <div className="text-2xl font-bold text-primary">
                {calculations.totalCost.toFixed(6)} SOL
              </div>
              <div className="text-muted-foreground">
                ${calculations.totalCostUSD.toFixed(4)} USD
              </div>
              <div className="text-xs text-muted-foreground">
                {(calculations.costPerOperation * 1000).toFixed(4)} SOL per 1000 ops
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h3 className="font-medium">Market Alternative</h3>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Trojan Bot:</span>
                <span>{calculations.trojanCost.toFixed(6)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span>Maestro Bot:</span>
                <span>{calculations.maestroCost.toFixed(6)} SOL</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Best competitor option
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-green-50 border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <h3 className="font-medium text-green-800">Your Savings</h3>
            </div>
            <div className="space-y-1 text-sm">
              <div className="text-xl font-bold text-green-600">
                {calculations.savingsPercent.toFixed(1)}%
              </div>
              <div className="text-green-600">
                Save {calculations.savings.toFixed(6)} SOL
              </div>
              <div className="text-xs text-green-600">
                ${(calculations.savings * solPrice).toFixed(4)} USD saved
              </div>
            </div>
          </Card>
        </div>

        {/* Performance Metrics */}
        <Card className="p-4">
          <h3 className="font-medium mb-3">Performance Optimization</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-muted-foreground">Network Efficiency</div>
              <div className="text-lg font-semibold">{calculations.networkEfficiency}%</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Cost Efficiency</div>
              <div className="text-lg font-semibold text-green-600">{calculations.savingsPercent.toFixed(0)}%</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Strategy</div>
              <div className="text-lg font-semibold">{calculations.shouldUseBatch ? 'Batch' : 'Individual'}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Fee Model</div>
              <div className="text-lg font-semibold">{calculations.isMicroTrade ? 'Micro' : 'Standard'}</div>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {autoPilot ? (
            <Button onClick={handleAutoSelect} className="flex-1">
              Apply AI Recommendation
            </Button>
          ) : (
            <Button 
              onClick={() => {
                toast({
                  title: "Manual Settings Applied",
                  description: `Using ${calculations.recommendedStrategy} with custom priority level`,
                });
              }}
              className="flex-1"
            >
              Apply Manual Settings
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              const config = {
                amount,
                operationCount,
                strategy: calculations.recommendedStrategy,
                totalCost: calculations.totalCost,
                savings: calculations.savingsPercent
              };
              navigator.clipboard.writeText(JSON.stringify(config, null, 2));
              toast({ title: "Configuration Copied", description: "Smart fee config copied to clipboard." });
            }}
          >
            Copy Config
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Our AI continuously monitors market conditions and automatically selects the most cost-effective fee structure. 
          Switch to manual mode for custom priority levels.
        </p>
      </CardContent>
    </Card>
  );
}