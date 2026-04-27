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
import {
  Loader2,
  RefreshCw,
  Sparkles,
  Search,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Download,
  Info,
  Skull,
  ExternalLink,
  Check,
  X,
  RotateCw,
  ShieldAlert,
  Network,
  Building2,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import HypotheticalPnlPanel from "@/components/admin/HypotheticalPnlPanel";

interface MeshDecisionTrace {
  creator_wallet?: string;
  dev_history?: {
    risk_tier: string | null;
    trust_level: string | null;
    tokens_rugged: number;
    auto_blacklisted: boolean;
    has_history_rug: boolean;
  };
  this_token?: {
    death_cause: string | null;
    autopsy_notes: string | null;
    market_cap: number | null;
    is_rug: boolean;
  };
  peak_multiplier?: number;
  decision?: string;
  reason?: string;
  evaluated_at?: string;
}

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
  mesh_decision_trace: MeshDecisionTrace | null;
  dev_history_warning: boolean | null;
  total_messages: number;
  genealogy_depth?: number | null;
  genealogy_kyc_root?: string | null;
  genealogy_chain?: Array<{ wallet: string; depth: number; amountSol?: number | null; cexName?: string | null; role: 'creator' | 'funder' | 'kyc_root' }> | null;
}

const MIN_X_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "1", label: "≥ 1x (show all)" },
  { value: "2", label: "≥ 2x" },
  { value: "3", label: "≥ 3x" },
  { value: "5", label: "≥ 5x" },
  { value: "10", label: "≥ 10x" },
  { value: "15", label: "≥ 15x" },
  { value: "50", label: "≥ 50x" },
];

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

function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(rows: LifecycleRow[]) {
  const headers = [
    "First called",
    "Symbol",
    "Mint",
    "Entry MC",
    "Peak X",
    "Peak MC",
    "Lifespan minutes",
    "Milestones",
    "Creator wallet",
    "Mesh status",
    "Dev history warning",
    "Mesh reason",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        new Date(r.first_called_at).toISOString(),
        r.token_symbol || "",
        r.token_mint,
        r.entry_market_cap ?? "",
        r.peak_multiplier,
        r.peak_market_cap ?? "",
        r.lifespan_minutes ?? "",
        r.milestone_count,
        r.creator_wallet || "",
        r.mesh_promotion_status,
        r.dev_history_warning ? "yes" : "no",
        r.mesh_promotion_reason || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `insiders-lifecycle-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function InsidersLifecycleTab() {
  const [rows, setRows] = useState<LifecycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [tracingKyc, setTracingKyc] = useState(false);
  const [traceProgress, setTraceProgress] = useState<{ done: number; total: number } | null>(null);
  const [crossLinks, setCrossLinks] = useState<any | null>(null);
  const [crossLinksLoading, setCrossLinksLoading] = useState(false);
  const [crossTab, setCrossTab] = useState<'creator' | 'funder' | 'kyc'>('creator');
  const [minX, setMinX] = useState<string>("2");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [drillDown, setDrillDown] = useState<LifecycleRow | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [rowActioning, setRowActioning] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [lastBuildAt, setLastBuildAt] = useState<string | null>(null);
  // Sorting + pagination (client-side; full table is already in memory)
  type SortKey = 'ordinal' | 'first_called_at' | 'token_symbol' | 'entry_market_cap' | 'peak_multiplier' | 'peak_market_cap' | 'lifespan_minutes';
  const [sortKey, setSortKey] = useState<SortKey>('peak_multiplier');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  // Open drill-down dialog: shows lean row immediately, then hydrates the
  // heavy JSON columns (mesh_decision_trace, milestone_timeline,
  // genealogy_chain) on demand so they don't bloat the initial table fetch.
  const openDrillDown = async (row: LifecycleRow) => {
    setDrillDown({ ...row, milestone_timeline: row.milestone_timeline ?? [] } as LifecycleRow);
    // If heavy fields are already present (e.g. just refreshed), skip the round-trip.
    if (
      Array.isArray((row as any).milestone_timeline) &&
      (row as any).milestone_timeline.length >= 0 &&
      'mesh_decision_trace' in row &&
      'genealogy_chain' in row
    ) {
      // Heavy fields already loaded — nothing to do
      // (this branch hits when the row was hydrated by handleRowAction's refetch)
      if ((row as any)._hydrated) return;
    }
    setDrillDownLoading(true);
    try {
      const { data } = await supabase
        .from('telegram_insider_token_lifecycle')
        .select('mesh_decision_trace, milestone_timeline, genealogy_chain')
        .eq('id', row.id)
        .maybeSingle();
      if (data) {
        setDrillDown((prev) => prev && prev.id === row.id ? ({
          ...prev,
          mesh_decision_trace: (data as any).mesh_decision_trace ?? null,
          milestone_timeline: (data as any).milestone_timeline ?? [],
          genealogy_chain: (data as any).genealogy_chain ?? null,
          _hydrated: true,
        } as any) : prev);
      }
    } catch (e: any) {
      toast.error('Failed to load token details: ' + (e?.message || String(e)));
    } finally {
      setDrillDownLoading(false);
    }
  };

  const handleRowAction = async (
    tokenMint: string,
    action: 'promote' | 'reconsider' | 'reject' | 'override_promote',
    reason?: string,
  ) => {
    setRowActioning(tokenMint + ':' + action);
    try {
      const { data, error } = await supabase.functions.invoke('insiders-mesh-row-action', {
        body: { token_mint: tokenMint, action, reason },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'action failed');
      toast.success(`${action.replace('_', ' ')} → ${data.new_status}`);
      await fetchRows();
      // If drill-down is open for this token, refresh that view too
      if (drillDown?.token_mint === tokenMint) {
        const { data: r } = await supabase
          .from('telegram_insider_token_lifecycle')
          .select('*')
          .eq('token_mint', tokenMint)
          .maybeSingle();
        if (r) setDrillDown(r as any);
      }
      setOverrideReason("");
    } catch (e: any) {
      toast.error('Action failed: ' + (e?.message || String(e)));
    } finally {
      setRowActioning(null);
    }
  };

  const fetchRows = async () => {
    setLoading(true);
    // Lean column list — exclude heavy JSON columns (mesh_decision_trace,
    // milestone_timeline, genealogy_chain) which are only needed in the
    // drill-down dialog. With 1300+ rows the heavy columns add several MB
    // to the initial payload and cause noticeable lag on tab open.
    const LEAN_COLUMNS = [
      'id', 'token_mint', 'token_symbol', 'first_called_at',
      'entry_market_cap', 'entry_mc_text',
      'peak_multiplier', 'peak_market_cap', 'peak_reached_at',
      'milestone_count', 'lifespan_minutes',
      'creator_wallet', 'creator_risk_tier', 'is_rugged',
      'mesh_promotion_status', 'mesh_promotion_reason',
      'dev_history_warning', 'total_messages',
      'genealogy_depth', 'genealogy_kyc_root',
    ].join(',');
    // Page through to bypass PostgREST's default 1000-row response cap.
    const PAGE = 1000;
    const acc: any[] = [];
    let latest: string | null = null;
    try {
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase
          .from("telegram_insider_token_lifecycle")
          .select(LEAN_COLUMNS)
          .order("peak_multiplier", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data as any[]) || [];
        acc.push(...batch);
        for (const r of batch) {
          if (!latest || (r.first_called_at && r.first_called_at > latest)) latest = r.first_called_at;
        }
        if (batch.length < PAGE) break;
      }
      setRows(acc as any);
      setLastBuildAt(latest);
    } catch (e: any) {
      toast.error("Failed to load lifecycle: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const fetchCrossLinks = async () => {
    setCrossLinksLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('insiders-cross-links', { body: {} });
      if (error) throw error;
      setCrossLinks(data);
    } catch (e: any) {
      toast.error('Failed to load cross-links: ' + (e?.message || String(e)));
    } finally {
      setCrossLinksLoading(false);
    }
  };

  useEffect(() => {
    fetchCrossLinks();
  }, []);

  const handleTraceKyc = async () => {
    setTracingKyc(true);
    setTraceProgress({ done: 0, total: 0 });
    try {
      let totalProcessed = 0;
      // Loop until remaining === 0 (or safety cap of 200 batches)
      for (let i = 0; i < 200; i++) {
        const { data, error } = await supabase.functions.invoke('insiders-genealogy-backfill', {
          body: { batchSize: 25 },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'backfill failed');
        totalProcessed += data.processed || 0;
        setTraceProgress({ done: totalProcessed, total: totalProcessed + (data.remaining || 0) });
        if (!data.remaining || data.remaining === 0 || data.processed === 0) break;
      }
      toast.success(`Traced ${totalProcessed} creator wallets back to KYC roots`);
      await Promise.all([fetchRows(), fetchCrossLinks()]);
    } catch (e: any) {
      toast.error('Trace failed: ' + (e?.message || String(e)));
    } finally {
      setTracingKyc(false);
      setTraceProgress(null);
    }
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      // statusFilter — handle saddev/dud/dead which override minX
      if (statusFilter === "saddev") {
        if (r.peak_multiplier >= 2) return false;
      } else if (statusFilter === "dud") {
        if (r.milestone_count !== 1) return false;
      } else if (statusFilter === "dead") {
        if (r.milestone_count !== 0) return false;
      } else if (statusFilter === "promoted") {
        if (r.mesh_promotion_status !== "promoted") return false;
      } else if (statusFilter === "rejected") {
        if (r.mesh_promotion_status !== "rejected_rug") return false;
      } else if (statusFilter === "eligible") {
        if (r.peak_multiplier < 3 || r.mesh_promotion_status === "promoted" || r.is_rugged) return false;
      } else if (statusFilter === "dev_history") {
        if (!r.dev_history_warning) return false;
      } else {
        // "all" — apply minX
        if (r.peak_multiplier < Number(minX)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!r.token_mint.toLowerCase().includes(q) && !(r.token_symbol || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, minX, statusFilter, search]);

  // Sort the filtered list by the active column. Ordinal sort uses the
  // current filtered insertion order (which mirrors the default peak_multiplier desc fetch).
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === 'ordinal') {
      // ordinal = position in `filtered`. asc keeps fetch order, desc reverses.
      return sortDir === 'asc' ? arr : arr.reverse();
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const va: any = (a as any)[sortKey];
      const vb: any = (b as any)[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls last
      if (vb == null) return -1;
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * dir;
      }
      if (sortKey === 'first_called_at') {
        return (new Date(va).getTime() - new Date(vb).getTime()) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Reset page when filters/sort change so the user always sees page 1 of the new view.
  useEffect(() => { setPage(1); }, [minX, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // sensible defaults: numeric/date columns → desc; text → asc
      setSortDir(key === 'token_symbol' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 inline ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 inline ml-1 text-primary" />;
  };

  const summary = useMemo(() => {
    return {
      total: rows.length,
      neverHit2x: rows.filter((r) => r.peak_multiplier < 2).length,
      reached2x: rows.filter((r) => r.peak_multiplier >= 2).length,
      reached3x: rows.filter((r) => r.peak_multiplier >= 3).length,
      reached5x: rows.filter((r) => r.peak_multiplier >= 5).length,
      reached10x: rows.filter((r) => r.peak_multiplier >= 10).length,
      reached15x: rows.filter((r) => r.peak_multiplier >= 15).length,
      promoted: rows.filter((r) => r.mesh_promotion_status === "promoted").length,
      rejected: rows.filter((r) => r.mesh_promotion_status === "rejected_rug").length,
      devHistory: rows.filter((r) => r.dev_history_warning).length,
    };
  }, [rows]);

  const handleBuild = async () => {
    setBuilding(true);
    try {
      const { data, error } = await supabase.functions.invoke("insiders-lifecycle-builder", { body: {} });
      if (error) throw error;
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
        `Promoted ${data?.promoted} (${data?.promoted_with_dev_history || 0} ⚠ dev history) • Rejected (this-token rug) ${data?.skipped_rug} • Already in mesh ${data?.skipped_already_promoted}`
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
      {/* Hypothetical $X-per-call PnL simulator */}
      <HypotheticalPnlPanel rows={rows} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total tokens</div><div className="text-2xl font-bold">{summary.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground flex items-center gap-1"><Skull className="h-3 w-3" />Never hit 2x</div><div className="text-2xl font-bold text-muted-foreground">{summary.neverHit2x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥2x</div><div className="text-2xl font-bold text-green-500">{summary.reached2x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥3x</div><div className="text-2xl font-bold text-green-500">{summary.reached3x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥5x</div><div className="text-2xl font-bold text-yellow-500">{summary.reached5x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥10x</div><div className="text-2xl font-bold text-orange-500">{summary.reached10x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">≥15x</div><div className="text-2xl font-bold text-red-500">{summary.reached15x}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">In Mesh</div><div className="text-2xl font-bold text-cyan-400">{summary.promoted}</div><div className="text-xs text-amber-400 mt-1">{summary.devHistory} ⚠ dev hist</div></CardContent></Card>
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
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-2">
              <Network className="h-3.5 w-3.5" />
              Auto-rebuild + KYC tracing every 3h.
              {lastBuildAt && (
                <span className="ml-1 inline-flex items-center gap-1 text-foreground/80">
                  <Clock className="h-3.5 w-3.5" />
                  Latest call: {new Date(lastBuildAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button onClick={handlePromote} disabled={promoting} size="sm" variant="secondary">
                {promoting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Promote ≥3x to Mesh
              </Button>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                    <Info className="h-4 w-4" />
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent className="w-96 text-xs">
                  <div className="space-y-2">
                    <div className="font-semibold">What does "Promote ≥3x to Mesh" do?</div>
                    <p>
                      Scans every Insiders token with peak ≥3x. For each, looks up the creator wallet,
                      checks for rug signals on <strong>this specific token</strong>, and if clean writes
                      a <code>good_actor_creator</code> record into <code>reputation_mesh</code> — the global trust
                      graph used by the bubble map, /dev report, and trading guards.
                    </p>
                    <p>
                      Wallets with rug history on <em>other</em> tokens get an amber ⚠ "Dev History" tag but stay
                      eligible — only this-token rugs are hard-rejected.
                    </p>
                  </div>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Button
              onClick={() => downloadCSV(sorted)}
              size="sm"
              variant="outline"
              disabled={sorted.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />Export CSV
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
              <Select value={minX} onValueChange={setMinX} disabled={statusFilter !== "all"}>
                <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MIN_X_OPTIONS.map((x) => (
                    <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (use min-X)</SelectItem>
                  <SelectItem value="saddev">&lt; 2x (Saddev)</SelectItem>
                  <SelectItem value="dud">Dud (1 milestone)</SelectItem>
                  <SelectItem value="dead">Dead on arrival</SelectItem>
                  <SelectItem value="promoted">Mesh Promoted</SelectItem>
                  <SelectItem value="rejected">Rejected (this-token rug)</SelectItem>
                  <SelectItem value="dev_history">⚠ Dev History</SelectItem>
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
                    <TableHead className="cursor-pointer select-none w-12" onClick={() => toggleSort('ordinal')}>
                      # <SortIcon k="ordinal" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('first_called_at')}>
                      First called <SortIcon k="first_called_at" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('token_symbol')}>
                      Symbol <SortIcon k="token_symbol" />
                    </TableHead>
                    <TableHead>Mint</TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('entry_market_cap')}>
                      Entry MC <SortIcon k="entry_market_cap" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('peak_multiplier')}>
                      Peak X <SortIcon k="peak_multiplier" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('peak_market_cap')}>
                      Peak MC <SortIcon k="peak_market_cap" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('lifespan_minutes')}>
                      Lifespan <SortIcon k="lifespan_minutes" />
                    </TableHead>
                    <TableHead>Mesh</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r, idx) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openDrillDown(r)}
                    >
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {pageStart + idx + 1}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(r.first_called_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{r.token_symbol || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{shortMint(r.token_mint)}</TableCell>
                      <TableCell className="text-right">{r.entry_mc_text || fmtMC(r.entry_market_cap)}</TableCell>
                      <TableCell className="text-right">
                        {r.peak_multiplier < 2 ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Skull className="h-3 w-3 mr-1" />Saddev
                          </Badge>
                        ) : (
                          <Badge
                            variant={r.peak_multiplier >= 10 ? "destructive" : r.peak_multiplier >= 5 ? "default" : r.peak_multiplier >= 3 ? "secondary" : "outline"}
                          >
                            {r.peak_multiplier}x
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{fmtMC(r.peak_market_cap)}</TableCell>
                      <TableCell title={r.lifespan_minutes == null ? "Original Telegram timestamps not preserved on this batch." : undefined}>
                        {fmtLifespan(r.lifespan_minutes)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {r.mesh_promotion_status === "promoted" && (
                            <Badge className="bg-cyan-500/20 text-cyan-400"><ShieldCheck className="h-3 w-3 mr-1" />Promoted</Badge>
                          )}
                          {r.mesh_promotion_status === "rejected_rug" && (
                            <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Rug</Badge>
                          )}
                          {r.mesh_promotion_status === "not_eligible" && r.peak_multiplier >= 3 && (
                            <Badge variant="outline">Pending</Badge>
                          )}
                          {r.dev_history_warning && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">⚠ Dev Hist</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <TooltipProvider delayDuration={200}>
                          <div className="flex justify-end gap-1">
                            {(r.mesh_promotion_status === 'not_eligible' || r.mesh_promotion_status === 'pending') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-500 hover:bg-green-500/10"
                                    disabled={!!rowActioning}
                                    onClick={() => handleRowAction(r.token_mint, 'promote')}
                                  >
                                    {rowActioning === r.token_mint + ':promote' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Promote to Mesh</TooltipContent>
                              </Tooltip>
                            )}
                            {(r.mesh_promotion_status === 'rejected_rug' || r.mesh_promotion_status === 'promoted' || r.mesh_promotion_status === 'manually_rejected') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm" variant="ghost" className="h-7 w-7 p-0"
                                    disabled={!!rowActioning}
                                    onClick={() => handleRowAction(r.token_mint, 'reconsider')}
                                  >
                                    {rowActioning === r.token_mint + ':reconsider' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reconsider</TooltipContent>
                              </Tooltip>
                            )}
                            {r.mesh_promotion_status === 'promoted' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                    disabled={!!rowActioning}
                                    onClick={() => handleRowAction(r.token_mint, 'reject')}
                                  >
                                    {rowActioning === r.token_mint + ':reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove from Mesh</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No tokens match these filters</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} of {rows.length} tokens. Click a row for the full milestone timeline & mesh decision.
          </div>
        </CardContent>
      </Card>

      {/* Wallet Cross-Links — RedFlag/GreenFlag detector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" /> Wallet Cross-Links
            {crossLinks?.stats && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                {crossLinks.stats.rowsWithCreator} creators • {crossLinks.stats.rowsWithKyc} KYC roots
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Button size="sm" variant={crossTab === 'creator' ? 'default' : 'outline'} onClick={() => setCrossTab('creator')}>
              Shared Creator ({crossLinks?.sharedCreator?.length || 0})
            </Button>
            <Button size="sm" variant={crossTab === 'funder' ? 'default' : 'outline'} onClick={() => setCrossTab('funder')}>
              Shared Funder ({crossLinks?.sharedFunder?.length || 0})
            </Button>
            <Button size="sm" variant={crossTab === 'kyc' ? 'default' : 'outline'} onClick={() => setCrossTab('kyc')}>
              <Building2 className="h-3.5 w-3.5 mr-1" />Shared KYC ({crossLinks?.sharedKycRoot?.length || 0})
            </Button>
            <Button size="sm" variant="ghost" onClick={fetchCrossLinks} disabled={crossLinksLoading} className="ml-auto">
              {crossLinksLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          {crossLinksLoading && !crossLinks && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          )}

          {crossLinks && (() => {
            const list = crossTab === 'creator' ? crossLinks.sharedCreator
              : crossTab === 'funder' ? crossLinks.sharedFunder
              : crossLinks.sharedKycRoot;
            if (!list || list.length === 0) {
              return <div className="text-sm text-muted-foreground py-4 text-center">No clusters found in this category yet.</div>;
            }
            return (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {list.map((cluster: any, idx: number) => {
                  const verdictColor = cluster.verdict === 'green' ? 'bg-green-500/20 text-green-400 border-green-500/40'
                    : cluster.verdict === 'red' ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : cluster.verdict === 'mixed' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-muted text-muted-foreground';
                  const verdictLabel = cluster.verdict === 'green' ? '🟢 Repeat Winner'
                    : cluster.verdict === 'red' ? '🔴 Serial Saddev/Rug'
                    : cluster.verdict === 'mixed' ? '⚠ Mixed-Outcome Family'
                    : 'Neutral';
                  return (
                    <div key={idx} className="border rounded-md p-3 bg-muted/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          <a href={`https://solscan.io/account/${cluster.key}`} target="_blank" rel="noreferrer" className="hover:text-primary">
                            {cluster.key.slice(0, 6)}…{cluster.key.slice(-4)}
                          </a>
                        </Badge>
                        {cluster.cexName && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/40">{cluster.cexName}</Badge>
                        )}
                        <Badge className={verdictColor}>{verdictLabel}</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">{cluster.count} tokens</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {cluster.tokens.map((t: any) => (
                          <button
                            key={t.token_mint}
                            onClick={() => {
                              const full = rows.find(r => r.token_mint === t.token_mint);
                              if (full) openDrillDown(full);
                            }}
                            className={`px-2 py-1 rounded text-xs border transition-colors hover:opacity-80 ${
                              t.is_rugged ? 'bg-red-500/10 border-red-500/30 text-red-400'
                              : t.peak_multiplier >= 5 ? 'bg-green-500/10 border-green-500/30 text-green-400'
                              : t.peak_multiplier >= 2 ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                              : 'bg-muted/50 border-border text-muted-foreground'
                            }`}
                            title={`${t.token_symbol || t.token_mint} — peak ${t.peak_multiplier}x`}
                          >
                            {t.token_symbol || t.token_mint.slice(0, 4)} · {t.peak_multiplier}x
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Drill-down dialog */}
      <Dialog open={!!drillDown} onOpenChange={(o) => !o && setDrillDown(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drillDown?.token_symbol} — {drillDown && shortMint(drillDown.token_mint)}
            </DialogTitle>
          </DialogHeader>
          {drillDownLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading mesh decision, milestones & lineage…
            </div>
          )}
          {drillDown && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">First called:</span> {new Date(drillDown.first_called_at).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Entry MC:</span> {drillDown.entry_mc_text || fmtMC(drillDown.entry_market_cap)}</div>
                <div><span className="text-muted-foreground">Peak:</span> {drillDown.peak_multiplier}x @ {fmtMC(drillDown.peak_market_cap)}</div>
                <div>
                  <span className="text-muted-foreground">Lifespan:</span> {fmtLifespan(drillDown.lifespan_minutes)}
                  {drillDown.lifespan_minutes == null && (
                    <span className="text-xs text-muted-foreground ml-1">(timestamps not preserved on this batch)</span>
                  )}
                </div>
                <div className="col-span-2 break-all">
                  <span className="text-muted-foreground">Mint:</span>{" "}
                  <a
                    href={`https://solscan.io/token/${drillDown.token_mint}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs underline hover:text-primary"
                  >
                    {drillDown.token_mint} <ExternalLink className="inline h-3 w-3" />
                  </a>
                </div>
                {drillDown.creator_wallet && (
                  <div className="col-span-2 break-all">
                    <span className="text-muted-foreground">Creator:</span>{" "}
                    <a
                      href={`https://solscan.io/account/${drillDown.creator_wallet}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs underline hover:text-primary"
                    >
                      {drillDown.creator_wallet} <ExternalLink className="inline h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Funding Lineage — Mint → funder → … → KYC Root */}
              {drillDown.genealogy_chain && drillDown.genealogy_chain.length > 0 && (
                <div className="border rounded-md p-3 bg-muted/30">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Network className="h-4 w-4" /> Funding Lineage
                    {drillDown.genealogy_kyc_root ? (
                      <Badge className="bg-green-500/20 text-green-400 ml-2">KYC resolved</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-2">Trail incomplete</Badge>
                    )}
                  </h4>
                  <div className="space-y-1">
                    {drillDown.genealogy_chain.map((hop, idx) => {
                      const isKyc = hop.role === 'kyc_root';
                      const isCreator = hop.role === 'creator';
                      return (
                        <div key={idx}>
                          <div className={`flex items-center gap-2 p-2 rounded text-xs ${isKyc ? 'bg-green-500/10 border border-green-500/30' : isCreator ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-background/50'}`}>
                            <span className="w-16 shrink-0 text-muted-foreground">
                              {isCreator ? 'Creator' : isKyc ? '🏦 KYC' : `Hop ${hop.depth}`}
                            </span>
                            <a
                              href={`https://solscan.io/account/${hop.wallet}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono underline hover:text-primary flex-1 break-all"
                            >
                              {hop.wallet}
                            </a>
                            {hop.cexName && (
                              <Badge variant="outline" className="text-green-400 border-green-500/40">
                                {hop.cexName}
                              </Badge>
                            )}
                            {hop.amountSol != null && hop.amountSol > 0 && (
                              <span className="text-muted-foreground whitespace-nowrap">{hop.amountSol.toFixed(2)} SOL</span>
                            )}
                          </div>
                          {idx < (drillDown.genealogy_chain?.length || 0) - 1 && (
                            <div className="flex justify-center py-0.5">
                              <ArrowDown className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!drillDown.genealogy_kyc_root && (
                      <div className="text-xs text-muted-foreground mt-2 italic">
                        🌑 Trail lost before reaching a known exchange. Auto-tracer will retry on the next 3h cycle (depth limit: 8 hops).
                      </div>
                    )}
                  </div>
                </div>
              )}
              {drillDown.creator_wallet && (!drillDown.genealogy_chain || drillDown.genealogy_chain.length === 0) && (
                <div className="border rounded-md p-3 bg-muted/30 text-xs text-muted-foreground">
                  <Network className="h-4 w-4 inline mr-1" />
                  Wallet lineage not traced yet. The auto-tracer runs every 3h via the orchestrator and will resolve this on the next cycle.
                </div>
              )}

              {/* Mesh Decision section */}
              <div className="border rounded-md p-3 bg-muted/30">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Mesh Decision
                </h4>
                {drillDown.mesh_decision_trace ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={
                        drillDown.mesh_decision_trace.decision === "promoted"
                          ? "default"
                          : drillDown.mesh_decision_trace.decision === "rejected_rug"
                          ? "destructive"
                          : "outline"
                      }>
                        Decision: {drillDown.mesh_decision_trace.decision || "—"}
                      </Badge>
                      {drillDown.dev_history_warning && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">⚠ Dev Hist</Badge>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Creator history (other tokens):</div>
                      <ul className="ml-4 list-disc text-muted-foreground">
                        <li>Risk tier: <span className="text-foreground">{drillDown.mesh_decision_trace.dev_history?.risk_tier || "none"}</span></li>
                        <li>Trust level: <span className="text-foreground">{drillDown.mesh_decision_trace.dev_history?.trust_level || "none"}</span></li>
                        <li>Tokens rugged before: <span className="text-foreground">{drillDown.mesh_decision_trace.dev_history?.tokens_rugged ?? 0}</span></li>
                        <li>Auto-blacklisted: <span className="text-foreground">{drillDown.mesh_decision_trace.dev_history?.auto_blacklisted ? "yes" : "no"}</span></li>
                      </ul>
                    </div>
                    <div>
                      <div className="font-semibold mb-1">This token's own signals:</div>
                      <ul className="ml-4 list-disc text-muted-foreground">
                        <li>Death cause: <span className="text-foreground">{drillDown.mesh_decision_trace.this_token?.death_cause || "alive / not flagged"}</span></li>
                        <li>Current MC: <span className="text-foreground">{fmtMC(drillDown.mesh_decision_trace.this_token?.market_cap ?? null)}</span></li>
                        <li>This token rug: <span className="text-foreground">{drillDown.mesh_decision_trace.this_token?.is_rug ? "YES" : "no"}</span></li>
                      </ul>
                    </div>
                    {drillDown.mesh_promotion_reason && (
                      <div className="pt-2 border-t">
                        <span className="text-muted-foreground">Reason:</span> {drillDown.mesh_promotion_reason}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {drillDown.mesh_promotion_reason || "No decision recorded yet. Run \"Promote ≥3x to Mesh\" to evaluate."}
                  </div>
                )}

                {/* Manual admin actions */}
                <div className="mt-4 pt-3 border-t space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" /> Admin actions
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(drillDown.mesh_promotion_status === 'not_eligible' || drillDown.mesh_promotion_status === 'pending') && (
                      <Button size="sm" variant="default" disabled={!!rowActioning}
                        onClick={() => handleRowAction(drillDown.token_mint, 'promote')}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Promote
                      </Button>
                    )}
                    {(drillDown.mesh_promotion_status === 'rejected_rug' || drillDown.mesh_promotion_status === 'promoted' || drillDown.mesh_promotion_status === 'manually_rejected') && (
                      <Button size="sm" variant="outline" disabled={!!rowActioning}
                        onClick={() => handleRowAction(drillDown.token_mint, 'reconsider')}>
                        <RotateCw className="h-3.5 w-3.5 mr-1" /> Reconsider
                      </Button>
                    )}
                    {drillDown.mesh_promotion_status === 'promoted' && (
                      <Button size="sm" variant="destructive" disabled={!!rowActioning}
                        onClick={() => handleRowAction(drillDown.token_mint, 'reject')}>
                        <X className="h-3.5 w-3.5 mr-1" /> Remove from Mesh
                      </Button>
                    )}
                  </div>

                  {drillDown.mesh_promotion_status === 'rejected_rug' && (
                    <div className="space-y-2 pt-2">
                      <div className="text-xs text-muted-foreground">
                        Override required: this token is currently flagged as rugged. Provide a reason to force-promote.
                      </div>
                      <Textarea
                        placeholder="Why are you overriding the rug verdict? (recorded in audit trail)"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        rows={2}
                        className="text-xs"
                      />
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-amber-500 hover:bg-amber-500/90 text-amber-950"
                        disabled={!!rowActioning || !overrideReason.trim()}
                        onClick={() => handleRowAction(drillDown.token_mint, 'override_promote', overrideReason.trim())}
                      >
                        <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Override → Promote
                      </Button>
                    </div>
                  )}
                </div>
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
