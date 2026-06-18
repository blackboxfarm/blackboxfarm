import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSolPrice } from "@/hooks/useSolPrice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Download, Sparkles, Copy, ArrowDownToLine, Zap, Waves, Play, X, ShoppingCart, DollarSign } from "lucide-react";
import { WaterfallWalletDrawer, type WaterfallWallet, type TokenHolding } from "./WaterfallWalletDrawer";

const SHORT = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;
const LAMPORTS_PER_SOL = 1_000_000_000;
const FEE_BUFFER_LAMPORTS = 10_000;
const SIM_STORAGE_KEY = "waterfall_sim_mode";
const SIM_TROLL_CYCLES = 10;
const SIM_TROLL_COST_PER_CYCLE = 0.0002; // SOL "fee" per simulated cycle
const SIM_DEFAULT_SEED_SOL = 12; // fake SOL credited to R1 of each column when sim starts / is reset

export type SimLogEntry = {
  ts: number;
  col: number;
  row: number;
  kind: "BUY" | "SELL" | "TROLL" | "CASCADE" | "WITHDRAW" | "RESET";
  msg: string;
};

type PlanHop = {
  row: number;
  leaveBehindLamports: number;
  projectedIncomingLamports: number;
  projectedForwardLamports: number; // 0 for terminal W10
  insufficient: boolean;
};
type CascadePlan = {
  columnIndex: number;
  basisW1Lamports: number;
  hops: PlanHop[]; // length 10 (rows 0..9)
};

function buildCascadePlan(columnIndex: number, w1Sol: number): CascadePlan {
  const basis = Math.floor(w1Sol * LAMPORTS_PER_SOL);
  const hops: PlanHop[] = [];
  let incoming = basis;
  // Dynamic even-split target: divide W1 balance by 10 wallets, then jitter ±15% per hop.
  const targetLamports = Math.floor(basis / 10);
  for (let r = 0; r < 10; r++) {
    if (r === 9) {
      hops.push({
        row: r,
        leaveBehindLamports: incoming, // terminal, just sits
        projectedIncomingLamports: incoming,
        projectedForwardLamports: 0,
        insufficient: incoming < 5_000_000, // 0.005 SOL min for troll
      });
      break;
    }
    const jitter = 1 + (Math.random() * 0.30 - 0.15); // ±15%
    const leave = Math.max(1, Math.floor(targetLamports * jitter));
    const forward = incoming - leave - FEE_BUFFER_LAMPORTS;
    const insufficient = forward < 5_000_000;
    hops.push({
      row: r,
      leaveBehindLamports: leave,
      projectedIncomingLamports: incoming,
      projectedForwardLamports: Math.max(0, forward),
      insufficient,
    });
    incoming = forward;
  }
  return { columnIndex, basisW1Lamports: basis, hops };
}

const fmtSol = (lamports: number) => (lamports / LAMPORTS_PER_SOL).toFixed(4);

type CascadeRun = {
  id: string;
  column_index: number;
  status: string;
  current_wallet_row: number | null;
  current_step: string | null;
  error: string | null;
};

export default function WaterfallGrid() {
  const [wallets, setWallets] = useState<WaterfallWallet[]>([]);
  const [balances, setBalances] = useState<Record<string, { sol: number; tokens: TokenHolding[] }>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [active, setActive] = useState<WaterfallWallet | null>(null);
  const [cascades, setCascades] = useState<Record<number, CascadeRun>>({});
  const [plans, setPlans] = useState<Record<number, CascadePlan>>({});
  const { priceData } = useSolPrice() as any;
  const solUsd = priceData?.price ?? 0;

  // Buy target — single token mint pasted at the top, with per-column enable checkboxes.
  const [targetMint, setTargetMint] = useState<string>("");
  const [buySizePct, setBuySizePct] = useState<string>("95");
  const [buyEnabled, setBuyEnabled] = useState<boolean[]>(() => Array.from({ length: 10 }, () => true));
  const [tokenPrices, setTokenPrices] = useState<Record<string, { priceUsd: number; symbol: string }>>({});

  // ─── SIMULATION MODE ────────────────────────────────────────────────────
  const [simMode, setSimMode] = useState<boolean>(() => {
    try { return localStorage.getItem(SIM_STORAGE_KEY) === "1"; } catch { return false; }
  });
  const [simState, setSimState] = useState<Record<string, { sol: number; tokens: Record<string, number> }>>({});
  const [simLog, setSimLog] = useState<SimLogEntry[]>([]);
  const [simLogOpen, setSimLogOpen] = useState(true);

  // Funding toolbar state
  const [simFundCol, setSimFundCol] = useState<string>("all"); // "all" or "0".."9"
  const [simFundAmount, setSimFundAmount] = useState<string>("10");

  // Bulk-sell busy flags
  const [sellingCol, setSellingCol] = useState<number | null>(null);
  const [sellingGrid, setSellingGrid] = useState<boolean>(false);

  const appendLog = useCallback((e: Omit<SimLogEntry, "ts">) => {
    setSimLog((prev) => [{ ...e, ts: Date.now() }, ...prev].slice(0, 500));
  }, []);

  // Seed default: R1 of each column gets SIM_DEFAULT_SEED_SOL fake SOL, everything else zero.
  const seedDefaultSim = useCallback(() => {
    const snap: Record<string, { sol: number; tokens: Record<string, number> }> = {};
    for (const w of wallets) {
      snap[w.id] = {
        sol: w.row_index === 0 ? SIM_DEFAULT_SEED_SOL : 0,
        tokens: {},
      };
    }
    setSimState(snap);
  }, [wallets]);

  useEffect(() => {
    try { localStorage.setItem(SIM_STORAGE_KEY, simMode ? "1" : "0"); } catch {}
    if (simMode && Object.keys(simState).length === 0 && wallets.length > 0) {
      seedDefaultSim();
      appendLog({ col: -1, row: -1, kind: "RESET", msg: `Seeded ${SIM_DEFAULT_SEED_SOL} SOL on R1 of all 10 waterfalls.` });
    }
    if (!simMode) {
      setSimState({});
      setSimLog([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simMode, wallets.length]);

  const resetAllGrid = () => {
    seedDefaultSim();
    setSimLog([]);
    appendLog({ col: -1, row: -1, kind: "RESET", msg: `Grid reset · R1 of all 10 waterfalls seeded with ${SIM_DEFAULT_SEED_SOL} SOL.` });
    toast({ title: "Sim grid reset", description: `R1 of all columns = ${SIM_DEFAULT_SEED_SOL} SOL` });
  };

  // Add fake SOL to R1 of one column, or all columns.
  const simFund = (colSel: string, amountSol: number) => {
    if (!(amountSol > 0)) return toast({ title: "Enter an amount > 0", variant: "destructive" });
    const cols = colSel === "all" ? Array.from({ length: 10 }, (_, i) => i) : [parseInt(colSel, 10)];
    setSimState((prev) => {
      const next = { ...prev };
      for (const c of cols) {
        const w1 = wallets.find((w) => w.column_index === c && w.row_index === 0);
        if (!w1) continue;
        const cur = next[w1.id] ?? { sol: 0, tokens: {} };
        next[w1.id] = { ...cur, sol: cur.sol + amountSol };
      }
      return next;
    });
    const usd = solUsd > 0 ? ` ($${(amountSol * solUsd).toFixed(2)})` : "";
    if (colSel === "all") {
      appendLog({ col: -1, row: 0, kind: "RESET", msg: `SIM FUND · +${amountSol} SOL${usd} to R1 of ALL 10 waterfalls` });
    } else {
      const c = parseInt(colSel, 10);
      appendLog({ col: c, row: 0, kind: "RESET", msg: `W${c + 1}·R1  SIM FUND  +${amountSol} SOL${usd}` });
    }
  };

  // Zero out all 10 wallets in a single column.
  const simClearColumn = (col: number) => {
    setSimState((prev) => {
      const next = { ...prev };
      for (const w of wallets) {
        if (w.column_index === col) next[w.id] = { sol: 0, tokens: {} };
      }
      return next;
    });
    appendLog({ col, row: -1, kind: "RESET", msg: `W${col + 1}  SIM CLEAR  (10 wallets zeroed)` });
  };

  // Re-seed just one column's R1 to default.
  const simSeedColumn = (col: number) => {
    setSimState((prev) => {
      const next = { ...prev };
      const w1 = wallets.find((w) => w.column_index === col && w.row_index === 0);
      if (w1) next[w1.id] = { sol: SIM_DEFAULT_SEED_SOL, tokens: {} };
      return next;
    });
    appendLog({ col, row: 0, kind: "RESET", msg: `W${col + 1}·R1  SIM SEED  ${SIM_DEFAULT_SEED_SOL} SOL` });
  };

  const simBuy = useCallback((w: WaterfallWallet, mint: string, lamportsIn: number) => {
    const meta = tokenPrices[mint];
    const priceUsd = meta?.priceUsd ?? 0;
    const solPriceUsd = solUsd || 0;
    const solIn = lamportsIn / LAMPORTS_PER_SOL;
    const usdIn = solIn * solPriceUsd * 0.99;
    const tokensOut = priceUsd > 0 ? usdIn / priceUsd : 0;
    setSimState((prev) => {
      const cur = prev[w.id] ?? { sol: 0, tokens: {} };
      const newSol = Math.max(0, cur.sol - solIn - 0.00001);
      const newTokens = { ...cur.tokens, [mint]: (cur.tokens[mint] ?? 0) + tokensOut };
      return { ...prev, [w.id]: { sol: newSol, tokens: newTokens } };
    });
    appendLog({
      col: w.column_index, row: w.row_index, kind: "BUY",
      msg: `W${w.column_index + 1}·R${w.row_index + 1}  SIM BUY  ${solIn.toFixed(4)} SOL → ${tokensOut.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${meta?.symbol ?? "?"} @ $${priceUsd ? priceUsd.toFixed(8).replace(/\.?0+$/, "") : "?"}`,
    });
  }, [tokenPrices, solUsd, appendLog]);

  const simSell = useCallback((w: WaterfallWallet, mint: string) => {
    const meta = tokenPrices[mint];
    const priceUsd = meta?.priceUsd ?? 0;
    const solPriceUsd = solUsd || 0;
    setSimState((prev) => {
      const cur = prev[w.id] ?? { sol: 0, tokens: {} };
      const amt = cur.tokens[mint] ?? 0;
      const usdOut = amt * priceUsd * 0.99;
      const solOut = solPriceUsd > 0 ? usdOut / solPriceUsd : 0;
      const newTokens = { ...cur.tokens };
      delete newTokens[mint];
      appendLog({
        col: w.column_index, row: w.row_index, kind: "SELL",
        msg: `W${w.column_index + 1}·R${w.row_index + 1}  SIM SELL ${amt.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${meta?.symbol ?? "?"} → ${solOut.toFixed(4)} SOL`,
      });
      return { ...prev, [w.id]: { sol: cur.sol + solOut - 0.00001, tokens: newTokens } };
    });
  }, [tokenPrices, solUsd, appendLog]);

  const simTroll = useCallback((w: WaterfallWallet) => {
    const cost = SIM_TROLL_CYCLES * SIM_TROLL_COST_PER_CYCLE;
    setSimState((prev) => {
      const cur = prev[w.id] ?? { sol: 0, tokens: {} };
      return { ...prev, [w.id]: { ...cur, sol: Math.max(0, cur.sol - cost) } };
    });
    appendLog({
      col: w.column_index, row: w.row_index, kind: "TROLL",
      msg: `W${w.column_index + 1}·R${w.row_index + 1}  SIM TROLL ${SIM_TROLL_CYCLES} cycles · -${cost.toFixed(4)} SOL net`,
    });
  }, [appendLog]);

  // ─── BULK SELL (per column + entire grid) ──────────────────────────────
  // Returns wallets in a column (or all columns when col === -1) that currently
  // hold `targetMint` with a positive balance.
  const collectSellTargets = useCallback((col: number): WaterfallWallet[] => {
    const mint = targetMint.trim();
    if (!mint) return [];
    const inScope = col < 0 ? wallets : wallets.filter((w) => w.column_index === col);
    return inScope.filter((w) => {
      if (simMode) {
        const amt = simState[w.id]?.tokens?.[mint] ?? 0;
        return amt > 0;
      }
      const held = (balances[w.pubkey]?.tokens ?? []).find((t) => t.mint === mint);
      return !!held && held.amount > 0;
    });
  }, [wallets, balances, simState, simMode, targetMint]);

  const sellOneLive = async (w: WaterfallWallet, mint: string) => {
    const { error } = await supabase.functions.invoke("waterfall-swap", {
      body: { walletId: w.id, mint, side: "sell" },
    });
    if (error) throw new Error(error.message);
  };

  const sellColumn = async (col: number) => {
    const mint = targetMint.trim();
    if (!mint) return toast({ title: "Set a token address at the top", variant: "destructive" });
    const list = collectSellTargets(col);
    if (list.length === 0) return toast({ title: `W${col + 1}: no wallets hold target token`, variant: "destructive" });
    if (!confirm(`Sell ALL ${mint.slice(0, 6)}… in every wallet of W${col + 1}?\nThis will sell ${list.length} wallet(s) immediately.`)) return;
    setSellingCol(col);
    let ok = 0; let firstErr = "";
    try {
      for (const w of list) {
        try {
          if (simMode) simSell(w, mint);
          else await sellOneLive(w, mint);
          ok++;
        } catch (e: any) {
          if (!firstErr) firstErr = e?.message || String(e);
        }
        await new Promise((r) => setTimeout(r, simMode ? 80 : 200));
      }
      if (simMode) appendLog({ col, row: -1, kind: "SELL", msg: `W${col + 1}  SIM SELL WATERFALL  (${ok}/${list.length} wallets)` });
      toast({
        title: `W${col + 1} sold ${ok}/${list.length}`,
        description: firstErr ? `First error: ${firstErr}` : simMode ? "Simulation complete." : "Submitted.",
        variant: firstErr ? "destructive" : "default",
      });
    } finally {
      setSellingCol(null);
    }
  };

  const sellGrid = async () => {
    const mint = targetMint.trim();
    if (!mint) return toast({ title: "Set a token address at the top", variant: "destructive" });
    const list = collectSellTargets(-1);
    if (list.length === 0) return toast({ title: "No wallets hold target token", variant: "destructive" });
    if (!confirm(`SELL GRID: Sell ALL ${mint.slice(0, 6)}… across ALL ${list.length} holding wallet(s)?\nThis cannot be undone.`)) return;
    setSellingGrid(true);
    const perCol = new Array(10).fill(0).map(() => ({ ok: 0, total: 0 }));
    let ok = 0; let firstErr = "";
    try {
      for (const w of list) {
        perCol[w.column_index].total++;
        try {
          if (simMode) simSell(w, mint);
          else await sellOneLive(w, mint);
          perCol[w.column_index].ok++;
          ok++;
        } catch (e: any) {
          if (!firstErr) firstErr = e?.message || String(e);
        }
        await new Promise((r) => setTimeout(r, simMode ? 60 : 200));
      }
      if (simMode) appendLog({ col: -1, row: -1, kind: "SELL", msg: `GRID SIM SELL  (${ok}/${list.length} wallets)` });
      const desc = perCol
        .map((p, i) => (p.total > 0 ? `W${i + 1}:${p.ok}/${p.total}` : null))
        .filter(Boolean)
        .join(" · ");
      toast({
        title: `Grid sell complete: ${ok}/${list.length}`,
        description: firstErr ? `First error: ${firstErr}  |  ${desc}` : desc,
        variant: firstErr ? "destructive" : "default",
      });
    } finally {
      setSellingGrid(false);
    }
  };

  // Aggregate all unique non-SOL mints currently held across the grid, then fetch DexScreener prices.
  useEffect(() => {
    const mints = new Set<string>();
    for (const b of Object.values(balances)) for (const t of b.tokens) if (t.amount > 0) mints.add(t.mint);
    if (targetMint && targetMint.length >= 32) mints.add(targetMint.trim());
    const missing = [...mints].filter((m) => !(m in tokenPrices));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      // DexScreener accepts up to ~30 mints comma-separated.
      const chunks: string[][] = [];
      for (let i = 0; i < missing.length; i += 25) chunks.push(missing.slice(i, i + 25));
      const next: Record<string, { priceUsd: number; symbol: string }> = {};
      for (const chunk of chunks) {
        try {
          const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`);
          const j = await r.json();
          const pairs = (j?.pairs ?? []) as any[];
          for (const m of chunk) {
            const pair = pairs.find((p) => p?.baseToken?.address === m);
            if (pair) next[m] = { priceUsd: Number(pair.priceUsd ?? 0), symbol: pair.baseToken?.symbol ?? "?" };
            else next[m] = { priceUsd: 0, symbol: "?" };
          }
        } catch {
          for (const m of chunk) next[m] = { priceUsd: 0, symbol: "?" };
        }
      }
      if (!cancelled) setTokenPrices((prev) => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [balances, targetMint]);

  const toggleBuyEnabled = (col: number) =>
    setBuyEnabled((prev) => prev.map((v, i) => (i === col ? !v : v)));

  const validTargetMint = targetMint.trim().length >= 32 && targetMint.trim().length <= 44;

  const loadWallets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("waterfall_wallets")
      .select("id,column_index,row_index,nickname,pubkey,sol_balance,last_balance_at")
      .gte("row_index", 0)
      .lte("row_index", 9)
      .order("column_index").order("row_index");
    if (error) toast({ title: "Load failed", description: error.message, variant: "destructive" });
    setWallets((data ?? []) as WaterfallWallet[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadWallets(); }, [loadWallets]);

  // Load any currently-running cascades + subscribe to updates
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("waterfall_cascade_runs")
        .select("id,column_index,status,current_wallet_row,current_step,error")
        .eq("status", "running")
        .order("started_at", { ascending: false });
      if (cancelled) return;
      const map: Record<number, CascadeRun> = {};
      for (const r of (data ?? []) as CascadeRun[]) {
        if (!(r.column_index in map)) map[r.column_index] = r;
      }
      setCascades(map);
    })();
    const channel = supabase
      .channel("waterfall-cascade-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waterfall_cascade_runs" },
        (payload: any) => {
          const r = (payload.new ?? payload.old) as CascadeRun;
          if (!r) return;
          setCascades((prev) => {
            const next = { ...prev };
            if (r.status === "running") next[r.column_index] = r;
            else delete next[r.column_index];
            return next;
          });
          if (payload.eventType === "UPDATE" && r.status === "completed") {
            toast({ title: `Cascade ${r.column_index + 1} complete` });
          }
          if (payload.eventType === "UPDATE" && r.status === "failed") {
            toast({ title: `Cascade ${r.column_index + 1} failed`, description: r.error ?? "", variant: "destructive" });
          }
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  const previewCascade = (columnIndex: number) => {
    if (cascades[columnIndex]) return toast({ title: "Already running", variant: "destructive" });
    const w1 = wallets.find((w) => w.column_index === columnIndex && w.row_index === 0);
    if (!w1) return toast({ title: "Wallet 1 not found", variant: "destructive" });
    const sol = simMode
      ? (simState[w1.id]?.sol ?? Number(w1.sol_balance || 0))
      : Number(w1.sol_balance || 0);
    if (sol < 0.50) {
      return toast({ title: "Not enough SOL in W1", description: "Need ≥ 0.5 SOL to plan a cascade.", variant: "destructive" });
    }
    const plan = buildCascadePlan(columnIndex, sol);
    setPlans((prev) => ({ ...prev, [columnIndex]: plan }));
  };

  const cancelPlan = (columnIndex: number) => {
    setPlans((prev) => {
      const n = { ...prev };
      delete n[columnIndex];
      return n;
    });
  };

  const executePlan = async (columnIndex: number) => {
    const plan = plans[columnIndex];
    if (!plan) return;
    if (simMode) {
      cancelPlan(columnIndex);
      appendLog({ col: columnIndex, row: -1, kind: "CASCADE", msg: `── SIM CASCADE column ${columnIndex + 1} starting (10 hops) ──` });
      for (const hop of plan.hops) {
        const fromW = wallets.find((w) => w.column_index === columnIndex && w.row_index === hop.row);
        const toW = wallets.find((w) => w.column_index === columnIndex && w.row_index === hop.row + 1);
        if (!fromW) continue;
        await new Promise((r) => setTimeout(r, 350));
        setSimState((prev) => {
          const next = { ...prev };
          const from = next[fromW.id] ?? { sol: 0, tokens: {} };
          if (hop.row === 9 || !toW) {
            next[fromW.id] = { ...from, sol: hop.projectedIncomingLamports / LAMPORTS_PER_SOL };
            return next;
          }
          const to = next[toW.id] ?? { sol: 0, tokens: {} };
          next[fromW.id] = { ...from, sol: hop.leaveBehindLamports / LAMPORTS_PER_SOL };
          next[toW.id] = { ...to, sol: to.sol + hop.projectedForwardLamports / LAMPORTS_PER_SOL };
          return next;
        });
        appendLog({
          col: columnIndex, row: hop.row, kind: "CASCADE",
          msg: hop.row === 9
            ? `W${columnIndex + 1}·R10  terminal · holds ${fmtSol(hop.projectedIncomingLamports)} SOL`
            : `W${columnIndex + 1}·R${hop.row + 1}  leave ${fmtSol(hop.leaveBehindLamports)} → fwd ${fmtSol(hop.projectedForwardLamports)} to R${hop.row + 2}`,
        });
      }
      appendLog({ col: columnIndex, row: -1, kind: "CASCADE", msg: `── SIM CASCADE column ${columnIndex + 1} complete ──` });
      toast({ title: `Sim cascade ${columnIndex + 1} complete` });
      return;
    }
    if (cascades[columnIndex]) return toast({ title: "Already running", variant: "destructive" });
    const w1 = wallets.find((w) => w.column_index === columnIndex && w.row_index === 0);
    if (!w1) return toast({ title: "Wallet 1 not found", variant: "destructive" });
    const currentBasis = Math.floor(Number(w1.sol_balance || 0) * LAMPORTS_PER_SOL);
    if (Math.abs(currentBasis - plan.basisW1Lamports) > 0.01 * LAMPORTS_PER_SOL) {
      return toast({
        title: "W1 balance changed since preview",
        description: "Cancel and re-run CASCADE to regenerate the plan.",
        variant: "destructive",
      });
    }
    if (plan.hops.some((h) => h.insufficient)) {
      return toast({ title: "Plan has insufficient hops", variant: "destructive" });
    }
    if (!confirm(`EXECUTE cascade on column ${columnIndex + 1} with the previewed plan?\n~25 minutes. ~$1–$2.50 in fees.`)) return;
    const planPayload = plan.hops
      .filter((h) => h.row < 9)
      .map((h) => ({ row: h.row, leaveBehindLamports: h.leaveBehindLamports }));
    const { error } = await supabase.functions.invoke("waterfall-cascade", {
      body: { columnIndex, plan: planPayload },
    });
    if (error) return toast({ title: "Cascade start failed", description: error.message, variant: "destructive" });
    toast({ title: `Cascade ${columnIndex + 1} started` });
  };

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("waterfall-generate-all");
    setGenerating(false);
    if (error) return toast({ title: "Generate failed", description: error.message, variant: "destructive" });
    toast({ title: "Wallets generated", description: `${(data as any)?.generated ?? 0} new wallets` });
    loadWallets();
  };

  const refresh = async () => {
    setRefreshing(true);
    const { data, error } = await supabase.functions.invoke("waterfall-refresh-balances");
    setRefreshing(false);
    if (error) return toast({ title: "Refresh failed", description: error.message, variant: "destructive" });
    setBalances((data as any)?.wallets ?? {});
    loadWallets();
    toast({ title: "Balances refreshed" });
  };

  const exportKeys = async () => {
    if (!confirm("Export ALL private keys as a JSON file? Treat the file as a vault — anyone with it controls the wallets.")) return;
    setExporting(true);
    const { data, error } = await supabase.functions.invoke("waterfall-export-keys");
    setExporting(false);
    if (error) return toast({ title: "Export failed", description: error.message, variant: "destructive" });
    const blob = new Blob([JSON.stringify((data as any)?.wallets ?? [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waterfall-wallets-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateNickname = async (id: string, nickname: string) => {
    const { error } = await supabase.from("waterfall_wallets").update({ nickname }).eq("id", id);
    if (error) return toast({ title: "Rename failed", description: error.message, variant: "destructive" });
    setWallets((prev) => prev.map((w) => (w.id === id ? { ...w, nickname } : w)));
    if (active?.id === id) setActive({ ...active, nickname });
  };

  const grid = useMemo(() => {
    const map = new Map<string, WaterfallWallet>();
    for (const w of wallets) map.set(`${w.column_index}:${w.row_index}`, w);
    return map;
  }, [wallets]);

  const totalSol = useMemo(() => wallets.reduce((s, w) => s + Number(w.sol_balance || 0), 0), [wallets]);

  const isEmpty = wallets.length === 0;

  return (
    <div className="p-4 space-y-4">
      {simMode && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg">🧪</span>
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">SIMULATION MODE — no real transactions</div>
              <div className="text-[11px] text-muted-foreground">
                R1 of every waterfall is seeded with {SIM_DEFAULT_SEED_SOL} fake SOL. All BUY / SELL / TROLL / CASCADE actions run locally.
                {solUsd > 0 && <> Live SOL price: <span className="font-mono">${solUsd.toFixed(2)}</span></>}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={resetAllGrid}>Reset All Grid</Button>
            <Button size="sm" variant="ghost" onClick={() => setSimMode(false)}>Exit</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-amber-500/30 pt-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Fund:</span>
            <select
              value={simFundCol}
              onChange={(e) => setSimFundCol(e.target.value)}
              className="h-8 text-xs rounded border border-input bg-input px-2"
            >
              <option value="all">All waterfalls</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i} value={String(i)}>Waterfall {i + 1}</option>
              ))}
            </select>
            <span className="text-[11px] text-muted-foreground">Add</span>
            <Input
              type="number"
              min={0.001}
              step={0.1}
              value={simFundAmount}
              onChange={(e) => setSimFundAmount(e.target.value)}
              className="h-8 w-24 text-xs"
            />
            <span className="text-[11px] text-muted-foreground">SOL to Wallet 1</span>
            {solUsd > 0 && Number(simFundAmount) > 0 && (
              <span className="text-[11px] text-muted-foreground">
                ≈ ${(Number(simFundAmount) * solUsd).toFixed(2)}
                {simFundCol === "all" && <> × 10 = ${(Number(simFundAmount) * solUsd * 10).toFixed(2)}</>}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => simFund(simFundCol, Number(simFundAmount) || 0)}>
              + Add
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h2 className="text-lg font-semibold">💧 Waterfall — 10×10 Solana Wallet Grid</h2>
          <p className="text-xs text-muted-foreground">
            10 isolated columns · 10 wallets per column · {wallets.length}/100 wallets · Total: {totalSol.toFixed(4)} SOL
            {solUsd > 0 && ` (≈ $${(totalSol * solUsd).toFixed(2)})`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={simMode ? "default" : "outline"}
            className={simMode ? "bg-amber-500 hover:bg-amber-600 text-black" : ""}
            onClick={() => setSimMode((v) => !v)}
            title="Toggle simulation mode (no real transactions)"
          >
            🧪 <span className="ml-2">{simMode ? "Sim ON" : "Sim Mode"}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-2">Generate Missing</span>
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing || isEmpty}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh Balances</span>
          </Button>
          <Button size="sm" variant="destructive" onClick={exportKeys} disabled={exporting || isEmpty}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="ml-2">Export Private Keys</span>
          </Button>
        </div>
      </div>

      {/* Buy target bar */}
      <div className="rounded-md border bg-muted/40 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium whitespace-nowrap">Buy token (mint):</label>
          <Input
            value={targetMint}
            onChange={(e) => setTargetMint(e.target.value)}
            placeholder="Paste Solana token mint address…"
            className="h-8 text-xs font-mono flex-1 min-w-[260px]"
          />
          <label className="text-xs font-medium whitespace-nowrap ml-2">Buy size (% of wallet SOL):</label>
          <Input
            value={buySizePct}
            onChange={(e) => setBuySizePct(e.target.value)}
            className="h-8 text-xs w-20"
            type="number"
            min={1}
            max={99}
          />
          <span className="text-[11px] text-muted-foreground">%</span>
          {validTargetMint && tokenPrices[targetMint.trim()] && (
            <span className="text-xs text-muted-foreground ml-2">
              {tokenPrices[targetMint.trim()].symbol} · ${tokenPrices[targetMint.trim()].priceUsd.toFixed(8).replace(/\.?0+$/, "")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-muted-foreground">BUY enabled per column:</span>
          {Array.from({ length: 10 }, (_, c) => (
            <label key={c} className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={buyEnabled[c]}
                onChange={() => toggleBuyEnabled(c)}
                className="h-3 w-3"
              />
              W{c + 1}
            </label>
          ))}
        </div>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {isEmpty && !loading && (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          No wallets yet. Click <span className="font-medium">Generate Missing</span> to create the full 10×10 grid (100 wallets).
        </div>
      )}

      {!isEmpty && (
        <div className="overflow-auto border rounded-md">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                {Array.from({ length: 10 }, (_, c) => {
                  const first = grid.get(`${c}:0`);
                  return (
                    <th key={c} className="p-2 border-b border-r min-w-[180px] align-top">
                      <div className="font-bold text-[11px] text-muted-foreground">WATERFALL {c + 1}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-1">{first ? SHORT(first.pubkey) : "—"}</div>
                      {simMode && (
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => simSeedColumn(c)}
                            className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                            title={`Seed R1 of W${c + 1} with ${SIM_DEFAULT_SEED_SOL} SOL`}
                          >
                            Seed {SIM_DEFAULT_SEED_SOL}
                          </button>
                          <button
                            onClick={() => simClearColumn(c)}
                            className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                            title={`Clear all 10 wallets of W${c + 1}`}
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: 10 }, (_, c) => {
                    const w = grid.get(`${c}:${r}`);
                      const cascade = cascades[c];
                      const isCascadeWallet = !!cascade && cascade.current_wallet_row === r;
                      const plan = plans[c];
                      const planHop = plan?.hops.find((h) => h.row === r);
                    return (
                      <td key={c} className="p-2 border-b border-r align-top">
                        {w ? (
                          <Cell
                            w={w}
                            tokens={
                              simMode
                                ? Object.entries(simState[w.id]?.tokens ?? {}).map(([mint, amount]) => {
                                    const real = (balances[w.pubkey]?.tokens ?? []).find((t) => t.mint === mint);
                                    return { mint, amount, decimals: real?.decimals ?? 6 };
                                  })
                                : balances[w.pubkey]?.tokens ?? []
                            }
                            solOverride={simMode ? (simState[w.id]?.sol ?? Number(w.sol_balance || 0)) : undefined}
                            solUsd={solUsd}
                              tokenPrices={tokenPrices}
                              targetMint={validTargetMint ? targetMint.trim() : ""}
                              buyEnabled={buyEnabled[c]}
                              buySizePct={Number(buySizePct) || 0}
                            onOpen={() => setActive(w)}
                            onRename={updateNickname}
                              isHeadOfColumn={r === 0}
                              cascade={cascade}
                              isCurrentCascadeWallet={isCascadeWallet}
                              planHop={planHop}
                              hasPlan={!!plan}
                              onPreview={() => previewCascade(c)}
                              onExecute={() => executePlan(c)}
                              onCancelPlan={() => cancelPlan(c)}
                              simMode={simMode}
                              onSimBuy={simBuy}
                              onSimSell={simSell}
                              onSimTroll={simTroll}
                          />
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {simMode && (
        <div className="border rounded-md">
          <button
            onClick={() => setSimLogOpen((v) => !v)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold bg-muted/40 hover:bg-muted"
          >
            <span>🧪 Simulation Log ({simLog.length})</span>
            <div className="flex gap-3 items-center">
              <span
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(simLog.map(l => `${new Date(l.ts).toLocaleTimeString()}  ${l.msg}`).join("\n")); toast({ title: "Log copied" }); }}
                className="text-[10px] underline text-muted-foreground hover:text-foreground cursor-pointer"
              >copy</span>
              <span
                onClick={(e) => { e.stopPropagation(); setSimLog([]); }}
                className="text-[10px] underline text-muted-foreground hover:text-foreground cursor-pointer"
              >clear</span>
              <span>{simLogOpen ? "▼" : "▶"}</span>
            </div>
          </button>
          {simLogOpen && (
            <div className="max-h-64 overflow-auto font-mono text-[11px] p-2 space-y-0.5">
              {simLog.length === 0 && <div className="text-muted-foreground">No actions yet. Click BUY / SELL / TROLL / CASCADE on any wallet.</div>}
              {simLog.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">{new Date(l.ts).toLocaleTimeString()}</span>
                  <span className="truncate">{l.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <WaterfallWalletDrawer
        wallet={active}
        tokens={active ? balances[active.pubkey]?.tokens ?? [] : []}
        solUsd={solUsd}
        onClose={() => setActive(null)}
        onRename={updateNickname}
        onWithdrawComplete={refresh}
      />
    </div>
  );
}

function Cell({
  w, tokens, solOverride, solUsd, tokenPrices, targetMint, buyEnabled, buySizePct,
  onOpen, onRename, isHeadOfColumn, cascade, isCurrentCascadeWallet,
  planHop, hasPlan, onPreview, onExecute, onCancelPlan,
  simMode, onSimBuy, onSimSell, onSimTroll,
}: {
  w: WaterfallWallet;
  tokens: TokenHolding[];
  solOverride?: number;
  solUsd: number;
  tokenPrices: Record<string, { priceUsd: number; symbol: string }>;
  targetMint: string;
  buyEnabled: boolean;
  buySizePct: number;
  onOpen: () => void;
  onRename: (id: string, nickname: string) => void;
  isHeadOfColumn: boolean;
  cascade?: CascadeRun;
  isCurrentCascadeWallet: boolean;
  planHop?: PlanHop;
  hasPlan: boolean;
  onPreview: () => void;
  onExecute: () => void;
  onCancelPlan: () => void;
  simMode: boolean;
  onSimBuy: (w: WaterfallWallet, mint: string, lamportsIn: number) => void;
  onSimSell: (w: WaterfallWallet, mint: string) => void;
  onSimTroll: (w: WaterfallWallet) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(w.nickname ?? "");
  const [trolling, setTrolling] = useState(false);
  const [busy, setBusy] = useState<null | "buy" | "sell">(null);
  const [elapsed, setElapsed] = useState(0);
  const sol = solOverride !== undefined ? solOverride : Number(w.sol_balance || 0);
  const cascadeRunning = !!cascade;

  useEffect(() => {
    if (!trolling) return;
    const t0 = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [trolling]);

  const runTroll = async () => {
    if (sol < 0.005) {
      return toast({ title: "Not enough SOL", description: "Needs ~0.005 SOL for 10 cycles + fees.", variant: "destructive" });
    }
    if (simMode) { onSimTroll(w); return; }
    if (!confirm(`Run TROLL on ${w.nickname || "Wallet"}?\n10× buy + sell of $TROLL at ~$0.02/cycle, 5s between cycles.\n~2 min runtime.`)) return;
    setTrolling(true);
    const { data, error } = await supabase.functions.invoke("waterfall-troll", { body: { walletId: w.id } });
    setTrolling(false);
    if (error) return toast({ title: "TROLL failed", description: error.message, variant: "destructive" });
    const d = data as any;
    const okCount = (d?.cycles ?? []).filter((c: any) => c.buy && c.sell).length;
    toast({ title: `TROLL done (${okCount}/10)`, description: `Spent ${Number(d?.netSolSpent ?? 0).toFixed(6)} SOL in ${Math.round((d?.totalMs ?? 0) / 1000)}s` });
  };

  const runSwap = async (side: "buy" | "sell") => {
    if (!targetMint) return toast({ title: "Set a token address at the top", variant: "destructive" });
    if (side === "buy") {
      if (!buyEnabled) return;
      if (!(buySizePct > 0 && buySizePct < 100)) return toast({ title: "Buy % must be between 1 and 99", variant: "destructive" });
      if (sol < 0.002) {
        return toast({ title: "Not enough SOL", description: `Wallet has ${sol.toFixed(6)} SOL.`, variant: "destructive" });
      }
      var buyLamportsCalc = Math.floor(sol * (buySizePct / 100) * LAMPORTS_PER_SOL);
      if (buyLamportsCalc < 1_000_000) {
        return toast({ title: "Buy size too small", description: `~${(buyLamportsCalc / LAMPORTS_PER_SOL).toFixed(6)} SOL.`, variant: "destructive" });
      }
      if (simMode) { onSimBuy(w, targetMint, buyLamportsCalc); return; }
      if (!confirm(`BUY ${(buyLamportsCalc / LAMPORTS_PER_SOL).toFixed(4)} SOL (${buySizePct}% of ${sol.toFixed(4)}) of ${targetMint.slice(0, 6)}… from ${w.nickname || "wallet"}?`)) return;
    } else {
      const held = tokens.find((t) => t.mint === targetMint);
      if (!held || held.amount <= 0) return toast({ title: "No balance to sell", variant: "destructive" });
      if (simMode) { onSimSell(w, targetMint); return; }
      if (!confirm(`SELL all ${held.amount.toLocaleString()} of ${targetMint.slice(0, 6)}… from ${w.nickname || "wallet"}?`)) return;
    }
    setBusy(side);
    const { data, error } = await supabase.functions.invoke("waterfall-swap", {
      body: {
        walletId: w.id,
        mint: targetMint,
        side,
        buyLamports: side === "buy" ? Math.floor(sol * (buySizePct / 100) * LAMPORTS_PER_SOL) : undefined,
      },
    });
    setBusy(null);
    if (error) return toast({ title: `${side.toUpperCase()} failed`, description: error.message, variant: "destructive" });
    toast({ title: `${side.toUpperCase()} sent`, description: `Tx: ${((data as any)?.signature ?? "").slice(0, 16)}…` });
  };

  const targetHeld = targetMint ? tokens.find((t) => t.mint === targetMint) : undefined;

  return (
    <div className={`space-y-1 ${isCurrentCascadeWallet ? "ring-2 ring-purple-500 rounded p-1 -m-1" : ""}`}>
      {simMode && (
        <div className="text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold">SIM</div>
      )}
      {editing ? (
        <div className="flex gap-1">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="h-6 text-xs"
            autoFocus
            onBlur={() => { setEditing(false); if (val !== w.nickname) onRename(w.id, val); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); if (val !== w.nickname) onRename(w.id, val); } }}
          />
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-left font-medium truncate w-full hover:underline" title="Click to rename">
          {w.nickname || "—"}
        </button>
      )}
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-muted-foreground">{SHORT(w.pubkey)}</span>
        <button onClick={() => { navigator.clipboard.writeText(w.pubkey); toast({ title: "Copied" }); }} className="text-muted-foreground hover:text-foreground">
          <Copy className="h-3 w-3" />
        </button>
      </div>
      <div className="text-[11px]">
        <span className="font-semibold">{sol.toFixed(4)} SOL</span>
        {solUsd > 0 && <span className="text-muted-foreground"> · ${(sol * solUsd).toFixed(2)}</span>}
        {planHop && (
          <span className={`ml-1 font-mono text-[10px] ${planHop.insufficient ? "text-red-600 dark:text-red-400" : "text-red-500 dark:text-red-400"}`}>
            {planHop.insufficient ? (
              <>[INSUFFICIENT]</>
            ) : planHop.row === 9 ? (
              <>[in ~{fmtSol(planHop.projectedIncomingLamports)} · terminal]</>
            ) : (
              <>[in {fmtSol(planHop.projectedIncomingLamports)} · leave {fmtSol(planHop.leaveBehindLamports)} → fwd {fmtSol(planHop.projectedForwardLamports)}]</>
            )}
          </span>
        )}
      </div>
      {tokens.length > 0 && (
        <div className="text-[10px] space-y-0.5">
          {tokens.slice(0, 4).map((t) => {
            const meta = tokenPrices[t.mint];
            const usd = meta ? meta.priceUsd * t.amount : 0;
            const sym = meta?.symbol ?? "?";
            const isTarget = targetMint === t.mint;
            const amt = t.amount >= 1000
              ? t.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : t.amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
            return (
              <div key={t.mint} className={`truncate ${isTarget ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {amt} {sym}
                {usd > 0 && <span className="text-muted-foreground"> (${usd >= 1 ? usd.toFixed(2) : usd.toFixed(4)})</span>}
              </div>
            );
          })}
          {tokens.length > 4 && <div className="text-muted-foreground">+{tokens.length - 4} more…</div>}
        </div>
      )}
      <Button size="sm" variant="outline" className="h-6 w-full text-[10px] px-2" onClick={onOpen}>
        <ArrowDownToLine className="h-3 w-3 mr-1" /> Withdraw / Details
      </Button>
      <div className="flex gap-1">
          <Button
            size="sm"
            variant="default"
            className="h-6 flex-1 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => runSwap("buy")}
            disabled={!targetMint || !buyEnabled || busy !== null || cascadeRunning || trolling}
            title={
              !targetMint
                ? "Paste a token mint at the top to enable BUY"
                : !buyEnabled
                  ? "Buying disabled for this column (uncheck at top)"
                  : `Buy ${buySizePct}% of wallet SOL (~${(sol * (buySizePct / 100)).toFixed(4)} SOL) of target token`
            }
          >
            {busy === "buy" ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ShoppingCart className="h-3 w-3 mr-1" />BUY</>}
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-6 flex-1 text-[10px] px-2 bg-rose-600 hover:bg-rose-700 text-white"
            onClick={() => runSwap("sell")}
            disabled={!targetMint || !targetHeld || (targetHeld?.amount ?? 0) <= 0 || busy !== null || cascadeRunning || trolling}
            title={
              !targetMint
                ? "Paste a token mint at the top to enable SELL"
                : targetHeld && targetHeld.amount > 0
                  ? `Sell 100% (${targetHeld.amount.toLocaleString()}) of target token`
                  : "No target-token balance in this wallet"
            }
          >
            {busy === "sell" ? <Loader2 className="h-3 w-3 animate-spin" /> : <><DollarSign className="h-3 w-3 mr-1" />SELL</>}
          </Button>
      </div>
      <Button
        size="sm"
        variant={trolling ? "secondary" : "default"}
        className="h-6 w-full text-[10px] px-2"
        onClick={runTroll}
        disabled={trolling || cascadeRunning}
        title="10× buy+sell $TROLL (~$0.02 ea, 5s gap)"
      >
        {trolling ? (
          <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> TROLL {elapsed}s</>
        ) : (
          <><Zap className="h-3 w-3 mr-1" /> TROLL</>
        )}
      </Button>
      {isHeadOfColumn && (
        <>
          {cascadeRunning ? (
            <Button size="sm" variant="secondary" className="h-6 w-full text-[10px] px-2" disabled>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Cascading
            </Button>
          ) : hasPlan ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                className="h-6 flex-1 text-[10px] px-2 bg-green-600 hover:bg-green-700 text-white"
                onClick={onExecute}
                title="Run cascade with the previewed leave-behind amounts"
              >
                <Play className="h-3 w-3 mr-1" /> EXECUTE
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                onClick={onCancelPlan}
                title="Discard preview"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-6 w-full text-[10px] px-2 border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
              onClick={onPreview}
              title="Preview random leave-behind amounts for the full cascade"
            >
              <Waves className="h-3 w-3 mr-1" /> CASCADE
            </Button>
          )}
        </>
      )}
      {cascadeRunning && isHeadOfColumn && (
        <div className="text-[10px] text-purple-600 dark:text-purple-400 truncate" title={cascade?.current_step ?? ""}>
          W{(cascade!.current_wallet_row ?? 0) + 1}: {cascade!.current_step}
        </div>
      )}
    </div>
  );
}