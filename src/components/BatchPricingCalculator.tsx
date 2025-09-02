import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Calculator, Users, Zap, TrendingDown } from "lucide-react";
import { useSolPrice } from "@/hooks/useSolPrice";
import { SolPriceDisplay } from "@/components/SolPriceDisplay";

export function BatchPricingCalculator() {
  const [makersNeeded, setMakersNeeded] = useState(100);
  const { price: solPrice } = useSolPrice();
  const [batchMode, setBatchMode] = useState<"bump" | "volume" | "spray">("bump");

  const calculations = useMemo(() => {
    // Smithii-style batch pricing model
    const costPer100Makers = 0.025; // SOL per 100 makers (Smithii rate)
    const minBatch = 10; // Minimum makers
    const actualBatches = Math.ceil(makersNeeded / 100);
    const totalCostSOL = actualBatches * costPer100Makers;
    
    // Calculate effective per-maker cost
    const costPerMaker = totalCostSOL / makersNeeded;
    
    // Compare with traditional per-transaction model
    const traditionalGasFee = 0.000005; // Base Solana fee
    const traditionalPriorityFee = 0.00002; // Typical priority fee
    const traditionalServiceFee = 0.0018; // Current service fee per tx
    const traditionalPerTx = traditionalGasFee + traditionalPriorityFee + traditionalServiceFee;
    const traditionalTotal = traditionalPerTx * makersNeeded;
    
    const savings = traditionalTotal - totalCostSOL;
    const savingsPercent = (savings / traditionalTotal) * 100;
    
    // Network efficiency calculation
    const networkFeesOnly = (traditionalGasFee + traditionalPriorityFee) * makersNeeded;
    const overhead = totalCostSOL - networkFeesOnly;
    const overheadPercent = (overhead / networkFeesOnly) * 100;

    return {
      totalCostSOL,
      totalCostUSD: totalCostSOL * solPrice,
      costPerMaker,
      costPerMakerUSD: costPerMaker * solPrice,
      actualBatches,
      traditionalTotal,
      traditionalPerTx,
      savings,
      savingsPercent,
      networkFeesOnly,
      overhead,
      overheadPercent
    };
  }, [makersNeeded, solPrice]);

  const batchModeConfig = {
    bump: {
      title: "Bump Bot Operations",
      description: "Volume generation for token promotion",
      icon: <TrendingDown className="h-4 w-4" />,
      minMakers: 10,
      maxMakers: 1000
    },
    volume: {
      title: "Volume Trading",
      description: "High-frequency trading operations",
      icon: <Zap className="h-4 w-4" />,
      minMakers: 50,
      maxMakers: 5000
    },
    spray: {
      title: "Multi-Wallet Operations",
      description: "Coordinated wallet actions",
      icon: <Users className="h-4 w-4" />,
      minMakers: 20,
      maxMakers: 2000
    }
  };

  const currentConfig = batchModeConfig[batchMode];

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Batch Pricing Calculator - Smithii Model
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pay per batch of operations, not per transaction - dramatically cheaper for volume operations
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Selection */}
        <div className="space-y-3">
          <Label>Operation Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(batchModeConfig) as Array<keyof typeof batchModeConfig>).map((mode) => (
              <Button
                key={mode}
                variant={batchMode === mode ? "default" : "outline"}
                size="sm"
                className="flex items-center gap-2 h-auto p-3"
                onClick={() => setBatchMode(mode)}
              >
                {batchModeConfig[mode].icon}
                <div className="text-left">
                  <div className="font-medium text-xs">{batchModeConfig[mode].title}</div>
                  <div className="text-xs text-muted-foreground">{batchModeConfig[mode].description}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Input Controls */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="makers">Number of Makers/Operations</Label>
              <div className="flex items-center gap-3 mt-2">
                <Slider
                  value={[makersNeeded]}
                  onValueChange={([v]) => setMakersNeeded(v)}
                  min={currentConfig.minMakers}
                  max={currentConfig.maxMakers}
                  step={10}
                  className="flex-1"
                />
                <Input
                  id="makers"
                  type="number"
                  value={makersNeeded}
                  onChange={(e) => setMakersNeeded(Math.max(currentConfig.minMakers, parseInt(e.target.value) || 0))}
                  className="w-24"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Batched in groups of 100 • {calculations.actualBatches} batches needed
              </p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="solPrice">SOL Price (USD) - Live</Label>
              <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/30 mt-2">
                <SolPriceDisplay size="md" />
                <span className="text-sm text-muted-foreground ml-auto">
                  Auto-updating
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Batch Pricing Breakdown */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="font-medium">Batch Pricing (Smithii Model)</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Cost per 100 makers:</span>
                <span className="font-medium">0.025 SOL</span>
              </div>
              <div className="flex justify-between">
                <span>Batches needed:</span>
                <span>{calculations.actualBatches}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total Cost:</span>
                <span className="text-primary">{calculations.totalCostSOL.toFixed(6)} SOL</span>
              </div>
              <div className="text-center text-muted-foreground">
                ${calculations.totalCostUSD.toFixed(2)} USD
              </div>
              <div className="text-center text-xs text-muted-foreground">
                ${(calculations.costPerMakerUSD * 1000).toFixed(4)} per 1000 operations
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-orange-50 border-orange-200">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-orange-600" />
              <h3 className="font-medium text-orange-800">Traditional Per-TX Model</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Cost per transaction:</span>
                <span className="font-medium">{calculations.traditionalPerTx.toFixed(6)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span>Number of operations:</span>
                <span>{makersNeeded}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total Cost:</span>
                <span className="text-orange-600">{calculations.traditionalTotal.toFixed(6)} SOL</span>
              </div>
              <div className="text-center text-muted-foreground">
                ${(calculations.traditionalTotal * solPrice).toFixed(2)} USD
              </div>
            </div>
          </Card>
        </div>

        {/* Savings Calculation */}
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-green-600" />
            <h3 className="font-medium text-green-800">Massive Savings with Batch Model</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-muted-foreground">SOL Saved</div>
              <div className="text-xl font-bold text-green-600">
                {calculations.savings.toFixed(6)}
              </div>
              <div className="text-xs text-muted-foreground">SOL</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">USD Saved</div>
              <div className="text-xl font-bold text-green-600">
                ${(calculations.savings * solPrice).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">USD</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Savings</div>
              <div className="text-xl font-bold text-green-600">
                {calculations.savingsPercent.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">cheaper</div>
            </div>
          </div>
        </Card>

        {/* Comparison Table */}
        <Card className="p-4">
          <h3 className="font-medium mb-3">Batch Size Comparison</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[10, 50, 100, 500, 1000].map((size) => {
              const batches = Math.ceil(size / 100);
              const batchCost = batches * 0.025;
              const traditionalCost = size * calculations.traditionalPerTx;
              const savings = ((traditionalCost - batchCost) / traditionalCost) * 100;
              
              return (
                <div key={size} className="p-3 border rounded-lg">
                  <div className="font-medium mb-1">{size} makers</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Batch:</span>
                      <span className="text-primary">{batchCost.toFixed(4)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Traditional:</span>
                      <span className="text-muted-foreground">{traditionalCost.toFixed(4)} SOL</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {savings.toFixed(0)}% cheaper
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => {
              toast({
                title: "Batch Pricing Active",
                description: `${calculations.actualBatches} batches of 100 makers each = ${calculations.totalCostSOL.toFixed(6)} SOL total cost`,
              });
            }}
          >
            Use Batch Pricing
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const config = {
                mode: batchMode,
                makersNeeded,
                totalCostSOL: calculations.totalCostSOL,
                savingsPercent: calculations.savingsPercent,
                solPrice
              };
              navigator.clipboard.writeText(JSON.stringify(config, null, 2));
              toast({ title: "Configuration Copied", description: "Batch pricing config copied to clipboard." });
            }}
          >
            Copy Config
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Batch pricing follows Smithii's proven model: 0.025 SOL per 100 operations. 
          Minimum 10 operations. Perfect for volume bots, bump operations, and multi-wallet coordination.
        </p>
      </CardContent>
    </Card>
  );
}