import React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useLocalSecrets } from "@/hooks/useLocalSecrets";

export type RunnerConfig = {
  tokenMint: string;
  tradeSizeUsd: number;
  intervalSec: number;
  dipPct: number; // e.g. 7 => 7%
  takeProfitPct: number; // e.g. 12
  stopLossPct: number; // e.g. 18
  cooldownSec: number; // cooldown after a sell
  dailyCapUsd: number; // maximum buys per day
  slippageBps: number; // for future on-chain
};

function format(n: number, d = 4) {
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "-";
}

async function fetchJupPriceUSD(mint: string): Promise<number | null> {
  try {
    const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(mint)}&vsToken=USDC`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    const p = j?.data?.[mint]?.price;
    if (typeof p === "number" && isFinite(p) && p > 0) return p;
    return null;
  } catch {
    return null;
  }
}

function useInterval(callback: () => void, delay: number | null) {
  const savedRef = React.useRef(callback);
  React.useEffect(() => {
    savedRef.current = callback;
  }, [callback]);
  React.useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function LiveRunner() {
  const { ready } = useLocalSecrets();

  const [cfg, setCfg] = React.useState<RunnerConfig>({
    tokenMint: "FTggXu7nYowpXjScSw7BZjtZDXywLNjK88CGhydDGgMS",
    tradeSizeUsd: 15,
    intervalSec: 60,
    dipPct: 7,
    takeProfitPct: 12,
    stopLossPct: 18,
    cooldownSec: 120,
    dailyCapUsd: 300,
    slippageBps: 1500,
  });

  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState<string>("idle");
  const [price, setPrice] = React.useState<number | null>(null);
  const [manualPrice, setManualPrice] = React.useState<string>("");
  const [trailingHigh, setTrailingHigh] = React.useState<number | null>(null);
  const [position, setPosition] = React.useState<{ entry: number } | null>(null);
  const [lastSellTs, setLastSellTs] = React.useState<number | null>(null);
  const [daily, setDaily] = React.useState<{ key: string; buyUsd: number }>({ key: todayKey(), buyUsd: 0 });

  // reset daily counters when date changes
  React.useEffect(() => {
    const key = todayKey();
    setDaily((d) => (d.key === key ? d : { key, buyUsd: 0 }));
  }, [running]);

  const effectivePrice = React.useMemo(() => {
    const m = Number(manualPrice);
    if (Number.isFinite(m) && m > 0) return m;
    return price;
  }, [manualPrice, price]);

  const canBuy = React.useMemo(() => {
    if (!effectivePrice) return false;
    if (daily.buyUsd + cfg.tradeSizeUsd > cfg.dailyCapUsd) return false;
    if (lastSellTs && Date.now() - lastSellTs < cfg.cooldownSec * 1000) return false;
    return !position; // only one position at a time
  }, [effectivePrice, daily, cfg, lastSellTs, position]);

  const tick = React.useCallback(async () => {
    // refresh price when manual not set
    if (!manualPrice) {
      const p = await fetchJupPriceUSD(cfg.tokenMint);
      setPrice(p);
    }

    const pNow = effectivePrice;
    if (!pNow || !Number.isFinite(pNow)) return;

    setTrailingHigh((prev) => (prev === null ? pNow : Math.max(prev, pNow)));
    const high = trailingHigh === null ? pNow : Math.max(trailingHigh, pNow);

    if (!position) {
      // Entry condition: dip from trailing high
      if (canBuy && pNow <= high * (1 - cfg.dipPct / 100)) {
        setPosition({ entry: pNow });
        setDaily((d) => ({ ...d, buyUsd: d.buyUsd + cfg.tradeSizeUsd }));
        setStatus(`BUY @ $${format(pNow, 6)} (dip ${cfg.dipPct}%)`);
        toast({ title: "Buy signal", description: `Buy $${cfg.tradeSizeUsd} at $${format(pNow, 6)}` });
      } else {
        setStatus(`Watching — price $${format(pNow, 6)} • high $${format(high, 6)}`);
      }
      return;
    }

    // In position: TP/SL handling
    const entry = position.entry;
    const tp = entry * (1 + cfg.takeProfitPct / 100);
    const sl = entry * (1 - cfg.stopLossPct / 100);

    if (pNow >= tp) {
      setPosition(null);
      setLastSellTs(Date.now());
      setStatus(`SELL TP @ $${format(pNow, 6)} (+${cfg.takeProfitPct}%)`);
      toast({ title: "Take profit", description: `Sold at $${format(pNow, 6)} (target ${cfg.takeProfitPct}%)` });
      return;
    }

    if (pNow <= sl) {
      setPosition(null);
      setLastSellTs(Date.now());
      setStatus(`SELL SL @ $${format(pNow, 6)} (−${cfg.stopLossPct}%)`);
      toast({ title: "Stop loss", description: `Sold at $${format(pNow, 6)} (stop ${cfg.stopLossPct}%)` });
      return;
    }

    setStatus(`Holding — entry $${format(entry, 6)} • now $${format(pNow, 6)} • TP $${format(tp, 6)} • SL $${format(sl, 6)}`);
  }, [cfg, canBuy, effectivePrice, manualPrice, position, trailingHigh]);

  useInterval(() => {
    if (running) void tick();
  }, running ? cfg.intervalSec * 1000 : null);

  const start = () => {
    if (!ready) {
      toast({ title: "Secrets required", description: "Set Secrets (RPC + Private Key) to enable future on-chain execution." });
    }
    setRunning(true);
    setStatus("running");
    void tick();
  };
  const stop = () => {
    setRunning(false);
    setStatus("stopped");
  };

  return (
    <Card className="max-w-4xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Live Strategy Runner (Simulated)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Token Mint</Label>
            <Input value={cfg.tokenMint} onChange={(e) => setCfg({ ...cfg, tokenMint: e.target.value.trim() })} />
          </div>
          <div className="space-y-2">
            <Label>Trade Size (USD)</Label>
            <Input type="number" value={cfg.tradeSizeUsd} onChange={(e) => setCfg({ ...cfg, tradeSizeUsd: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Interval (s)</Label>
            <Input type="number" value={cfg.intervalSec} onChange={(e) => setCfg({ ...cfg, intervalSec: Number(e.target.value) })} />
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Dip %</Label>
            <Input type="number" value={cfg.dipPct} onChange={(e) => setCfg({ ...cfg, dipPct: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Take Profit %</Label>
            <Input type="number" value={cfg.takeProfitPct} onChange={(e) => setCfg({ ...cfg, takeProfitPct: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Stop Loss %</Label>
            <Input type="number" value={cfg.stopLossPct} onChange={(e) => setCfg({ ...cfg, stopLossPct: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Cooldown (s)</Label>
            <Input type="number" value={cfg.cooldownSec} onChange={(e) => setCfg({ ...cfg, cooldownSec: Number(e.target.value) })} />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Daily Cap (USD)</Label>
            <Input type="number" value={cfg.dailyCapUsd} onChange={(e) => setCfg({ ...cfg, dailyCapUsd: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Slippage (bps)</Label>
            <Input type="number" value={cfg.slippageBps} onChange={(e) => setCfg({ ...cfg, slippageBps: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Manual Price Override (USD)</Label>
            <Input placeholder="leave empty to auto" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
          Status: {status} | Price: ${format(effectivePrice ?? NaN, 6)} | Trailing High: ${format(trailingHigh ?? NaN, 6)} | Position: {position ? `IN @ $${format(position.entry, 6)}` : "none"} | Daily buys: ${format(daily.buyUsd, 2)} / ${format(cfg.dailyCapUsd, 2)}
        </div>
        {!ready && (
          <p className="text-xs text-muted-foreground">Note: Secrets not set — on-chain execution remains disabled; this panel simulates signals only.</p>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        {running ? (
          <Button variant="secondary" onClick={stop}>Stop</Button>
        ) : (
          <Button onClick={start}>Start</Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setTrailingHigh(null);
            setPosition(null);
            setLastSellTs(null);
            setStatus("reset");
          }}
        >
          Reset state
        </Button>
      </CardFooter>
    </Card>
  );
}
