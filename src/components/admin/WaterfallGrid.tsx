import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const BUY_SELL_FEE_RESERVE_SOL = 0.012;
const MIN_BUY_LAMPORTS = 500_000;
const MAX_BUY_SIZE_PCT = 90;
const SIM_STORAGE_KEY = "waterfall_sim_mode";
const PERSIST_KEY = "waterfall-grid:v1";

type PersistedBlob = {
  targetMint?: string;
  useSameMint?: boolean;
  perColMints?: string[];
  buySizePct?: string;
  buyEnabled?: boolean[];
  simState?: Record<string, { sol: number; tokens: Record<string, number> }>;
  simLog?: SimLogEntry[];
  simFundCol?: string;
  simFundAmount?: string;
  simCostBasis?: Record<string, Record<string, SimCostBasis>>;
  simRealizedPnl?: Record<string, { sol: number; usd: number }>;
};

type SimCostBasis = { solIn: number; usdIn: number; tokens: number; entryPriceUsd?: number };

function loadPersisted(): PersistedBlob {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PersistedBlob) : {};
  } catch {
    return {};
  }
}
const PERSISTED_INIT: PersistedBlob = typeof window !== "undefined" ? loadPersisted() : {};
const clampBuySizePct = (raw: unknown) => {
  const n = Number(raw ?? MAX_BUY_SIZE_PCT);
  if (!Number.isFinite(n)) return String(MAX_BUY_SIZE_PCT);
  return String(Math.min(MAX_BUY_SIZE_PCT, Math.max(1, Math.floor(n))));
};

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
  const [targetMint, setTargetMint] = useState<string>(PERSISTED_INIT.targetMint ?? "");
  const [buySizePct, setBuySizePct] = useState<string>(clampBuySizePct(PERSISTED_INIT.buySizePct));
  const [buyEnabled, setBuyEnabled] = useState<boolean[]>(() => {
    const p = PERSISTED_INIT.buyEnabled;
    if (Array.isArray(p) && p.length === 10) return p.map(Boolean);
    return Array.from({ length: 10 }, () => true);
  });
  const [tokenPrices, setTokenPrices] = useState<Record<string, { priceUsd: number; symbol: string }>>({});
  // When true (default) every waterfall buys the single `targetMint` above.
  // When false each waterfall column gets its own mint input in the header.
  const [useSameMint, setUseSameMint] = useState<boolean>(PERSISTED_INIT.useSameMint ?? true);
  const [perColMints, setPerColMints] = useState<string[]>(() => {
    const p = PERSISTED_INIT.perColMints;
    if (Array.isArray(p) && p.length === 10) return p.map((s) => String(s ?? ""));
    return Array.from({ length: 10 }, () => "");
  });
  const mintForCol = useCallback(
    (c: number) => (useSameMint ? targetMint.trim() : (perColMints[c] ?? "").trim()),
    [useSameMint, targetMint, perColMints],
  );

  // ─── SIMULATION MODE ────────────────────────────────────────────────────
  const [simMode, setSimMode] = useState<boolean>(() => {
    try { return localStorage.getItem(SIM_STORAGE_KEY) === "1"; } catch { return false; }
  });
  const [simState, setSimState] = useState<Record<string, { sol: number; tokens: Record<string, number> }>>(
    () => PERSISTED_INIT.simState ?? {},
  );
  const [simLog, setSimLog] = useState<SimLogEntry[]>(() => {
    const p = PERSISTED_INIT.simLog;
    return Array.isArray(p) ? p.slice(0, 500) : [];
  });
  const [simLogOpen, setSimLogOpen] = useState(true);

  // Cost basis per (walletId → mint) for realized PnL.
  const [simCostBasis, setSimCostBasis] = useState<Record<string, Record<string, SimCostBasis>>>(
    () => PERSISTED_INIT.simCostBasis ?? {},
  );
  const [simRealizedPnl, setSimRealizedPnl] = useState<Record<string, { sol: number; usd: number }>>(
    () => PERSISTED_INIT.simRealizedPnl ?? {},
  );
  const [lastPriceRefresh, setLastPriceRefresh] = useState<number>(0);
  const [pricesRefreshing, setPricesRefreshing] = useState(false);
  const [, forceTick] = useState(0);
  const balancesRef = useRef<Record<string, { sol: number; tokens: TokenHolding[] }>>({});
  const balanceRefreshInFlightRef = useRef(false);

  // Funding toolbar state
  const [simFundCol, setSimFundCol] = useState<string>(PERSISTED_INIT.simFundCol ?? "all"); // "all" or "0".."9"
  const [simFundAmount, setSimFundAmount] = useState<string>(PERSISTED_INIT.simFundAmount ?? "10");

  // Bulk-sell busy flags
  const [sellingCol, setSellingCol] = useState<number | null>(null);
  const [sellingGrid, setSellingGrid] = useState<boolean>(false);
  const [buyingCol, setBuyingCol] = useState<number | null>(null);

  // Skip TROLL buy/sell during cascade — just spread SOL across the wallets.
  const [skipTroll, setSkipTroll] = useState<boolean>(() => {
    try { return localStorage.getItem("waterfall_skip_troll") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("waterfall_skip_troll", skipTroll ? "1" : "0"); } catch {}
  }, [skipTroll]);

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
    if (simMode && wallets.length > 0) {
      // Fill in any wallets missing a sim entry so every column's R1 starts
      // with SIM_DEFAULT_SEED_SOL even when persisted simState only covers a
      // subset of columns. Existing entries are preserved as-is.
      const missing = wallets.filter((w) => !simState[w.id]);
      if (missing.length > 0) {
        setSimState((prev) => {
          const next = { ...prev };
          const seededCols = new Set<number>();
          for (const w of missing) {
            next[w.id] = {
              sol: w.row_index === 0 ? SIM_DEFAULT_SEED_SOL : 0,
              tokens: {},
            };
            if (w.row_index === 0) seededCols.add(w.column_index);
          }
          if (seededCols.size > 0) {
            const cols = [...seededCols].sort((a, b) => a - b).map((c) => `W${c + 1}`).join(", ");
            appendLog({ col: -1, row: -1, kind: "RESET", msg: `Seeded ${SIM_DEFAULT_SEED_SOL} SOL on R1 of ${cols}.` });
          }
          return next;
        });
      }
    }
    // NOTE: leaving simMode no longer wipes simState/simLog — they are persisted
    // across mounts and reloads. Use "Reset All Grid" to clear explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simMode, wallets.length]);

  // Debounced persistence of all user-controlled SIM + UI state.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const blob: PersistedBlob = {
          targetMint, useSameMint, perColMints, buySizePct, buyEnabled,
          simState, simLog, simFundCol, simFundAmount,
          simCostBasis, simRealizedPnl,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(blob));
      } catch { /* quota or serialization error — ignore */ }
    }, 150);
    return () => clearTimeout(t);
  }, [targetMint, useSameMint, perColMints, buySizePct, buyEnabled, simState, simLog, simFundCol, simFundAmount, simCostBasis, simRealizedPnl]);

  const resetAllGrid = () => {
    seedDefaultSim();
    setSimLog([]);
    setSimCostBasis({});
    setSimRealizedPnl({});
    try { localStorage.removeItem(PERSIST_KEY); } catch {}
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

  const simBuy = useCallback((w: WaterfallWallet, mint: string, lamportsIn: number, priceOverride?: { priceUsd: number; symbol: string }) => {
    const meta = priceOverride ?? tokenPrices[mint];
    const priceUsd = meta?.priceUsd ?? 0;
    const solPriceUsd = solUsd || 0;
    const solIn = lamportsIn / LAMPORTS_PER_SOL;
    const usdIn = solIn * solPriceUsd * 0.99;
    // Guarantee a non-zero token credit even when DexScreener has no price yet
    // (fresh pump.fun mint). Falls back to 1 SOL → 1,000,000 phantom units.
    const phantomPrice = !(priceUsd > 0 && solPriceUsd > 0);
    const tokensOut = phantomPrice ? solIn * 1_000_000 : usdIn / priceUsd;
    setSimState((prev) => {
      const cur = prev[w.id] ?? { sol: Number(w.sol_balance || 0), tokens: {} };
      const newSol = Math.max(0, cur.sol - solIn - 0.00001);
      const newTokens = { ...cur.tokens, [mint]: (cur.tokens[mint] ?? 0) + tokensOut };
      return { ...prev, [w.id]: { sol: newSol, tokens: newTokens } };
    });
    // Accumulate cost basis for realized PnL on later sells.
    setSimCostBasis((prev) => {
      const walletBasis = prev[w.id] ?? {};
      const cur = walletBasis[mint] ?? { solIn: 0, usdIn: 0, tokens: 0 };
      const nextTokens = cur.tokens + tokensOut;
      const priorEntry = cur.entryPriceUsd ?? (cur.tokens > 0 && cur.usdIn > 0 ? cur.usdIn / cur.tokens : undefined);
      const nextEntry = priceUsd > 0 && nextTokens > 0
        ? (((priorEntry ?? priceUsd) * cur.tokens) + (priceUsd * tokensOut)) / nextTokens
        : priorEntry;
      return {
        ...prev,
        [w.id]: {
          ...walletBasis,
          [mint]: {
            solIn: cur.solIn + solIn,
            // Always record a USD basis when we know the SOL price, even if
            // the token price was phantom — otherwise PnL coloring stays grey.
            usdIn: cur.usdIn + (solPriceUsd > 0 ? solIn * solPriceUsd * 0.99 : 0),
            tokens: nextTokens,
            entryPriceUsd: nextEntry,
          },
        },
      };
    });
    appendLog({
      col: w.column_index, row: w.row_index, kind: "BUY",
      msg: `W${w.column_index + 1}·R${w.row_index + 1}  SIM BUY  ${solIn.toFixed(4)} SOL → ${tokensOut.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${meta?.symbol ?? "?"} @ $${priceUsd ? priceUsd.toFixed(8).replace(/\.?0+$/, "") : "?"}${phantomPrice ? "  (phantom price)" : ""}`,
    });
  }, [tokenPrices, solUsd, appendLog]);

  const simSell = useCallback((w: WaterfallWallet, mint: string, priceOverride?: { priceUsd: number; symbol: string }) => {
    const meta = priceOverride ?? tokenPrices[mint];
    const priceUsd = meta?.priceUsd ?? 0;
    const solPriceUsd = solUsd || 0;
    let pnlSol = 0;
    let pnlUsd = 0;
    let pnlPct = 0;
    let pnlHasUsd = false;
    setSimState((prev) => {
      const cur = prev[w.id] ?? { sol: Number(w.sol_balance || 0), tokens: {} };
      let amt = cur.tokens[mint] ?? 0;
      let synthSolIn = 0;
      // Phantom-holding synthesis: if the wallet has no token balance but does
      // have SOL, pretend it bought ~25% of its SOL worth of the token a moment
      // ago. Keeps SELL demos meaningful right after a CASCADE round (which
      // pairs every buy with an immediate sell and leaves zero holdings).
      if (amt <= 0 && cur.sol > 0.0005 && priceUsd > 0 && solPriceUsd > 0) {
        synthSolIn = cur.sol * 0.25;
        const usdIn = synthSolIn * solPriceUsd * 0.99;
        amt = usdIn / priceUsd;
      }
      const usdOut = amt * priceUsd;
      const solOut = solPriceUsd > 0 ? usdOut / solPriceUsd : 0;
      const newTokens = { ...cur.tokens };
      delete newTokens[mint];

      // Realized PnL vs accumulated cost basis (proportional to sold tokens).
      const basisWallet = simCostBasis[w.id] ?? {};
      const basis = basisWallet[mint];
      let costSol = synthSolIn; // synthetic basis defaults to the phantom-buy SOL
      let costUsd = synthSolIn * solPriceUsd * 0.99;
      if (basis && basis.tokens > 0 && amt > 0) {
        const frac = Math.min(1, amt / basis.tokens);
        costSol = basis.solIn * frac;
        costUsd = basis.entryPriceUsd && basis.entryPriceUsd > 0
          ? basis.entryPriceUsd * amt
          : basis.usdIn * frac;
      }
      pnlSol = solOut - costSol;
      pnlUsd = costUsd > 0 ? usdOut - costUsd : 0;
      pnlHasUsd = costUsd > 0;
      pnlPct = costUsd > 0 ? (pnlUsd / costUsd) * 100 : (costSol > 0 ? (pnlSol / costSol) * 100 : 0);

      // Update cost basis (consume the sold portion) and realized PnL totals.
      setSimCostBasis((prevBasis) => {
        const wb = { ...(prevBasis[w.id] ?? {}) };
        if (basis && basis.tokens > 0) {
          const frac = Math.min(1, amt / basis.tokens);
          const remTokens = Math.max(0, basis.tokens - amt);
          if (remTokens <= 1e-9) {
            delete wb[mint];
          } else {
            wb[mint] = {
              solIn: basis.solIn * (1 - frac),
              usdIn: basis.usdIn * (1 - frac),
              tokens: remTokens,
              entryPriceUsd: basis.entryPriceUsd,
            };
          }
        }
        return { ...prevBasis, [w.id]: wb };
      });
      setSimRealizedPnl((prevR) => {
        const cur = prevR[w.id] ?? { sol: 0, usd: 0 };
        return { ...prevR, [w.id]: { sol: pnlSol, usd: pnlUsd } };
      });

      const pnlTag = amt > 0
        ? `  PnL ${pnlSol >= 0 ? "+" : ""}${pnlSol.toFixed(4)} SOL${pnlHasUsd ? ` (${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)}, ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)` : ""}`
        : "";
      appendLog({
        col: w.column_index, row: w.row_index, kind: "SELL",
        msg: `W${w.column_index + 1}·R${w.row_index + 1}  SIM SELL ${amt.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${meta?.symbol ?? "?"} → ${solOut.toFixed(4)} SOL${synthSolIn > 0 ? "  (phantom)" : ""}${pnlTag}`,
      });
      const newSol = Math.max(0, cur.sol - synthSolIn + solOut - 0.00001);
      return { ...prev, [w.id]: { sol: newSol, tokens: newTokens } };
    });
  }, [tokenPrices, solUsd, appendLog, simCostBasis]);

  const simTroll = useCallback((w: WaterfallWallet) => {
    const cost = SIM_TROLL_CYCLES * SIM_TROLL_COST_PER_CYCLE;
    setSimState((prev) => {
      const cur = prev[w.id] ?? { sol: Number(w.sol_balance || 0), tokens: {} };
      return { ...prev, [w.id]: { ...cur, sol: Math.max(0, cur.sol - cost) } };
    });
    appendLog({
      col: w.column_index, row: w.row_index, kind: "TROLL",
      msg: `W${w.column_index + 1}·R${w.row_index + 1}  SIM TROLL ${SIM_TROLL_CYCLES} cycles · -${cost.toFixed(4)} SOL net`,
    });
  }, [appendLog]);

  // ─── BULK SELL (per column + entire grid) ──────────────────────────────
  // Returns wallets in a column that currently hold that column's target mint.
  const collectSellTargets = useCallback((col: number): WaterfallWallet[] => {
    const mint = mintForCol(col);
    if (!mint) return [];
    const inCol = wallets.filter((w) => w.column_index === col);
    const holders = inCol.filter((w) => {
      if (simMode) {
        const amt = simState[w.id]?.tokens?.[mint] ?? 0;
        return amt > 0;
      }
      const held = (balances[w.pubkey]?.tokens ?? []).find((t) => t.mint === mint);
      return !!held && held.amount > 0;
    });
    if (holders.length > 0) return holders;
    // SIM fallback: after a CASCADE run every buy is paired with an immediate
    // sell, so no wallet ends up holding the token. Allow the user to still
    // demonstrate a per-column / grid sell by targeting every wallet in the
    // column that has SOL — simSell() synthesizes a phantom holding so the
    // log line is meaningful. Never do this in live mode.
    if (simMode) {
      return inCol.filter((w) => (simState[w.id]?.sol ?? 0) > 0.0005);
    }
    return holders;
  }, [wallets, balances, simState, simMode, mintForCol]);

  const sellOneLive = async (w: WaterfallWallet, mint: string) => {
    const { error } = await supabase.functions.invoke("waterfall-swap", {
      body: { walletId: w.id, mint, side: "sell", priorityFeeMode: "low" },
    });
    if (error) throw new Error(error.message);
  };

  const sellColumn = async (col: number) => {
    const mint = mintForCol(col);
    if (!mint) return toast({ title: `W${col + 1}: set a token mint first`, variant: "destructive" });
    const list = collectSellTargets(col);
    if (list.length === 0) return toast({ title: `W${col + 1}: no wallets hold target token`, variant: "destructive" });
    if (!confirm(`Sell ALL ${mint.slice(0, 6)}… in every wallet of W${col + 1}?\nThis will sell ${list.length} wallet(s) immediately.`)) return;
    setSellingCol(col);
    let ok = 0; let firstErr = "";
    try {
      for (const w of list) {
        try {
          if (simMode) {
            // Fetch a FRESH price for THIS wallet's sell moment so realized
            // PnL reflects current market, not the stale snapshot left in
            // tokenPrices by the most recent buy fetch.
            let priceMeta: { priceUsd: number; symbol: string } | undefined;
            try {
              const fresh = await fetchPricesFor([mint]);
              if (fresh[mint] && fresh[mint].priceUsd > 0) {
                priceMeta = fresh[mint];
                setTokenPrices((prev) => ({ ...prev, [mint]: fresh[mint] }));
              }
            } catch { /* fall back to cached tokenPrices */ }
            simSell(w, mint, priceMeta);
          } else await sellOneLive(w, mint);
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
    // Gather targets per-column (each column may have its own mint).
    const perColLists: WaterfallWallet[][] = Array.from({ length: 10 }, (_, c) => collectSellTargets(c));
    const list = perColLists.flat();
    if (list.length === 0) return toast({ title: "No wallets hold any target token", variant: "destructive" });
    if (!confirm(`SELL GRID: Sell every target token across ALL ${list.length} holding wallet(s)?\nThis cannot be undone.`)) return;
    setSellingGrid(true);
    const perCol = new Array(10).fill(0).map(() => ({ ok: 0, total: 0 }));
    let ok = 0; let firstErr = "";
    try {
      for (let c = 0; c < 10; c++) {
        const mint = mintForCol(c);
        if (!mint) continue;
        for (const w of perColLists[c]) {
          perCol[c].total++;
          try {
            if (simMode) {
              let priceMeta: { priceUsd: number; symbol: string } | undefined;
              try {
                const fresh = await fetchPricesFor([mint]);
                if (fresh[mint] && fresh[mint].priceUsd > 0) {
                  priceMeta = fresh[mint];
                  setTokenPrices((prev) => ({ ...prev, [mint]: fresh[mint] }));
                }
              } catch { /* ignore */ }
              simSell(w, mint, priceMeta);
            } else await sellOneLive(w, mint);
            perCol[c].ok++;
            ok++;
          } catch (e: any) {
            if (!firstErr) firstErr = e?.message || String(e);
          }
          await new Promise((r) => setTimeout(r, simMode ? 60 : 200));
        }
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

  // ─── SELL ANY HELD TOKEN (not just the column target) ──────────────────
  const sellMintLive = useCallback(async (w: WaterfallWallet, mint: string) => {
    const { data, error } = await supabase.functions.invoke("waterfall-swap", {
      body: { walletId: w.id, mint, side: "sell", priorityFeeMode: "low" },
    });
    if (error) throw new Error(error.message);
    if (data && (data as any).success === false) {
      throw new Error((data as any).error || (data as any).skipReason || "sell failed");
    }
    return (data as any)?.signature as string | undefined;
  }, []);

  // ─── SELL ALL TOKENS IN ONE WALLET ─────────────────────────────────────
  const sellAllInWallet = useCallback(async (w: WaterfallWallet) => {
    const held = (balancesRef.current[w.pubkey]?.tokens ?? []).filter((t) => t.amount > 0);
    if (held.length === 0) { toast({ title: "No tokens to sell" }); return { ok: 0, total: 0 }; }
    if (!confirm(`Sell ALL ${held.length} token(s) in ${w.nickname || SHORT(w.pubkey)}?`)) return { ok: 0, total: 0 };
    let ok = 0; let firstErr = "";
    for (const t of held) {
      try { await sellMintLive(w, t.mint); ok++; }
      catch (e: any) { if (!firstErr) firstErr = e?.message || String(e); }
      await new Promise((r) => setTimeout(r, 250));
    }
    toast({ title: `Sold ${ok}/${held.length}`, description: firstErr || "Submitted.", variant: firstErr ? "destructive" : "default" });
    void refreshBalancesForBuy([w.pubkey]);
    return { ok, total: held.length };
  }, [sellMintLive]);

  // ─── SELL ALL HOLDINGS IN AN ENTIRE COLUMN ─────────────────────────────
  const [sellingAllCol, setSellingAllCol] = useState<number | null>(null);
  const sellAllInColumn = useCallback(async (col: number) => {
    const colWallets = wallets.filter((w) => w.column_index === col);
    const targets = colWallets
      .map((w) => ({ w, held: (balancesRef.current[w.pubkey]?.tokens ?? []).filter((t) => t.amount > 0) }))
      .filter((x) => x.held.length > 0);
    if (targets.length === 0) return toast({ title: `W${col + 1}: no token holdings`, variant: "destructive" });
    const totalSells = targets.reduce((s, x) => s + x.held.length, 0);
    if (!confirm(`Sell ALL holdings across W${col + 1}?\n${targets.length} wallet(s), ${totalSells} sell(s) total.`)) return;
    setSellingAllCol(col);
    let ok = 0; let firstErr = "";
    try {
      for (const { w, held } of targets) {
        for (const t of held) {
          try { await sellMintLive(w, t.mint); ok++; }
          catch (e: any) { if (!firstErr) firstErr = e?.message || String(e); }
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      toast({ title: `W${col + 1}: sold ${ok}/${totalSells}`, description: firstErr || "Submitted.", variant: firstErr ? "destructive" : "default" });
      void refreshBalancesForBuy(targets.map((x) => x.w.pubkey));
    } finally { setSellingAllCol(null); }
  }, [wallets, sellMintLive]);

  // ─── SWEEP ALL SOL → MAIN WALLET ───────────────────────────────────────
  const SWEEP_DEST_KEY = "waterfall_sweep_destination";
  const [sweeping, setSweeping] = useState(false);
  const [consolidatingCol, setConsolidatingCol] = useState<number | null>(null);
  const [sweepingToW1, setSweepingToW1] = useState(false);
  const [smartSellingCol, setSmartSellingCol] = useState<number | null>(null);
  const [chainSellingCol, setChainSellingCol] = useState<number | null>(null);
  const [refreshingCol, setRefreshingCol] = useState<number | null>(null);
  const sweepAllSol = useCallback(async () => {
    const remembered = (() => { try { return localStorage.getItem(SWEEP_DEST_KEY) || ""; } catch { return ""; } })();
    const dest = window.prompt("Sweep ALL SOL from every wallet to which address?", remembered) || "";
    const trimmed = dest.trim();
    if (!trimmed) return;
    if (trimmed.length < 32 || trimmed.length > 44) return toast({ title: "Invalid Solana address", variant: "destructive" });
    try { localStorage.setItem(SWEEP_DEST_KEY, trimmed); } catch {}
    const DUST = 0.000015;
    const candidates = wallets.filter((w) => {
      const live = balancesRef.current[w.pubkey]?.sol;
      const sol = typeof live === "number" ? live : Number(w.sol_balance || 0);
      return sol > DUST;
    });
    if (candidates.length === 0) return toast({ title: "No wallets with sweepable SOL" });
    if (!confirm(`Sweep SOL from ${candidates.length} wallet(s) → ${trimmed.slice(0, 6)}…${trimmed.slice(-4)}?`)) return;
    setSweeping(true);
    let ok = 0; let firstErr = "";
    try {
      for (const w of candidates) {
        try {
          const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
            body: { walletId: w.id, mint: "SOL", amount: -1, destination: trimmed },
          });
          if (error) throw new Error(error.message);
          if (data && (data as any).error) throw new Error((data as any).error);
          ok++;
        } catch (e: any) {
          if (!firstErr) firstErr = `${SHORT(w.pubkey)}: ${e?.message || String(e)}`;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      toast({ title: `Swept ${ok}/${candidates.length}`, description: firstErr || `Sent to ${SHORT(trimmed)}`, variant: firstErr ? "destructive" : "default" });
      void refreshBalancesForBuy(candidates.map((w) => w.pubkey));
    } finally { setSweeping(false); }
  }, [wallets]);

  // ─── CONSOLIDATE COLUMN → Wallet 1 (tokens + SOL) ──────────────────────
  // For wallets 2..10 in the column: transfer their target-mint token balance
  // to Wallet 1, then sweep their remaining SOL to Wallet 1. After this,
  // Wallet 1 holds all tokens AND has enough SOL to pay the sell fee.
  const consolidateColumn = useCallback(async (col: number) => {
    const mint = mintForCol(col);
    if (!mint) return toast({ title: `W${col + 1}: set a token mint first`, variant: "destructive" });
    const colWallets = wallets.filter((w) => w.column_index === col).sort((a, b) => a.row_index - b.row_index);
    const w1 = colWallets.find((w) => w.row_index === 0);
    if (!w1) return toast({ title: `W${col + 1}: Wallet 1 not found`, variant: "destructive" });
    const others = colWallets.filter((w) => w.row_index !== 0);
    const DUST_SOL = 0.000015;
    const tokenSenders = others
      .map((w) => {
        const held = (balancesRef.current[w.pubkey]?.tokens ?? []).find((t) => t.mint === mint);
        return held && held.amount > 0 ? { w, amount: held.amount } : null;
      })
      .filter((x): x is { w: WaterfallWallet; amount: number } => !!x);
    const solSenders = others.filter((w) => {
      const live = balancesRef.current[w.pubkey]?.sol;
      const sol = typeof live === "number" ? live : Number(w.sol_balance || 0);
      return sol > DUST_SOL;
    });
    if (tokenSenders.length === 0 && solSenders.length === 0) {
      return toast({ title: `W${col + 1}: nothing to consolidate`, description: "Wallets 2–10 have no tokens or sweepable SOL." });
    }
    if (!confirm(`Consolidate W${col + 1} → Wallet 1?\n• Move ${mint.slice(0, 6)}… from ${tokenSenders.length} wallet(s)\n• Sweep SOL from ${solSenders.length} wallet(s)\nThis runs ${tokenSenders.length + solSenders.length} on-chain transfers.`)) return;
    setConsolidatingCol(col);
    let ok = 0; let firstErr = "";
    const total = tokenSenders.length + solSenders.length;
    try {
      // 1) Tokens first (so SOL sweep can include any rent reclaimed)
      for (const { w, amount } of tokenSenders) {
        try {
          const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
            body: { walletId: w.id, mint, amount, destination: w1.pubkey },
          });
          if (error) throw new Error(error.message);
          if (data && (data as any).error) throw new Error((data as any).error);
          ok++;
        } catch (e: any) {
          if (!firstErr) firstErr = `${SHORT(w.pubkey)} token: ${e?.message || String(e)}`;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      // 2) SOL sweep
      for (const w of solSenders) {
        try {
          const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
            body: { walletId: w.id, mint: "SOL", amount: -1, destination: w1.pubkey },
          });
          if (error) throw new Error(error.message);
          if (data && (data as any).error) throw new Error((data as any).error);
          ok++;
        } catch (e: any) {
          if (!firstErr) firstErr = `${SHORT(w.pubkey)} SOL: ${e?.message || String(e)}`;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      toast({
        title: `W${col + 1} consolidated ${ok}/${total}`,
        description: firstErr || `Wallet 1 now holds the bag. Click Sell W${col + 1}.`,
        variant: firstErr ? "destructive" : "default",
      });
      void refreshBalancesForBuy([w1.pubkey, ...others.map((w) => w.pubkey)]);
    } finally {
      setConsolidatingCol(null);
    }
  }, [wallets, mintForCol]);

  // ─── SMART SELL DUST: fund -> sell -> sweep back ───────────────────────
  // For each wallet in the column holding the target token but lacking SOL
  // for the sell fee: send 0.05 SOL from W1, wait for confirmation, sell
  // 100% of the token, then sweep remaining SOL back to W1. W1 itself just
  // sells (no fund/sweep).
  const MIN_SOL_FOR_SELL = 0.003;
  const SMART_FUND_SOL = 0.05;
  const smartSellDustColumn = useCallback(async (col: number) => {
    const mint = mintForCol(col);
    if (!mint) return toast({ title: `W${col + 1}: set a token mint first`, variant: "destructive" });
    const colWallets = wallets.filter((w) => w.column_index === col).sort((a, b) => a.row_index - b.row_index);
    const w1 = colWallets.find((w) => w.row_index === 0);
    if (!w1) return toast({ title: `W${col + 1}: Wallet 1 not found`, variant: "destructive" });
    const holders = colWallets
      .map((w) => {
        const held = (balancesRef.current[w.pubkey]?.tokens ?? []).find((t) => t.mint === mint);
        return held && held.amount > 0 ? { w, amount: held.amount } : null;
      })
      .filter((x): x is { w: WaterfallWallet; amount: number } => !!x);
    if (holders.length === 0) return toast({ title: `W${col + 1}: no wallets hold ${mint.slice(0, 6)}…` });
    const w1Sol = (() => {
      const live = balancesRef.current[w1.pubkey]?.sol;
      return typeof live === "number" ? live : Number(w1.sol_balance || 0);
    })();
    const needsFunding = holders.filter(({ w }) => {
      if (w.id === w1.id) return false;
      const live = balancesRef.current[w.pubkey]?.sol;
      const sol = typeof live === "number" ? live : Number(w.sol_balance || 0);
      return sol < MIN_SOL_FOR_SELL;
    });
    const requiredFundSol = needsFunding.length * SMART_FUND_SOL;
    if (w1Sol < requiredFundSol + 0.002) {
      return toast({
        title: `W${col + 1}·W1 needs ~${(requiredFundSol + 0.002).toFixed(3)} SOL`,
        description: `Has ${w1Sol.toFixed(4)}. Sweep more SOL into W${col + 1}·W1 first.`,
        variant: "destructive",
      });
    }
    if (!confirm(`Smart-Sell W${col + 1}: ${holders.length} wallet(s) hold ${mint.slice(0, 6)}…\n• ${needsFunding.length} need ${SMART_FUND_SOL} SOL fueled from W1\n• Each will be sold and SOL swept back to W1\n\nProceed?`)) return;
    setSmartSellingCol(col);
    let ok = 0; let firstErr = "";
    try {
      for (const { w } of holders) {
        const isW1 = w.id === w1.id;
        try {
          if (!isW1) {
            const live = balancesRef.current[w.pubkey]?.sol;
            const sol = typeof live === "number" ? live : Number(w.sol_balance || 0);
            if (sol < MIN_SOL_FOR_SELL) {
              const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
                body: { walletId: w1.id, mint: "SOL", amount: SMART_FUND_SOL, destination: w.pubkey },
              });
              if (error) throw new Error(`fund: ${error.message}`);
              if (data && (data as any).error) throw new Error(`fund: ${(data as any).error}`);
              // Update local cache so the next iteration sees the funded balance.
              const prev = balancesRef.current[w.pubkey] ?? { sol: 0, tokens: [] };
              balancesRef.current[w.pubkey] = { ...prev, sol: (prev.sol || 0) + SMART_FUND_SOL };
              await new Promise((r) => setTimeout(r, 3000));
            }
          }
          await sellMintLive(w, mint);
          ok++;
          // Wait for the swap to land before sweeping.
          await new Promise((r) => setTimeout(r, 4000));
          if (!isW1) {
            try {
              await supabase.functions.invoke("waterfall-withdraw", {
                body: { walletId: w.id, mint: "SOL", amount: -1, destination: w1.pubkey },
              });
            } catch (e: any) {
              if (!firstErr) firstErr = `${SHORT(w.pubkey)} sweep: ${e?.message || String(e)}`;
            }
          }
        } catch (e: any) {
          if (!firstErr) firstErr = `${SHORT(w.pubkey)}: ${e?.message || String(e)}`;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      toast({
        title: `W${col + 1}: smart-sold ${ok}/${holders.length}`,
        description: firstErr || `Tokens sold. SOL swept back to W${col + 1}·Wallet 1.`,
        variant: firstErr ? "destructive" : "default",
      });
      void refreshBalancesForBuy([w1.pubkey, ...holders.map((h) => h.w.pubkey)]);
    } finally {
      setSmartSellingCol(null);
    }
  }, [wallets, mintForCol, sellMintLive]);

  // ─── SWEEP ENTIRE GRID SOL → W1·Wallet 1 ───────────────────────────────
  // ─── CHAIN-SELL: walk wallets in a column that hold ANY non-SOL token. ─
  // For each holder (in row order): ensure it has SOL (top up from the
  // previous holder if possible, otherwise from W1·Wallet1 of THIS column),
  // sell every non-SOL token it holds, then sweep its SOL forward to the
  // next holder. After the last holder, sweep the SOL back to Wallet 1.
  const chainSellColumn = useCallback(async (col: number) => {
    const colWallets = wallets.filter((w) => w.column_index === col).sort((a, b) => a.row_index - b.row_index);
    const w1 = colWallets.find((w) => w.row_index === 0);
    if (!w1) return toast({ title: `W${col + 1}: Wallet 1 not found`, variant: "destructive" });
    const holders = colWallets
      .map((w) => {
        const toks = (balancesRef.current[w.pubkey]?.tokens ?? []).filter((t) => t.amount > 0);
        return toks.length > 0 ? { w, tokens: toks } : null;
      })
      .filter((x): x is { w: WaterfallWallet; tokens: TokenHolding[] } => !!x);
    if (holders.length === 0) return toast({ title: `W${col + 1}: no wallets hold non-SOL tokens` });
    const totalSells = holders.reduce((s, h) => s + h.tokens.length, 0);
    if (!confirm(
      `Chain-Sell W${col + 1}: ${holders.length} wallet(s) hold non-SOL tokens (${totalSells} sell call(s)).\n` +
      `• Each wallet will be funded if SOL < ${MIN_SOL_FOR_SELL}\n` +
      `• After selling, SOL hops forward to the next holder\n` +
      `• Final wallet sweeps SOL back to W${col + 1}·Wallet 1\n\nProceed?`
    )) return;
    setChainSellingCol(col);
    let okSells = 0; let firstErr = "";
    const solOf = (pk: string, fallback: number) => {
      const live = balancesRef.current[pk]?.sol;
      return typeof live === "number" ? live : fallback;
    };
    try {
      for (let i = 0; i < holders.length; i++) {
        const { w, tokens } = holders[i];
        const isW1 = w.id === w1.id;
        try {
          // 1) Ensure SOL for fees.
          let solHere = solOf(w.pubkey, Number(w.sol_balance || 0));
          if (solHere < MIN_SOL_FOR_SELL && !isW1) {
            const funder = w1; // top up from this column's W1
            const funderSol = solOf(funder.pubkey, Number(funder.sol_balance || 0));
            if (funderSol < SMART_FUND_SOL + 0.002) {
              throw new Error(`needs ${SMART_FUND_SOL} SOL but W1 only has ${funderSol.toFixed(4)}`);
            }
            const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
              body: { walletId: funder.id, mint: "SOL", amount: SMART_FUND_SOL, destination: w.pubkey },
            });
            if (error) throw new Error(`fund: ${error.message}`);
            if (data && (data as any).error) throw new Error(`fund: ${(data as any).error}`);
            // local cache so chain math stays consistent
            const prevW = balancesRef.current[w.pubkey] ?? { sol: 0, tokens: [] };
            balancesRef.current[w.pubkey] = { ...prevW, sol: (prevW.sol || 0) + SMART_FUND_SOL };
            const prevF = balancesRef.current[funder.pubkey] ?? { sol: 0, tokens: [] };
            balancesRef.current[funder.pubkey] = { ...prevF, sol: Math.max(0, (prevF.sol || 0) - SMART_FUND_SOL) };
            await new Promise((r) => setTimeout(r, 3000));
          }
          // 2) Sell every non-SOL token in this wallet.
          for (const t of tokens) {
            try { await sellMintLive(w, t.mint); okSells++; }
            catch (e: any) { if (!firstErr) firstErr = `${SHORT(w.pubkey)} ${t.mint.slice(0,6)}…: ${e?.message || String(e)}`; }
            await new Promise((r) => setTimeout(r, 400));
          }
          // 3) Wait for sell SOL to land, then sweep to next holder (or back to W1).
          await new Promise((r) => setTimeout(r, 4500));
          const nextHolder = holders[i + 1];
          const dest = nextHolder ? nextHolder.w : w1;
          if (dest.id !== w.id) {
            try {
              const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
                body: { walletId: w.id, mint: "SOL", amount: -1, destination: dest.pubkey },
              });
              if (error) throw new Error(error.message);
              if (data && (data as any).error) throw new Error((data as any).error);
              await new Promise((r) => setTimeout(r, 2500));
            } catch (e: any) {
              if (!firstErr) firstErr = `${SHORT(w.pubkey)} sweep→${SHORT(dest.pubkey)}: ${e?.message || String(e)}`;
            }
          }
        } catch (e: any) {
          if (!firstErr) firstErr = `${SHORT(w.pubkey)}: ${e?.message || String(e)}`;
        }
      }
      // 4) Final cleanup: sweep ANY residual SOL from every non-W1 wallet in the
      // column back to W1 (covers wallets that received hop SOL but weren't
      // holders, or wallets whose forward-sweep failed mid-chain).
      await new Promise((r) => setTimeout(r, 2000));
      const cleanupTargets = colWallets.filter((x) => x.id !== w1.id);
      let sweptBack = 0;
      for (const x of cleanupTargets) {
        try {
          const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
            body: { walletId: x.id, mint: "SOL", amount: -1, destination: w1.pubkey },
          });
          if (error) continue;
          if (data && (data as any).error) continue;
          sweptBack++;
          await new Promise((r) => setTimeout(r, 800));
        } catch { /* ignore — wallet may simply have no sweepable SOL */ }
      }
      toast({
        title: `W${col + 1}: chain-sold ${okSells}/${totalSells}`,
        description: firstErr || `SOL chained through ${holders.length} wallet(s); final cleanup swept ${sweptBack} wallet(s) back to W${col + 1}·Wallet 1.`,
        variant: firstErr ? "destructive" : "default",
      });
      void refreshBalancesForBuy(colWallets.map((x) => x.pubkey));
    } finally {
      setChainSellingCol(null);
    }
  }, [wallets, sellMintLive]);

  const sweepAllToW1 = useCallback(async () => {
    const w1 = wallets.find((w) => w.column_index === 0 && w.row_index === 0);
    if (!w1) return toast({ title: "W1·Wallet 1 not found", variant: "destructive" });
    const DUST = 0.000015;
    const candidates = wallets.filter((w) => {
      if (w.id === w1.id) return false;
      const live = balancesRef.current[w.pubkey]?.sol;
      const sol = typeof live === "number" ? live : Number(w.sol_balance || 0);
      return sol > DUST;
    });
    if (candidates.length === 0) return toast({ title: "No wallets with sweepable SOL" });
    if (!confirm(`Sweep SOL from ${candidates.length} wallet(s) → W1·Wallet 1 (${SHORT(w1.pubkey)})?`)) return;
    setSweepingToW1(true);
    let ok = 0; let firstErr = "";
    try {
      for (const w of candidates) {
        try {
          const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
            body: { walletId: w.id, mint: "SOL", amount: -1, destination: w1.pubkey },
          });
          if (error) throw new Error(error.message);
          if (data && (data as any).error) throw new Error((data as any).error);
          ok++;
        } catch (e: any) {
          if (!firstErr) firstErr = `${SHORT(w.pubkey)}: ${e?.message || String(e)}`;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      toast({
        title: `Swept ${ok}/${candidates.length} → W1·Wallet 1`,
        description: firstErr || `All SOL consolidated in ${SHORT(w1.pubkey)}`,
        variant: firstErr ? "destructive" : "default",
      });
      void refreshBalancesForBuy([w1.pubkey, ...candidates.map((w) => w.pubkey)]);
    } finally { setSweepingToW1(false); }
  }, [wallets]);

  // ─── BULK BUY (per column) ─────────────────────────────────────────────
  const buyColumn = async (col: number) => {
    const mint = mintForCol(col);
    if (!mint) return toast({ title: `W${col + 1}: set a token mint first`, variant: "destructive" });
    const pct = Math.min(MAX_BUY_SIZE_PCT, Number(buySizePct) || 0);
    if (!(pct > 0 && pct <= MAX_BUY_SIZE_PCT)) return toast({ title: `Buy % must be between 1 and ${MAX_BUY_SIZE_PCT}`, variant: "destructive" });
    let balanceSnapshot = balances;
    if (!simMode) {
      setBuyingCol(col);
      try {
        balanceSnapshot = await refreshBalancesForBuy(wallets.filter((w) => w.column_index === col).map((w) => w.pubkey));
      } catch (e: any) {
        setBuyingCol(null);
        return toast({ title: "Live balance refresh failed", description: e?.message || String(e), variant: "destructive" });
      }
      setBuyingCol(null);
    }
    const sourceWallets = wallets.map((w) => {
      const live = balanceSnapshot[w.pubkey]?.sol;
      return typeof live === "number" && Number.isFinite(live) ? { ...w, sol_balance: live } : w;
    });
    const colWallets = sourceWallets.filter((w) => w.column_index === col);
    const skipped: string[] = [];
    const buyLamportsByWallet = new Map<string, number>();
    const eligible = colWallets.filter((w) => {
      const s = simMode ? (simState[w.id]?.sol ?? Number(w.sol_balance || 0)) : Number(w.sol_balance || 0);
      const usableSol = Math.max(0, s - BUY_SELL_FEE_RESERVE_SOL);
      const lamports = Math.floor(usableSol * (pct / 100) * LAMPORTS_PER_SOL);
      buyLamportsByWallet.set(w.id, lamports);
      if (lamports < MIN_BUY_LAMPORTS) {
        skipped.push(`${w.pubkey?.slice(0, 8) || w.id.slice(0, 8)}.. leaves ${BUY_SELL_FEE_RESERVE_SOL.toFixed(3)} SOL fee reserve`);
        return false;
      }
      return true;
    });
    if (eligible.length === 0) return toast({ title: `W${col + 1}: no usable SOL after fee reserve`, description: `Leaving ${BUY_SELL_FEE_RESERVE_SOL.toFixed(3)} SOL for buy/sell fees.`, variant: "destructive" });
    skipped.forEach((msg) => appendLog({ col, row: -1, kind: "BUY", msg: `W${col + 1}  SKIP  ${msg}` }));
    if (!confirm(`BUY ${mint.slice(0, 6)}… in every wallet of W${col + 1} (${eligible.length}/${colWallets.length} eligible) at ${pct}% of live spendable SOL after reserving ${BUY_SELL_FEE_RESERVE_SOL.toFixed(3)} SOL?`)) return;
    setBuyingCol(col);
    let ok = 0; let firstErr = "";
    try {
      for (const w of eligible) {
        const lamports = buyLamportsByWallet.get(w.id) ?? 0;
        // Fetch a FRESH price for THIS wallet's buy moment, so per-wallet
        // PnL reflects intra-waterfall price drift instead of a single
        // column-wide snapshot.
        let priceMeta: { priceUsd: number; symbol: string } | undefined;
        try {
          const fresh = await fetchPricesFor([mint]);
          if (fresh[mint] && fresh[mint].priceUsd > 0) {
            priceMeta = fresh[mint];
            setTokenPrices((prev) => ({ ...prev, [mint]: fresh[mint] }));
          }
        } catch { /* fall back to cached tokenPrices */ }
        const effective = priceMeta ?? tokenPrices[mint];
        try {
          if (simMode) simBuy(w, mint, lamports, priceMeta);
          else {
            const { data: resp, error } = await supabase.functions.invoke("waterfall-swap", {
              body: { walletId: w.id, mint, side: "buy", buyLamports: lamports, buyPct: pct, buySellFeeReserveLamports: Math.floor(BUY_SELL_FEE_RESERVE_SOL * LAMPORTS_PER_SOL), minBuyLamports: MIN_BUY_LAMPORTS },
            });
            if (error) throw new Error(error.message);
            if (resp && (resp as any).success === false) throw new Error((resp as any).error || (resp as any).skipReason || "buy skipped");
            // Record per-wallet cost basis for LIVE buys so the cell's USD
            // value can colour green/red against the buy price.
            const actualLamports = Number((resp as any)?.buyLamports ?? lamports);
            const solIn = actualLamports / LAMPORTS_PER_SOL;
            const solPriceUsd = solUsd || 0;
            const usdIn = solIn * solPriceUsd * 0.99;
            const priceUsd = effective?.priceUsd ?? 0;
            const tokensEst = priceUsd > 0 && solPriceUsd > 0
              ? usdIn / priceUsd
              : solIn * 1_000_000; // phantom estimate, refined when balances refresh
            setSimCostBasis((prev) => {
              const wb = prev[w.id] ?? {};
              const cur = wb[mint] ?? { solIn: 0, usdIn: 0, tokens: 0 };
              return {
                ...prev,
                [w.id]: {
                  ...wb,
                  [mint]: {
                    solIn: cur.solIn + solIn,
                    usdIn: cur.usdIn + (solPriceUsd > 0 ? usdIn : 0),
                    tokens: cur.tokens + tokensEst,
                  },
                },
              };
            });
            appendLog({
              col: w.column_index, row: w.row_index, kind: "BUY",
              msg: `W${w.column_index + 1}·R${w.row_index + 1}  LIVE BUY  ${solIn.toFixed(4)} SOL @ $${priceUsd ? priceUsd.toFixed(8).replace(/\.?0+$/, "") : "?"}`,
            });
          }
          ok++;
        } catch (e: any) {
          const em = e?.message || String(e);
          if (!firstErr) firstErr = `${w.pubkey?.slice(0, 8) || w.id.slice(0, 8)}.. ${em}`;
          appendLog({ col: w.column_index, row: w.row_index, kind: "BUY", msg: `W${w.column_index + 1}·R${w.row_index + 1}  FAIL  ${em.slice(0, 140)}` });
        }
        await new Promise((r) => setTimeout(r, simMode ? 80 : 250));
      }
      if (simMode) appendLog({ col, row: -1, kind: "BUY", msg: `W${col + 1}  SIM BUY WATERFALL  (${ok}/${eligible.length} wallets)` });
      toast({
        title: `W${col + 1} bought ${ok}/${eligible.length}${skipped.length ? ` · skipped ${skipped.length}` : ""}`,
        description: firstErr ? `First fail: ${firstErr}` : simMode ? "Simulation complete." : "Submitted.",
        variant: firstErr && ok === 0 ? "destructive" : "default",
      });
      if (!simMode && ok > 0) void refreshBalancesForBuy(colWallets.map((w) => w.pubkey));
    } finally {
      setBuyingCol(null);
    }
  };

  // Fetch DexScreener prices for an explicit mint set. Used both for the
  // initial "missing mint" backfill and for the SIM-mode live refresh poller.
  const fetchPricesFor = useCallback(async (mintList: string[]) => {
    if (mintList.length === 0) return {} as Record<string, { priceUsd: number; symbol: string }>;
    const chunks: string[][] = [];
    for (let i = 0; i < mintList.length; i += 25) chunks.push(mintList.slice(i, i + 25));
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
    return next;
  }, []);

  // Aggregate mints currently relevant to the grid (held on-chain + held in
  // SIM + configured target/per-column mints).
  const activeMints = useMemo(() => {
    const mints = new Set<string>();
    for (const b of Object.values(balances)) for (const t of b.tokens) if (t.amount > 0) mints.add(t.mint);
    if (targetMint && targetMint.trim().length >= 32) mints.add(targetMint.trim());
    for (const m of perColMints) {
      const v = (m ?? "").trim();
      if (v.length >= 32 && v.length <= 44) mints.add(v);
    }
    for (const entry of Object.values(simState)) {
      for (const m of Object.keys(entry.tokens ?? {})) mints.add(m);
    }
    return [...mints];
  }, [balances, targetMint, perColMints, simState]);

  // Initial / on-change backfill of any newly-seen mints.
  useEffect(() => {
    const missing = activeMints.filter((m) => !(m in tokenPrices));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const next = await fetchPricesFor(missing);
      if (!cancelled) {
        setTokenPrices((prev) => ({ ...prev, ...next }));
        setLastPriceRefresh(Date.now());
      }
    })();
    return () => { cancelled = true; };
  }, [activeMints, tokenPrices, fetchPricesFor]);

  // Manual refresh handler — also used by the live poller.
  const refreshActivePrices = useCallback(async () => {
    if (activeMints.length === 0) return;
    setPricesRefreshing(true);
    try {
      const next = await fetchPricesFor(activeMints);
      setTokenPrices((prev) => ({ ...prev, ...next }));
      setLastPriceRefresh(Date.now());
    } finally {
      setPricesRefreshing(false);
    }
  }, [activeMints, fetchPricesFor]);

  // Live price polling for SIM mode (15s, pauses when tab hidden).
  useEffect(() => {
    if (!simMode) return;
    if (activeMints.length === 0) return;
    let timer: number | null = null;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshActivePrices();
    };
    timer = window.setInterval(tick, 15_000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [simMode, activeMints, refreshActivePrices]);

  // 1-second tick so "updated Ns ago" label re-renders in SIM mode.
  useEffect(() => {
    if (!simMode) return;
    const id = window.setInterval(() => forceTick((v) => (v + 1) % 1_000_000), 1000);
    return () => window.clearInterval(id);
  }, [simMode]);

  const toggleBuyEnabled = (col: number) =>
    setBuyEnabled((prev) => prev.map((v, i) => (i === col ? !v : v)));

  const validTargetMint = targetMint.trim().length >= 32 && targetMint.trim().length <= 44;

  const applyRefreshPayload = useCallback((payload: any) => {
    const refreshed = (payload?.wallets ?? {}) as Record<string, { sol: number; tokens: TokenHolding[] }>;
    const partial = Boolean(payload?.partial);
    const nextBalances = partial ? { ...balancesRef.current, ...refreshed } : refreshed;
    balancesRef.current = nextBalances;
    setBalances(nextBalances);
    setWallets((prev) => prev.map((w) => {
      const live = refreshed[w.pubkey]?.sol;
      return typeof live === "number" && Number.isFinite(live) && live !== Number(w.sol_balance || 0) ? { ...w, sol_balance: live } : w;
    }));
    return nextBalances;
  }, []);

  const refreshBalancesForBuy = useCallback(async (pubkeys?: string[]) => {
    const { data, error } = await supabase.functions.invoke("waterfall-refresh-balances", {
      body: pubkeys?.length ? { pubkeys } : {},
    });
    if (error) throw new Error(error.message);
    return applyRefreshPayload(data);
  }, [applyRefreshPayload]);

  const loadWallets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("waterfall_wallets")
      .select("id,column_index,row_index,nickname,pubkey,sol_balance,last_balance_at")
      .gte("row_index", 0)
      .lte("row_index", 9)
      .order("column_index").order("row_index");
    if (error) toast({ title: "Load failed", description: error.message, variant: "destructive" });
    const loaded = (data ?? []) as WaterfallWallet[];
    setWallets(loaded);
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
      appendLog({ col: columnIndex, row: -1, kind: "CASCADE", msg: `── SIM CASCADE column ${columnIndex + 1} starting (10 hops × 10 TROLL cycles) ──` });
      for (const hop of plan.hops) {
        const fromW = wallets.find((w) => w.column_index === columnIndex && w.row_index === hop.row);
        const toW = wallets.find((w) => w.column_index === columnIndex && w.row_index === hop.row + 1);
        if (!fromW) continue;

        // SIM TROLL: 10 buy/sell cycles on this wallet before forwarding
        let trollSpentLamports = 0;
        if (skipTroll) {
          appendLog({
            col: columnIndex, row: hop.row, kind: "TROLL",
            msg: `W${columnIndex + 1}·R${hop.row + 1}  TROLL skipped (SOL spread only)`,
          });
        } else {
          for (let k = 1; k <= 10; k++) {
            const jitter = 1 + (Math.random() * 0.4 - 0.2); // ±20%
            const feeSol = SIM_TROLL_COST_PER_CYCLE * jitter;
            trollSpentLamports += Math.floor(feeSol * LAMPORTS_PER_SOL);
            appendLog({
              col: columnIndex, row: hop.row, kind: "TROLL",
              msg: `W${columnIndex + 1}·R${hop.row + 1}  troll ${k}/10  BUY→SELL $TROLL  −${feeSol.toFixed(5)} SOL`,
            });
            await new Promise((r) => setTimeout(r, 90));
          }
        }
        // Deduct troll fees from the wallet's sim SOL up front
        setSimState((prev) => {
          const next = { ...prev };
          const cur = next[fromW.id] ?? { sol: 0, tokens: {} };
          next[fromW.id] = { ...cur, sol: Math.max(0, cur.sol - trollSpentLamports / LAMPORTS_PER_SOL) };
          return next;
        });

        await new Promise((r) => setTimeout(r, 200));
        setSimState((prev) => {
          const next = { ...prev };
          const from = next[fromW.id] ?? { sol: 0, tokens: {} };
          if (hop.row === 9 || !toW) {
            next[fromW.id] = { ...from, sol: Math.max(0, hop.projectedIncomingLamports / LAMPORTS_PER_SOL - trollSpentLamports / LAMPORTS_PER_SOL) };
            return next;
          }
          const to = next[toW.id] ?? { sol: 0, tokens: {} };
          const forwardSol = Math.max(0, (hop.projectedForwardLamports - trollSpentLamports) / LAMPORTS_PER_SOL);
          next[fromW.id] = { ...from, sol: hop.leaveBehindLamports / LAMPORTS_PER_SOL };
          next[toW.id] = { ...to, sol: to.sol + forwardSol };
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
    const eta = skipTroll ? "~2–4 minutes. ~$0.10 in fees." : "~25 minutes. ~$1–$2.50 in fees.";
    const trollNote = skipTroll ? "\n(TROLL skipped — SOL spread only)" : "";
    if (!confirm(`EXECUTE cascade on column ${columnIndex + 1} with the previewed plan?\n${eta}${trollNote}`)) return;
    const planPayload = plan.hops
      .filter((h) => h.row < 9)
      .map((h) => ({ row: h.row, leaveBehindLamports: h.leaveBehindLamports }));
    const { error } = await supabase.functions.invoke("waterfall-cascade", {
      body: { columnIndex, plan: planPayload, skipTroll },
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
    applyRefreshPayload(data);
    loadWallets();
    toast({ title: "Balances refreshed" });
  };

  const exportKeys = async () => {
    if (!confirm("Export ALL 100 private keys to your device as CSV + JSON files?\n\nAnyone with these files controls the wallets. Are you sure?")) return;
    setExporting(true);
    const { data, error } = await supabase.functions.invoke("waterfall-export-keys");
    setExporting(false);
    if (error) return toast({ title: "Export failed", description: error.message, variant: "destructive" });
    const rows = ((data as any)?.wallets ?? []) as Array<{ column: number; wallet: number; nickname: string | null; pubkey: string; secret_base58: string }>;
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,"0")}${String(ts.getDate()).padStart(2,"0")}-${String(ts.getHours()).padStart(2,"0")}${String(ts.getMinutes()).padStart(2,"0")}`;
    const download = (filename: string, blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const csvEsc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      ["column","wallet","nickname","pubkey","secret_base58"].join(","),
      ...rows.map(r => [r.column, r.wallet, r.nickname ?? "", r.pubkey, r.secret_base58].map(csvEsc).join(",")),
    ].join("\n");
    download(`waterfall-keys-${stamp}.json`, new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    download(`waterfall-keys-${stamp}.csv`, new Blob([csv], { type: "text/csv" }));
    toast({ title: `Exported ${rows.length} keys`, description: "CSV + JSON downloaded" });
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

  // USD value of tokens held in each column (sum across all 10 wallets of that column).
  const tokenUsdByCol = useMemo(() => {
    const out: number[] = Array.from({ length: 10 }, () => 0);
    for (const w of wallets) {
      const toks = balances[w.pubkey]?.tokens ?? [];
      let sum = 0;
      for (const t of toks) {
        const px = tokenPrices[t.mint]?.priceUsd ?? 0;
        sum += px * t.amount;
      }
      if (w.column_index >= 0 && w.column_index < 10) out[w.column_index] += sum;
    }
    return out;
  }, [wallets, balances, tokenPrices]);
  const totalTokenUsd = useMemo(() => tokenUsdByCol.reduce((a, b) => a + b, 0), [tokenUsdByCol]);
  const totalWalletsWithTokens = useMemo(() => {
    let n = 0;
    for (const w of wallets) if ((balances[w.pubkey]?.tokens ?? []).some((t) => t.amount > 0)) n++;
    return n;
  }, [wallets, balances]);

  // Auto-load on-chain balances + token holdings once wallets are loaded so the
  // grid shows tokens + USD value WITHOUT the user clicking "Refresh".
  // Re-poll every 20s so newly-bought tokens appear on their own and stale
  // holdings disappear after a sell — always read live from on-chain (Helius
  // RPC inside the edge function), never from the database.
  useEffect(() => {
    if (wallets.length === 0) return;
    let cancelled = false;
    const run = async () => {
      if (balanceRefreshInFlightRef.current) return;
      balanceRefreshInFlightRef.current = true;
      try {
        const { data, error } = await supabase.functions.invoke("waterfall-refresh-balances");
        if (error) throw error;
        if (!cancelled) applyRefreshPayload(data);
      } catch (e) {
        console.warn("[WaterfallGrid] auto-refresh failed", e);
      } finally {
        balanceRefreshInFlightRef.current = false;
      }
    };
    run();
    const id = window.setInterval(run, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [wallets.length, applyRefreshPayload]);

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
          <div className="flex flex-wrap items-center gap-2 border-t border-amber-500/30 pt-2 text-[11px]">
            <span className="font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Live prices:</span>
            <span className="text-muted-foreground">
              {lastPriceRefresh > 0
                ? <>updated {Math.max(0, Math.floor((Date.now() - lastPriceRefresh) / 1000))}s ago · {activeMints.length} mint{activeMints.length === 1 ? "" : "s"}</>
                : <>idle — no mints tracked yet</>}
            </span>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={refreshActivePrices} disabled={pricesRefreshing || activeMints.length === 0}>
              {pricesRefreshing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Refresh now
            </Button>
            <span className="text-muted-foreground">· auto every 15s (paused when tab hidden)</span>
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
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
            🪙 Tokens held: ${totalTokenUsd.toFixed(2)} across {totalWalletsWithTokens} wallet{totalWalletsWithTokens === 1 ? "" : "s"}
            {solUsd > 0 && ` · Grand total (SOL + tokens) ≈ $${(totalSol * solUsd + totalTokenUsd).toFixed(2)}`}
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
          <Button
            size="sm"
            variant="default"
            className="bg-rose-600 hover:bg-rose-700 text-white"
            onClick={sellGrid}
            disabled={
              sellingGrid || sellingCol !== null || buyingCol !== null || isEmpty ||
              (useSameMint ? !targetMint.trim() : perColMints.every((m) => !(m ?? "").trim()))
            }
            title={
              (useSameMint ? !targetMint.trim() : perColMints.every((m) => !(m ?? "").trim()))
                ? "Set at least one target token to enable"
                : "Sell target tokens across all configured waterfalls"
            }
          >
            {sellingGrid ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
            <span className="ml-2">SELL GRID</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
            onClick={sweepAllSol}
            disabled={sweeping || isEmpty}
            title="Sweep all remaining SOL from every wallet to a main address"
          >
            {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            <span className="ml-2">SWEEP SOL</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-cyan-500 text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950"
            onClick={sweepAllToW1}
            disabled={sweepingToW1 || isEmpty}
            title="Sweep ALL SOL across the grid into W1·Wallet 1"
          >
            {sweepingToW1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            <span className="ml-2">SWEEP → W1·W1</span>
          </Button>
        </div>
      </div>

      {/* Buy target bar */}
      <div className="rounded-md border bg-muted/40 p-3 space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
          <input
            type="checkbox"
            checked={useSameMint}
            onChange={() => setUseSameMint((v) => !v)}
            className="h-3.5 w-3.5"
          />
          Use the same Buy token for all 10 waterfalls
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {useSameMint ? (
            <>
              <label className="text-xs font-medium whitespace-nowrap">Buy token (mint):</label>
              <Input
                value={targetMint}
                onChange={(e) => setTargetMint(e.target.value)}
                placeholder="Paste Solana token mint address…"
                className="h-8 text-xs font-mono flex-1 min-w-[260px]"
              />
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground italic flex-1 min-w-[260px]">
              Per-waterfall mint inputs are shown in each column header below.
            </span>
          )}
              <label className="text-xs font-medium whitespace-nowrap ml-2">Buy size (% of spendable SOL):</label>
          <Input
            value={buySizePct}
                onChange={(e) => setBuySizePct(clampBuySizePct(e.target.value))}
            className="h-8 text-xs w-20"
            type="number"
            min={1}
                max={MAX_BUY_SIZE_PCT}
          />
          <span className="text-[11px] text-muted-foreground">%</span>
          {useSameMint && validTargetMint && tokenPrices[targetMint.trim()] && (
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
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipTroll}
              onChange={() => setSkipTroll((v) => !v)}
              className="h-3.5 w-3.5"
            />
            Skip TROLL process (cascade just spreads SOL across wallets)
          </label>
          {skipTroll && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              No buy/sell of $TROLL · ~2–4 min instead of ~25 min
            </span>
          )}
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
                  const colMint = mintForCol(c);
                  const colMintMeta = colMint && tokenPrices[colMint];
                  return (
                    <th key={c} className="p-2 border-b border-r min-w-[180px] align-top">
                      <div className="font-bold text-[11px] text-muted-foreground">WATERFALL {c + 1}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-1">{first ? SHORT(first.pubkey) : "—"}</div>
                      {!useSameMint && (
                        <Input
                          value={perColMints[c] ?? ""}
                          onChange={(e) =>
                            setPerColMints((prev) => prev.map((v, i) => (i === c ? e.target.value : v)))
                          }
                          placeholder="Mint…"
                          className="h-6 mt-1 text-[10px] font-mono"
                        />
                      )}
                      {colMintMeta && (
                        <div className="text-[9px] text-muted-foreground mt-0.5 truncate">
                          {colMintMeta.symbol} · ${colMintMeta.priceUsd.toFixed(8).replace(/\.?0+$/, "")}
                        </div>
                      )}
                      <div className="text-[10px] mt-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        Tokens: ${tokenUsdByCol[c].toFixed(2)}
                      </div>
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => buyColumn(c)}
                          disabled={sellingGrid || sellingCol !== null || buyingCol !== null || !colMint || !buyEnabled[c]}
                          className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-1"
                          title={!colMint ? "Set this waterfall's mint to enable" : !buyEnabled[c] ? "Buying disabled for this column" : `Buy target token in every wallet of W${c + 1}`}
                        >
                          {buyingCol === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Buy W{c + 1}</>}
                        </button>
                        <button
                          onClick={() => sellColumn(c)}
                          disabled={sellingGrid || sellingCol !== null || buyingCol !== null || !colMint}
                          className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-1"
                          title={!colMint ? "Set this waterfall's mint to enable" : `Sell target token in every wallet of W${c + 1}`}
                        >
                          {sellingCol === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Sell W{c + 1}</>}
                        </button>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => sellAllInColumn(c)}
                          disabled={sellingGrid || sellingCol !== null || sellingAllCol !== null || buyingCol !== null}
                          className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-800 hover:bg-rose-900 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-1"
                          title={`Sell ALL token holdings (any mint) across every wallet of W${c + 1}`}
                        >
                          {sellingAllCol === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Sell ALL W{c + 1}</>}
                        </button>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => consolidateColumn(c)}
                          disabled={consolidatingCol !== null || sellingGrid || sellingCol !== null || sellingAllCol !== null || buyingCol !== null || !colMint}
                          className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-700 hover:bg-cyan-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-1"
                          title={!colMint ? "Set this waterfall's mint to enable" : `Move ALL tokens + SOL from W${c + 1}·R2–R10 into W${c + 1}·Wallet 1`}
                        >
                          {consolidatingCol === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Consolidate → W{c + 1}·W1</>}
                        </button>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => smartSellDustColumn(c)}
                          disabled={smartSellingCol !== null || consolidatingCol !== null || sellingGrid || sellingCol !== null || sellingAllCol !== null || buyingCol !== null || !colMint}
                          className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-700 hover:bg-fuchsia-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-1"
                          title={!colMint ? "Set this waterfall's mint to enable" : `For each wallet of W${c + 1} that holds the target token: fund 0.05 SOL from W1 if needed, sell, then sweep SOL back to W1`}
                        >
                          {smartSellingCol === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Smart-Sell Dust W{c + 1}</>}
                        </button>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => chainSellColumn(c)}
                          disabled={chainSellingCol !== null || smartSellingCol !== null || consolidatingCol !== null || sellingGrid || sellingCol !== null || sellingAllCol !== null || buyingCol !== null}
                          className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-700 hover:bg-orange-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-1"
                          title={`Walk every wallet of W${c + 1} holding ANY non-SOL token: fund if dry, sell all tokens, then hop SOL forward to the next holder (last hop returns to Wallet 1).`}
                        >
                          {chainSellingCol === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Chain-Sell W{c + 1}</>}
                        </button>
                      </div>
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
                              targetMint={mintForCol(c)}
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
                              onRefreshBalancesForBuy={refreshBalancesForBuy}
                              simMode={simMode}
                              onSimBuy={simBuy}
                              onSimSell={simSell}
                              onSimTroll={simTroll}
                              realizedPnl={simMode ? simRealizedPnl[w.id] : undefined}
                              costBasis={simCostBasis[w.id]}
                              onSellMintLive={sellMintLive}
                              onSellAllLive={sellAllInWallet}
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
  onRefreshBalancesForBuy,
  simMode, onSimBuy, onSimSell, onSimTroll, realizedPnl,
  costBasis,
  onSellMintLive, onSellAllLive,
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
  onRefreshBalancesForBuy: (pubkeys?: string[]) => Promise<Record<string, { sol: number; tokens: TokenHolding[] }>>;
  simMode: boolean;
  onSimBuy: (w: WaterfallWallet, mint: string, lamportsIn: number) => void;
  onSimSell: (w: WaterfallWallet, mint: string) => void;
  onSimTroll: (w: WaterfallWallet) => void;
  realizedPnl?: { sol: number; usd: number };
  costBasis?: Record<string, SimCostBasis>;
  onSellMintLive: (w: WaterfallWallet, mint: string) => Promise<string | undefined>;
  onSellAllLive: (w: WaterfallWallet) => Promise<{ ok: number; total: number }>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(w.nickname ?? "");
  const [trolling, setTrolling] = useState(false);
  const [busy, setBusy] = useState<null | "buy" | "sell">(null);
  const [sellingMint, setSellingMint] = useState<string | null>(null);
  const [sellingAll, setSellingAll] = useState(false);
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
      const pct = Math.min(MAX_BUY_SIZE_PCT, buySizePct || 0);
      if (!(pct > 0 && pct <= MAX_BUY_SIZE_PCT)) return toast({ title: `Buy % must be between 1 and ${MAX_BUY_SIZE_PCT}`, variant: "destructive" });
      let liveSol = sol;
      if (!simMode) {
        setBusy("buy");
        try {
          const fresh = await onRefreshBalancesForBuy([w.pubkey]);
          liveSol = fresh[w.pubkey]?.sol ?? sol;
        } catch (e: any) {
          setBusy(null);
          return toast({ title: "Live balance refresh failed", description: e?.message || String(e), variant: "destructive" });
        }
        setBusy(null);
      }
      if (liveSol < 0.002) {
        return toast({ title: "Not enough SOL", description: `Wallet has ${liveSol.toFixed(6)} SOL.`, variant: "destructive" });
      }
      var buyLamportsCalc = Math.floor(Math.max(0, liveSol - BUY_SELL_FEE_RESERVE_SOL) * (pct / 100) * LAMPORTS_PER_SOL);
      if (buyLamportsCalc < MIN_BUY_LAMPORTS) {
        return toast({ title: "No spendable SOL", description: `Live ${liveSol.toFixed(6)} SOL; reserve ${BUY_SELL_FEE_RESERVE_SOL.toFixed(3)} SOL for buy/sell fees.`, variant: "destructive" });
      }
      if (simMode) { onSimBuy(w, targetMint, buyLamportsCalc); return; }
      if (!confirm(`BUY ${(buyLamportsCalc / LAMPORTS_PER_SOL).toFixed(4)} SOL (${pct}% of live spendable SOL after ${BUY_SELL_FEE_RESERVE_SOL.toFixed(3)} SOL fee reserve) of ${targetMint.slice(0, 6)}… from ${w.nickname || "wallet"}?`)) return;
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
        buyLamports: side === "buy" ? buyLamportsCalc : undefined,
        buyPct: side === "buy" ? Math.min(MAX_BUY_SIZE_PCT, buySizePct || 0) : undefined,
        buySellFeeReserveLamports: side === "buy" ? Math.floor(BUY_SELL_FEE_RESERVE_SOL * LAMPORTS_PER_SOL) : undefined,
        minBuyLamports: side === "buy" ? MIN_BUY_LAMPORTS : undefined,
        priorityFeeMode: "low",
      },
    });
    setBusy(null);
    if (error) return toast({ title: `${side.toUpperCase()} failed`, description: error.message, variant: "destructive" });
    if (data && (data as any).success === false) {
      return toast({ title: `${side.toUpperCase()} skipped`, description: (data as any).error || (data as any).skipReason || "No executable trade.", variant: "destructive" });
    }
    if (!simMode) void onRefreshBalancesForBuy([w.pubkey]);
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
          {tokens.map((t) => {
            const meta = tokenPrices[t.mint];
            const usd = meta ? meta.priceUsd * t.amount : 0;
            const solEq = solUsd > 0 ? usd / solUsd : 0;
            const sym = meta?.symbol ?? "?";
            const tokenLabel = sym && sym !== "?" ? sym : SHORT(t.mint);
            const isTarget = targetMint === t.mint;
            const amt = t.amount >= 1000
              ? t.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : t.amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
            const basis = costBasis?.[t.mint];
            let costUsd = 0;
            let pnlPct = 0;
            if (basis && basis.tokens > 0) {
              const heldRatio = Math.min(1, t.amount / basis.tokens);
              // Fallback: if we never captured a USD basis (phantom-price buy),
              // derive it from the SOL spent × live SOL/USD.
              const basisUsd = basis.usdIn > 0
                ? basis.usdIn
                : basis.solIn * (solUsd || 0) * 0.99;
              costUsd = basis.entryPriceUsd && basis.entryPriceUsd > 0
                ? basis.entryPriceUsd * t.amount
                : basisUsd * heldRatio;
              if (costUsd > 0 && usd > 0) pnlPct = ((usd - costUsd) / costUsd) * 100;
            }
            const hasPnl = costUsd > 0 && usd > 0;
            const pnlColor = !hasPnl
              ? "text-muted-foreground"
              : usd >= costUsd
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400";
            return (
              <div key={t.mint} className={`truncate ${isTarget ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                <span className="font-semibold">{amt}</span> {tokenLabel}
                {!simMode && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Sell ALL ${amt} ${tokenLabel} (${SHORT(t.mint)}) from ${w.nickname || "wallet"}?`)) return;
                      setSellingMint(t.mint);
                      try {
                        await onSellMintLive(w, t.mint);
                        toast({ title: `Sell sent: ${tokenLabel}` });
                      } catch (e: any) {
                        toast({ title: `Sell failed`, description: e?.message || String(e), variant: "destructive" });
                      } finally { setSellingMint(null); }
                    }}
                    disabled={sellingMint !== null || sellingAll || busy !== null || cascadeRunning || trolling}
                    className="ml-1 inline-flex items-center px-1 py-px rounded text-[9px] bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 align-middle"
                    title={`Sell 100% of ${tokenLabel}`}
                  >
                    {sellingMint === t.mint ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Sell"}
                  </button>
                )}
                {usd > 0 && (
                  <>
                    <span className="text-muted-foreground">{" ≈ "}</span>
                    <span className={`font-medium ${pnlColor}`} title={hasPnl ? `Cost: $${costUsd.toFixed(4)} · ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%` : undefined}>
                      ${usd >= 1 ? usd.toFixed(2) : usd.toFixed(4)}
                    </span>
                    {solEq > 0 && <span className="text-muted-foreground"> / {solEq.toFixed(4)} SOL</span>}
                    {hasPnl && Math.abs(pnlPct) > 0.01 && (
                      <span className={`ml-1 font-mono ${pnlColor}`}>({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)</span>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {(() => {
            const tokensUsd = tokens.reduce((s, t) => s + (tokenPrices[t.mint]?.priceUsd ?? 0) * t.amount, 0);
            const solValueUsd = sol * solUsd;
            const totalUsd = tokensUsd + solValueUsd;
            const totalSol = solUsd > 0 ? totalUsd / solUsd : sol;
            if (tokensUsd <= 0) return null;
            return (
              <div className="text-[10px] text-foreground font-medium border-t border-border/40 pt-0.5">
                Total ≈ {solUsd > 0 ? `$${totalUsd.toFixed(2)} / ` : ""}{totalSol.toFixed(4)} SOL
              </div>
            );
          })()}
          {realizedPnl && (Math.abs(realizedPnl.sol) > 1e-6 || Math.abs(realizedPnl.usd) > 0.001) && (
            <div className={`text-[10px] font-medium ${realizedPnl.sol >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              Realized: {realizedPnl.sol >= 0 ? "+" : ""}{realizedPnl.sol.toFixed(4)} SOL
              {Math.abs(realizedPnl.usd) > 0.001 && <> ({realizedPnl.usd >= 0 ? "+" : ""}${realizedPnl.usd.toFixed(2)})</>}
            </div>
          )}
        </div>
      )}
      {tokens.length === 0 && realizedPnl && (Math.abs(realizedPnl.sol) > 1e-6 || Math.abs(realizedPnl.usd) > 0.001) && (
        <div className={`text-[10px] font-medium ${realizedPnl.sol >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          Realized: {realizedPnl.sol >= 0 ? "+" : ""}{realizedPnl.sol.toFixed(4)} SOL
          {Math.abs(realizedPnl.usd) > 0.001 && <> ({realizedPnl.usd >= 0 ? "+" : ""}${realizedPnl.usd.toFixed(2)})</>}
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
                  : `Buy ${buySizePct}% of spendable SOL after reserving ${BUY_SELL_FEE_RESERVE_SOL.toFixed(3)} SOL for fees`
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
      {!simMode && tokens.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 w-full text-[10px] px-2 border-rose-500 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
          onClick={async () => {
            setSellingAll(true);
            try { await onSellAllLive(w); } finally { setSellingAll(false); }
          }}
          disabled={sellingAll || sellingMint !== null || busy !== null || cascadeRunning || trolling}
          title="Sell every token in this wallet (any mint)"
        >
          {sellingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <><DollarSign className="h-3 w-3 mr-1" />SELL ALL HOLDINGS</>}
        </Button>
      )}
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