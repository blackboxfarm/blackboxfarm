import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Users, Calendar, Hash, MessageSquare, ExternalLink, Crown, Shield } from 'lucide-react';
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
  const paidGroups = groups.filter(g => g.is_paid).length;

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
            Live data from Telegram API for all groups/channels with @holdersintel_bot
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Paid Groups</p>
            <p className="text-2xl font-bold text-primary">{paidGroups}</p>
          </CardContent>
        </Card>
      </div>

      {/* Groups Table */}
      <Card>
        <CardContent className="p-0">
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
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  <TableHead className="text-center">Bot Users</TableHead>
                  <TableHead className="text-center">Lookups</TableHead>
                  <TableHead className="text-center">Tokens</TableHead>
                  <TableHead>Top Command</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Installed</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const isActive = new Date(g.last_seen) > new Date(Date.now() - 86400000);
                  return (
                    <TableRow key={g.chat_id} className={g.kicked ? 'opacity-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium text-sm flex items-center gap-1">
                              {g.chat_title}
                              {g.is_paid && <Crown className="w-3 h-3 text-yellow-500" />}
                              {g.kicked && <span className="text-red-500 text-xs">(kicked)</span>}
                            </div>
                            {g.username && (
                              <a
                                href={`https://t.me/${g.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5"
                              >
                                @{g.username} <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {g.description && (
                              <p className="text-[10px] text-muted-foreground max-w-[200px] truncate">
                                {g.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{g.chat_type}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {g.member_count !== null ? g.member_count.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-center font-medium">{g.unique_users}</TableCell>
                      <TableCell className="text-center font-medium">{g.total_interactions}</TableCell>
                      <TableCell className="text-center font-medium">{g.unique_tokens}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-muted-foreground" />
                          {getTopCommand(g.top_commands)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {g.kicked ? (
                          <Badge variant="destructive" className="text-xs">Kicked</Badge>
                        ) : g.is_paid ? (
                          <Badge className="text-xs bg-green-600">Paid</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Free</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(g.installed_at).toLocaleDateString()}
                        </div>
                      </TableCell>
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
