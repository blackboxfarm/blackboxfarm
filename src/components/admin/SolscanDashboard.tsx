import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Activity, Database, Zap } from "lucide-react";

type Stats = {
  cycle: { start: string; end: string; days_into_cycle: number; total_cycle_days: number; days_remaining: number };
  totals: { calls_cycle: number; calls_24h: number; cache_hits: number; network_calls: number; cache_hit_pct: number; projected_cycle_total: number };
  status_codes: { status: number; count: number }[];
  endpoints: { endpoint: string; calls: number; success_pct: number; cache_hit_pct: number; avg_ms: number; last_error: string | null }[];
  functions: { function_name: string; calls: number; success_pct: number; avg_ms: number }[];
  sparkline: { day: string; calls: number }[];
  recent_errors: { ts: string; endpoint_path: string; function_name?: string; http_status: number; error_message?: string }[];
};

type ProbeResult = { url: string; status: number; ms: number; body?: any; error?: string };
type ProbeResp = { key: string; verdict: string; results: ProbeResult[] };

const PRO_V2_ENDPOINTS: { path: string; powers: string; benefit: string }[] = [
  { path: "/v2.0/token/meta", powers: "Token authority audit, oracle resolver", benefit: "Mint/freeze authority transparency on every token card" },
  { path: "/v2.0/token/markets", powers: "liquidity-lock-checker pool detection", benefit: "Accurate LP / lock detection beyond DexScreener" },
  { path: "/v2.0/token/holders", powers: "Top holder concentration audit", benefit: "Verifies AMM pool wallets in HoldersIntel" },
  { path: "/v2.0/token/transfer (BURN)", powers: "Lifecycle scorecard burn-event signal", benefit: "Post-bond integrity scoring" },
  { path: "/v2.0/account/transfer", powers: "Wallet funding chain (oracle, dev genealogy)", benefit: "KYC-root resolution + funder discovery" },
  { path: "/v2.0/account/detail", powers: "CEX label resolution", benefit: "Identifies Binance/Coinbase/Kraken wallets in mesh" },
  { path: "/v2.0/account/portfolio", powers: "Wallet investigator portfolio view", benefit: "Whole-wallet token holdings, no Helius credits burned" },
  { path: "/v2.0/account/defi/activities", powers: "Buyback detection (probe-buybacks)", benefit: "Detects dev re-buys post-bond" },
  { path: "/v2.0/transaction/detail", powers: "FlipIt entry verification", benefit: "Authoritative on-chain truth for buy/sell sigs" },
];

const UNTAPPED_PRO_V2: { path: string; potential: string }[] = [
  { path: "/v2.0/token/defi/activities", potential: "Token-level DeFi flow analysis" },
  { path: "/v2.0/account/balance_change", potential: "Real-time wallet PnL tracking" },
  { path: "/v2.0/nft/news", potential: "NFT mint surveillance" },
  { path: "/v2.0/market/info", potential: "Market microstructure for advanced trading" },
  { path: "/v2.0/monitor/usage", potential: "Live billing-side credit check (server-side)" },
];

function fmtNum(n: number) { return n.toLocaleString("en-US"); }
function fmtDate(iso: string) { return new Date(iso).toLocaleString(); }
function statusBadge(s: number) {
  if (s === 0) return <Badge variant="destructive">NET ERR</Badge>;
  if (s >= 200 && s < 300) return <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-300">{s}</Badge>;
  if (s === 429) return <Badge variant="destructive">429 Throttled</Badge>;
  if (s >= 400 && s < 500) return <Badge variant="destructive">{s}</Badge>;
  return <Badge variant="destructive">{s}</Badge>;
}

export default function SolscanDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResp | null>(null);
  const [probing, setProbing] = useState(false);

  async function loadStats() {
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("solscan-usage-stats");
      if (error) throw error;
      setStats(data as Stats);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }

  async function runProbe() {
    setProbing(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-solscan-pro");
      if (error) throw error;
      setProbe(data as ProbeResp);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setProbing(false); }
  }

  useEffect(() => {
    loadStats();
    runProbe();
    const t = setInterval(loadStats, 30_000);
    return () => clearInterval(t);
  }, []);

  const cycleResetText = stats
    ? `${stats.cycle.days_remaining} days until reset on ${new Date(stats.cycle.end).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`
    : "—";

  const verdictColor = probe?.verdict === "PRO_V2_OK" ? "bg-emerald-500/20 text-emerald-300"
    : probe?.verdict === "NOT_PRO_OR_INVALID" ? "bg-red-500/20 text-red-300"
    : "bg-yellow-500/20 text-yellow-300";

  const sparkMax = stats ? Math.max(1, ...stats.sparkline.map(d => d.calls)) : 1;

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-xl">🔎 Solscan Pro v2 — Master Dashboard</CardTitle>
            <Badge variant="outline">$199/mo plan</Badge>
            {probe && <Badge className={verdictColor}>{probe.verdict}</Badge>}
            {probe && <span className="text-xs text-muted-foreground">key: {probe.key}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{cycleResetText}</span>
            <Button size="sm" variant="outline" onClick={loadStats} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={runProbe} disabled={probing}>
              {probing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Re-probe"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {err && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {err}
          </CardContent>
        </Card>
      )}

      {/* Live probe results */}
      {probe && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Live key probe</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {probe.results.map((r) => (
              <div key={r.url} className="border rounded-lg p-2 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="truncate font-mono text-[10px]">{r.url.replace("https://pro-api.solscan.io", "")}</span>
                  {statusBadge(r.status)}
                </div>
                <div className="text-muted-foreground">{r.ms}ms</div>
                {r.error && <div className="text-destructive truncate">{r.error}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Calls (cycle)" value={fmtNum(stats.totals.calls_cycle)} icon={<Activity className="h-4 w-4" />} />
          <StatCard label="Calls (24h)" value={fmtNum(stats.totals.calls_24h)} icon={<Activity className="h-4 w-4" />} />
          <StatCard label="Cache hit %" value={`${stats.totals.cache_hit_pct}%`} icon={<Database className="h-4 w-4" />} />
          <StatCard label="Network calls" value={fmtNum(stats.totals.network_calls)} icon={<Zap className="h-4 w-4" />} />
          <StatCard label="Projected cycle" value={fmtNum(stats.totals.projected_cycle_total)} icon={<Activity className="h-4 w-4" />} />
        </div>
      )}

      {/* Sparkline */}
      {stats && stats.sparkline.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Daily calls — current billing cycle (resets on the 8th)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {stats.sparkline.map((d) => (
                <div key={d.day} title={`${d.day}: ${d.calls}`} className="flex-1 bg-primary/60 rounded-t hover:bg-primary transition-colors" style={{ height: `${(d.calls / sparkMax) * 100}%`, minHeight: "2px" }} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{stats.sparkline[0]?.day}</span>
              <span>{stats.sparkline[stats.sparkline.length - 1]?.day}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status codes */}
      {stats && (
        <Card>
          <CardHeader><CardTitle className="text-sm">HTTP status breakdown</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.status_codes.map((s) => (
              <div key={s.status} className="flex items-center gap-2 border rounded-md px-2 py-1 text-xs">
                {statusBadge(s.status)}
                <span className="font-mono">{fmtNum(s.count)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Endpoint table */}
      {stats && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Endpoint breakdown</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Success %</TableHead>
                  <TableHead className="text-right">Cache %</TableHead>
                  <TableHead className="text-right">Avg ms</TableHead>
                  <TableHead>Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.endpoints.map((e) => (
                  <TableRow key={e.endpoint}>
                    <TableCell className="font-mono text-xs">{e.endpoint}</TableCell>
                    <TableCell className="text-right">{fmtNum(e.calls)}</TableCell>
                    <TableCell className="text-right">{e.success_pct}%</TableCell>
                    <TableCell className="text-right">{e.cache_hit_pct}%</TableCell>
                    <TableCell className="text-right">{e.avg_ms}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[300px] truncate">{e.last_error ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Functions table */}
      {stats && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Calling functions (quota burn)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Function</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Success %</TableHead>
                  <TableHead className="text-right">Avg ms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.functions.map((f) => (
                  <TableRow key={f.function_name}>
                    <TableCell className="font-mono text-xs">{f.function_name}</TableCell>
                    <TableCell className="text-right">{fmtNum(f.calls)}</TableCell>
                    <TableCell className="text-right">{f.success_pct}%</TableCell>
                    <TableCell className="text-right">{f.avg_ms}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent errors */}
      {stats && stats.recent_errors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Recent errors (last 50 in cycle)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Function</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recent_errors.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.ts)}</TableCell>
                    <TableCell>{statusBadge(r.http_status)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.endpoint_path}</TableCell>
                    <TableCell className="font-mono text-xs">{r.function_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[400px] truncate">{r.error_message ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pro v2 feature inventory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Pro v2 endpoints in use
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Powers</TableHead>
                <TableHead>User benefit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PRO_V2_ENDPOINTS.map((e) => (
                <TableRow key={e.path}>
                  <TableCell className="font-mono text-xs">{e.path}</TableCell>
                  <TableCell className="text-xs">{e.powers}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.benefit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" /> Untapped Pro v2 endpoints (roadmap)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Potential value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {UNTAPPED_PRO_V2.map((e) => (
                <TableRow key={e.path}>
                  <TableCell className="font-mono text-xs">{e.path}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.potential}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}