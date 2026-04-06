import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, UserPlus, UserMinus, Bot, Users, Shield, MessageSquare } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

interface ChannelMember {
  id: string;
  chat_id: number;
  chat_title: string | null;
  telegram_user_id: string;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  event_type: string;
  invited_by_user_id: string | null;
  is_bot_account: boolean;
  created_at: string;
}

interface WelcomeConfig {
  id: string;
  chat_id: number;
  chat_title: string | null;
  is_enabled: boolean;
  welcome_message: string;
  suspend_until: string | null;
}

export function ChannelMembersDashboard() {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [welcomeConfig, setWelcomeConfig] = useState<WelcomeConfig | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [suspendHours, setSuspendHours] = useState("4");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "real" | "bot">("all");

  const [stats, setStats] = useState({
    totalJoins: 0, totalLeaves: 0, realUsers: 0, botAccounts: 0, netGrowth: 0,
    joinsToday: 0, leavesToday: 0,
  });

  const load = async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [memRes, joinCountRes, leaveCountRes, realCountRes, botCountRes, joinsTodayRes, leavesTodayRes, configRes] = await Promise.all([
      supabase.from("telegram_channel_members").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).eq("event_type", "joined"),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).eq("event_type", "left"),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).eq("event_type", "joined").eq("is_bot_account", false),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).eq("is_bot_account", true),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).eq("event_type", "joined").gte("created_at", todayISO),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).eq("event_type", "left").gte("created_at", todayISO),
      supabase.from("telegram_channel_welcome_config").select("*").limit(1).maybeSingle(),
    ]);

    if (memRes.data) setMembers(memRes.data as ChannelMember[]);
    if (configRes.data) {
      setWelcomeConfig(configRes.data as WelcomeConfig);
      setEditMessage((configRes.data as WelcomeConfig).welcome_message);
    }

    const joins = joinCountRes.count ?? 0;
    const leaves = leaveCountRes.count ?? 0;
    setStats({
      totalJoins: joins,
      totalLeaves: leaves,
      realUsers: realCountRes.count ?? 0,
      botAccounts: botCountRes.count ?? 0,
      netGrowth: joins - leaves,
      joinsToday: joinsTodayRes.count ?? 0,
      leavesToday: leavesTodayRes.count ?? 0,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleWelcome = async (enabled: boolean) => {
    if (!welcomeConfig) return;
    setSaving(true);
    await supabase.from("telegram_channel_welcome_config")
      .update({ is_enabled: enabled })
      .eq("id", welcomeConfig.id);
    setWelcomeConfig({ ...welcomeConfig, is_enabled: enabled });
    toast.success(enabled ? "Welcome messages enabled" : "Welcome messages disabled");
    setSaving(false);
  };

  const saveMessage = async () => {
    if (!welcomeConfig) return;
    setSaving(true);
    await supabase.from("telegram_channel_welcome_config")
      .update({ welcome_message: editMessage })
      .eq("id", welcomeConfig.id);
    setWelcomeConfig({ ...welcomeConfig, welcome_message: editMessage });
    toast.success("Welcome message saved");
    setSaving(false);
  };

  const suspendWelcome = async () => {
    if (!welcomeConfig) return;
    setSaving(true);
    const until = new Date(Date.now() + parseInt(suspendHours) * 3600000).toISOString();
    await supabase.from("telegram_channel_welcome_config")
      .update({ suspend_until: until })
      .eq("id", welcomeConfig.id);
    setWelcomeConfig({ ...welcomeConfig, suspend_until: until });
    toast.success(`Welcome messages suspended for ${suspendHours} hours`);
    setSaving(false);
  };

  const resumeWelcome = async () => {
    if (!welcomeConfig) return;
    setSaving(true);
    await supabase.from("telegram_channel_welcome_config")
      .update({ suspend_until: null })
      .eq("id", welcomeConfig.id);
    setWelcomeConfig({ ...welcomeConfig, suspend_until: null });
    toast.success("Welcome messages resumed");
    setSaving(false);
  };

  const initConfig = async (chatId: number, chatTitle: string | null) => {
    setSaving(true);
    const { data } = await supabase.from("telegram_channel_welcome_config").insert({
      chat_id: chatId,
      chat_title: chatTitle,
      is_enabled: true,
    }).select().single();
    if (data) {
      setWelcomeConfig(data as WelcomeConfig);
      setEditMessage((data as WelcomeConfig).welcome_message);
    }
    toast.success("Welcome config initialized");
    setSaving(false);
  };

  const filteredMembers = members.filter(m => {
    if (filter === "real") return !m.is_bot_account;
    if (filter === "bot") return m.is_bot_account;
    return true;
  });

  const isSuspended = welcomeConfig?.suspend_until && new Date(welcomeConfig.suspend_until) > new Date();
  const uniqueChatId = members.length > 0 ? members[0].chat_id : null;
  const uniqueChatTitle = members.length > 0 ? members[0].chat_title : null;

  const eventBadge = (event: string, isBot: boolean) => {
    const botIcon = isBot ? <Bot className="h-3 w-3 text-muted-foreground" /> : null;
    if (event === "joined") return <Badge className="text-[10px] gap-1"><UserPlus className="h-3 w-3" /> Joined {botIcon}</Badge>;
    if (event === "left") return <Badge variant="secondary" className="text-[10px] gap-1"><UserMinus className="h-3 w-3" /> Left {botIcon}</Badge>;
    if (event === "kicked") return <Badge variant="destructive" className="text-[10px]">Kicked</Badge>;
    if (event === "banned") return <Badge variant="destructive" className="text-[10px]">Banned</Badge>;
    return <Badge variant="outline" className="text-[10px]">{event}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
        {[
          { label: "Total Joins", value: stats.totalJoins, color: "" },
          { label: "Total Leaves", value: stats.totalLeaves, color: "text-red-500" },
          { label: "Net Growth", value: stats.netGrowth, color: "text-green-500" },
          { label: "Real Users", value: stats.realUsers, color: "text-blue-500" },
          { label: "Bot Accounts", value: stats.botAccounts, color: "text-muted-foreground" },
          { label: "Joins Today", value: stats.joinsToday, color: "text-green-500" },
          { label: "Leaves Today", value: stats.leavesToday, color: "text-red-500" },
        ].map(s => (
          <div key={s.label} className="rounded-md border p-2 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Welcome Message Config */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Welcome Message Config
            </CardTitle>
            {!welcomeConfig && uniqueChatId && (
              <Button size="sm" onClick={() => initConfig(uniqueChatId, uniqueChatTitle)} disabled={saving}>
                Initialize Config
              </Button>
            )}
          </div>
        </CardHeader>
        {welcomeConfig && (
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={welcomeConfig.is_enabled} onCheckedChange={toggleWelcome} disabled={saving} />
                <span className="text-sm">{welcomeConfig.is_enabled ? "Enabled" : "Disabled"}</span>
              </div>
              {isSuspended && (
                <Badge variant="secondary" className="text-xs">
                  Suspended until {format(new Date(welcomeConfig.suspend_until!), "MMM d, h:mm a")}
                </Badge>
              )}
            </div>
            <Textarea value={editMessage} onChange={e => setEditMessage(e.target.value)} rows={4} className="text-xs font-mono" placeholder="Welcome message... use {name} for user's first name" />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={saveMessage} disabled={saving}>Save Message</Button>
              <div className="flex items-center gap-1 ml-auto">
                <Input type="number" value={suspendHours} onChange={e => setSuspendHours(e.target.value)} className="w-16 h-8 text-xs" min="1" />
                <span className="text-xs text-muted-foreground">hrs</span>
                {isSuspended ? (
                  <Button size="sm" variant="outline" onClick={resumeWelcome} disabled={saving}>Resume</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={suspendWelcome} disabled={saving}>
                    <Shield className="h-3 w-3 mr-1" /> Suspend
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Member Events Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Channel Member Events
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border overflow-hidden">
                {(["all", "real", "bot"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-2 py-1 text-xs capitalize ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    {f}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Event</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Channel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No member events</TableCell></TableRow>
                ) : filteredMembers.map(m => (
                  <TableRow key={m.id} className={m.is_bot_account ? "opacity-50" : ""}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(m.created_at), "MMM d, yyyy")}
                      <span className="text-muted-foreground ml-1">
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {m.telegram_username ? `@${m.telegram_username}` : m.first_name || m.telegram_user_id}
                    </TableCell>
                    <TableCell className="text-xs">{eventBadge(m.event_type, m.is_bot_account)}</TableCell>
                    <TableCell className="text-xs">
                      {m.is_bot_account ? (
                        <Badge variant="outline" className="text-[10px]"><Bot className="h-3 w-3 mr-1" />Bot</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-green-600">Real</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{m.chat_title || String(m.chat_id)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}