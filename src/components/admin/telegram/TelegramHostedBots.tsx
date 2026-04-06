import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Users, Calendar, Hash, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HostedGroup {
  chat_id: string;
  chat_title: string;
  chat_type: string;
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
      // Fetch from channel_installations for official install data
      const { data: installations } = await supabase
        .from('channel_installations')
        .select('chat_id, chat_title, chat_type, is_active, is_paid, installed_at, kicked');

      // Fetch interaction stats per group
      const { data: raw } = await supabase
        .from('telegram_bot_interactions')
        .select('chat_id, chat_type, chat_title, telegram_username, token_mint, command, created_at')
        .in('chat_type', ['group', 'supergroup'])
        .order('created_at', { ascending: false })
        .limit(2000);

      if (raw) {
        const grouped = new Map<string, HostedGroup>();

        // Seed from installations first (they have titles)
        if (installations) {
          for (const inst of installations) {
            const key = String(inst.chat_id);
            if (!grouped.has(key)) {
              grouped.set(key, {
                chat_id: key,
                chat_title: inst.chat_title || `Group ${key}`,
                chat_type: inst.chat_type || 'supergroup',
                total_interactions: 0,
                unique_users: 0,
                unique_tokens: 0,
                top_commands: {},
                first_seen: inst.installed_at || new Date().toISOString(),
                last_seen: inst.installed_at || new Date().toISOString(),
              });
            }
          }
        }

        // Enrich with interaction data
        for (const row of raw) {
          const key = String(row.chat_id);
          if (!grouped.has(key)) {
            grouped.set(key, {
              chat_id: key,
              chat_title: (row as any).chat_title || `Group ${key}`,
              chat_type: row.chat_type || 'group',
              total_interactions: 0,
              unique_users: 0,
              unique_tokens: 0,
              top_commands: {},
              first_seen: row.created_at,
              last_seen: row.created_at,
            });
          }
          const g = grouped.get(key)!;
          g.total_interactions++;
          // Update title if we got a better one from interactions
          if ((row as any).chat_title && g.chat_title.startsWith('Group ')) {
            g.chat_title = (row as any).chat_title;
          }
          if (row.created_at < g.first_seen) g.first_seen = row.created_at;
          if (row.created_at > g.last_seen) g.last_seen = row.created_at;
          if (row.command) {
            g.top_commands[row.command] = (g.top_commands[row.command] || 0) + 1;
          }
        }

        // Calculate unique users and tokens per group
        for (const [key, g] of grouped) {
          const rows = raw.filter(r => String(r.chat_id) === key);
          g.unique_users = new Set(rows.map(r => r.telegram_username).filter(Boolean)).size;
          g.unique_tokens = new Set(rows.map(r => r.token_mint).filter(Boolean)).size;
        }

        setGroups(Array.from(grouped.values()).sort((a, b) => b.total_interactions - a.total_interactions));
      }
    } catch (err) {
      console.error('Error loading hosted groups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const totalGroups = groups.length;
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
            Groups & channels that have installed @holdersintel_bot
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Total Groups</p>
            <p className="text-2xl font-bold">{totalGroups}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Active (24h)</p>
            <p className="text-2xl font-bold text-green-500">{activeToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Total Lookups</p>
            <p className="text-2xl font-bold">{totalInteractions.toLocaleString()}</p>
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
                  <TableHead className="text-center">Users</TableHead>
                  <TableHead className="text-center">Lookups</TableHead>
                  <TableHead className="text-center">Tokens</TableHead>
                  <TableHead>Top Command</TableHead>
                  <TableHead>Installed</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const isActive = new Date(g.last_seen) > new Date(Date.now() - 86400000);
                  return (
                    <TableRow key={g.chat_id}>
                      <TableCell>
                        <div className="font-medium text-sm">{g.chat_title}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{g.chat_id}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{g.chat_type}</Badge>
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
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(g.first_seen).toLocaleDateString()}
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
