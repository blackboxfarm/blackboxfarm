import React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useLocalSecrets } from "@/hooks/useLocalSecrets";
import { supabase } from "@/integrations/supabase/client";

// Supabase Functions fallback (direct URL) — uses public anon key
const SB_PROJECT_URL = "https://apxauapuusmgwbbzjgfl.supabase.co";
const SB_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU";
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
    const res = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-quote?priceMint=${encodeURIComponent(mint)}`, {
      headers: {
        'apikey': SB_ANON_KEY,
        'Authorization': `Bearer ${SB_ANON_KEY}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const j = await res.json();
    const p = j?.priceUSD;
    if (typeof p === 'number' && isFinite(p) && p > 0) return p;
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
  const { ready, secrets } = useLocalSecrets();

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

  type Trade = { id: string; time: number; side: 'buy'|'sell'; status: 'pending'|'confirmed'|'error'; signatures?: string[]; error?: string };
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [executing, setExecuting] = React.useState(false);

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

  const execSwap = React.useCallback(async (side: 'buy' | 'sell') => {
    if (executing) return false;
    setExecuting(true);
    const id = crypto.randomUUID();
    const newTrade: Trade = { id, time: Date.now(), side, status: 'pending' };
    setTrades((t) => [newTrade, ...t].slice(0, 25));
    try {
      const body = side === 'buy'
        ? { side: 'buy', tokenMint: cfg.tokenMint, usdcAmount: cfg.tradeSizeUsd, slippageBps: cfg.slippageBps }
        : { side: 'sell', tokenMint: cfg.tokenMint, sellAll: true, slippageBps: cfg.slippageBps };

      try {
        const { data, error } = await supabase.functions.invoke('raydium-swap', {
          body,
          headers: secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : undefined,
        });
        if (error) throw error;
        const sigs: string[] = data?.signatures ?? [];
        setTrades((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'confirmed', signatures: sigs } : x)));
        if (sigs.length) {
          toast({ title: `${side.toUpperCase()} executed`, description: `Confirmed tx: ${sigs[0].slice(0, 8)}…` });
        } else {
          toast({ title: `${side.toUpperCase()} executed`, description: `No signature returned` });
        }
        return true;
      } catch (firstErr: any) {
        // Fallback: direct fetch to Edge Function URL (handles occasional supabase-js invoke transport issues)
        const needFallback = /Failed to send a request to the Edge Function/i.test(firstErr?.message || "");
        if (!needFallback) throw firstErr;
        try {
          const res = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-swap`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SB_ANON_KEY,
              'Authorization': `Bearer ${SB_ANON_KEY}`,
              ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
          }
          const data = await res.json();
          const sigs: string[] = data?.signatures ?? [];
          setTrades((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'confirmed', signatures: sigs } : x)));
          toast({ title: `${side.toUpperCase()} executed`, description: sigs[0] ? `Confirmed tx: ${sigs[0].slice(0, 8)}…` : 'No signature returned' });
          return true;
        } catch (e2: any) {
          const msg = e2?.message ?? String(e2);
          setTrades((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'error', error: msg } : x)));
          toast({ title: 'Swap failed', description: msg });
          return false;
        }
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setTrades((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'error', error: msg } : x)));
      toast({ title: 'Swap failed', description: msg });
      return false;
    } finally {
      setExecuting(false);
    }
  }, [executing, cfg.tokenMint, cfg.tradeSizeUsd, cfg.slippageBps, supabase]);

  const tick = React.useCallback(async () => {
    if (executing) {
      setStatus('executing…');
      return;
    }
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
        setStatus(`BUY @ $${format(pNow, 6)} (dip ${cfg.dipPct}%)`);
        const ok = await execSwap('buy');
        if (ok) {
          setPosition({ entry: pNow });
          setDaily((d) => ({ ...d, buyUsd: d.buyUsd + cfg.tradeSizeUsd }));
        }
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
      setStatus(`SELL TP @ $${format(pNow, 6)} (+${cfg.takeProfitPct}%)`);
      const ok = await execSwap('sell');
      if (ok) {
        setPosition(null);
        setLastSellTs(Date.now());
        toast({ title: 'Take profit', description: `Sold at $${format(pNow, 6)} (target ${cfg.takeProfitPct}%)` });
      }
      return;
    }

    if (pNow <= sl) {
      setStatus(`SELL SL @ $${format(pNow, 6)} (−${cfg.stopLossPct}%)`);
      const ok = await execSwap('sell');
      if (ok) {
        setPosition(null);
        setLastSellTs(Date.now());
        toast({ title: 'Stop loss', description: `Sold at $${format(pNow, 6)} (stop ${cfg.stopLossPct}%)` });
      }
      return;
    }

    setStatus(`Holding — entry $${format(entry, 6)} • now $${format(pNow, 6)} • TP $${format(tp, 6)} • SL $${format(sl, 6)}`);
  }, [executing, cfg, canBuy, effectivePrice, manualPrice, position, trailingHigh, execSwap]);

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
        <CardTitle>Live Strategy Runner (Raydium)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
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
          </div>

          <aside className="space-y-2">
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Recent trades</div>
              <ul className="space-y-1 max-h-72 overflow-auto">
                {trades.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(t.time).toLocaleTimeString()} • {t.side.toUpperCase()} • {t.status}
                    </span>
                    {t.signatures?.[0] && (
                      <a
                        className="underline"
                        href={`https://solscan.io/tx/${t.signatures[0]}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        View tx
                      </a>
                    )}
                    {t.error && <span className="text-destructive">{t.error}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {running ? (
          <Button variant="secondary" onClick={stop} disabled={executing}>Stop</Button>
        ) : (
          <Button onClick={start} disabled={executing}>Start</Button>
        )}
        <Button onClick={() => void execSwap('buy')} disabled={executing}>Buy now</Button>
        <Button variant="outline" onClick={() => void execSwap('sell')} disabled={executing}>Sell now</Button>
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
