import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, XCircle, Clock, Users, Activity, Database, Globe, Bell, Zap, Twitter, Archive, CalendarDays, CreditCard, Search, CheckCheck, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
interface MorningReport {
  id: string;
  report_date: string;
  report_period_start: string;
  report_period_end: string;
  overall_status: string;
  api_usage_summary: Record<string, {
    total_calls: number;
    successful: number;
    failed: number;
    fail_rate_pct: number;
    avg_response_ms: number;
    credits_used: number;
    top_errors: { error: string; count: number }[];
  }>;
  rate_limit_events: { service: string; endpoint: string; status: number; count: number }[];
  auth_failure_events: { service: string; endpoint: string; status: number; count: number }[];
  quota_status: Record<string, { display_name: string; used: number; limit: number | null; pct: number; status: string; tier: string | null; is_paid: boolean }>;
  error_patterns: { endpoint: string; service: string; count: number; error: string | null }[];
  new_signups: number;
  new_signups_details: { email: string; provider: string; display_name: string | null; created_at: string }[];
  new_subscribers: number;
  new_subscribers_details: any[];
  table_health: Record<string, { row_count: number; status: string }>;
  external_services_status: Record<string, { status: string; calls_overnight: number; failures: number; notes: string }>;
  holders_intel_metrics: {
    display_name: string;
    username: string;
    is_verified: boolean;
    professional_type: string | null;
    followers: { total: number; blue_check_premium: number; normal: number; blue_check_pct: number };
    following: number;
    follow_ratio: number;
    tweets: number;
    likes: number;
    avg_likes_per_tweet: number;
    listed_count: number;
    media_count: number;
    join_date: string | null;
    last_enriched_at: string | null;
  } | null;
  unread_notifications: number;
  alerts: { level: string; category: string; title: string; detail: string }[];
  execution_time_ms: number;
  telegram_sent: boolean;
  telegram_sent_at: string | null;
  created_at: string;
}

const alertFeatureLabels: Record<string, string> = {
  function_health: 'Edge function health — background automations and bot/webhook features',
  api_failure: 'External API reliability — data feeds and enrichment services',
  rate_limit: 'API quota pressure — integrations may throttle or stall',
  dlq: 'Dead Letter Queue — retries exhausted and manual recovery may be needed',
};

function getAlertFeatureLabel(category: string) {
  return alertFeatureLabels[category] || 'System health signal';
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    healthy: { variant: "default", icon: <CheckCircle className="w-3 h-3" /> },
    ok: { variant: "default", icon: <CheckCircle className="w-3 h-3" /> },
    active: { variant: "default", icon: <CheckCircle className="w-3 h-3" /> },
    warning: { variant: "secondary", icon: <AlertTriangle className="w-3 h-3" /> },
    critical: { variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
    degraded: { variant: "secondary", icon: <AlertTriangle className="w-3 h-3" /> },
    down: { variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
    idle: { variant: "outline", icon: <Clock className="w-3 h-3" /> },
    error: { variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
  };
  const c = config[status] || config.ok;
  return (
    <Badge variant={c.variant} className="gap-1 text-xs">
      {c.icon} {status}
    </Badge>
  );
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {icon}
        <span className="font-semibold text-sm">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-9 pr-3 pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ReportView({ report }: { report: MorningReport }) {
  const [clearedAlerts, setClearedAlerts] = useState<Set<number>>(new Set());
  const totalCalls = Object.values(report.api_usage_summary).reduce((s, v) => s + v.total_calls, 0);
  const totalFails = Object.values(report.api_usage_summary).reduce((s, v) => s + v.failed, 0);
  const totalCredits = Object.values(report.api_usage_summary).reduce((s, v) => s + v.credits_used, 0);

  const subDetails = report.new_subscribers_details as any;
  const subEntries = subDetails?.entries || (Array.isArray(subDetails) ? subDetails : []);
  const subSummary = subDetails?.summary || null;

  const copyAlertQuestion = (alert: { level: string; category: string; title: string; detail: string }) => {
    const question = `Morning Report alert — [${alert.level.toUpperCase()}] ${alert.title}: ${alert.detail}. This affects: ${getAlertFeatureLabel(alert.category)}. What should I do about this? What's the root cause and recommended fix?`;
    navigator.clipboard.writeText(question);
    toast.success('Question copied to clipboard');
  };

  const toggleClearAlert = (idx: number) => {
    setClearedAlerts(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {/* Alerts Banner */}
      {report.alerts.filter(a => a.level === 'critical' || a.level === 'warning').length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="font-semibold text-sm text-destructive">Action Required</span>
            </div>
            <div className="space-y-1">
              {report.alerts.filter(a => a.level === 'critical' || a.level === 'warning').map((alert, i) => {
                const isCleared = clearedAlerts.has(i);
                return (
                  <div key={i} className={`flex items-start gap-2 text-xs transition-opacity ${isCleared ? 'opacity-40' : ''}`}>
                    <Badge variant={alert.level === 'critical' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                      {alert.level}
                    </Badge>
                    <div className={`flex-1 ${isCleared ? 'line-through' : ''}`}>
                      <span className="font-medium">{alert.title}</span>
                      <span className="text-muted-foreground ml-1">— {alert.detail}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 border-border/50 hover:bg-purple-500/20 hover:text-purple-300"
                        title="Copy investigation question to clipboard"
                        onClick={() => copyAlertQuestion(alert)}
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className={`h-7 w-7 border-border/50 ${isCleared ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'hover:bg-green-500/20 hover:text-green-300'}`}
                        title={isCleared ? 'Unmark as cleared' : 'Mark as cleared'}
                        onClick={() => toggleClearAlert(i)}
                      >
                        <CheckCheck className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">API Calls</div>
          <div className="text-lg font-bold">{totalCalls.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{totalFails} failed</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Credits Used</div>
          <div className="text-lg font-bold">{totalCredits.toLocaleString()}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">New Signups</div>
          <div className="text-lg font-bold">{report.new_signups}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">New Subs</div>
          <div className="text-lg font-bold">{subSummary?.overnight_new ?? report.new_subscribers}</div>
          {subSummary?.overnight_revenue_usd > 0 && (
            <div className="text-xs text-green-500">${subSummary.overnight_revenue_usd.toFixed(2)}</div>
          )}
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total Active Subs</div>
          <div className="text-lg font-bold">{subSummary?.total_active_subscribers ?? '—'}</div>
          <div className="text-xs text-muted-foreground">{subSummary?.total_linked_accounts ?? 0} linked</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Unread</div>
          <div className="text-lg font-bold">{report.unread_notifications}</div>
        </Card>
      </div>

      {/* Detailed Sections */}
      <Card>
        <CardContent className="p-4 space-y-0">
          {/* Signups */}
          <Section title={`Overnight Signups (${report.new_signups})`} icon={<Users className="w-4 h-4 text-blue-400" />}>
            {report.new_signups_details.length > 0 ? (
              <div className="space-y-1">
                {report.new_signups_details.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px]">{s.provider}</Badge>
                    <span className="font-mono">{s.email}</span>
                    {s.display_name && <span className="text-muted-foreground">({s.display_name})</span>}
                    <span className="text-muted-foreground ml-auto">{s.created_at ? format(new Date(s.created_at), 'h:mm a') : ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No new signups overnight</p>
            )}
          </Section>

          {/* Subscribers / Stripe */}
          <Section title={`Overnight Subscriptions (${subSummary?.overnight_new ?? report.new_subscribers})`} icon={<CreditCard className="w-4 h-4 text-emerald-400" />}>
            {subEntries.length > 0 ? (
              <div className="space-y-2">
                {/* Tier breakdown summary */}
                {subSummary?.tier_breakdown && Object.keys(subSummary.tier_breakdown).length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {Object.entries(subSummary.tier_breakdown as Record<string, number>).map(([tier, count]) => (
                      <Badge key={tier} variant="outline" className="text-[10px] gap-1">
                        {tier}: {count as number}
                      </Badge>
                    ))}
                    {subSummary.overnight_revenue_usd > 0 && (
                      <Badge variant="default" className="text-[10px] gap-1 bg-emerald-600">
                        💰 ${subSummary.overnight_revenue_usd.toFixed(2)} revenue
                      </Badge>
                    )}
                  </div>
                )}
                {/* Individual entries */}
                {subEntries.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant={s.tier_key === 'pro' ? 'default' : s.tier_key === 'dev' ? 'secondary' : 'outline'} className="text-[10px]">
                      {s.tier_key}
                    </Badge>
                    <span className="font-mono">{s.email}</span>
                    {s.name && <span className="text-muted-foreground">({s.name})</span>}
                    <span className="text-emerald-500 font-medium">{s.amount}/{s.interval}</span>
                    {s.linked ? (
                      <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">✅ linked</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30">⏳ unlinked</Badge>
                    )}
                    <span className="text-muted-foreground ml-auto">{s.created_at ? format(new Date(s.created_at), 'h:mm a') : ''}</span>
                  </div>
                ))}
                {/* Totals row */}
                {subSummary && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border/50">
                    <span>Total Active: <span className="font-medium text-foreground">{subSummary.total_active_subscribers}</span></span>
                    <span>Linked: <span className="font-medium text-foreground">{subSummary.total_linked_accounts}</span></span>
                    {subSummary.banner_purchases > 0 && <span>Banner Purchases: <span className="font-medium text-foreground">{subSummary.banner_purchases}</span></span>}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No new subscriptions overnight</p>
            )}
          </Section>

          {/* API Usage Per Service */}
          <Section title="API Usage by Service" icon={<Activity className="w-4 h-4 text-green-400" />}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 pr-3 font-medium">Service</th>
                    <th className="text-right py-1.5 px-2 font-medium">Calls</th>
                    <th className="text-right py-1.5 px-2 font-medium">Failed</th>
                    <th className="text-right py-1.5 px-2 font-medium">Fail %</th>
                    <th className="text-right py-1.5 px-2 font-medium">Avg ms</th>
                    <th className="text-right py-1.5 px-2 font-medium">Credits</th>
                    <th className="text-left py-1.5 pl-2 font-medium">Top Error</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.api_usage_summary)
                    .sort((a, b) => b[1].total_calls - a[1].total_calls)
                    .map(([svc, stats]) => (
                      <tr key={svc} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-1.5 pr-3 font-medium">{svc}</td>
                        <td className="text-right py-1.5 px-2">{stats.total_calls}</td>
                        <td className="text-right py-1.5 px-2">{stats.failed > 0 ? <span className="text-destructive">{stats.failed}</span> : '0'}</td>
                        <td className="text-right py-1.5 px-2">
                          <span className={stats.fail_rate_pct >= 50 ? 'text-destructive font-bold' : stats.fail_rate_pct >= 10 ? 'text-yellow-500' : ''}>
                            {stats.fail_rate_pct}%
                          </span>
                        </td>
                        <td className="text-right py-1.5 px-2">{stats.avg_response_ms}ms</td>
                        <td className="text-right py-1.5 px-2">{stats.credits_used || '—'}</td>
                        <td className="py-1.5 pl-2 max-w-[200px] truncate text-muted-foreground">
                          {stats.top_errors[0]?.error || '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Rate Limits & Auth Failures */}
          {(report.rate_limit_events.length > 0 || report.auth_failure_events.length > 0) && (
            <Section title="Rate Limit & Auth Issues" icon={<Zap className="w-4 h-4 text-yellow-400" />}>
              <div className="space-y-1">
                {report.rate_limit_events.map((e, i) => (
                  <div key={`rl-${i}`} className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary" className="text-[10px]">429</Badge>
                    <span>{e.service}/{e.endpoint}</span>
                    <span className="text-muted-foreground">×{e.count}</span>
                  </div>
                ))}
                {report.auth_failure_events.map((e, i) => (
                  <div key={`af-${i}`} className="flex items-center gap-2 text-xs">
                    <Badge variant="destructive" className="text-[10px]">{e.status}</Badge>
                    <span>{e.service}/{e.endpoint}</span>
                    <span className="text-muted-foreground">×{e.count}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Quota Status */}
          <Section title="Quota Status" icon={<Activity className="w-4 h-4 text-purple-400" />} defaultOpen={false}>
            <div className="space-y-2">
              {Object.entries(report.quota_status).map(([svc, q]) => (
                <div key={svc} className="flex items-center gap-2 text-xs">
                  <StatusBadge status={q.status} />
                  <span className="font-medium w-24">{q.display_name}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        q.pct >= 90 ? 'bg-destructive' : q.pct >= 75 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(q.pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-20 text-right">
                    {q.limit ? `${q.used}/${q.limit}` : `${q.used}`}
                  </span>
                  <span className="text-muted-foreground w-12 text-right">{q.pct}%</span>
                  {q.tier && <Badge variant="outline" className="text-[10px]">{q.tier}</Badge>}
                </div>
              ))}
            </div>
          </Section>

          {/* Error Patterns */}
          {report.error_patterns.length > 0 && (
            <Section title={`Repeated Errors (${report.error_patterns.length})`} icon={<XCircle className="w-4 h-4 text-red-400" />}>
              <div className="space-y-1">
                {report.error_patterns.map((ep, i) => (
                  <div key={i} className="text-xs border-l-2 border-destructive/30 pl-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ep.endpoint}</span>
                      <Badge variant="secondary" className="text-[10px]">{ep.count}×</Badge>
                    </div>
                    {ep.error && <p className="text-muted-foreground truncate">{ep.error}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* HoldersIntel Twitter Metrics */}
          {report.holders_intel_metrics && (
            <Section title="@HoldersIntel Account" icon={<Twitter className="w-4 h-4 text-sky-400" />}>
              {(() => {
                const hi = report.holders_intel_metrics!;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="p-2 rounded-lg bg-muted/30 text-center">
                        <div className="text-lg font-bold">{hi.followers.total.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">Total Followers</div>
                      </div>
                      <div className="p-2 rounded-lg bg-sky-500/10 text-center">
                        <div className="text-lg font-bold text-sky-400">~{hi.followers.blue_check_premium.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">🔵 Verified (indexed)</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 text-center">
                        <div className="text-lg font-bold">{hi.followers.normal.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">👤 Normal Followers</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 text-center">
                        <div className="text-lg font-bold">~{hi.followers.blue_check_pct}%</div>
                        <div className="text-[10px] text-muted-foreground">Blue Check Ratio (est.)</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      <div className="text-xs"><span className="text-muted-foreground">Following:</span> <span className="font-medium">{hi.following}</span></div>
                      <div className="text-xs"><span className="text-muted-foreground">Ratio:</span> <span className="font-medium">{hi.follow_ratio}:1</span></div>
                      <div className="text-xs"><span className="text-muted-foreground">Tweets:</span> <span className="font-medium">{hi.tweets.toLocaleString()}</span></div>
                      <div className="text-xs"><span className="text-muted-foreground">Likes:</span> <span className="font-medium">{hi.likes.toLocaleString()}</span></div>
                      <div className="text-xs"><span className="text-muted-foreground">Listed:</span> <span className="font-medium">{hi.listed_count}</span></div>
                      <div className="text-xs"><span className="text-muted-foreground">Media:</span> <span className="font-medium">{hi.media_count}</span></div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Avg Likes/Tweet: <span className="font-medium text-foreground">{hi.avg_likes_per_tweet}</span></span>
                      <span>Verified: {hi.is_verified ? '✅' : '❌'}</span>
                      <span>Type: {hi.professional_type || 'N/A'}</span>
                      {hi.last_enriched_at && <span>Enriched: {format(new Date(hi.last_enriched_at), 'MMM d, h:mm a')}</span>}
                    </div>
                  </div>
                );
              })()}
            </Section>
          )}

          {/* External Services */}
          <Section title="External Services" icon={<Globe className="w-4 h-4 text-cyan-400" />}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(report.external_services_status).map(([svc, info]) => (
                <div key={svc} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30">
                  <StatusBadge status={info.status} />
                  <div>
                    <div className="font-medium">{svc}</div>
                    <div className="text-muted-foreground">{info.notes}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Table Health */}
          <Section title="Table Health" icon={<Database className="w-4 h-4 text-indigo-400" />} defaultOpen={false}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(report.table_health).map(([table, info]) => (
                <div key={table} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30">
                  <span className="font-mono">{table}</span>
                  <div className="flex items-center gap-1">
                    <span className={info.status !== 'ok' ? 'text-yellow-500 font-bold' : ''}>
                      {info.row_count >= 0 ? info.row_count.toLocaleString() : 'err'}
                    </span>
                    <StatusBadge status={info.status} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MorningReportTab() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');
  
  const { data: reports, isLoading } = useQuery({
    queryKey: ['morning-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('morning_reports')
        .select('*')
        .order('report_date', { ascending: false });
      if (error) throw error;
      return data as unknown as MorningReport[];
    },
  });

  const { data: archivedReports, isLoading: archiveLoading } = useQuery({
    queryKey: ['morning-reports-archive'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('morning_reports_archive' as any)
        .select('*')
        .order('report_date', { ascending: false });
      if (error) throw error;
      return data as unknown as (MorningReport & { archived_at: string })[];
    },
    enabled: viewMode === 'archive',
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('morning-report');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Morning report generated!');
      queryClient.invalidateQueries({ queryKey: ['morning-reports'] });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('archive_old_morning_reports' as any);
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`Archived ${count} old reports`);
      queryClient.invalidateQueries({ queryKey: ['morning-reports'] });
      queryClient.invalidateQueries({ queryKey: ['morning-reports-archive'] });
    },
    onError: (err) => toast.error(`Archive failed: ${err.message}`),
  });

  const displayReports = viewMode === 'active' ? reports : archivedReports;
  const [selectedReportId, setSelectedReportId] = useState<string>('');

  const groupedReports = useMemo(() => {
    if (!displayReports?.length) return {};
    const groups: Record<string, typeof displayReports> = {};
    displayReports.forEach(r => {
      const month = format(new Date(r.report_date + 'T00:00:00'), 'MMMM yyyy');
      if (!groups[month]) groups[month] = [];
      groups[month]!.push(r);
    });
    return groups;
  }, [displayReports]);

  const selectedReport = displayReports?.find(r => r.id === selectedReportId) || displayReports?.[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            ☀️ Morning Report
          </h2>
          <p className="text-sm text-muted-foreground">
            Daily system health digest — auto-generated at 9:00 AM ET · 30-day retention, then archived monthly
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            variant="ghost"
            size="sm"
            title="Archive reports older than 30 days"
          >
            <Archive className={`w-4 h-4 mr-1 ${archiveMutation.isPending ? 'animate-spin' : ''}`} />
            Archive Old
          </Button>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            Generate Now
          </Button>
        </div>
      </div>

      {/* View mode toggle + Calendar select */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setViewMode('active')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'active' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            <CalendarDays className="w-3 h-3 inline mr-1" />
            Active ({reports?.length || 0})
          </button>
          <button
            onClick={() => setViewMode('archive')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'archive' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            <Archive className="w-3 h-3 inline mr-1" />
            Archived ({archivedReports?.length || '…'})
          </button>
        </div>

        {displayReports && displayReports.length > 0 && (
          <Select
            value={selectedReport?.id || ''}
            onValueChange={(val) => setSelectedReportId(val)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a report date…">
                {selectedReport && (
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full inline-block ${
                      selectedReport.overall_status === 'healthy' ? 'bg-green-500' :
                      selectedReport.overall_status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                    {format(new Date(selectedReport.report_date + 'T00:00:00'), 'EEEE, MMM d, yyyy')}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(groupedReports).map(([month, reps]) => (
                <div key={month}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{month}</div>
                  {reps!.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full inline-block ${
                          r.overall_status === 'healthy' ? 'bg-green-500' :
                          r.overall_status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                        }`} />
                        {format(new Date(r.report_date + 'T00:00:00'), 'EEE, MMM d')}
                        <span className="text-muted-foreground text-[10px] ml-auto">
                          {r.new_signups} signups
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {(isLoading || (viewMode === 'archive' && archiveLoading)) && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {!isLoading && !selectedReport && viewMode === 'active' && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No morning reports yet. Generate your first one!</p>
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-1 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            Generate Morning Report
          </Button>
        </Card>
      )}

      {!archiveLoading && !displayReports?.length && viewMode === 'archive' && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No archived reports yet. Reports older than 30 days get archived automatically.</p>
        </Card>
      )}

      {selectedReport && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <StatusBadge status={selectedReport.overall_status} />
            <span className="text-sm text-muted-foreground">
              {format(new Date(selectedReport.report_period_start), 'MMM d, h:mm a')} → {format(new Date(selectedReport.report_period_end), 'h:mm a')}
            </span>
            {selectedReport.telegram_sent && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Bell className="w-3 h-3" /> TG sent {selectedReport.telegram_sent_at ? format(new Date(selectedReport.telegram_sent_at), 'h:mm a') : ''}
              </Badge>
            )}
            {viewMode === 'archive' && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Archive className="w-3 h-3" /> Archived
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              Generated in {selectedReport.execution_time_ms}ms
            </span>
          </div>
          <ReportView report={selectedReport} />
        </div>
      )}
    </div>
  );
}
