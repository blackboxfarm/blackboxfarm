import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Receipt, RefreshCw, ExternalLink, ArrowUpRight, ArrowDownRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface FlipRow {
  id: string;
  token_symbol: string | null;
  token_name: string | null;
  token_mint: string;
  source_channel_id: string | null;
  status: string | null;
  buy_amount_sol: number | null;
  buy_price_usd: number | null;
  sell_price_usd: number | null;
  quantity_tokens: number | null;
  profit_usd: number | null;
  buy_executed_at: string | null;
  sell_executed_at: string | null;
  buy_signature: string | null;
  sell_signature: string | null;
  target_multiplier: number | null;
}

interface ChannelMap {
  [id: string]: string;
}

function fmtUsd(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return `$${v.toFixed(0)}`;
  if (abs >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function pnl(row: FlipRow): { usd: number | null; pct: number | null } {
  // Prefer stored profit_usd if present
  if (row.profit_usd != null) {
    const buyCost = (row.buy_price_usd || 0) * (row.quantity_tokens || 0);
    const pct = buyCost > 0 ? (row.profit_usd / buyCost) * 100 : null;
    return { usd: row.profit_usd, pct };
  }
  if (row.buy_price_usd && row.sell_price_usd && row.quantity_tokens) {
    const usd = (row.sell_price_usd - row.buy_price_usd) * row.quantity_tokens;
    const pct = ((row.sell_price_usd - row.buy_price_usd) / row.buy_price_usd) * 100;
    return { usd, pct };
  }
  return { usd: null, pct: null };
}

export function ChannelTransactionLog() {
  const [rows, setRows] = useState<FlipRow[]>([]);
  const [channels, setChannels] = useState<ChannelMap>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: positions, error: pErr }, { data: chans }] = await Promise.all([
      supabase
        .from("flip_positions")
        .select(
          "id, token_symbol, token_name, token_mint, source_channel_id, status, buy_amount_sol, buy_price_usd, sell_price_usd, quantity_tokens, profit_usd, buy_executed_at, sell_executed_at, buy_signature, sell_signature, target_multiplier"
        )
        .eq("source", "telegram")
        .not("source_channel_id", "is", null)
        .order("buy_executed_at", { ascending: false, nullsFirst: false })
        .limit(25),
      supabase.from("telegram_channel_config").select("id, channel_name, channel_username"),
    ]);

    if (pErr) {
      console.error("ChannelTransactionLog load error:", pErr);
    }
    setRows((positions || []) as FlipRow[]);
    const map: ChannelMap = {};
    (chans || []).forEach((c: { id: string; channel_name: string | null; channel_username: string | null }) => {
      map[c.id] = c.channel_name || c.channel_username || c.id.slice(0, 8);
    });
    setChannels(map);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transaction record? This cannot be undone.")) return;
    const { error } = await supabase.from("flip_positions").delete().eq("id", id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Transaction deleted");
  };

  const handleClearAll = async () => {
    if (rows.length === 0) return;
    if (!confirm(`Delete ALL ${rows.length} channel transactions shown? This cannot be undone.`)) return;
    const ids = rows.map((r) => r.id);
    const { error } = await supabase.from("flip_positions").delete().in("id", ids);
    if (error) {
      toast.error(`Clear failed: ${error.message}`);
      return;
    }
    setRows([]);
    toast.success(`Cleared ${ids.length} transactions`);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("channel-tx-log")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flip_positions" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card className="border-orange-500/30 bg-gradient-to-br from-background to-orange-500/5">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Receipt className="h-5 w-5 text-orange-500" />
          Channel Auto-Buy Transactions
          <Badge variant="outline" className="ml-2 text-[10px]">Last 25</Badge>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={loading || rows.length === 0}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Delete all shown transactions"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No channel-triggered flips yet. Once a rule fires, buys/sells will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left py-2 px-2">Token</th>
                  <th className="text-left py-2 px-2">Channel</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2 px-2">Buy</th>
                  <th className="text-right py-2 px-2">Sell</th>
                  <th className="text-right py-2 px-2">PnL</th>
                  <th className="text-left py-2 px-2">When</th>
                  <th className="text-left py-2 px-2">Tx</th>
                  <th className="text-right py-2 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = pnl(r);
                  const isWin = (p.usd ?? 0) > 0;
                  const isLoss = (p.usd ?? 0) < 0;
                  const sold = !!r.sell_executed_at;
                  const channelName = r.source_channel_id ? channels[r.source_channel_id] || r.source_channel_id.slice(0, 8) : "—";
                  return (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="py-2 px-2">
                        <div className="font-semibold">{r.token_symbol || "—"}</div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                          {r.token_mint.slice(0, 6)}…{r.token_mint.slice(-4)}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-xs truncate max-w-[140px]">{channelName}</td>
                      <td className="py-2 px-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            sold
                              ? isWin
                                ? "border-emerald-500/40 text-emerald-500"
                                : "border-red-500/40 text-red-500"
                              : "border-blue-500/40 text-blue-500"
                          }`}
                        >
                          {sold ? "CLOSED" : (r.status || "OPEN").toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs">
                        <div>{r.buy_amount_sol ? `${r.buy_amount_sol.toFixed(3)} SOL` : "—"}</div>
                        <div className="text-[10px] text-muted-foreground">@ {fmtUsd(r.buy_price_usd)}</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs">
                        {sold ? (
                          <>
                            <div>{fmtUsd(r.sell_price_usd)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {r.target_multiplier ? `${r.target_multiplier}× TP` : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={`py-2 px-2 text-right font-mono text-xs font-semibold ${
                        isWin ? "text-emerald-500" : isLoss ? "text-red-500" : "text-muted-foreground"
                      }`}>
                        {p.usd != null ? (
                          <div className="flex items-center justify-end gap-1">
                            {isWin && <ArrowUpRight className="h-3 w-3" />}
                            {isLoss && <ArrowDownRight className="h-3 w-3" />}
                            <div>
                              <div>{fmtUsd(p.usd)}</div>
                              {p.pct != null && (
                                <div className="text-[10px]">{p.pct >= 0 ? "+" : ""}{p.pct.toFixed(1)}%</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-[11px] text-muted-foreground">
                        <div>B: {fmtTime(r.buy_executed_at)}</div>
                        {sold && <div>S: {fmtTime(r.sell_executed_at)}</div>}
                      </td>
                      <td className="py-2 px-2 text-[11px]">
                        <div className="flex flex-col gap-0.5">
                          {r.buy_signature && (
                            <a
                              href={`https://solscan.io/tx/${r.buy_signature}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-500 hover:underline inline-flex items-center gap-0.5"
                            >
                              buy <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {r.sell_signature && (
                            <a
                              href={`https://solscan.io/tx/${r.sell_signature}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-orange-500 hover:underline inline-flex items-center gap-0.5"
                            >
                              sell <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(r.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete this record"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
