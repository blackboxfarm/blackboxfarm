import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TradeSimulatorProps {
  ethMainnetPrice: number;
  ethBasePrice: number;
  baseTokenPrice: number;
}

export const TradeSimulator = ({ 
  ethMainnetPrice, 
  ethBasePrice, 
  baseTokenPrice 
}: TradeSimulatorProps) => {
  const [amount, setAmount] = useState("1000");
  const [loopType, setLoopType] = useState<"A" | "B" | "C">("A");
  const [showResults, setShowResults] = useState(false);

  const calculateLoopA = (startAmount: number) => {
    const steps = [
      { 
        step: 1, 
        action: "Buy ETH on Mainnet", 
        amount: startAmount / ethMainnetPrice, 
        unit: "ETH",
        fee: 0,
        value: startAmount 
      },
      { 
        step: 2, 
        action: "Bridge to Base", 
        amount: (startAmount / ethMainnetPrice) * 0.995, 
        unit: "ETH",
        fee: startAmount * 0.005,
        value: (startAmount / ethMainnetPrice) * 0.995 * ethBasePrice 
      },
      { 
        step: 3, 
        action: "Swap to BASE", 
        amount: ((startAmount / ethMainnetPrice) * 0.995 * ethBasePrice) / baseTokenPrice * 0.997,
        unit: "BASE",
        fee: ((startAmount / ethMainnetPrice) * 0.995 * ethBasePrice) * 0.003,
        value: ((startAmount / ethMainnetPrice) * 0.995 * ethBasePrice) * 0.997
      },
      { 
        step: 4, 
        action: "Bridge back to Mainnet", 
        amount: ((startAmount / ethMainnetPrice) * 0.995 * ethBasePrice * 0.997) / ethMainnetPrice * 0.995,
        unit: "ETH",
        fee: ((startAmount / ethMainnetPrice) * 0.995 * ethBasePrice * 0.997) * 0.005,
        value: ((startAmount / ethMainnetPrice) * 0.995 * ethBasePrice * 0.997) * 0.995
      },
    ];

    const finalAmount = steps[steps.length - 1].value;
    const profit = finalAmount - startAmount;
    const profitPct = (profit / startAmount) * 100;

    return { steps, finalAmount, profit, profitPct };
  };

  const simulateTrade = () => {
    setShowResults(true);
  };

  const results = showResults ? calculateLoopA(parseFloat(amount)) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Trade Simulator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Investment Amount (USD)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
            />
          </div>
          <div className="space-y-2">
            <Label>Loop Type</Label>
            <Select value={loopType} onValueChange={(v) => setLoopType(v as "A" | "B" | "C")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Loop A - ETH Mainnet ↔ Base</SelectItem>
                <SelectItem value="B">Loop B - BASE Token</SelectItem>
                <SelectItem value="C" disabled>Loop C - Three-Way (Coming Soon)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={simulateTrade} className="w-full">
          <Calculator className="mr-2 h-4 w-4" />
          Simulate Trade
        </Button>

        {results && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Simulation Results</h3>
              <Badge 
                variant={results.profitPct > 0 ? "default" : "destructive"}
                className="flex items-center gap-1"
              >
                {results.profitPct > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {results.profitPct > 0 ? "+" : ""}{results.profitPct.toFixed(2)}%
              </Badge>
            </div>

            <div className="space-y-3">
              {results.steps.map((step) => (
                <div key={step.step} className="bg-muted/50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      Step {step.step}: {step.action}
                    </span>
                    {step.fee > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Fee: ${step.fee.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">
                      {step.amount.toFixed(4)} {step.unit}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ≈ ${step.value.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">Final Result</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Starting:</span>
                  <span className="font-medium">${parseFloat(amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Ending:</span>
                  <span className="font-medium">${results.finalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Net Profit:</span>
                  <span className={results.profit > 0 ? "text-green-500" : "text-red-500"}>
                    {results.profit > 0 ? "+" : ""}${results.profit.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
