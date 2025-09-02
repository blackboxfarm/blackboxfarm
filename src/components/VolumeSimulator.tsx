import React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { VolumeSimulatorPresets } from "./VolumeSimulatorPresets";
import { useSolPrice } from "@/hooks/useSolPrice";
import { SolPriceDisplay } from "@/components/SolPriceDisplay";

const formatNumber = (n: number, digits = 2) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "-";

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
};

export default function VolumeSimulator() {
  const [bankrollSol, setBankrollSol] = React.useState(1);
  const [tradeSizeUsd, setTradeSizeUsd] = React.useState(0.1);
  const { price: solPriceUsd } = useSolPrice();
  const [intervalSec, setIntervalSec] = React.useState(15);
  const [ammFeeBps, setAmmFeeBps] = React.useState(25); // 25 bps = 0.25%
  const [networkFeePreset, setNetworkFeePreset] = React.useState<"low" | "typical" | "busy">("typical");
  const [pairMode, setPairMode] = React.useState(true); // buy+sell per interval
  const [newAccounts, setNewAccounts] = React.useState(0); // optional first-time inits
  const [useBatchPricing, setUseBatchPricing] = React.useState(false); // Smithii-style batch pricing
  const [showPresets, setShowPresets] = React.useState(false);

  const networkFeePerTradeSOL = React.useMemo(() => {
    switch (networkFeePreset) {
      case "low":
        return 0.000005;
      case "busy":
        return 0.0001;
      default:
        return 0.00002;
    }
  }, [networkFeePreset]);

  const rentPerAccountSOL = 0.002;
  const upfrontRentCostSOL = newAccounts * rentPerAccountSOL;
  const availableSol = Math.max(bankrollSol - upfrontRentCostSOL, 0);

  const ammFeePerTradeSOL = React.useMemo(() => {
    const feePct = ammFeeBps / 10000; // bps -> percent
    if (solPriceUsd <= 0) return Infinity;
    return (tradeSizeUsd * feePct) / solPriceUsd;
  }, [tradeSizeUsd, ammFeeBps, solPriceUsd]);

  // Calculate fees first
  const totalFeePerTradeSOL = useBatchPricing 
    ? 0.025 / 100 // Smithii model: 0.025 SOL per 100 makers = 0.00025 SOL per trade
    : ammFeePerTradeSOL + networkFeePerTradeSOL;
  
  // Then calculate trades possible
  const tradesPossible = totalFeePerTradeSOL > 0 ? Math.floor(availableSol / totalFeePerTradeSOL) : 0;
  const tradesPerInterval = pairMode ? 2 : 1;
  const tradesPerSecond = intervalSec > 0 ? tradesPerInterval / intervalSec : 0;
  const runtimeSeconds = tradesPerSecond > 0 ? tradesPossible / tradesPerSecond : 0;
  const cycles = Math.floor(tradesPossible / 2);
  
  // Batch vs traditional comparison
  const traditionalFeePerTrade = ammFeePerTradeSOL + networkFeePerTradeSOL;
  const batchSavings = useBatchPricing 
    ? ((traditionalFeePerTrade - totalFeePerTradeSOL) / traditionalFeePerTrade) * 100 
    : 0;

  const totalFeePerTradeUSD = totalFeePerTradeSOL * solPriceUsd;

  const handleStart = () => {
    toast({
      title: "Simulation Only",
      description:
        "This tool estimates runtime and fees. On-chain automation isn’t enabled here. Tell me your router (Raydium/Orca/Pump) and network (devnet/mainnet) to plan next steps.",
    });
  };

  const loadPreset = (preset: any) => {
    setBankrollSol(preset.params.bankrollSol);
    setTradeSizeUsd(preset.params.tradeSizeUsd);
    // Note: SOL price is now live, so we don't set it from presets
    setIntervalSec(preset.params.intervalSec);
    setAmmFeeBps(preset.params.ammFeeBps);
    setNetworkFeePreset(preset.params.networkFeePreset);
    setPairMode(preset.params.pairMode);
    setUseBatchPricing(preset.params.useBatchPricing);
    toast({ title: "Preset loaded", description: `${preset.name} configuration applied (SOL price is live)` });
  };

  const savePreset = (name: string, description: string) => {
    toast({ title: "Preset saved", description: `${name} saved successfully` });
  };

  const currentParams = {
    bankrollSol,
    tradeSizeUsd,
    solPriceUsd,
    intervalSec,
    ammFeeBps,
    networkFeePreset,
    pairMode,
    useBatchPricing
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {showPresets && (
        <VolumeSimulatorPresets 
          onLoadPreset={loadPreset}
          currentParams={currentParams}
          onSavePreset={savePreset}
        />
      )}
      
      <Card className="shadow">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Solana Volume Bot Simulator</CardTitle>
            <Button 
              variant="outline" 
              onClick={() => setShowPresets(!showPresets)}
            >
              {showPresets ? 'Hide Presets' : 'Show Presets'}
            </Button>
          </div>
        </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bankroll">Bankroll (SOL)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  id="bankroll"
                  min={0.05}
                  max={10}
                  step={0.05}
                  value={[bankrollSol]}
                  onValueChange={([v]) => setBankrollSol(v)}
                />
                <Input
                  className="w-28"
                  type="number"
                  min={0}
                  step="0.01"
                  value={bankrollSol}
                  onChange={(e) => setBankrollSol(Number(e.target.value))}
                />
              </div>
              <p className="text-sm text-muted-foreground">Optional rent reserved: {formatNumber(upfrontRentCostSOL, 4)} SOL (for {newAccounts} new accounts)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trade-size">Trade size (USD)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  id="trade-size"
                  min={0.05}
                  max={5}
                  step={0.05}
                  value={[tradeSizeUsd]}
                  onValueChange={([v]) => setTradeSizeUsd(Number(v.toFixed(2)))}
                />
                <Input
                  className="w-28"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={tradeSizeUsd}
                  onChange={(e) => setTradeSizeUsd(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="interval">Interval (seconds)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  id="interval"
                  min={1}
                  max={60}
                  step={1}
                  value={[intervalSec]}
                  onValueChange={([v]) => setIntervalSec(v)}
                />
                <Input
                  className="w-28"
                  type="number"
                  min={1}
                  step="1"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="pairmode"
                  type="checkbox"
                  className="h-4 w-4 rounded border-border bg-input text-primary accent-primary"
                  checked={pairMode}
                  onChange={(e) => setPairMode(e.target.checked)}
                />
                <Label htmlFor="pairmode">Buy + sell within each interval</Label>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amm">AMM fee (bps)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  id="amm"
                  min={5}
                  max={100}
                  step={1}
                  value={[ammFeeBps]}
                  onValueChange={([v]) => setAmmFeeBps(Math.round(v))}
                />
                <Input
                  className="w-28"
                  type="number"
                  min={1}
                  step="1"
                  value={ammFeeBps}
                  onChange={(e) => setAmmFeeBps(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Network fee preset</Label>
              <div className="flex gap-2">
                {(["low", "typical", "busy"] as const).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={networkFeePreset === p ? "default" : "secondary"}
                    onClick={() => setNetworkFeePreset(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Fee per trade ≈ {formatNumber(networkFeePerTradeSOL, 6)} SOL
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sol-price">SOL Price (USD) - Live</Label>
              <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
                <SolPriceDisplay size="md" />
                <span className="text-sm text-muted-foreground ml-auto">
                  Auto-updating every 30s
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-accounts">New token accounts to init (optional)</Label>
              <Input
                id="new-accounts"
                className="w-28"
                type="number"
                min={0}
                step="1"
                value={newAccounts}
                onChange={(e) => setNewAccounts(Math.max(0, Math.floor(Number(e.target.value))))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="batch-pricing"
                  type="checkbox"
                  className="h-4 w-4 rounded border-border bg-input text-primary accent-primary"
                  checked={useBatchPricing}
                  onChange={(e) => setUseBatchPricing(e.target.checked)}
                />
                <Label htmlFor="batch-pricing">Use Batch Pricing (Smithii Model)</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {useBatchPricing 
                  ? `0.025 SOL per 100 operations = ${formatNumber(totalFeePerTradeSOL, 6)} SOL per trade`
                  : "Traditional per-transaction fees"
                }
              </p>
            </div>
          </section>
        </div>

        <article className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              {useBatchPricing ? "Batch fee per trade" : "AMM fee per trade"}
            </p>
            <p className="text-2xl font-semibold">
              {formatNumber(useBatchPricing ? totalFeePerTradeSOL : ammFeePerTradeSOL, 6)} SOL
            </p>
            <p className="text-sm text-muted-foreground">
              ≈ ${formatNumber((useBatchPricing ? totalFeePerTradeSOL : ammFeePerTradeSOL) * solPriceUsd, 5)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Total fee per trade</p>
            <p className="text-2xl font-semibold">{formatNumber(totalFeePerTradeSOL, 6)} SOL</p>
            <p className="text-sm text-muted-foreground">≈ ${formatNumber(totalFeePerTradeUSD, 4)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Trades possible</p>
            <p className="text-2xl font-semibold">{formatNumber(tradesPossible, 0)}</p>
            <p className="text-sm text-muted-foreground">Cycles (buy+sell): {formatNumber(cycles, 0)}</p>
          </div>
          {useBatchPricing && (
            <div className="rounded-lg border p-4 bg-green-50 border-green-200">
              <p className="text-sm text-muted-foreground">Batch savings</p>
              <p className="text-2xl font-semibold text-green-600">{formatNumber(batchSavings, 1)}%</p>
              <p className="text-sm text-muted-foreground">vs traditional pricing</p>
            </div>
          )}
        </article>

        <article className="mt-4 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Estimated runtime</p>
          <p className="text-2xl font-semibold">{formatDuration(runtimeSeconds)}</p>
          <p className="text-sm text-muted-foreground">Interval: {intervalSec}s • {pairMode ? "2 trades" : "1 trade"} per interval</p>
        </article>

        <p className="mt-6 text-xs text-muted-foreground">
          This is a planning tool. Actual fees vary with congestion and router. Avoid market manipulation and follow all applicable laws and venue rules.
        </p>
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button onClick={handleStart}>Start simulated run</Button>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(
              JSON.stringify(
                {
                  bankrollSol,
                  tradeSizeUsd,
                  solPriceUsd,
                  intervalSec,
                  ammFeeBps,
                  networkFeePreset,
                  pairMode,
                  newAccounts,
                },
                null,
                2
              )
            );
            toast({ title: "Plan copied", description: "Parameters copied to clipboard." });
          }}
        >
          Copy plan
        </Button>
      </CardFooter>
    </Card>
    </div>
  );
}
