import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, AlertTriangle, Lock, Unlock, MessageSquare, Globe, Smartphone, RefreshCw } from "lucide-react";
import { format } from "date-fns";

// ── Unified Security Event Timeline ──
function SecurityTimeline() {
  const [searchUser, setSearchUser] = useState("");

  const { data: auditLogs, isLoading: auditLoading, refetch: refetchAudit } = useQuery({
    queryKey: ["security-audit-logs", searchUser],
    queryFn: async () => {
      let q = supabase
        .from("security_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (searchUser.trim()) {
        q = q.eq("user_id", searchUser.trim());
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const eventEmoji: Record<string, string> = {
    INSERT: "➕", UPDATE: "✏️", DELETE: "🗑️",
    "2FA_ENABLED": "🔐", "2FA_DISABLED": "⚠️",
    LOGIN_ANOMALY: "🚨", PASSWORD_CHANGE: "🔑",
    EMAIL_CHANGE: "📧", PHONE_CHANGE: "📱",
    SESSION_KILL: "💀", LOCKDOWN: "🔒",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              Security Event Timeline
            </CardTitle>
            <CardDescription>All security-related changes across all users</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchAudit()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
        <Input
          placeholder="Filter by user ID..."
          value={searchUser}
          onChange={(e) => setSearchUser(e.target.value)}
          className="max-w-sm mt-2"
        />
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          {auditLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : !auditLogs?.length ? (
            <p className="text-muted-foreground text-sm">No audit events found.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-accent/10 transition-colors">
                  <span className="text-xl mt-0.5">{eventEmoji[log.event_type] || "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{log.event_type}</Badge>
                      {log.table_name && (
                        <Badge variant="secondary" className="text-xs">{log.table_name}</Badge>
                      )}
                      {log.ip_address && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Globe className="h-3 w-3" /> {String(log.ip_address)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      User: {log.user_id ? `${String(log.user_id).slice(0, 8)}...` : "system"}
                    </p>
                    {log.details && (
                      <pre className="text-xs text-muted-foreground mt-1 max-w-full overflow-x-auto">
                        {typeof log.details === 'object' ? JSON.stringify(log.details, null, 1) : String(log.details)}
                      </pre>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {log.created_at ? format(new Date(log.created_at), "MMM dd HH:mm:ss") : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── SMS Alert Conversations ──
function SmsAlertConversations() {
  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ["security-sms-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_sms_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const statusColor: Record<string, string> = {
    sent: "bg-blue-500/20 text-blue-400",
    responded: "bg-green-500/20 text-green-400",
    expired: "bg-muted text-muted-foreground",
    pending: "bg-amber-500/20 text-amber-400",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              SMS Alert Conversations
            </CardTitle>
            <CardDescription>Interactive Y/N security SMS exchanges</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : !alerts?.length ? (
            <p className="text-muted-foreground text-sm">No SMS alerts sent yet.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert: any) => (
                <div key={alert.id} className="p-4 rounded-lg border border-border/50 bg-card/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-mono">{alert.phone_number?.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") || "hidden"}</span>
                      <Badge variant="outline" className="text-xs">{alert.alert_type}</Badge>
                      <Badge className={`text-xs ${statusColor[alert.status] || ""}`}>{alert.status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {alert.created_at ? format(new Date(alert.created_at), "MMM dd HH:mm") : "—"}
                    </span>
                  </div>

                  {/* Outbound message */}
                  <div className="ml-6 mb-2 p-2 rounded bg-blue-500/10 border-l-2 border-blue-500">
                    <p className="text-xs text-blue-300">📤 Sent:</p>
                    <p className="text-sm">{alert.message_body}</p>
                  </div>

                  {/* User response */}
                  {alert.user_response ? (
                    <div className="ml-6 p-2 rounded bg-green-500/10 border-l-2 border-green-500">
                      <p className="text-xs text-green-300">📥 Response: <strong>{alert.user_response}</strong></p>
                      {alert.response_action && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Action: {alert.response_action} {alert.action_executed_at ? `@ ${format(new Date(alert.action_executed_at), "HH:mm:ss")}` : ""}
                        </p>
                      )}
                      {alert.responded_at && (
                        <p className="text-xs text-muted-foreground">
                          Response time: {Math.round((new Date(alert.responded_at).getTime() - new Date(alert.created_at).getTime()) / 1000)}s
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="ml-6 p-2 rounded bg-muted/30 border-l-2 border-muted">
                      <p className="text-xs text-muted-foreground">⏳ Awaiting response... Expected: [{(alert.expected_responses || []).join(", ")}]</p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    User: {alert.user_id ? `${alert.user_id.slice(0, 8)}...` : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Login Anomaly Monitor ──
function LoginAnomalyMonitor() {
  const { data: logins, isLoading, refetch } = useQuery({
    queryKey: ["login-history-anomalies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("login_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Login History & Anomalies
            </CardTitle>
            <CardDescription>All logins with suspicion flags</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : !logins?.length ? (
            <p className="text-muted-foreground text-sm">No login history yet.</p>
          ) : (
            <div className="space-y-2">
              {logins.map((login: any) => (
                <div
                  key={login.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    login.is_suspicious
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-border/50 bg-card/50"
                  }`}
                >
                  <span className="text-xl mt-0.5">{login.is_suspicious ? "🚨" : "✅"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {login.country && (
                        <Badge variant="outline" className="text-xs">
                          <Globe className="h-3 w-3 mr-1" /> {login.country}{login.city ? `, ${login.city}` : ""}
                        </Badge>
                      )}
                      {login.login_method && (
                        <Badge variant="secondary" className="text-xs">{login.login_method}</Badge>
                      )}
                      {login.is_suspicious && (
                        <Badge variant="destructive" className="text-xs">SUSPICIOUS</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      User: {login.user_id?.slice(0, 8)}... | IP: {login.ip_address || "—"}
                    </p>
                    {login.suspicion_reasons?.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {login.suspicion_reasons.map((r: string, i: number) => (
                          <Badge key={i} variant="destructive" className="text-xs">{r}</Badge>
                        ))}
                      </div>
                    )}
                    {login.device_fingerprint && (
                      <p className="text-xs text-muted-foreground mt-1">
                        FP: {login.device_fingerprint.slice(0, 12)}...
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {login.created_at ? format(new Date(login.created_at), "MMM dd HH:mm") : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Account Lockdown Status ──
function AccountLockdownPanel() {
  const { data: lockdowns, isLoading, refetch } = useQuery({
    queryKey: ["account-lockdowns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_lockdowns")
        .select("*")
        .order("locked_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-orange-500" />
              Account Lockdowns
            </CardTitle>
            <CardDescription>Active and historical account locks</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : !lockdowns?.length ? (
            <p className="text-muted-foreground text-sm">No lockdowns recorded.</p>
          ) : (
            <div className="space-y-2">
              {lockdowns.map((ld: any) => (
                <div
                  key={ld.id}
                  className={`p-3 rounded-lg border ${
                    ld.is_locked
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-green-500/30 bg-green-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {ld.is_locked ? (
                        <Lock className="h-4 w-4 text-red-500" />
                      ) : (
                        <Unlock className="h-4 w-4 text-green-500" />
                      )}
                      <Badge variant={ld.is_locked ? "destructive" : "default"} className="text-xs">
                        {ld.is_locked ? "LOCKED" : "UNLOCKED"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {ld.locked_at ? format(new Date(ld.locked_at), "MMM dd HH:mm") : "—"}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{ld.locked_reason}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    User: {ld.user_id?.slice(0, 8)}...
                  </p>
                  {ld.unlocked_at && (
                    <p className="text-xs text-green-400 mt-1">
                      Unlocked: {format(new Date(ld.unlocked_at), "MMM dd HH:mm")} via {ld.unlock_method || "manual"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Stats Summary Cards ──
function SecurityStats() {
  const { data: stats } = useQuery({
    queryKey: ["security-stats-summary"],
    queryFn: async () => {
      const [smsRes, loginRes, lockRes, auditRes] = await Promise.all([
        supabase.from("security_sms_alerts").select("id", { count: "exact", head: true }),
        supabase.from("login_history").select("id", { count: "exact", head: true }).eq("is_suspicious", true),
        supabase.from("account_lockdowns").select("id", { count: "exact", head: true }).eq("is_locked", true),
        supabase.from("security_audit_log").select("id", { count: "exact", head: true }),
      ]);
      return {
        totalSms: smsRes.count || 0,
        suspiciousLogins: loginRes.count || 0,
        activeLockdowns: lockRes.count || 0,
        totalAuditEvents: auditRes.count || 0,
      };
    },
  });

  const cards = [
    { label: "SMS Alerts Sent", value: stats?.totalSms || 0, icon: MessageSquare, color: "text-blue-500" },
    { label: "Suspicious Logins", value: stats?.suspiciousLogins || 0, icon: AlertTriangle, color: "text-red-500" },
    { label: "Active Lockdowns", value: stats?.activeLockdowns || 0, icon: Lock, color: "text-orange-500" },
    { label: "Audit Events", value: stats?.totalAuditEvents || 0, icon: Shield, color: "text-amber-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3 text-center">
            <c.icon className={`h-6 w-6 mx-auto mb-1 ${c.color}`} />
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main Dashboard ──
export function SecurityActivityDashboard() {
  return (
    <div className="space-y-6">
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-orange-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            🛡️ Security Activity Center
          </CardTitle>
          <CardDescription>
            Unified view of all security events: SMS alerts, login anomalies, auth changes, account lockdowns.
          </CardDescription>
        </CardHeader>
      </Card>

      <SecurityStats />

      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="timeline" className="data-[state=active]:bg-amber-500/20">
            📋 Event Timeline
          </TabsTrigger>
          <TabsTrigger value="sms" className="data-[state=active]:bg-blue-500/20">
            📱 SMS Conversations
          </TabsTrigger>
          <TabsTrigger value="logins" className="data-[state=active]:bg-red-500/20">
            🔐 Login Anomalies
          </TabsTrigger>
          <TabsTrigger value="lockdowns" className="data-[state=active]:bg-orange-500/20">
            🔒 Lockdowns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <SecurityTimeline />
        </TabsContent>
        <TabsContent value="sms">
          <SmsAlertConversations />
        </TabsContent>
        <TabsContent value="logins">
          <LoginAnomalyMonitor />
        </TabsContent>
        <TabsContent value="lockdowns">
          <AccountLockdownPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SecurityActivityDashboard;
