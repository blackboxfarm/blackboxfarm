import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, CheckCircle, XCircle, ArrowRightLeft, Zap, Clock, Server, Shield, Activity, TrendingUp, List } from "lucide-react";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { format, subHours, subDays } from "date-fns";

// ─── Static Function Registry ───
const SCRAPER_FUNCTION_REGISTRY: Array<{
  name: string;
  provider: "smart-scrape" | "browserless-direct" | "firecrawl-override";
  description: string;
  providerOverride?: string;
  cronSchedule?: string;
  humanFreq?: string;
}> = [
  { name: "dex-top-200", provider: "firecrawl-override", description: "DexScreener top 200 trending tokens", providerOverride: "firecrawl", cronSchedule: "*/30 * * * *", humanFreq: "every 30 min" },
  { name: "firecrawl-scrape", provider: "smart-scrape", description: "General-purpose scrape endpoint (admin)", humanFreq: "on-demand" },
  { name: "pumpfun-comment-scanner", provider: "smart-scrape", description: "Pump.fun coin pages — comment bot detection", humanFreq: "per token scan" },
  { name: "pumpfun-kol-registry", provider: "smart-scrape", description: "Pump.fun profiles — KOL detection", humanFreq: "per token scan" },
  { name: "social-larp-detector", provider: "smart-scrape", description: "Token websites — larp/scam detection", humanFreq: "per token scan" },
  { name: "social-predictor-ai", provider: "smart-scrape", description: "URL content for AI social prediction", humanFreq: "per prediction" },
  { name: "sync-knowledge-base", provider: "smart-scrape", description: "Knowledge base URL scraping", humanFreq: "on-demand" },
  { name: "agentic-browser", provider: "browserless-direct", description: "Browser automation (direct Browserless API)", humanFreq: "on-demand" },
  { name: "bulk-community-enricher", provider: "browserless-direct", description: "X community about-page scraping", humanFreq: "per enrichment batch" },
  { name: "test-browserless", provider: "browserless-direct", description: "Browserless connectivity test", humanFreq: "on-demand" },
];

function FunctionRegistryCard() {
  const { data: auditStats } = useQuery({
    queryKey: ["scraper-function-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scraper_audit_log" as any)
        .select("function_name, success, response_time_ms, fell_back, created_at")
        .order("created_at", { ascending: false })
        .limit(5000) as any;
      if (error) throw error;

      const statsMap: Record<string, {
        total: number; success: number; errors: number;
        avgMs: number; totalMs: number; fallbacks: number;
        lastCall: string;
      }> = {};

      for (const row of (data || [])) {
        const fn = row.function_name || "unknown";
        if (!statsMap[fn]) {
          statsMap[fn] = { total: 0, success: 0, errors: 0, avgMs: 0, totalMs: 0, fallbacks: 0, lastCall: "" };
        }
        const s = statsMap[fn];
        s.total++;
        if (row.success) s.success++; else s.errors++;
        s.totalMs += row.response_time_ms || 0;
        if (row.fell_back) s.fallbacks++;
        if (!s.lastCall || row.created_at > s.lastCall) s.lastCall = row.created_at;
      }

      for (const fn of Object.keys(statsMap)) {
        statsMap[fn].avgMs = statsMap[fn].total > 0 ? Math.round(statsMap[fn].totalMs / statsMap[fn].total) : 0;
      }
      return statsMap;
    },
    refetchInterval: 30000,
  });

  const providerBadge = (p: string) => {
    switch (p) {
      case "smart-scrape": return <Badge variant="secondary" className="text-[10px]">🔀 Smart</Badge>;
      case "browserless-direct": return <Badge variant="outline" className="text-[10px]">🖥️ Direct</Badge>;
      case "firecrawl-override": return <Badge className="text-[10px] bg-orange-600">🔥 FC Override</Badge>;
      default: return <Badge>{p}</Badge>;
    }
  };

  const successRate = (s: number, t: number) => {
    if (t === 0) return <span className="text-muted-foreground">—</span>;
    const pct = Math.round((s / t) * 100);
    const color = pct >= 95 ? "text-green-500" : pct >= 70 ? "text-yellow-500" : "text-red-500";
    return <span className={color}>{pct}%</span>;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <List className="h-4 w-4" /> Function Registry — Scraper Consumers
          {auditStats && <Badge variant="outline" className="text-[10px] ml-auto">{Object.keys(auditStats).length} tracked</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead compact>Function</TableHead>
              <TableHead compact>Routing</TableHead>
              <TableHead compact>Schedule</TableHead>
              <TableHead compact className="text-right">Calls</TableHead>
              <TableHead compact className="text-right">✅</TableHead>
              <TableHead compact className="text-right">❌</TableHead>
              <TableHead compact className="text-right">Rate</TableHead>
              <TableHead compact className="text-right">Avg ms</TableHead>
              <TableHead compact className="text-right">Fallbacks</TableHead>
              <TableHead compact>Last Call</TableHead>
              <TableHead compact>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SCRAPER_FUNCTION_REGISTRY.map((fn) => {
              const stats = auditStats?.[fn.name];
              return (
                <TableRow key={fn.name}>
                  <TableCell compact className="font-mono font-medium">{fn.name}</TableCell>
                  <TableCell compact>{providerBadge(fn.provider)}</TableCell>
                  <TableCell compact className="font-mono text-muted-foreground">{fn.cronSchedule || "on-demand"}</TableCell>
                  <TableCell compact className="text-right font-mono">{stats?.total ?? "—"}</TableCell>
                  <TableCell compact className="text-right font-mono text-green-500">{stats?.success ?? "—"}</TableCell>
                  <TableCell compact className="text-right font-mono text-red-500">{stats?.errors || "—"}</TableCell>
                  <TableCell compact className="text-right font-mono">{stats ? successRate(stats.success, stats.total) : "—"}</TableCell>
                  <TableCell compact className="text-right font-mono">{stats?.avgMs ? `${(stats.avgMs / 1000).toFixed(1)}s` : "—"}</TableCell>
                  <TableCell compact className="text-right font-mono">{stats?.fallbacks || "—"}</TableCell>
                  <TableCell compact className="text-muted-foreground text-[10px]">
                    {stats?.lastCall ? format(new Date(stats.lastCall), "MMM d HH:mm") : "—"}
                  </TableCell>
                  <TableCell compact className="text-muted-foreground truncate max-w-[180px]" title={fn.description}>{fn.description}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-[10px] text-muted-foreground p-2">
          <strong>Smart</strong> = global provider toggles · <strong>Direct</strong> = bypasses router · <strong>FC Override</strong> = hardcoded Firecrawl · Stats from last ~5K audit rows
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Provider Toggle Card ───
function ProviderToggleCard() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["scraper-provider-config"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("scraper_provider_config" as any)
        .select("*")
        .limit(1)
        .single() as any);
      if (error) throw error;
      return data as {
        id: string;
        provider_primary: string;
        provider_fallback: string;
        browserless_enabled: boolean;
        firecrawl_enabled: boolean;
        auto_fallback_enabled: boolean;
      };
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: any }) => {
      const { error } = await (supabase
        .from("scraper_provider_config" as any)
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("id", config!.id) as any);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["scraper-provider-config"] });
      toast.success(`Scraper config updated: ${vars.field} → ${vars.value}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const swapProviders = () => {
    if (!config) return;
    const newPrimary = config.provider_primary === "browserless" ? "firecrawl" : "browserless";
    const newFallback = newPrimary === "browserless" ? "firecrawl" : "browserless";
    toggleMutation.mutate({ field: "provider_primary", value: newPrimary });
    setTimeout(() => {
      toggleMutation.mutate({ field: "provider_fallback", value: newFallback });
    }, 300);
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading config...</div>;
  if (!config) return null;

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
          Scraper Provider Control
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider order */}
        <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="default" className="text-xs">🔵 PRIMARY</Badge>
              <span className="font-medium text-sm capitalize">{config.provider_primary}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">🟡 FALLBACK</Badge>
              <span className="text-sm text-muted-foreground capitalize">{config.provider_fallback}</span>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={swapProviders}
            className="flex items-center gap-2"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Swap Order
          </Button>
        </div>

        {/* Individual toggles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">🖥️ Browserless</p>
              <p className="text-xs text-muted-foreground">Self-hosted Chromium</p>
            </div>
            <Switch
              checked={config.browserless_enabled}
              onCheckedChange={(v) => toggleMutation.mutate({ field: "browserless_enabled", value: v })}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">🔥 Firecrawl</p>
              <p className="text-xs text-muted-foreground">Cloud API backup</p>
            </div>
            <Switch
              checked={config.firecrawl_enabled}
              onCheckedChange={(v) => toggleMutation.mutate({ field: "firecrawl_enabled", value: v })}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">🔄 Auto Fallback</p>
              <p className="text-xs text-muted-foreground">On primary failure</p>
            </div>
            <Switch
              checked={config.auto_fallback_enabled}
              onCheckedChange={(v) => toggleMutation.mutate({ field: "auto_fallback_enabled", value: v })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Audit Stats Summary ───
function AuditStatsSummary({ timeRange }: { timeRange: string }) {
  const since = timeRange === "1h" ? subHours(new Date(), 1).toISOString()
    : timeRange === "6h" ? subHours(new Date(), 6).toISOString()
    : timeRange === "24h" ? subDays(new Date(), 1).toISOString()
    : subDays(new Date(), 7).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["scraper-audit-stats", timeRange],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("scraper_audit_log" as any)
        .select("provider_used, success, fell_back, response_time_ms, function_name, content_usable")
        .gte("created_at", since) as any);
      if (error) throw error;
      return data as Array<{
        provider_used: string;
        success: boolean;
        fell_back: boolean;
        response_time_ms: number;
        function_name: string;
        content_usable: boolean;
      }>;
    },
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading stats...</div>;

  const rows = data || [];
  const total = rows.length;
  const successes = rows.filter(r => r.success).length;
  const failures = total - successes;
  const fallbacks = rows.filter(r => r.fell_back).length;
  const avgMs = total > 0 ? Math.round(rows.reduce((s, r) => s + (r.response_time_ms || 0), 0) / total) : 0;
  const usable = rows.filter(r => r.content_usable).length;

  // By provider
  const byProvider = rows.reduce((acc: Record<string, { total: number; success: number; avgMs: number; totalMs: number }>, r) => {
    const p = r.provider_used;
    if (!acc[p]) acc[p] = { total: 0, success: 0, avgMs: 0, totalMs: 0 };
    acc[p].total++;
    if (r.success) acc[p].success++;
    acc[p].totalMs += r.response_time_ms || 0;
    acc[p].avgMs = acc[p].totalMs / acc[p].total;
    return acc;
  }, {});

  // By function
  const byFunction = rows.reduce((acc: Record<string, { total: number; success: number; fallbacks: number; avgMs: number; totalMs: number }>, r) => {
    const f = r.function_name;
    if (!acc[f]) acc[f] = { total: 0, success: 0, fallbacks: 0, avgMs: 0, totalMs: 0 };
    acc[f].total++;
    if (r.success) acc[f].success++;
    if (r.fell_back) acc[f].fallbacks++;
    acc[f].totalMs += r.response_time_ms || 0;
    acc[f].avgMs = acc[f].totalMs / acc[f].total;
    return acc;
  }, {});

  const successRate = total > 0 ? ((successes / total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard icon={<Activity className="h-4 w-4" />} label="Total Scrapes" value={total} />
        <StatCard icon={<CheckCircle className="h-4 w-4 text-green-500" />} label="Success Rate" value={`${successRate}%`} color={Number(successRate) > 90 ? "text-green-500" : Number(successRate) > 70 ? "text-yellow-500" : "text-red-500"} />
        <StatCard icon={<XCircle className="h-4 w-4 text-red-500" />} label="Failures" value={failures} color={failures > 0 ? "text-red-500" : "text-green-500"} />
        <StatCard icon={<ArrowRightLeft className="h-4 w-4 text-yellow-500" />} label="Fallbacks" value={fallbacks} color={fallbacks > 0 ? "text-yellow-500" : "text-muted-foreground"} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Avg Speed" value={`${(avgMs / 1000).toFixed(1)}s`} />
        <StatCard icon={<Shield className="h-4 w-4 text-blue-500" />} label="Usable Content" value={usable} />
      </div>

      {/* Provider breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" /> Provider Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(byProvider).length === 0 ? (
            <p className="text-sm text-muted-foreground">No scraping activity yet in this window.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(byProvider).map(([provider, stats]) => {
                const rate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : "0";
                return (
                  <div key={provider} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm capitalize">{provider === "browserless" ? "🖥️" : "🔥"} {provider}</span>
                      <Badge variant={Number(rate) > 90 ? "default" : Number(rate) > 50 ? "secondary" : "destructive"}>
                        {rate}% success
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span>{stats.total} calls</span>
                      <span>{stats.success} ok</span>
                      <span>{(stats.avgMs / 1000).toFixed(1)}s avg</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-function breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Per-Function Audit</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(byFunction).length === 0 ? (
            <p className="text-sm text-muted-foreground">No function data yet.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1">
              <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground p-1 sticky top-0 bg-card">
                <span>Function</span><span>Calls</span><span>Success</span><span>Rate</span><span>Fallbacks</span><span>Avg Speed</span>
              </div>
              {Object.entries(byFunction)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([fn, s]) => {
                  const rate = s.total > 0 ? ((s.success / s.total) * 100).toFixed(0) : "0";
                  return (
                    <div key={fn} className={`grid grid-cols-6 gap-2 text-xs p-1.5 rounded ${s.success < s.total ? 'bg-red-500/5 border border-red-500/20' : 'border'}`}>
                      <span className="font-mono truncate" title={fn}>{fn}</span>
                      <span>{s.total}</span>
                      <span className="text-green-400">{s.success}</span>
                      <span className={Number(rate) > 90 ? "text-green-400" : Number(rate) > 50 ? "text-yellow-400" : "text-red-400"}>{rate}%</span>
                      <span className={s.fallbacks > 0 ? "text-yellow-400" : "text-muted-foreground"}>{s.fallbacks}</span>
                      <span>{(s.avgMs / 1000).toFixed(1)}s</span>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color || ''}`}>{value}</p>
    </div>
  );
}

// ─── Recent Audit Log ───
function RecentAuditLog({ timeRange }: { timeRange: string }) {
  const since = timeRange === "1h" ? subHours(new Date(), 1).toISOString()
    : timeRange === "6h" ? subHours(new Date(), 6).toISOString()
    : timeRange === "24h" ? subDays(new Date(), 1).toISOString()
    : subDays(new Date(), 7).toISOString();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["scraper-audit-log", timeRange],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("scraper_audit_log" as any)
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100) as any);
      if (error) throw error;
      return data as Array<{
        id: string;
        function_name: string;
        target_url: string;
        provider_used: string;
        provider_was_primary: boolean;
        fell_back: boolean;
        success: boolean;
        http_status: number;
        response_time_ms: number;
        response_size_bytes: number;
        content_usable: boolean;
        error_message: string;
        created_at: string;
      }>;
    },
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Recent Scrape Log</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
          <div className="max-h-96 overflow-y-auto space-y-1">
            <div className="grid grid-cols-7 gap-1 text-[10px] font-medium text-muted-foreground p-1 sticky top-0 bg-card">
              <span>Time</span><span>Function</span><span>URL</span><span>Provider</span><span>Status</span><span>Speed</span><span>Size</span>
            </div>
            {(data || []).map((row) => (
              <div
                key={row.id}
                className={`grid grid-cols-7 gap-1 text-[10px] p-1 rounded ${
                  !row.success ? 'bg-red-500/5 border border-red-500/20' : 
                  row.fell_back ? 'bg-yellow-500/5 border border-yellow-500/20' : 'border'
                }`}
              >
                <span className="text-muted-foreground">{format(new Date(row.created_at), 'HH:mm:ss')}</span>
                <span className="font-mono truncate" title={row.function_name}>{row.function_name}</span>
                <span className="truncate text-muted-foreground" title={row.target_url}>{row.target_url.replace(/https?:\/\//, '').slice(0, 30)}</span>
                <span className="flex items-center gap-1">
                  {row.provider_used === 'browserless' ? '🖥️' : '🔥'}
                  {row.fell_back && <span className="text-yellow-400">↩</span>}
                </span>
                <span>
                  {row.success ? <CheckCircle className="h-3 w-3 text-green-500 inline" /> : <XCircle className="h-3 w-3 text-red-500 inline" />}
                  {row.error_message && <span className="ml-1 text-red-400 truncate" title={row.error_message}>!</span>}
                </span>
                <span>{row.response_time_ms ? `${(row.response_time_ms / 1000).toFixed(1)}s` : '—'}</span>
                <span>{row.response_size_bytes ? `${(row.response_size_bytes / 1024).toFixed(0)}KB` : '—'}</span>
              </div>
            ))}
            {(data || []).length === 0 && <p className="text-xs text-muted-foreground py-2">No scrape activity in this window.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Export ───
export function ScraperAuditPanel() {
  const [timeRange, setTimeRange] = useState("24h");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          🕸️ Scraper Infrastructure Audit
        </h3>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="6h">Last 6h</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ProviderToggleCard />
      <FunctionRegistryCard />
      <AuditStatsSummary timeRange={timeRange} />
      <RecentAuditLog timeRange={timeRange} />
    </div>
  );
}

export default ScraperAuditPanel;
