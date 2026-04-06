import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Users, ExternalLink, Hash, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HostedGroup {
  chat_id: string;
  chat_type: string;
  total_interactions: number;
  unique_users: number;
  unique_tokens: number;
  first_seen: string;
  last_seen: string;
  recent_users: string[];
}

export function TelegramHostedBots() {
  const [groups, setGroups] = useState<HostedGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Get all group/supergroup interactions aggregated by chat_id
      const { data, error } = await supabase.rpc('get_telegram_hosted_groups');
      
      if (error) {
        // Fallback: manual query if RPC doesn't exist
        console.warn('RPC not available, using fallback query');
        const { data: raw } = await supabase
          .from('telegram_bot_interactions')
          .select('chat_id, chat_type, telegram_username, token_mint, created_at')
          .in('chat_type', ['group', 'supergroup'])
          .order('created_at', { ascending: false })
          .limit(1000);

        if (raw) {
          const grouped = new Map<string, HostedGroup>();
          for (const row of raw) {
            const key = String(row.chat_id);
            if (!grouped.has(key)) {
              grouped.set(key, {
                chat_id: key,
                chat_type: row.chat_type || 'group',
                total_interactions: 0,
                unique_users: 0,
                unique_tokens: 0,
                first_seen: row.created_at,
                last_seen: row.created_at,
                recent_users: [],
              });
            }
            const g = grouped.get(key)!;
            g.total_interactions++;
            if (row.created_at < g.first_seen) g.first_seen = row.created_at;
            if (row.created_at > g.last_seen) g.last_seen = row.created_at;
            if (row.telegram_username && !g.recent_users.includes(row.telegram_username)) {
              g.recent_users.push(row.telegram_username);
            }
          }

          // Count unique users and tokens per group
          for (const [key, g] of grouped) {
            const userSet = new Set(raw.filter(r => String(r.chat_id) === key).map(r => r.telegram_username).filter(Boolean));
            const tokenSet = new Set(raw.filter(r => String(r.chat_id) === key).map(r => r.token_mint).filter(Boolean));
            g.unique_users = userSet.size;
            g.unique_tokens = tokenSet.size;
          }

          setGroups(Array.from(grouped.values()).sort((a, b) => b.total_interactions - a.total_interactions));
        }
      } else {
        setGroups(data || []);
      }
    } catch (err) {
      console.error('Error loading hosted groups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalGroups = groups.length;
  const totalInteractions = groups.reduce((s, g) => s + g.total_interactions, 0);
  const activeToday = groups.filter(g => {
    const lastSeen = new Date(g.last_seen);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return lastSeen > oneDayAgo;
  }).length;

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
                  <TableHead>Chat ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Users</TableHead>
                  <TableHead className="text-center">Lookups</TableHead>
                  <TableHead className="text-center">Tokens</TableHead>
                  <TableHead>First Installed</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Active Users</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const isActive = new Date(g.last_seen) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                  return (
                    <TableRow key={g.chat_id}>
                      <TableCell className="font-mono text-xs">{g.chat_id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {g.chat_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">{g.unique_users}</TableCell>
                      <TableCell className="text-center font-medium">{g.total_interactions}</TableCell>
                      <TableCell className="text-center font-medium">{g.unique_tokens}</TableCell>
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
                      <TableCell className="text-xs">
                        {g.recent_users.slice(0, 3).map(u => (
                          <a
                            key={u}
                            href={`https://t.me/${u}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline mr-1"
                          >
                            @{u}
                          </a>
                        ))}
                        {g.recent_users.length > 3 && (
                          <span className="text-muted-foreground">+{g.recent_users.length - 3} more</span>
                        )}
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
