import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSolPrice } from "@/hooks/useSolPrice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Download, Sparkles, Copy, ArrowDownToLine, Zap, Waves } from "lucide-react";
import { WaterfallWalletDrawer, type WaterfallWallet, type TokenHolding } from "./WaterfallWalletDrawer";

const SHORT = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

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
  const { priceData } = useSolPrice() as any;
  const solUsd = priceData?.price ?? 0;

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

  const startCascade = async (columnIndex: number) => {
    if (cascades[columnIndex]) return toast({ title: "Already running", variant: "destructive" });
    if (!confirm(
      `CASCADE column ${columnIndex + 1}?\n\n` +
      `Runs TROLL on W1 (10 cycles w/ retries) → forwards remainder to W2 (leaves 0.75–0.95 SOL behind) → repeats through W10.\n\n` +
      `~25 minutes total. ~$1–$2.50 in fees.\nW1 needs enough SOL (≥ ~9 SOL recommended for clean 10-hop run).`
    )) return;
    const { error } = await supabase.functions.invoke("waterfall-cascade", { body: { columnIndex } });
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
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h2 className="text-lg font-semibold">💧 Waterfall — 10×10 Solana Wallet Grid</h2>
          <p className="text-xs text-muted-foreground">
            10 isolated columns · 10 wallets per column · {wallets.length}/100 wallets · Total: {totalSol.toFixed(4)} SOL
            {solUsd > 0 && ` (≈ $${(totalSol * solUsd).toFixed(2)})`}
          </p>
        </div>
        <div className="flex gap-2">
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
                    return (
                      <td key={c} className="p-2 border-b border-r align-top">
                        {w ? (
                          <Cell
                            w={w}
                            tokens={balances[w.pubkey]?.tokens ?? []}
                            solUsd={solUsd}
                            onOpen={() => setActive(w)}
                            onRename={updateNickname}
                              isHeadOfColumn={r === 0}
                              cascade={cascade}
                              isCurrentCascadeWallet={isCascadeWallet}
                              onCascade={() => startCascade(c)}
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
  w, tokens, solUsd, onOpen, onRename, isHeadOfColumn, cascade, isCurrentCascadeWallet, onCascade,
}: {
  w: WaterfallWallet;
  tokens: TokenHolding[];
  solUsd: number;
  onOpen: () => void;
  onRename: (id: string, nickname: string) => void;
  isHeadOfColumn: boolean;
  cascade?: CascadeRun;
  isCurrentCascadeWallet: boolean;
  onCascade: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(w.nickname ?? "");
  const [trolling, setTrolling] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const sol = Number(w.sol_balance || 0);
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
    if (!confirm(`Run TROLL on ${w.nickname || "Wallet"}?\n10× buy + sell of $TROLL at ~$0.02/cycle, 5s between cycles.\n~2 min runtime.`)) return;
    setTrolling(true);
    const { data, error } = await supabase.functions.invoke("waterfall-troll", { body: { walletId: w.id } });
    setTrolling(false);
    if (error) return toast({ title: "TROLL failed", description: error.message, variant: "destructive" });
    const d = data as any;
    const okCount = (d?.cycles ?? []).filter((c: any) => c.buy && c.sell).length;
    toast({ title: `TROLL done (${okCount}/10)`, description: `Spent ${Number(d?.netSolSpent ?? 0).toFixed(6)} SOL in ${Math.round((d?.totalMs ?? 0) / 1000)}s` });
  };

  return (
    <div className={`space-y-1 ${isCurrentCascadeWallet ? "ring-2 ring-purple-500 rounded p-1 -m-1" : ""}`}>
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
      </div>
      {tokens.length > 0 && (
        <div className="text-[10px] text-muted-foreground">+{tokens.length} token{tokens.length > 1 ? "s" : ""}</div>
      )}
      <Button size="sm" variant="outline" className="h-6 w-full text-[10px] px-2" onClick={onOpen}>
        <ArrowDownToLine className="h-3 w-3 mr-1" /> Withdraw / Details
      </Button>
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
        <Button
          size="sm"
          variant={cascadeRunning ? "secondary" : "outline"}
          className="h-6 w-full text-[10px] px-2 border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
          onClick={onCascade}
          disabled={cascadeRunning}
          title="Run TROLL on each wallet 1→10, forwarding the remainder down the column"
        >
          {cascadeRunning ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Cascading</>
          ) : (
            <><Waves className="h-3 w-3 mr-1" /> CASCADE</>
          )}
        </Button>
      )}
      {cascadeRunning && isHeadOfColumn && (
        <div className="text-[10px] text-purple-600 dark:text-purple-400 truncate" title={cascade?.current_step ?? ""}>
          W{(cascade!.current_wallet_row ?? 0) + 1}: {cascade!.current_step}
        </div>
      )}
    </div>
  );
}