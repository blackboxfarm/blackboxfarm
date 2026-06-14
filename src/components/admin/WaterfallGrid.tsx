import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSolPrice } from "@/hooks/useSolPrice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Download, Sparkles, Copy, ArrowDownToLine } from "lucide-react";
import { WaterfallWalletDrawer, type WaterfallWallet, type TokenHolding } from "./WaterfallWalletDrawer";

const SHORT = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

export default function WaterfallGrid() {
  const [wallets, setWallets] = useState<WaterfallWallet[]>([]);
  const [balances, setBalances] = useState<Record<string, { sol: number; tokens: TokenHolding[] }>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [active, setActive] = useState<WaterfallWallet | null>(null);
  const { priceData } = useSolPrice() as any;
  const solUsd = priceData?.price ?? 0;

  const loadWallets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("waterfall_wallets")
      .select("id,column_index,row_index,nickname,pubkey,sol_balance,last_balance_at")
      .order("column_index").order("row_index");
    if (error) toast({ title: "Load failed", description: error.message, variant: "destructive" });
    setWallets((data ?? []) as WaterfallWallet[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadWallets(); }, [loadWallets]);

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
                    return (
                      <td key={c} className="p-2 border-b border-r align-top">
                        {w ? (
                          <Cell
                            w={w}
                            tokens={balances[w.pubkey]?.tokens ?? []}
                            solUsd={solUsd}
                            onOpen={() => setActive(w)}
                            onRename={updateNickname}
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
  w, tokens, solUsd, onOpen, onRename,
}: {
  w: WaterfallWallet;
  tokens: TokenHolding[];
  solUsd: number;
  onOpen: () => void;
  onRename: (id: string, nickname: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(w.nickname ?? "");
  const sol = Number(w.sol_balance || 0);
  return (
    <div className="space-y-1">
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
    </div>
  );
}