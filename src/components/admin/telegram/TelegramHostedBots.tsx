import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Users, Calendar, MessageSquare, ExternalLink, Lock, Globe, User, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HostedGroup {
  chat_id: string;
  chat_title: string;
  chat_type: string;
  username: string | null;
  description: string | null;
  member_count: number | null;
  invite_link: string | null;
  is_active: boolean;
  is_paid: boolean;
  kicked: boolean;
  installed_at: string;
  installer_user_id: string | null;
  installer_email: string | null;
  installer_display_name: string | null;
  installer_telegram_username: string | null;
  installer_telegram_id: string | null;
  installer_oauth_provider: string | null;
  installer_oauth_username: string | null;
  total_interactions: number;
  unique_users: number;
  unique_tokens: number;
  top_commands: Record<string, number>;
  first_seen: string;
  last_seen: string;
}

export function TelegramHostedBots() {
  const [groups, setGroups] = useState<HostedGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-group-info');
      if (error) throw error;
      if (data?.groups) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.error('Error loading hosted groups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const totalGroups = groups.length;
  const totalMembers = groups.reduce((s, g) => s + (g.member_count || 0), 0);
  const totalInteractions = groups.reduce((s, g) => s + g.total_interactions, 0);
  const activeToday = groups.filter(g => new Date(g.last_seen) > new Date(Date.now() - 86400000)).length;

  const getTopCommand = (cmds: Record<string, number>) => {
    const entries = Object.entries(cmds).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? `/${entries[0][0]} (${entries[0][1]})` : '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Hosted Bot Installations
          </h3>
          <p className="text-sm text-muted-foreground">
            Live data from Telegram API — who installed the bot, where, and usage stats
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Groups</p>
            <p className="text-2xl font-bold">{totalGroups}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Members</p>
            <p className="text-2xl font-bold">{totalMembers.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Active (24h)</p>
            <p className="text-2xl font-bold text-green-500">{activeToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Lookups</p>
            <p className="text-2xl font-bold">{totalInteractions.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Groups Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-center text-muted-foreground p-8">No hosted installations found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group / Channel</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Installed By</TableHead>
                  <TableHead>X Profile</TableHead>
                  <TableHead>Web Account</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  <TableHead className="text-center">Bot Users</TableHead>
                  <TableHead className="text-center">Lookups</TableHead>
                  <TableHead>Top Command</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Installed</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const isActive = new Date(g.last_seen) > new Date(Date.now() - 86400000);
                  const isPublic = !!g.username;
                  const joinLink = g.username
                    ? `https://t.me/${g.username}`
                    : g.invite_link || null;

                  return (
                    <TableRow key={g.chat_id} className={g.kicked ? 'opacity-50' : ''}>
                      {/* Group/Channel Name */}
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm flex items-center gap-1">
                            {joinLink ? (
                              <a href={joinLink} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:underline flex items-center gap-1">
                                {g.chat_title} <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : g.chat_title}
                            {g.kicked && <span className="text-red-500 text-xs">(kicked)</span>}
                          </div>
                          {g.username && <span className="text-[10px] text-muted-foreground">@{g.username}</span>}
                          {g.description && (
                            <p className="text-[10px] text-muted-foreground max-w-[200px] truncate">{g.description}</p>
                          )}
                        </div>
                      </TableCell>

                      {/* Visibility */}
                      <TableCell>
                        {isPublic ? (
                          <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                            <Globe className="w-3 h-3 text-green-500" /> Public
                          </Badge>
                        ) : g.invite_link ? (
                          <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                            <Lock className="w-3 h-3 text-yellow-500" /> Invite
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                            <Lock className="w-3 h-3 text-red-500" /> Private
                          </Badge>
                        )}
                      </TableCell>

                      {/* Installed By (TG Admin) */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {g.installer_telegram_username ? (
                            <a href={`https://t.me/${g.installer_telegram_username}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:underline text-xs flex items-center gap-1">
                              <User className="w-3 h-3" />
                              @{g.installer_telegram_username}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : g.installer_telegram_id ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="w-3 h-3" />
                              TG#{g.installer_telegram_id}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>

                      {/* X Profile */}
                      <TableCell>
                        {g.installer_oauth_provider === 'twitter' && g.installer_oauth_username ? (
                          <a href={`https://x.com/${g.installer_oauth_username}`} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:underline text-xs flex items-center gap-1">
                            𝕏 @{g.installer_oauth_username}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Web Account */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {g.installer_email && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 truncate max-w-[160px]">
                              <Mail className="w-3 h-3 shrink-0" />
                              {g.installer_email}
                            </span>
                          )}
                          {g.installer_user_id && (
                            <a href={`https://blackbox.farm/super-admin?tab=accounts&user=${g.installer_user_id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-blue-400 hover:underline flex items-center gap-1">
                              View Profile → <ExternalLink className="w-2 h-2" />
                            </a>
                          )}
                          {!g.installer_email && !g.installer_user_id && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Members */}
                      <TableCell className="text-center font-medium">
                        {g.member_count !== null ? g.member_count.toLocaleString() : '—'}
                      </TableCell>

                      {/* Bot Users */}
                      <TableCell className="text-center font-medium">{g.unique_users}</TableCell>

                      {/* Lookups */}
                      <TableCell className="text-center font-medium">{g.total_interactions}</TableCell>

                      {/* Top Command */}
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-muted-foreground" />
                          {getTopCommand(g.top_commands)}
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {g.kicked ? (
                          <Badge variant="destructive" className="text-xs">Kicked</Badge>
                        ) : (
                          <Badge className="text-xs bg-green-600">Active</Badge>
                        )}
                      </TableCell>

                      {/* Installed */}
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(g.installed_at).toLocaleDateString()}
                        </div>
                      </TableCell>

                      {/* Last Active */}
                      <TableCell>
                        <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
                          {formatDistanceToNow(new Date(g.last_seen), { addSuffix: true })}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
