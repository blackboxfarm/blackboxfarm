import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Loader2, Dices } from "lucide-react";
import type { WaterfallWallet } from "./WaterfallWalletDrawer";

const MIN_PER_WALLET = 0.001;
const PER_TX_FEE = 0.000005;

export type SpreadTarget = { wallet: WaterfallWallet; amount: number };

/** Fuzzy-even split: renormalised random weights so the sum is exact. */
export function fuzzySplit(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const rounded = raw.map((v) => Math.round(v * 1e6) / 1e6);
  const diff = Math.round((total - rounded.reduce((a, b) => a + b, 0)) * 1e6) / 1e6;
  if (Math.abs(diff) > 0) {
    let maxIdx = 0;
    rounded.forEach((v, i) => { if (v > rounded[maxIdx]) maxIdx = i; });
    rounded[maxIdx] = Math.round((rounded[maxIdx] + diff) * 1e6) / 1e6;
  }
  return rounded;
}

export function WaterfallSpreadModal({
  open,
  onOpenChange,
  wallets,
  source,
  sourceSol,
  liveSol,
  running,
  onSpread,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  wallets: WaterfallWallet[];
  source: WaterfallWallet | null;
  sourceSol: number;
  liveSol: (pubkey: string) => number;
  running: boolean;
  onSpread: (targets: SpreadTarget[], fuzzPct: number) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amountStr, setAmountStr] = useState<string>("");
  const [reserveStr, setReserveStr] = useState<string>("0.02");
  const [fuzzPct, setFuzzPct] = useState<number>(5);
  const [seed, setSeed] = useState<number>(() => Math.random());
  const dragMode = useRef<null | "add" | "remove">(null);

  const reserve = Math.max(0, Number(reserveStr) || 0);
  const amount = Number(amountStr) || 0;

  // Reset defaults each time the modal opens
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSeed(Math.random());
    const avail = Math.max(0, sourceSol - (Number(reserveStr) || 0));
    setAmountStr(avail > 0 ? avail.toFixed(4) : "0");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceSol]);

  const grid = useMemo(() => {
    const map = new Map<string, WaterfallWallet>();
    for (const w of wallets) map.set(`${w.column_index}:${w.row_index}`, w);
    return map;
  }, [wallets]);

  const cols = useMemo(() => {
    const set = new Set(wallets.map((w) => w.column_index));
    return [...set].sort((a, b) => a - b);
  }, [wallets]);
  const rows = useMemo(() => {
    const set = new Set(wallets.map((w) => w.row_index));
    return [...set].sort((a, b) => a - b);
  }, [wallets]);

  const isSource = useCallback((w: WaterfallWallet) => !!source && w.id === source.id, [source]);

  const toggle = useCallback((w: WaterfallWallet, mode?: "add" | "remove") => {
    if (isSource(w)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const has = next.has(w.id);
      const action = mode ?? (has ? "remove" : "add");
      if (action === "add") next.add(w.id); else next.delete(w.id);
      return next;
    });
  }, [isSource]);

  const selectMany = useCallback((list: WaterfallWallet[]) => {
    setSelected((prev) => {
      const eligible = list.filter((w) => !isSource(w));
      const allIn = eligible.length > 0 && eligible.every((w) => prev.has(w.id));
      const next = new Set(prev);
      for (const w of eligible) { if (allIn) next.delete(w.id); else next.add(w.id); }
      return next;
    });
  }, [isSource]);

  const selectedWallets = useMemo(
    () => wallets
      .filter((w) => selected.has(w.id))
      .sort((a, b) => a.column_index - b.column_index || a.row_index - b.row_index),
    [wallets, selected],
  );

  // Deterministic-per-seed pseudo random weights
  const weights = useMemo(() => {
    let s = Math.floor(seed * 1e9) || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const f = fuzzPct / 100;
    return selectedWallets.map(() => 1 + (rnd() * 2 - 1) * f);
  }, [selectedWallets, fuzzPct, seed]);

  const plan = useMemo<SpreadTarget[]>(() => {
    if (selectedWallets.length === 0 || amount <= 0) return [];
    // Drop wallets that would receive below the minimum, then re-split.
    let list = selectedWallets.map((w, i) => ({ wallet: w, weight: weights[i] ?? 1 }));
    for (let guard = 0; guard < 20; guard++) {
      const amounts = fuzzySplit(amount, list.map((x) => x.weight));
      const bad = amounts.findIndex((a) => a < MIN_PER_WALLET);
      if (bad === -1) return list.map((x, i) => ({ wallet: x.wallet, amount: amounts[i] }));
      list = list.filter((_, i) => i !== bad);
      if (list.length === 0) return [];
    }
    return [];
  }, [selectedWallets, weights, amount]);

  const totalOut = plan.reduce((s, p) => s + p.amount, 0);
  const min = plan.length ? Math.min(...plan.map((p) => p.amount)) : 0;
  const max = plan.length ? Math.max(...plan.map((p) => p.amount)) : 0;
  const needed = totalOut + reserve + plan.length * PER_TX_FEE;
  const solvent = needed <= sourceSol + 1e-9;
  const label = (w: WaterfallWallet) => `W${w.column_index + 1}·W${w.row_index + 1}`;

  const canSend = plan.length > 0 && solvent && !running && !!source;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⬆ Spread SOL from W1·Wallet 1</DialogTitle>
          <DialogDescription>
            {source
              ? <>Source <span className="font-mono">{source.pubkey.slice(0, 6)}…{source.pubkey.slice(-4)}</span> holds <span className="font-semibold text-foreground">{sourceSol.toFixed(4)} SOL</span>. Click or drag across the grid to pick recipients.</>
              : <>W1·Wallet 1 not found.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Amount to spread (SOL)</Label>
            <Input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reserve in W1·W1 (SOL)</Label>
            <Input value={reserveStr} onChange={(e) => setReserveStr(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fuzz ±{fuzzPct}%</Label>
            <div className="flex items-center gap-2">
              <Slider min={0} max={15} step={1} value={[fuzzPct]} onValueChange={(v) => setFuzzPct(v[0] ?? 0)} />
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSeed(Math.random())} title="Re-roll random split">
                <Dices className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => selectMany(wallets.filter((w) => !isSource(w)))}>Select all</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAmountStr(Math.max(0, sourceSol - reserve).toFixed(4))}>Max</Button>
          <span className="text-muted-foreground">{selected.size} selected</span>
        </div>

        {/* 10x10 picker */}
        <div
          className="overflow-x-auto select-none"
          onPointerUp={() => { dragMode.current = null; }}
          onPointerLeave={() => { dragMode.current = null; }}
        >
          <table className="border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="p-0.5" />
                {cols.map((c) => (
                  <th key={c} className="p-0.5">
                    <button
                      className="w-full px-1 py-0.5 rounded border border-border text-[10px] hover:bg-muted"
                      onClick={() => selectMany(wallets.filter((w) => w.column_index === c))}
                    >
                      W{c + 1}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r}>
                  <th className="p-0.5">
                    <button
                      className="w-full px-1 py-0.5 rounded border border-border text-[10px] hover:bg-muted"
                      onClick={() => selectMany(wallets.filter((w) => w.row_index === r))}
                    >
                      R{r + 1}
                    </button>
                  </th>
                  {cols.map((c) => {
                    const w = grid.get(`${c}:${r}`);
                    if (!w) return <td key={c} className="p-0.5"><div className="h-9 w-16 rounded border border-dashed border-border/40" /></td>;
                    const src = isSource(w);
                    const on = selected.has(w.id);
                    const sol = liveSol(w.pubkey);
                    const amt = plan.find((p) => p.wallet.id === w.id)?.amount;
                    return (
                      <td key={c} className="p-0.5">
                        <div
                          role="button"
                          aria-pressed={on}
                          onPointerDown={(e) => {
                            if (src) return;
                            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                            dragMode.current = on ? "remove" : "add";
                            toggle(w, dragMode.current);
                          }}
                          onPointerEnter={() => { if (dragMode.current && !src) toggle(w, dragMode.current); }}
                          className={`h-9 w-16 px-1 rounded border text-left leading-tight flex flex-col justify-center cursor-pointer ${
                            src
                              ? "border-border/40 bg-muted/40 text-muted-foreground cursor-not-allowed"
                              : on
                                ? "border-emerald-500 bg-emerald-500/20 text-foreground"
                                : "border-border hover:bg-muted"
                          }`}
                          title={src ? "Source wallet" : `${label(w)} — ${sol.toFixed(4)} SOL`}
                        >
                          <span className="font-semibold">{src ? "SRC" : label(w)}</span>
                          <span className="text-[9px] text-muted-foreground">
                            {amt != null ? `+${amt.toFixed(4)}` : sol.toFixed(3)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-border p-2 text-xs space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Recipients: <span className="font-semibold">{plan.length}</span></span>
            <span>Total out: <span className="font-semibold">{totalOut.toFixed(4)} SOL</span></span>
            <span>Min/Max: {min.toFixed(4)} / {max.toFixed(4)}</span>
            <span>Fees: ~{(plan.length * PER_TX_FEE).toFixed(6)} SOL</span>
          </div>
          {!solvent && plan.length > 0 && (
            <div className="text-red-600 dark:text-red-400 font-medium">
              Insufficient: needs {needed.toFixed(4)} SOL (incl. reserve + fees), W1·W1 has {sourceSol.toFixed(4)}.
            </div>
          )}
          {plan.length > 0 && (
            <div className="max-h-40 overflow-auto font-mono text-[10px] text-muted-foreground grid sm:grid-cols-2 gap-x-4">
              {plan.map((p) => (
                <div key={p.wallet.id}>{label(p.wallet)} → {p.amount.toFixed(6)} SOL</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
          <Button
            onClick={() => onSpread(plan, fuzzPct)}
            disabled={!canSend}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : `Spread ${totalOut.toFixed(4)} SOL → ${plan.length} wallet(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}