import React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useLocalSecrets } from "@/hooks/useLocalSecrets";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  quoteAsset: 'SOL' | 'USDC';
};

function format(n: number, d = 4) {
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "-";
}

async function fetchJupPriceUSD(mint: string): Promise<number | null> {
  // 1) DexScreener (client-friendly)
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.pairs?.[0]?.priceUsd);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {}
  // 2) Our edge proxy (works even when browser can’t reach price sources)
  try {
    const r2 = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-quote?priceMint=${encodeURIComponent(mint)}`, {
      headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${SB_ANON_KEY}` },
      cache: 'no-store',
    });
    if (r2.ok) {
      const j2 = await r2.json();
      const p2 = Number(j2?.priceUSD);
      if (Number.isFinite(p2) && p2 > 0) return p2;
    }
  } catch {}
  // 3) Jupiter fallback (best-effort)
  try {
    const r3 = await fetch(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(mint)}&vsToken=USDC`, { cache: 'no-store' });
    if (r3.ok) {
      const j3 = await r3.json();
      const p3 = Number(j3?.data?.[mint]?.price);
      if (Number.isFinite(p3) && p3 > 0) return p3;
    }
  } catch {}
  return null;
}

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function fetchSolUsd(): Promise<number | null> {
  const tryEdge = async (id: string) => {
    try {
      const r = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-quote?priceMint=${encodeURIComponent(id)}`, {
        headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${SB_ANON_KEY}` },
        cache: 'no-store',
      });
      if (r.ok) {
        const j = await r.json();
        const p = Number(j?.priceUSD);
        if (Number.isFinite(p) && p > 0) return p;
      }
    } catch {}
    return null;
  };

  // Prefer WSOL mint to avoid symbol ambiguity
  const p1 = await tryEdge(WSOL_MINT);
  if (p1) return p1;

  const p2 = await tryEdge('SOL');
  if (p2) return p2;

  const p3 = await tryEdge('wSOL');
  if (p3) return p3;

  // Jupiter direct (best-effort)
  try {
    const r = await fetch('https://price.jup.ag/v6/price?ids=SOL', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.data?.SOL?.price ?? j?.data?.wSOL?.price ?? j?.SOL?.price);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {}
  try {
    const r = await fetch(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(WSOL_MINT)}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.data?.[WSOL_MINT]?.price);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {}
  return null;
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
    intervalSec: 5,
    dipPct: 7,
    takeProfitPct: 12,
    stopLossPct: 1000,
    cooldownSec: 120,
    dailyCapUsd: 300,
    slippageBps: 1500,
    quoteAsset: 'SOL',
  });

  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState<string>("idle");
  const [price, setPrice] = React.useState<number | null>(null);
  const [manualPrice, setManualPrice] = React.useState<string>("18");
  const [trailingHigh, setTrailingHigh] = React.useState<number | null>(null);
  const [position, setPosition] = React.useState<{ entry: number } | null>(null);
  const [lastSellTs, setLastSellTs] = React.useState<number | null>(null);
  const [daily, setDaily] = React.useState<{ key: string; buyUsd: number }>({ key: todayKey(), buyUsd: 0 });

  type Trade = { id: string; time: number; side: 'buy'|'sell'; status: 'pending'|'confirmed'|'error'; signatures?: string[]; error?: string };
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [executing, setExecuting] = React.useState(false);
  const [wallet, setWallet] = React.useState<{ address: string; sol: number } | null>(null);
  const [walletLoading, setWalletLoading] = React.useState(false);

  const [holding, setHolding] = React.useState<{ mint: string; amountRaw: string; decimals: number; uiAmount: number } | null>(null);
  const [activity, setActivity] = React.useState<{ time: number; text: string }[]>([]);
  const log = React.useCallback((text: string) => {
    setActivity((a) => [{ time: Date.now(), text }, ...a].slice(0, 50));
  }, []);
  // reset daily counters when date changes
  React.useEffect(() => {
    const key = todayKey();
    setDaily((d) => (d.key === key ? d : { key, buyUsd: 0 }));
  }, [running]);

  const loadWallet = React.useCallback(async () => {
    setWalletLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('trader-wallet', {
        headers: secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : undefined,
      });
      if (error) throw error;
      const addr = data?.publicKey as string | undefined;
      const sol = Number(data?.solBalance);
      if (addr && Number.isFinite(sol)) setWallet({ address: addr, sol });
      else if (addr) setWallet({ address: addr, sol: NaN });
    } catch (_) {
      try {
        const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet`, {
          headers: {
            apikey: SB_ANON_KEY,
            Authorization: `Bearer ${SB_ANON_KEY}`,
            ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
          },
        });
        if (res.ok) {
          const j = await res.json();
          const addr = j?.publicKey as string | undefined;
          const sol = Number(j?.solBalance);
          if (addr && Number.isFinite(sol)) setWallet({ address: addr, sol });
          else if (addr) setWallet({ address: addr, sol: NaN });
        }
      } catch {}
    } finally {
      setWalletLoading(false);
    }
  }, [secrets?.functionToken]);

  React.useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const loadHoldings = React.useCallback(async () => {
    if (!cfg.tokenMint) return;
    try {
      const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent(cfg.tokenMint)}` , {
        headers: {
          apikey: SB_ANON_KEY,
          Authorization: `Bearer ${SB_ANON_KEY}`,
          ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
        },
      });
      if (res.ok) {
        const j = await res.json();
        const dec = Number(j?.tokenDecimals);
        const raw = String(j?.tokenBalanceRaw ?? "0");
        const ui = Number(j?.tokenUiAmount ?? (Number(raw) / Math.pow(10, Number.isFinite(dec) ? dec : 0)));
        if (j?.tokenMint) {
          setHolding({ mint: j.tokenMint, amountRaw: raw, decimals: Number.isFinite(dec) ? dec : 0, uiAmount: Number.isFinite(ui) ? ui : 0 });
        } else {
          setHolding(null);
        }
      }
    } catch {}
  }, [cfg.tokenMint, secrets?.functionToken]);

  React.useEffect(() => {
    void loadHoldings();
  }, [loadHoldings]);
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
      let body: any;
      if (cfg.quoteAsset === 'USDC') {
        body = side === 'buy'
          ? { side: 'buy', tokenMint: cfg.tokenMint, usdcAmount: cfg.tradeSizeUsd, slippageBps: cfg.slippageBps }
          : { side: 'sell', tokenMint: cfg.tokenMint, sellAll: true, slippageBps: cfg.slippageBps };
      } else {
        if (side === 'buy') {
          const solUsd = await fetchSolUsd();
          if (!solUsd || !Number.isFinite(solUsd) || solUsd <= 0) throw new Error('Failed to fetch SOL price');
          const lamports = Math.floor((cfg.tradeSizeUsd / solUsd) * 1_000_000_000 * 0.98);
          if (!Number.isFinite(lamports) || lamports <= 0) throw new Error('Computed lamports invalid');
          body = { inputMint: WSOL_MINT, outputMint: cfg.tokenMint, amount: lamports, slippageBps: cfg.slippageBps, wrapSol: true };
        } else {
          // Query fresh token balance to sell
          let raw = 0;
          try {
            const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent(cfg.tokenMint)}`, {
              headers: {
                apikey: SB_ANON_KEY,
                Authorization: `Bearer ${SB_ANON_KEY}`,
                ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
              },
            });
            if (res.ok) {
              const j = await res.json();
              raw = Number(j?.tokenBalanceRaw ?? 0);
            }
          } catch {}
          if (!Number.isFinite(raw) || raw <= 0) throw new Error('No token balance to sell');
          body = { inputMint: cfg.tokenMint, outputMint: WSOL_MINT, amount: Math.floor(raw), slippageBps: cfg.slippageBps, unwrapSol: true };
        }
      }

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
        await loadWallet();
        await loadHoldings();
        const freshPrice = await fetchJupPriceUSD(cfg.tokenMint);
        if (freshPrice !== null) setPrice(freshPrice);
        return true;
      } catch (firstErr: any) {
        // Fallback: direct fetch to Edge Function URL for any error from supabase.invoke
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
          await loadWallet();
          await loadHoldings();
          const freshPrice = await fetchJupPriceUSD(cfg.tokenMint);
          if (freshPrice !== null) setPrice(freshPrice);
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
  }, [executing, cfg.tokenMint, cfg.tradeSizeUsd, cfg.slippageBps, cfg.quoteAsset, supabase, loadWallet, loadHoldings]);

  const convertUsdcToSol = React.useCallback(async () => {
    if (executing) return;
    setExecuting(true);
    try {
      // Get USDC balance (raw) via wallet function
      let raw = 0;
      try {
        const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent(USDC_MINT)}` , {
          headers: {
            apikey: SB_ANON_KEY,
            Authorization: `Bearer ${SB_ANON_KEY}`,
            ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
          },
        });
        if (res.ok) {
          const j = await res.json();
          raw = Number(j?.tokenBalanceRaw ?? 0);
        }
      } catch {}
      if (!Number.isFinite(raw) || raw <= 0) {
        toast({ title: 'No USDC to convert', description: 'USDC balance is zero.' });
        return;
      }

      const body = { inputMint: USDC_MINT, outputMint: WSOL_MINT, amount: Math.floor(raw), slippageBps: cfg.slippageBps, unwrapSol: true } as const;

      try {
        const { data, error } = await supabase.functions.invoke('raydium-swap', {
          body,
          headers: secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : undefined,
        });
        if (error) throw error;
        const sigs: string[] = data?.signatures ?? [];
        toast({ title: 'Converted USDC to SOL', description: sigs[0] ? `Tx: ${sigs[0].slice(0,8)}…` : 'Success' });
      } catch (firstErr: any) {
        const res = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SB_ANON_KEY,
            Authorization: `Bearer ${SB_ANON_KEY}`,
            ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`HTTP ${res.status}: ${t}`);
        }
        const data = await res.json();
        const sigs: string[] = data?.signatures ?? [];
        toast({ title: 'Converted USDC to SOL', description: sigs[0] ? `Tx: ${sigs[0].slice(0,8)}…` : 'Success' });
      }

      await loadWallet();
    } catch (e: any) {
      toast({ title: 'Conversion failed', description: e?.message ?? String(e) });
    } finally {
      setExecuting(false);
    }
  }, [executing, cfg.slippageBps, supabase, secrets?.functionToken, loadWallet]);

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
          const tpPrice = pNow * (1 + cfg.takeProfitPct / 100);
          const expectedProfit = cfg.tradeSizeUsd * (cfg.takeProfitPct / 100);
          log(`Bought $${format(cfg.tradeSizeUsd, 2)} at $${format(pNow, 6)} — waiting to sell at $${format(tpPrice, 6)} (+${cfg.takeProfitPct}%, ~+$${format(expectedProfit, 2)})`);
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
        const nextBuy = high * (1 - cfg.dipPct / 100);
        log(`Sold at $${format(pNow, 6)} (TP +${cfg.takeProfitPct}%). Waiting for price dip to $${format(nextBuy, 6)} to buy back.`);
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
        const nextBuy = high * (1 - cfg.dipPct / 100);
        log(`Sold at $${format(pNow, 6)} (SL −${cfg.stopLossPct}%). Waiting for price dip to $${format(nextBuy, 6)} to buy back.`);
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
    // Immediately fetch fresh price and announce dip target
    (async () => {
      const p = await fetchJupPriceUSD(cfg.tokenMint);
      if (p !== null) {
        setPrice(p);
        setTrailingHigh((prev) => (prev === null ? p : Math.max(prev, p)));
        const nextBuy = p * (1 - cfg.dipPct / 100);
        log(`Watching — current $${format(p, 6)}. Will buy on dip to $${format(nextBuy, 6)} (−${cfg.dipPct}%).`);
      }
      // Prime balances on start
      await Promise.all([loadWallet(), loadHoldings()]);
      // Kick the first tick after priming
      void tick();
    })();
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

            <div className="grid md:grid-cols-4 gap-4">
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
              <div className="space-y-2">
                <Label>Quote Asset</Label>
                <Select value={cfg.quoteAsset} onValueChange={(v) => setCfg({ ...cfg, quoteAsset: v as 'SOL' | 'USDC' })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOL">SOL</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
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
              <div className="font-medium mb-2">Trading wallet</div>
              {wallet ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate" title={wallet.address}>
                      {wallet.address.slice(0, 4)}…{wallet.address.slice(-4)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(wallet.address)}>Copy</Button>
                      <a className="underline text-sm" href={`https://solscan.io/account/${wallet.address}`} target="_blank" rel="noreferrer noopener">View</a>
                    </div>
                  </div>
                  <div>Balance: {Number.isFinite(wallet.sol) ? `${wallet.sol.toFixed(4)} SOL` : '—'}</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void loadWallet()} disabled={walletLoading}>
                      {walletLoading ? 'Refreshing…' : 'Refresh'}
                    </Button>
                    <Button size="sm" onClick={() => void convertUsdcToSol()} disabled={executing}>Convert USDC→SOL</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Not loaded</span>
                  <Button size="sm" variant="outline" onClick={() => void loadWallet()} disabled={walletLoading}>
                    {walletLoading ? 'Refreshing…' : 'Load'}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Holdings</div>
              {holding ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Token</span>
                    <span title={cfg.tokenMint}>{cfg.tokenMint.slice(0,4)}…{cfg.tokenMint.slice(-4)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span>{holding.uiAmount.toFixed(6)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Value</span>
                    <span>{Number.isFinite(effectivePrice ?? NaN) ? `$${(holding.uiAmount * (effectivePrice || 0)).toFixed(2)}` : '—'}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void loadHoldings()}>Refresh</Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">No balance</span>
                  <Button size="sm" variant="outline" onClick={() => void loadHoldings()}>Load</Button>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Activity</div>
              <ul className="space-y-1 max-h-48 overflow-auto">
                {activity.map((a, idx) => (
                  <li key={idx} className="text-muted-foreground">
                    {new Date(a.time).toLocaleTimeString()} • {a.text}
                  </li>
                ))}
              </ul>
            </div>

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
