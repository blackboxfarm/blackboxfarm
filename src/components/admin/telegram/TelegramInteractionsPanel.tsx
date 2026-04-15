import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, UserPlus, UserMinus, Bot, Users, ExternalLink, UserCheck, History } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface LinkedProfile {
  id: string;
  display_name: string | null;
  oauth_provider: string | null;
  oauth_username: string | null;
  email?: string;
}

interface TelegramUser {
  telegram_user_id: string;
  telegram_username: string | null;
  first_name: string | null;
  first_seen: string;
  last_seen: string;
  total_interactions: number;
  linked_user_id: string | null;
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
  const [tgUsers, setTgUsers] = useState<TelegramUser[]>([]);
  const [interactions, setInteractions] = useState<BotInteraction[]>([]);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("users");

  const [linkedProfiles, setLinkedProfiles] = useState<Map<string, LinkedProfile>>(new Map());

  const [stats, setStats] = useState({
    totalToday: 0, totalUsers: 0, registeredUsers: 0, joinsToday: 0, leavesToday: 0,
  });

  const load = async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Fetch recent interactions for display + separate count queries for accurate stats
    const [intRes, memRes, statsRes, joinsRes, leavesRes, totalUsersRes, registeredUsersRes] = await Promise.all([
      supabase.from("telegram_bot_interactions").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("telegram_channel_members").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("telegram_bot_interactions").select("id", { count: "exact", head: true }).gte("created_at", todayISO),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).gte("created_at", todayISO).eq("event_type", "joined"),
      supabase.from("telegram_channel_members").select("id", { count: "exact", head: true }).gte("created_at", todayISO).eq("event_type", "left"),
      supabase.rpc("count_distinct_tg_users" as any),
      supabase.rpc("count_registered_tg_users" as any),
    ]);

    if (intRes.data) {
      setInteractions(intRes.data as BotInteraction[]);

      // Aggregate unique users
      const userMap = new Map<string, TelegramUser>();
      for (const i of intRes.data) {
        const existing = userMap.get(i.telegram_user_id);
        if (!existing) {
          userMap.set(i.telegram_user_id, {
            telegram_user_id: i.telegram_user_id,
            telegram_username: i.telegram_username,
            first_name: i.first_name,
            first_seen: i.created_at,
            last_seen: i.created_at,
            total_interactions: 1,
            linked_user_id: i.linked_user_id,
          });
        } else {
          existing.total_interactions++;
          if (i.telegram_username) existing.telegram_username = i.telegram_username;
          if (i.first_name) existing.first_name = i.first_name;
          if (i.linked_user_id) existing.linked_user_id = i.linked_user_id;
          if (new Date(i.created_at) < new Date(existing.first_seen)) existing.first_seen = i.created_at;
          if (new Date(i.created_at) > new Date(existing.last_seen)) existing.last_seen = i.created_at;
        }
      }
      const users = Array.from(userMap.values()).sort((a, b) => new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime());
      setTgUsers(users);

      // Fetch linked profiles
      const linkedIds = [...new Set(users.filter(u => u.linked_user_id).map(u => u.linked_user_id!))];
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

      const registered = users.filter(u => u.linked_user_id).length;
      setStats({
        totalToday: statsRes.count ?? 0,
        totalUsers: users.length,
        registeredUsers: registered,
        joinsToday: joinsRes.count ?? 0,
        leavesToday: leavesRes.count ?? 0,
      });
    }
    if (memRes.data) setMembers(memRes.data as ChannelMember[]);

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
            <p className="text-xs text-muted-foreground">Total TG Users</p>
            <p className="text-lg font-bold">{stats.totalUsers}</p>
          </div>
          <div className="rounded-md border p-2 text-center">
            <p className="text-xs text-muted-foreground">Registered (Web)</p>
            <p className="text-lg font-bold text-green-500">{stats.registeredUsers}</p>
          </div>
          <div className="rounded-md border p-2 text-center">
            <p className="text-xs text-muted-foreground">Commands Today</p>
            <p className="text-lg font-bold">{stats.totalToday}</p>
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
            <TabsTrigger value="users"><UserCheck className="h-3 w-3 mr-1" /> Users Directory</TabsTrigger>
            <TabsTrigger value="bot"><History className="h-3 w-3 mr-1" /> Command Log</TabsTrigger>
            <TabsTrigger value="members"><Users className="h-3 w-3 mr-1" /> Channel Members</TabsTrigger>
          </TabsList>

          {/* PRIMARY: Users Directory */}
          <TabsContent value="users">
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact>TG User</TableHead>
                    <TableHead compact>First Seen</TableHead>
                    <TableHead compact>Last Active</TableHead>
                    <TableHead compact>Commands</TableHead>
                    <TableHead compact>Registered</TableHead>
                    <TableHead compact>Web Account</TableHead>
                    <TableHead compact>X / Twitter</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tgUsers.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users yet</TableCell></TableRow>
                  ) : tgUsers.map((u) => {
                    const profile = u.linked_user_id ? linkedProfiles.get(u.linked_user_id) : null;
                    return (
                      <TableRow key={u.telegram_user_id}>
                        <TableCell compact>
                          {u.telegram_username ? (
                            <a href={`https://t.me/${u.telegram_username}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:underline flex items-center gap-1">
                              @{u.telegram_username} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">{u.first_name || u.telegram_user_id}</span>
                          )}
                          {u.first_name && u.telegram_username && (
                            <span className="text-[10px] text-muted-foreground block">{u.first_name}</span>
                          )}
                        </TableCell>
                        <TableCell compact className="whitespace-nowrap text-xs">
                          {format(new Date(u.first_seen), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell compact className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(u.last_seen), { addSuffix: true })}
                        </TableCell>
                        <TableCell compact className="text-center">{u.total_interactions}</TableCell>
                        <TableCell compact>
                          {u.linked_user_id ? (
                            <Badge className="text-[10px] bg-green-600">✓ Yes</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell compact>
                          {u.linked_user_id && profile ? (
                            <div className="flex flex-col gap-0.5">
                              {profile.display_name && (
                                <span className="text-[10px] text-muted-foreground">{profile.display_name}</span>
                              )}
                              <a href={`/super-admin?tab=accounts&user=${u.linked_user_id}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-blue-400 hover:underline flex items-center gap-1">
                                View Profile → <ExternalLink className="w-2 h-2" />
                              </a>
                            </div>
                          ) : u.linked_user_id ? (
                            <a href={`/super-admin?tab=accounts&user=${u.linked_user_id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-blue-400 hover:underline flex items-center gap-1">
                              View Profile → <ExternalLink className="w-2 h-2" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell compact>
                          {profile?.oauth_provider === 'twitter' && profile?.oauth_username ? (
                            <a href={`https://x.com/${profile.oauth_username}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:underline flex items-center gap-1 text-xs">
                              𝕏 @{profile.oauth_username} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* SECONDARY: Command Log */}
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
                    <TableHead compact>Web Account</TableHead>
                    <TableHead compact>New</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interactions.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No interactions recorded yet</TableCell></TableRow>
                  ) : interactions.map((i) => {
                    const profile = i.linked_user_id ? linkedProfiles.get(i.linked_user_id) : null;
                    return (
                    <TableRow key={i.id}>
                      <TableCell compact className="whitespace-nowrap">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</TableCell>
                      <TableCell compact>
                        {i.telegram_username ? (
                          <a href={`https://t.me/${i.telegram_username}`} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:underline flex items-center gap-1">
                            @{i.telegram_username} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : i.first_name || i.telegram_user_id}
                      </TableCell>
                      <TableCell compact className="font-mono text-xs">{i.command || '—'}</TableCell>
                      <TableCell compact className="font-mono text-xs max-w-[80px] truncate">{i.token_mint ? `${i.token_mint.slice(0, 6)}…` : '—'}</TableCell>
                      <TableCell compact><Badge variant="outline" className="text-[10px]">{i.chat_type}</Badge></TableCell>
                      <TableCell compact>{statusBadge(i.response_status)}</TableCell>
                      <TableCell compact>
                        {i.linked_user_id ? (
                          <div className="flex flex-col gap-0.5">
                            {profile?.display_name && (
                              <span className="text-[10px] text-muted-foreground">{profile.display_name}</span>
                            )}
                            {profile?.oauth_provider && profile?.oauth_username && (
                              <span className="text-[10px] text-muted-foreground">
                                {profile.oauth_provider === 'twitter' ? '𝕏' : profile.oauth_provider}: @{profile.oauth_username}
                              </span>
                            )}
                            <a href={`/super-admin?tab=accounts&user=${i.linked_user_id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-blue-400 hover:underline flex items-center gap-1">
                              View Profile → <ExternalLink className="w-2 h-2" />
                            </a>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell compact>{i.is_new_user ? <Badge className="text-[10px] bg-green-600">NEW</Badge> : ''}</TableCell>
                    </TableRow>
                    );
                  })}
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
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No member events recorded yet</TableCell></TableRow>
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
