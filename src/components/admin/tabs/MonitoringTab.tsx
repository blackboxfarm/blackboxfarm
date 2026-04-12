import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Activity, Shield, DollarSign, GitBranch, Server, AlertTriangle, CheckCircle, XCircle, Clock, Mail, TrendingUp } from "lucide-react";
import { ScraperAuditPanel } from "@/components/admin/ScraperAuditPanel";
import { format, subDays } from "date-fns";

// ─── Service Status Panel ───
function ServiceStatusPanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['service-status'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_status').select('*').order('service_name');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const statusIcon = (s: string) => {
    if (s === 'healthy' || s === 'operational') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (s === 'degraded') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const statusBadge = (s: string) => {
    const v = s === 'healthy' || s === 'operational' ? 'default' : s === 'degraded' ? 'secondary' : 'destructive';
    return <Badge variant={v as any}>{s}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> Service Status</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data || []).map((svc) => (
              <div key={svc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-2">
                  {statusIcon(svc.status)}
                  <span className="font-medium text-sm">{svc.service_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(svc.status)}
                  {svc.last_checked_at && (
                    <span className="text-xs text-muted-foreground">{format(new Date(svc.last_checked_at), 'HH:mm')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Error Trends Panel ───
function ErrorTrendsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['error-trends'],
    queryFn: async () => {
      const weekAgo = subDays(new Date(), 7).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('error_trend_snapshot')
        .select('*')
        .gte('snapshot_date', weekAgo)
        .order('snapshot_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Aggregate by service
  const byService = (data || []).reduce((acc: Record<string, { total: number; anomalies: number; s401: number; s429: number; s500: number }>, row) => {
    const s = row.service_name;
    if (!acc[s]) acc[s] = { total: 0, anomalies: 0, s401: 0, s429: 0, s500: 0 };
    acc[s].total += row.error_count || 0;
    if (row.is_anomaly) acc[s].anomalies++;
    acc[s].s401 += row.status_401_count || 0;
    acc[s].s429 += row.status_429_count || 0;
    acc[s].s500 += row.status_500_count || 0;
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Error Trends (7d)</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : Object.keys(byService).length === 0 ? (
          <p className="text-sm text-muted-foreground">No error trends recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(byService).sort((a, b) => b[1].total - a[1].total).map(([name, stats]) => (
              <div key={name} className="flex items-center justify-between p-2 rounded border">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{name}</span>
                  {stats.anomalies > 0 && <Badge variant="destructive" className="text-xs">⚠ {stats.anomalies} anomalies</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{stats.total} errors</span>
                  {stats.s401 > 0 && <span className="text-red-400">401: {stats.s401}</span>}
                  {stats.s429 > 0 && <span className="text-yellow-400">429: {stats.s429}</span>}
                  {stats.s500 > 0 && <span className="text-red-500">500: {stats.s500}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Delivery Log Panel ───
function DeliveryLogPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['delivery-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_delivery_log')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const stats = (data || []).reduce((acc, r) => {
    acc.total++;
    if (r.status === 'success') acc.success++;
    else acc.failed++;
    return acc;
  }, { total: 0, success: 0, failed: 0 });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Notification Delivery (Recent 50)</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span>Total: <strong>{stats.total}</strong></span>
              <span className="text-green-500">✓ {stats.success}</span>
              <span className="text-red-500">✗ {stats.failed}</span>
              <span className="text-muted-foreground">Rate: {stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0}%</span>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {(data || []).map((d) => (
                <div key={d.id} className="flex items-center justify-between text-xs p-1.5 rounded border">
                  <div className="flex items-center gap-2">
                    {d.status === 'success' ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                    <span className="font-mono">{d.channel}</span>
                    <span className="text-muted-foreground truncate max-w-[200px]">{d.notification_id || 'message'}</span>
                  </div>
                  <span className="text-muted-foreground">{d.created_at ? format(new Date(d.created_at), 'MMM d HH:mm') : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Monthly Costs Panel ───
function MonthlyCostsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['monthly-costs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_usage_archive')
        .select('*')
        .order('month_year', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Group by month
  const byMonth = (data || []).reduce((acc: Record<string, typeof data>, row) => {
    if (!acc[row.month_year]) acc[row.month_year] = [];
    acc[row.month_year].push(row);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Monthly Cost History</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : Object.keys(byMonth).length === 0 ? (
          <p className="text-sm text-muted-foreground">No archived months yet. Data populates on the 1st of each month.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(byMonth).map(([month, services]) => {
              const totalCost = (services || []).reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
              const totalCalls = (services || []).reduce((s, r) => s + (r.total_calls || 0), 0);
              return (
                <div key={month} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{month}</span>
                    <div className="flex gap-3 text-sm">
                      <span>${totalCost.toFixed(2)}</span>
                      <span className="text-muted-foreground">{totalCalls.toLocaleString()} calls</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                    {(services || []).filter(s => (s.total_calls || 0) > 0).sort((a, b) => (b.total_calls || 0) - (a.total_calls || 0)).map(s => (
                      <div key={s.id} className="flex justify-between p-1 rounded bg-muted/50">
                        <span>{s.service_name}</span>
                        <span>{(s.total_calls || 0).toLocaleString()} / ${(s.estimated_cost_usd || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Token Funnel Panel ───
function TokenFunnelPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['token-funnel'],
    queryFn: async () => {
      const weekAgo = subDays(new Date(), 7).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('token_funnel_daily')
        .select('*')
        .gte('funnel_date', weekAgo)
        .order('funnel_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const STAGE_ORDER = ['discovered', 'enriched', 'watchlisted', 'qualified', 'bought', 'sold', 'dead', 'post_mortem'];
  const STAGE_COLORS: Record<string, string> = {
    discovered: 'bg-blue-500/20 text-blue-400',
    enriched: 'bg-cyan-500/20 text-cyan-400',
    watchlisted: 'bg-green-500/20 text-green-400',
    qualified: 'bg-emerald-500/20 text-emerald-400',
    bought: 'bg-yellow-500/20 text-yellow-400',
    sold: 'bg-orange-500/20 text-orange-400',
    dead: 'bg-red-500/20 text-red-400',
    post_mortem: 'bg-purple-500/20 text-purple-400',
  };

  // Aggregate by stage over the week
  const byStage = (data || []).reduce((acc: Record<string, number>, row) => {
    acc[row.stage] = (acc[row.stage] || 0) + (row.token_count || 0);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" /> Token Pipeline Funnel (7d)</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : Object.keys(byStage).length === 0 ? (
          <p className="text-sm text-muted-foreground">No funnel data yet.</p>
        ) : (
          <div className="space-y-2">
            {STAGE_ORDER.filter(s => byStage[s]).map(stage => {
              const count = byStage[stage];
              const maxCount = Math.max(...Object.values(byStage));
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={stage} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{stage}</span>
                    <span className="font-mono">{count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${STAGE_COLORS[stage]?.split(' ')[0] || 'bg-primary/30'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Spider & Mesh Panel ───
function SpiderMeshPanel() {
  const { data: spiderData, isLoading: spiderLoading } = useQuery({
    queryKey: ['spider-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spider_run_metrics')
        .select('*')
        .order('run_date', { ascending: false })
        .limit(7);
      if (error) throw error;
      return data;
    },
  });

  const { data: meshData, isLoading: meshLoading } = useQuery({
    queryKey: ['mesh-growth'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mesh_growth_daily')
        .select('*')
        .order('snapshot_date', { ascending: false })
        .limit(7);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" /> Spider Runs (7d)</CardTitle></CardHeader>
        <CardContent>
          {spiderLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (spiderData || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No spider data yet.</p>
          ) : (
            <div className="space-y-2">
              {(spiderData || []).map(r => (
                <div key={r.id} className="grid grid-cols-4 gap-2 text-xs p-2 rounded border">
                  <span className="font-medium">{r.run_date}</span>
                  <span>🕷 {r.tokens_spidered || 0} tokens</span>
                  <span>🔗 {r.mesh_links_added || 0} links</span>
                  <span>👛 {r.wallets_discovered || 0} wallets</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" /> Mesh Growth (7d)</CardTitle></CardHeader>
        <CardContent>
          {meshLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (meshData || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No mesh data yet.</p>
          ) : (
            <div className="space-y-2">
              {(meshData || []).map(r => (
                <div key={r.id} className="grid grid-cols-4 gap-2 text-xs p-2 rounded border">
                  <span className="font-medium">{r.snapshot_date}</span>
                  <span>👤 {(r.total_developer_profiles || 0).toLocaleString()} devs</span>
                  <span>🔗 {(r.total_wallet_links || 0).toLocaleString()} links</span>
                  <span className="text-green-400">+{r.new_links_24h || 0} new</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Function Health Panel ───
function FunctionHealthPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['function-health'],
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('edge_function_runs')
        .select('function_name, status, duration_ms')
        .gte('created_at', dayAgo);
      if (error) throw error;
      return data;
    },
  });

  // Aggregate by function
  const byFn = (data || []).reduce((acc: Record<string, { total: number; errors: number; avgMs: number; totalMs: number }>, row) => {
    const fn = row.function_name;
    if (!acc[fn]) acc[fn] = { total: 0, errors: 0, avgMs: 0, totalMs: 0 };
    acc[fn].total++;
    if (row.status === 'error') acc[fn].errors++;
    acc[fn].totalMs += row.duration_ms || 0;
    acc[fn].avgMs = acc[fn].totalMs / acc[fn].total;
    return acc;
  }, {});

  const sorted = Object.entries(byFn).sort((a, b) => b[1].errors - a[1].errors || b[1].total - a[1].total);

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Function Health (24h)</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No function runs recorded in the last 24h.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1">
            <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground p-1">
              <span>Function</span><span>Runs</span><span>Errors</span><span>Avg Time</span>
            </div>
            {sorted.map(([fn, s]) => (
              <div key={fn} className={`grid grid-cols-4 gap-2 text-xs p-1.5 rounded ${s.errors > 0 ? 'bg-red-500/5 border border-red-500/20' : 'border'}`}>
                <span className="font-mono truncate">{fn}</span>
                <span>{s.total}</span>
                <span className={s.errors > 0 ? 'text-red-400 font-medium' : 'text-green-400'}>{s.errors}</span>
                <span>{(s.avgMs / 1000).toFixed(1)}s</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── DLQ Panel ───
function DLQPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['dlq-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dead_letter_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const stats = (data || []).reduce((acc, r) => {
    acc.total++;
    if (r.status === 'pending') acc.pending++;
    else if (r.status === 'resolved') acc.resolved++;
    else acc.failed++;
    return acc;
  }, { total: 0, pending: 0, resolved: 0, failed: 0 });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Dead Letter Queue</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span>Total: <strong>{stats.total}</strong></span>
              <span className="text-yellow-500">⏳ {stats.pending} pending</span>
              <span className="text-green-500">✓ {stats.resolved} resolved</span>
              <span className="text-red-500">✗ {stats.failed} failed</span>
            </div>
            {stats.pending > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {(data || []).filter(d => d.status === 'pending').map(d => (
                  <div key={d.id} className="text-xs p-2 rounded border border-yellow-500/20 bg-yellow-500/5">
                    <div className="flex justify-between">
                      <span className="font-mono">{d.operation}</span>
                      <span className="text-muted-foreground">retry #{d.retry_count}</span>
                    </div>
                    {d.error_message && <p className="text-red-400 mt-1 truncate">{d.error_message}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Firecrawl Usage Panel ───
function FirecrawlUsagePanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['firecrawl-usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scraper_audit_log')
        .select('function_name, provider_used, success, response_time_ms, http_status, error_message, fell_back, fallback_provider, created_at')
        .or('provider_used.eq.firecrawl,fallback_provider.eq.firecrawl')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  const rows = data || [];
  const totalCalls = rows.filter(r => r.provider_used === 'firecrawl').length;
  const totalSuccess = rows.filter(r => r.provider_used === 'firecrawl' && r.success).length;
  const totalFallbacks = rows.filter(r => r.fell_back && r.fallback_provider === 'firecrawl').length;
  const avgMs = totalCalls > 0 ? Math.round(rows.filter(r => r.provider_used === 'firecrawl').reduce((s, r) => s + (r.response_time_ms || 0), 0) / totalCalls) : 0;

  // Per-function breakdown
  const byFn = rows.filter(r => r.provider_used === 'firecrawl').reduce((acc: Record<string, { total: number; ok: number; fail: number; avgMs: number; totalMs: number; last: string; errors: string[] }>, r) => {
    const fn = r.function_name;
    if (!acc[fn]) acc[fn] = { total: 0, ok: 0, fail: 0, avgMs: 0, totalMs: 0, last: '', errors: [] };
    acc[fn].total++;
    if (r.success) acc[fn].ok++;
    else {
      acc[fn].fail++;
      if (r.error_message && acc[fn].errors.length < 3) acc[fn].errors.push(r.error_message);
    }
    acc[fn].totalMs += r.response_time_ms || 0;
    acc[fn].avgMs = Math.round(acc[fn].totalMs / acc[fn].total);
    if (!acc[fn].last || r.created_at > acc[fn].last) acc[fn].last = r.created_at;
    return acc;
  }, {});

  // Estimate credits — 1 credit per call
  const estimatedCreditsUsed = totalCalls;

  // Daily breakdown (last 7 days)
  const dailyCounts = rows.filter(r => r.provider_used === 'firecrawl').reduce((acc: Record<string, number>, r) => {
    const day = r.created_at?.split('T')[0] || 'unknown';
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});

  // All functions that CAN use Firecrawl (registry)
  const FC_REGISTRY = [
    { name: 'dex-top-200', role: '🔥 Primary', schedule: 'Cron 30min', note: 'CF-protected, hardcoded FC' },
    { name: 'social-predictor-ai', role: '🔀 Fallback + Search', schedule: 'On-demand', note: 'smartSearch is FC-only' },
    { name: 'firecrawl-scrape', role: '🔀 Smart Scrape', schedule: 'On-demand', note: 'General admin scraper' },
    { name: 'pumpfun-comment-scanner', role: '🔀 Fallback', schedule: 'Per scan', note: 'Falls back if Browserless fails' },
    { name: 'pumpfun-kol-registry', role: '🔀 Fallback', schedule: 'Per scan', note: 'Falls back if Browserless fails' },
    { name: 'social-larp-detector', role: '🔀 Fallback', schedule: 'On-demand', note: 'Website verification scraper' },
    { name: 'sync-knowledge-base', role: '🔀 Fallback', schedule: 'On-demand', note: 'KB page scraper' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalCalls}</p>
            <p className="text-xs text-muted-foreground">Total FC Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{totalCalls > 0 ? ((totalSuccess / totalCalls) * 100).toFixed(1) : 0}%</p>
            <p className="text-xs text-muted-foreground">Success Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{(avgMs / 1000).toFixed(1)}s</p>
            <p className="text-xs text-muted-foreground">Avg Response</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{estimatedCreditsUsed}</p>
            <p className="text-xs text-muted-foreground">Credits Used*</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{totalFallbacks}</p>
            <p className="text-xs text-muted-foreground">Fallback Hits</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-function usage */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">🔥 Per-Function Firecrawl Usage</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : Object.keys(byFn).length === 0 ? (
            <p className="text-sm text-muted-foreground">No Firecrawl calls recorded yet in audit log.</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground p-1">
                <span>Function</span><span>Calls</span><span>✓ OK</span><span>✗ Fail</span><span>Avg Time</span><span>Last Call</span>
              </div>
              {Object.entries(byFn).sort((a, b) => b[1].total - a[1].total).map(([fn, s]) => (
                <div key={fn} className={`grid grid-cols-6 gap-2 text-xs p-1.5 rounded ${s.fail > 0 ? 'bg-red-500/5 border border-red-500/20' : 'border'}`}>
                  <span className="font-mono truncate">{fn}</span>
                  <span>{s.total}</span>
                  <span className="text-green-400">{s.ok}</span>
                  <span className={s.fail > 0 ? 'text-red-400 font-medium' : ''}>{s.fail}</span>
                  <span>{(s.avgMs / 1000).toFixed(1)}s</span>
                  <span className="text-muted-foreground">{s.last ? format(new Date(s.last), 'MMM d HH:mm') : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily breakdown */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" /> Daily Credit Burn</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(dailyCounts).length === 0 ? (
            <p className="text-sm text-muted-foreground">No daily data yet.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(dailyCounts).sort((a, b) => b[0].localeCompare(a[0])).map(([day, count]) => {
                const maxCount = Math.max(...Object.values(dailyCounts));
                const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={day} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{day}</span>
                      <span className="font-mono">{count} credits</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-orange-500/50" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-3">* 1 credit ≈ 1 scrape call. Search calls also consume credits. Auto-extend: +1,000 credits / $12 CAD.</p>
        </CardContent>
      </Card>

      {/* Function Registry */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base">📋 Firecrawl Function Registry</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground p-1">
              <span>Function</span><span>FC Role</span><span>Schedule</span><span>Notes</span>
            </div>
            {FC_REGISTRY.map(fn => (
              <div key={fn.name} className="grid grid-cols-4 gap-2 text-xs p-1.5 rounded border">
                <span className="font-mono">{fn.name}</span>
                <span>{fn.role}</span>
                <span className="text-muted-foreground">{fn.schedule}</span>
                <span className="text-muted-foreground">{fn.note}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Monitoring Tab ───
export default function MonitoringTab() {
  const [subTab, setSubTab] = useState("overview");

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="overview">📊 Overview</TabsTrigger>
          <TabsTrigger value="scraper">🕸️ Scraper Audit</TabsTrigger>
          <TabsTrigger value="firecrawl">🔥 Firecrawl</TabsTrigger>
          <TabsTrigger value="errors">⚠️ Errors & DLQ</TabsTrigger>
          <TabsTrigger value="costs">💰 Costs</TabsTrigger>
          <TabsTrigger value="pipeline">🔄 Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <ServiceStatusPanel />
          <FunctionHealthPanel />
        </TabsContent>

        <TabsContent value="scraper" className="space-y-4">
          <ScraperAuditPanel />
        </TabsContent>

        <TabsContent value="firecrawl" className="space-y-4">
          <FirecrawlUsagePanel />
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <ErrorTrendsPanel />
          <DLQPanel />
          <DeliveryLogPanel />
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <MonthlyCostsPanel />
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <TokenFunnelPanel />
          <SpiderMeshPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
