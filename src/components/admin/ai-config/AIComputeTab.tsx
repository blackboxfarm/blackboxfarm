import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, MessageSquare, Bot, Globe, DollarSign, Cpu, Clock, User, ChevronDown, ChevronUp } from "lucide-react";
import { format, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const PLATFORM_COLORS = { telegram: "#3B82F6", web: "#10B981" };

interface ComputeRow {
  id: string;
  platform: string;
  user_id: string | null;
  session_id: string | null;
  model: string;
  function_name: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  response_time_ms: number | null;
  cost_estimate_usd: number | null;
  created_at: string;
}

interface AccountComputeSummary {
  user_id: string;
  email: string;
  tg_calls: number;
  web_calls: number;
  total_tokens: number;
  total_cost: number;
  avg_response_ms: number;
  last_activity: string;
}

export function AIComputeTab() {
  const [days, setDays] = useState(7);
  const [chatModalUserId, setChatModalUserId] = useState<string | null>(null);
  const [chatModalPlatform, setChatModalPlatform] = useState<'telegram' | 'web'>('web');

  const { data: computeLogs, isLoading, refetch } = useQuery({
    queryKey: ['ai-compute-logs', days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('ai_compute_log')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ComputeRow[];
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ['ai-compute-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_emails_for_ids' as any, {
        user_ids: [] as string[]
      });
      return [];
    },
    enabled: false,
  });

  // Aggregations
  const stats = useMemo(() => {
    if (!computeLogs?.length) return null;
    const totalCost = computeLogs.reduce((s, r) => s + (r.cost_estimate_usd || 0), 0);
    const totalTokens = computeLogs.reduce((s, r) => s + (r.total_tokens || 0), 0);
    const avgResponseMs = Math.round(computeLogs.reduce((s, r) => s + (r.response_time_ms || 0), 0) / computeLogs.length);
    const tgLogs = computeLogs.filter(r => r.platform === 'telegram');
    const webLogs = computeLogs.filter(r => r.platform === 'web');

    // Daily breakdown
    const dailyMap: Record<string, { date: string; telegram: number; web: number; cost: number; tokens: number }> = {};
    computeLogs.forEach(r => {
      const day = format(new Date(r.created_at), 'MMM d');
      if (!dailyMap[day]) dailyMap[day] = { date: day, telegram: 0, web: 0, cost: 0, tokens: 0 };
      dailyMap[day][r.platform as 'telegram' | 'web']++;
      dailyMap[day].cost += r.cost_estimate_usd || 0;
      dailyMap[day].tokens += r.total_tokens || 0;
    });
    const dailyData = Object.values(dailyMap).reverse();

    // Per-account breakdown
    const accountMap: Record<string, { user_id: string; tg: number; web: number; tokens: number; cost: number; avgMs: number; msCount: number; last: string }> = {};
    computeLogs.forEach(r => {
      const uid = r.user_id || r.session_id || 'anonymous';
      if (!accountMap[uid]) accountMap[uid] = { user_id: uid, tg: 0, web: 0, tokens: 0, cost: 0, avgMs: 0, msCount: 0, last: r.created_at };
      accountMap[uid][r.platform === 'telegram' ? 'tg' : 'web']++;
      accountMap[uid].tokens += r.total_tokens || 0;
      accountMap[uid].cost += r.cost_estimate_usd || 0;
      if (r.response_time_ms) { accountMap[uid].avgMs += r.response_time_ms; accountMap[uid].msCount++; }
      if (r.created_at > accountMap[uid].last) accountMap[uid].last = r.created_at;
    });
    const accountData = Object.values(accountMap)
      .map(a => ({ ...a, avgMs: a.msCount ? Math.round(a.avgMs / a.msCount) : 0 }))
      .sort((a, b) => b.cost - a.cost);

    // Model breakdown
    const modelMap: Record<string, { model: string; calls: number; tokens: number; cost: number }> = {};
    computeLogs.forEach(r => {
      if (!modelMap[r.model]) modelMap[r.model] = { model: r.model, calls: 0, tokens: 0, cost: 0 };
      modelMap[r.model].calls++;
      modelMap[r.model].tokens += r.total_tokens || 0;
      modelMap[r.model].cost += r.cost_estimate_usd || 0;
    });

    // Function (edge function) breakdown — the real "who ate the credits" view
    const fnMap: Record<string, { function_name: string; calls: number; tokens: number; cost: number; avgMs: number; msCount: number }> = {};
    computeLogs.forEach(r => {
      const k = r.function_name || '(unattributed)';
      if (!fnMap[k]) fnMap[k] = { function_name: k, calls: 0, tokens: 0, cost: 0, avgMs: 0, msCount: 0 };
      fnMap[k].calls++;
      fnMap[k].tokens += r.total_tokens || 0;
      fnMap[k].cost += r.cost_estimate_usd || 0;
      if (r.response_time_ms) { fnMap[k].avgMs += r.response_time_ms; fnMap[k].msCount++; }
    });
    const functionData = Object.values(fnMap)
      .map(f => ({ ...f, avgMs: f.msCount ? Math.round(f.avgMs / f.msCount) : 0 }))
      .sort((a, b) => b.cost - a.cost);

    return {
      totalCost, totalTokens, avgResponseMs,
      totalCalls: computeLogs.length,
      tgCalls: tgLogs.length, webCalls: webLogs.length,
      tgCost: tgLogs.reduce((s, r) => s + (r.cost_estimate_usd || 0), 0),
      webCost: webLogs.reduce((s, r) => s + (r.cost_estimate_usd || 0), 0),
      dailyData, accountData,
      modelData: Object.values(modelMap).sort((a, b) => b.calls - a.calls),
      functionData,
      platformPie: [
        { name: 'Telegram', value: tgLogs.length, cost: tgLogs.reduce((s, r) => s + (r.cost_estimate_usd || 0), 0) },
        { name: 'Web', value: webLogs.length, cost: webLogs.reduce((s, r) => s + (r.cost_estimate_usd || 0), 0) },
      ],
    };
  }, [computeLogs]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {[7, 14, 30].map(d => (
            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading && !stats && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {stats && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><Cpu className="w-3 h-3" /> Total Calls</div>
              <div className="text-xl font-bold">{stats.totalCalls.toLocaleString()}</div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><DollarSign className="w-3 h-3" /> Total Cost</div>
              <div className="text-xl font-bold text-green-400">${stats.totalCost.toFixed(4)}</div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><Bot className="w-3 h-3" /> Telegram</div>
              <div className="text-xl font-bold text-blue-400">{stats.tgCalls}</div>
              <div className="text-[10px] text-muted-foreground">${stats.tgCost.toFixed(4)}</div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="w-3 h-3" /> Web</div>
              <div className="text-xl font-bold text-emerald-400">{stats.webCalls}</div>
              <div className="text-[10px] text-muted-foreground">${stats.webCost.toFixed(4)}</div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="w-3 h-3" /> Tokens</div>
              <div className="text-xl font-bold">{(stats.totalTokens / 1000).toFixed(1)}k</div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" /> Avg Response</div>
              <div className="text-xl font-bold">{stats.avgResponseMs}ms</div>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily calls chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Daily AI Calls by Platform</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Legend />
                    <Bar dataKey="telegram" fill={PLATFORM_COLORS.telegram} name="Telegram" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="web" fill={PLATFORM_COLORS.web} name="Web" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Platform pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Platform Split</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={stats.platformPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      <Cell fill={PLATFORM_COLORS.telegram} />
                      <Cell fill={PLATFORM_COLORS.web} />
                    </Pie>
                    <Tooltip formatter={(val: number, name: string, entry: any) => [`${val} calls ($${entry.payload.cost.toFixed(4)})`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Cost trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Daily Cost Trend ($USD)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v.toFixed(3)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} />
                  <Line type="monotone" dataKey="cost" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Function (edge function) breakdown — the real ledger */}
          <Card className="border-amber-500/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" /> AI Spend by Function ({stats.functionData.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-card z-10">
                      <TableHead>Function</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Avg ms</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.functionData.map(f => (
                      <TableRow key={f.function_name}>
                        <TableCell className="font-mono text-xs">{f.function_name}</TableCell>
                        <TableCell className="text-right">{f.calls.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{(f.tokens / 1000).toFixed(1)}k</TableCell>
                        <TableCell className="text-right text-muted-foreground">{f.avgMs}</TableCell>
                        <TableCell className="text-right text-green-400 font-semibold">${f.cost.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Model breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Model Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.modelData.map(m => (
                    <TableRow key={m.model}>
                      <TableCell className="font-mono text-xs">{m.model}</TableCell>
                      <TableCell className="text-right">{m.calls}</TableCell>
                      <TableCell className="text-right">{(m.tokens / 1000).toFixed(1)}k</TableCell>
                      <TableCell className="text-right text-green-400">${m.cost.toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Per-Account Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="w-4 h-4" /> AI Compute by Account ({stats.accountData.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-card z-10">
                      <TableHead>Account</TableHead>
                      <TableHead className="text-center">TG</TableHead>
                      <TableHead className="text-center">Web</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Avg ms</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.accountData.map(a => (
                      <TableRow key={a.user_id}>
                        <TableCell className="font-mono text-xs max-w-[140px] truncate" title={a.user_id}>
                          {a.user_id.slice(0, 12)}…
                        </TableCell>
                        <TableCell className="text-center">
                          {a.tg > 0 ? <Badge variant="outline" className="text-[10px] text-blue-400">{a.tg}</Badge> : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {a.web > 0 ? <Badge variant="outline" className="text-[10px] text-emerald-400">{a.web}</Badge> : '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs">{(a.tokens / 1000).toFixed(1)}k</TableCell>
                        <TableCell className="text-right text-xs text-green-400">${a.cost.toFixed(4)}</TableCell>
                        <TableCell className="text-right text-xs">{a.avgMs}ms</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(a.last), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {a.tg > 0 && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="View TG chats"
                                onClick={() => { setChatModalUserId(a.user_id); setChatModalPlatform('telegram'); }}>
                                <Bot className="w-3 h-3 text-blue-400" />
                              </Button>
                            )}
                            {a.web > 0 && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="View web chats"
                                onClick={() => { setChatModalUserId(a.user_id); setChatModalPlatform('web'); }}>
                                <Globe className="w-3 h-3 text-emerald-400" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!isLoading && !stats && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No AI compute logs found for the last {days} days.</p>
        </Card>
      )}

      {/* Chat History Modal */}
      <ChatHistoryModal
        userId={chatModalUserId}
        platform={chatModalPlatform}
        onClose={() => setChatModalUserId(null)}
      />
    </div>
  );
}

function ChatHistoryModal({ userId, platform, onClose }: { userId: string | null; platform: 'telegram' | 'web'; onClose: () => void }) {
  const { data: webChats } = useQuery({
    queryKey: ['chat-modal-web', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('web_chat_sessions')
        .select('*')
        .eq('user_id', userId!)
        .order('last_message_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!userId && platform === 'web',
  });

  const { data: tgChats } = useQuery({
    queryKey: ['chat-modal-tg', userId],
    queryFn: async () => {
      // Look up telegram_user_id from ai_user_memory
      const { data: memory } = await supabase
        .from('ai_user_memory')
        .select('telegram_user_id')
        .eq('user_id', userId!)
        .maybeSingle();
      
      if (!memory?.telegram_user_id) return [];
      
      const { data } = await supabase
        .from('telegram_group_messages')
        .select('*')
        .eq('telegram_user_id', memory.telegram_user_id)
        .eq('chat_type', 'private')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!userId && platform === 'telegram',
  });

  const messages = platform === 'web' ? webChats : tgChats;

  return (
    <Dialog open={!!userId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {platform === 'telegram' ? <Bot className="w-4 h-4 text-blue-400" /> : <Globe className="w-4 h-4 text-emerald-400" />}
            {platform === 'telegram' ? 'Telegram' : 'Web'} Chat History
            <span className="text-xs text-muted-foreground font-mono ml-2">{userId?.slice(0, 12)}…</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-4">
          {platform === 'web' && webChats?.map((session: any) => (
            <div key={session.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{format(new Date(session.last_message_at), 'MMM d, HH:mm')}</span>
                <Badge variant="outline" className="text-[10px]">{session.message_count} msgs</Badge>
                <span>{session.page_path}</span>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {(Array.isArray(session.messages) ? session.messages : [])
                  .filter((m: any) => m.role !== 'system')
                  .map((msg: any, i: number) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                        msg.role === 'user' ? 'bg-primary/20' : 'bg-muted'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {platform === 'telegram' && tgChats?.map((msg: any) => (
            <div key={msg.id} className={`flex ${msg.is_bot_reply ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                msg.is_bot_reply ? 'bg-muted' : 'bg-primary/20'
              }`}>
                <div className="text-[10px] text-muted-foreground mb-0.5">
                  {msg.is_bot_reply ? '🤖' : `👤 ${msg.username || msg.display_name || 'User'}`} · {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                </div>
                {msg.message_text}
              </div>
            </div>
          ))}
          {(!messages || messages.length === 0) && (
            <p className="text-center text-muted-foreground text-sm py-4">No chat history found for this account on {platform}.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AIComputeTab;
