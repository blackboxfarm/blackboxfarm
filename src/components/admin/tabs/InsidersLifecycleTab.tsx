import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Sparkles, Search, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LifecycleRow {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  first_called_at: string;
  entry_market_cap: number | null;
  entry_mc_text: string | null;
  peak_multiplier: number;
  peak_market_cap: number | null;
  peak_reached_at: string | null;
  milestone_count: number;
  milestone_timeline: Array<{ multiplier: number; current_mc: number | null; current_mc_text: string | null; timestamp: string }>;
  lifespan_minutes: number | null;
  creator_wallet: string | null;
  creator_risk_tier: string | null;
  is_rugged: boolean;
  mesh_promotion_status: string;
  mesh_promotion_reason: string | null;
  total_messages: number;
}

const MIN_X_OPTIONS = [1, 2, 3, 5, 10, 15, 50];

function fmtMC(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtLifespan(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${(min / 60).toFixed(1)}h`;
  return `${(min / 60 / 24).toFixed(1)}d`;
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

export default function InsidersLifecycleTab() {
  const [rows, setRows] = useState<LifecycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [minX, setMinX] = useState<number>(2);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [drillDown, setDrillDown] = useState<LifecycleRow | null>(null);
  const [stats, setStats] = useState<any>(null);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("telegram_insider_token_lifecycle")
      .select("*")
      .order("peak_multiplier", { ascending: false })
      .limit(2000);
    if (error) {
      toast.error("Failed to load lifecycle: " + error.message);
    } else {
      setRows((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.peak_multiplier < minX) return false;
      if (statusFilter === "promoted" && r.mesh_promotion_status !== "promoted") return false;
      if (statusFilter === "rejected" && r.mesh_promotion_status !== "rejected_rug") return false;
      if (statusFilter === "eligible" && (r.peak_multiplier < 3 || r.mesh_promotion_status === "promoted" || r.is_rugged)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.token_mint.toLowerCase().includes(q) && !(r.token_symbol || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, minX, statusFilter, search]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      reached2x: rows.filter((r) => r.peak_multiplier >= 2).length,
      reached3x: rows.filter((r) => r.peak_multiplier >= 3).length,
      reached5x: rows.filter((r) => r.peak_multiplier >= 5).length,
      reached10x: rows.filter((r) => r.peak_multiplier >= 10).length,
      reached15x: rows.filter((r) => r.peak_multiplier >= 15).length,
      promoted: rows.filter((r) => r.mesh_promotion_status === "promoted").length,
      rejected: rows.filter((r) => r.mesh_promotion_status === "rejected_rug").length,
    };
  }, [rows]);

  const handleBuild = async () => {
    setBuilding(true);
    try {
      const { data, error } = await supabase.functions.invoke("insiders-lifecycle-builder", { body: {} });
      if (error) throw error;
      setStats(data?.stats);
      toast.success(`Built ${data?.tokens_upserted} token lifecycles from ${data?.messages_processed} messages`);
      await fetchRows();
    } catch (e: any) {
      toast.error("Build failed: " + (e?.message || String(e)));
    } finally {
      setBuilding(false);
    }
  };

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const { data, error } = await supabase.functions.invoke("insiders-mesh-promoter", { body: {} });
      if (error) throw error;
      toast.success(
        `Promoted ${data?.promoted} • Rejected (rug) ${data?.skipped_rug} • Already promoted ${data?.skipped_already_promoted} • No creator ${data?.skipped_no_creator}`
      );
      await fetchRows();
    } catch (e: any) {
      toast.error("Promotion failed: " + (e?.message || String(e)));
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total tokens</div><div className="text-2xl font-bold">{summary.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥2x</div><div className="text-2xl font-bold text-green-500">{summary.reached2x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥3x</div><div className="text-2xl font-bold text-green-500">{summary.reached3x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥5x</div><div className="text-2xl font-bold text-yellow-500">{summary.reached5x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥10x</div><div className="text-2xl font-bold text-orange-500">{summary.reached10x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥15x</div><div className="text-2xl font-bold text-red-500">{summary.reached15x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">In Mesh</div><div className="text-2xl font-bold text-cyan-400">{summary.promoted}</div><div className="text-xs text-red-400 mt-1">{summary.rejected} rug</div></CardContent></Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Insiders Channel — Token Lifecycle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleBuild} disabled={building} size="sm">
              {building ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Rebuild from messages
            </Button>
            <Button onClick={handlePromote} disabled={promoting} size="sm" variant="secondary">
              {promoting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Promote ≥3x to Mesh
            </Button>
            <Button onClick={fetchRows} disabled={loading} size="sm" variant="ghost">
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>

            <div className="flex items-center gap-2 ml-auto">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Symbol or mint..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 h-8"
              />
              <Select value={String(minX)} onValueChange={(v) => setMinX(Number(v))}>
                <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MIN_X_OPTIONS.map((x) => (
                    <SelectItem key={x} value={String(x)}>≥ {x}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="promoted">Mesh Promoted</SelectItem>
                  <SelectItem value="rejected">Rejected (rug)</SelectItem>
                  <SelectItem value="eligible">Eligible (unpromoted)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>First called</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Mint</TableHead>
                    <TableHead className="text-right">Entry MC</TableHead>
                    <TableHead className="text-right">Peak X</TableHead>
                    <TableHead className="text-right">Peak MC</TableHead>
                    <TableHead>Lifespan</TableHead>
                    <TableHead>Mesh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setDrillDown(r)}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(r.first_called_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{r.token_symbol || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{shortMint(r.token_mint)}</TableCell>
                      <TableCell className="text-right">{r.entry_mc_text || fmtMC(r.entry_market_cap)}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={r.peak_multiplier >= 10 ? "destructive" : r.peak_multiplier >= 5 ? "default" : r.peak_multiplier >= 3 ? "secondary" : "outline"}
                        >
                          {r.peak_multiplier}x
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmtMC(r.peak_market_cap)}</TableCell>
                      <TableCell>{fmtLifespan(r.lifespan_minutes)}</TableCell>
                      <TableCell>
                        {r.mesh_promotion_status === "promoted" && (
                          <Badge className="bg-cyan-500/20 text-cyan-400"><ShieldCheck className="h-3 w-3 mr-1" />Promoted</Badge>
                        )}
                        {r.mesh_promotion_status === "rejected_rug" && (
                          <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Rug</Badge>
                        )}
                        {r.mesh_promotion_status === "not_eligible" && r.peak_multiplier >= 3 && (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No tokens match these filters</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} of {rows.length} tokens. Click a row for the full milestone timeline.
          </div>
        </CardContent>
      </Card>

      {/* Drill-down dialog */}
      <Dialog open={!!drillDown} onOpenChange={(o) => !o && setDrillDown(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {drillDown?.token_symbol} — {drillDown && shortMint(drillDown.token_mint)}
            </DialogTitle>
          </DialogHeader>
          {drillDown && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">First called:</span> {new Date(drillDown.first_called_at).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Entry MC:</span> {drillDown.entry_mc_text || fmtMC(drillDown.entry_market_cap)}</div>
                <div><span className="text-muted-foreground">Peak:</span> {drillDown.peak_multiplier}x @ {fmtMC(drillDown.peak_market_cap)}</div>
                <div><span className="text-muted-foreground">Lifespan:</span> {fmtLifespan(drillDown.lifespan_minutes)}</div>
                <div className="col-span-2 break-all"><span className="text-muted-foreground">Mint:</span> <span className="font-mono text-xs">{drillDown.token_mint}</span></div>
                {drillDown.creator_wallet && (
                  <div className="col-span-2 break-all"><span className="text-muted-foreground">Creator:</span> <span className="font-mono text-xs">{drillDown.creator_wallet}</span></div>
                )}
                {drillDown.mesh_promotion_reason && (
                  <div className="col-span-2"><span className="text-muted-foreground">Mesh:</span> {drillDown.mesh_promotion_reason}</div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Milestone timeline ({drillDown.milestone_count})</h4>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {drillDown.milestone_timeline.length === 0 && (
                    <div className="text-sm text-muted-foreground">No milestones recorded.</div>
                  )}
                  {drillDown.milestone_timeline.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm border-b border-border/50 py-1">
                      <span className="text-xs text-muted-foreground">{new Date(m.timestamp).toLocaleString()}</span>
                      <span className="font-bold">{m.multiplier}x</span>
                      <span>{m.current_mc_text || fmtMC(m.current_mc)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}