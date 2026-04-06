import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, UserPlus, UserMinus, Bot, Users, ExternalLink, Mail } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface LinkedProfile {
  id: string;
  display_name: string | null;
  oauth_provider: string | null;
  oauth_username: string | null;
  email?: string;
}

interface BotInteraction {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  first_name: string | null;
  command: string | null;
  token_mint: string | null;
  chat_type: string;
  response_status: string;
  linked_user_id: string | null;
  is_new_user: boolean;
  created_at: string;
}

interface ChannelMember {
  id: string;
  chat_id: number;
  chat_title: string | null;
  telegram_user_id: string;
  telegram_username: string | null;
  first_name: string | null;
  event_type: string;
  invited_by_user_id: string | null;
  created_at: string;
}

export function TelegramInteractionsPanel() {
  const [interactions, setInteractions] = useState<BotInteraction[]>([]);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("bot");

  const [linkedProfiles, setLinkedProfiles] = useState<Map<string, LinkedProfile>>(new Map());

  const [stats, setStats] = useState({
    totalToday: 0, uniqueUsers: 0, newUsers: 0, joinsToday: 0, leavesToday: 0,
  });

  const load = async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [intRes, memRes, statsRes, newRes, joinsRes, leavesRes] = await Promise.all([
      supabase.from("telegram_bot_interactions").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("telegram_channel_members").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("telegram_bot_interactions").select("id", { count: "exact", head: true }).gte("created_at", todayISO),
      supabase.from("telegram_bot_interactions").select("id", { count: "exact", head: true }).gte("created_at", todayISO).eq("is_new_user", true),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).gte("created_at", todayISO).eq("event_type", "joined"),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).gte("created_at", todayISO).eq("event_type", "left"),
    ]);

    if (intRes.data) {
      setInteractions(intRes.data as BotInteraction[]);
      
      // Fetch linked profiles for users with linked_user_id
      const linkedIds = [...new Set(intRes.data.filter(i => i.linked_user_id).map(i => i.linked_user_id))];
      if (linkedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, oauth_provider, oauth_username")
          .in("id", linkedIds);
        const map = new Map<string, LinkedProfile>();
        if (profiles) {
          for (const p of profiles) {
            map.set(p.id, p as LinkedProfile);
          }
        }
        setLinkedProfiles(map);
      }
    }
    if (memRes.data) setMembers(memRes.data as ChannelMember[]);

    setStats({
      totalToday: statsRes.count ?? 0,
      uniqueUsers: 0,
      newUsers: newRes.count ?? 0,
      joinsToday: joinsRes.count ?? 0,
      leavesToday: leavesRes.count ?? 0,
    });

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const statusBadge = (status: string) => {
    if (status === "success") return <Badge className="text-[10px]">✓</Badge>;
    if (status === "rate_limited") return <Badge variant="secondary" className="text-[10px]">Rate Limited</Badge>;
    if (status === "error") return <Badge variant="destructive" className="text-[10px]">Error</Badge>;
    return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  };

  const eventBadge = (event: string) => {
    if (event === "joined") return <Badge className="text-[10px] gap-1"><UserPlus className="h-3 w-3" /> Joined</Badge>;
    if (event === "left") return <Badge variant="secondary" className="text-[10px] gap-1"><UserMinus className="h-3 w-3" /> Left</Badge>;
    if (event === "kicked") return <Badge variant="destructive" className="text-[10px]">Kicked</Badge>;
    if (event === "banned") return <Badge variant="destructive" className="text-[10px]">Banned</Badge>;
    return <Badge variant="outline" className="text-[10px]">{event}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" /> Telegram Interactions & Members
          </CardTitle>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div className="rounded-md border p-2 text-center">
            <p className="text-xs text-muted-foreground">Commands Today</p>
            <p className="text-lg font-bold">{stats.totalToday}</p>
          </div>
          <div className="rounded-md border p-2 text-center">
            <p className="text-xs text-muted-foreground">Unique Users</p>
            <p className="text-lg font-bold">{stats.uniqueUsers}</p>
          </div>
          <div className="rounded-md border p-2 text-center">
            <p className="text-xs text-muted-foreground">New Users</p>
            <p className="text-lg font-bold text-green-500">{stats.newUsers}</p>
          </div>
          <div className="rounded-md border p-2 text-center">
            <p className="text-xs text-muted-foreground">Joins Today</p>
            <p className="text-lg font-bold text-green-500">{stats.joinsToday}</p>
          </div>
          <div className="rounded-md border p-2 text-center">
            <p className="text-xs text-muted-foreground">Leaves Today</p>
            <p className="text-lg font-bold text-red-500">{stats.leavesToday}</p>
          </div>
        </div>

        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList>
            <TabsTrigger value="bot"><Bot className="h-3 w-3 mr-1" /> Bot Interactions</TabsTrigger>
            <TabsTrigger value="members"><Users className="h-3 w-3 mr-1" /> Channel Members</TabsTrigger>
          </TabsList>

          <TabsContent value="bot">
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact>Time</TableHead>
                    <TableHead compact>User</TableHead>
                    <TableHead compact>Command</TableHead>
                    <TableHead compact>Token</TableHead>
                    <TableHead compact>Chat</TableHead>
                    <TableHead compact>Status</TableHead>
                    <TableHead compact>Linked</TableHead>
                    <TableHead compact>New</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interactions.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No interactions recorded yet</TableCell></TableRow>
                  ) : interactions.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell compact className="whitespace-nowrap">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</TableCell>
                      <TableCell compact>{i.telegram_username ? `@${i.telegram_username}` : i.first_name || i.telegram_user_id}</TableCell>
                      <TableCell compact className="font-mono text-xs">{i.command || '—'}</TableCell>
                      <TableCell compact className="font-mono text-xs max-w-[80px] truncate">{i.token_mint ? `${i.token_mint.slice(0, 6)}…` : '—'}</TableCell>
                      <TableCell compact><Badge variant="outline" className="text-[10px]">{i.chat_type}</Badge></TableCell>
                      <TableCell compact>{statusBadge(i.response_status)}</TableCell>
                      <TableCell compact>{i.linked_user_id ? '✅' : '—'}</TableCell>
                      <TableCell compact>{i.is_new_user ? <Badge className="text-[10px] bg-green-600">NEW</Badge> : ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="members">
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact>Time</TableHead>
                    <TableHead compact>Channel</TableHead>
                    <TableHead compact>User</TableHead>
                    <TableHead compact>Event</TableHead>
                    <TableHead compact>Invited By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No member events recorded yet — hit Repair Webhook above to enable</TableCell></TableRow>
                  ) : members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell compact className="whitespace-nowrap">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</TableCell>
                      <TableCell compact>{m.chat_title || String(m.chat_id)}</TableCell>
                      <TableCell compact>{m.telegram_username ? `@${m.telegram_username}` : m.first_name || m.telegram_user_id}</TableCell>
                      <TableCell compact>{eventBadge(m.event_type)}</TableCell>
                      <TableCell compact>{m.invited_by_user_id || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
