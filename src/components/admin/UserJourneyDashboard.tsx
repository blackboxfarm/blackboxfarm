import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, RefreshCw, Users, Activity, Clock, Filter, Eye, Zap, AlertTriangle, MousePointer } from 'lucide-react';
import { format, formatDistanceToNow, subDays } from 'date-fns';

interface JourneyEvent {
  id: string;
  user_id: string;
  session_id: string | null;
  event_type: string;
  event_name: string;
  page_path: string | null;
  metadata: Record<string, unknown>;
  duration_seconds: number | null;
  created_at: string;
}

interface UserSummary {
  user_id: string;
  email: string;
  event_count: number;
  last_event: string;
  referral_source: string | null;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  page_view: 'bg-blue-500/20 text-blue-400',
  feature_use: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  action: 'bg-yellow-500/20 text-yellow-400',
  bot_command: 'bg-purple-500/20 text-purple-400',
};

const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  page_view: <Eye className="h-3 w-3" />,
  feature_use: <Zap className="h-3 w-3" />,
  error: <AlertTriangle className="h-3 w-3" />,
  action: <MousePointer className="h-3 w-3" />,
  bot_command: <Activity className="h-3 w-3" />,
};

export function UserJourneyDashboard() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<number>(7);
  const [stats, setStats] = useState({ totalEvents: 0, activeUsers: 0, errorRate: 0, avgSessionPages: 0 });

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Get event counts per user
      const { data: eventData } = await supabase
        .from('user_journey_events')
        .select('user_id, created_at')
        .gte('created_at', subDays(new Date(), dateRange).toISOString())
        .order('created_at', { ascending: false });

      // Get profiles for email/referral
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, referral_source');

      if (!eventData) { setIsLoading(false); return; }

      // Aggregate by user
      const userMap = new Map<string, { count: number; lastEvent: string }>();
      for (const e of eventData) {
        const existing = userMap.get(e.user_id);
        if (existing) {
          existing.count++;
        } else {
          userMap.set(e.user_id, { count: 1, lastEvent: e.created_at });
        }
      }

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      const summaries: UserSummary[] = Array.from(userMap.entries()).map(([uid, data]) => ({
        user_id: uid,
        email: profileMap.get(uid)?.display_name || uid.slice(0, 8) + '...',
        event_count: data.count,
        last_event: data.lastEvent,
        referral_source: profileMap.get(uid)?.referral_source || null,
      }));

      summaries.sort((a, b) => b.event_count - a.event_count);
      setUsers(summaries);

      // Compute stats
      const totalEvents = eventData.length;
      const activeUsers = userMap.size;
      const errorEvents = eventData.filter((e: any) => e.event_type === 'error').length;
      setStats({
        totalEvents,
        activeUsers,
        errorRate: totalEvents > 0 ? (errorEvents / totalEvents) * 100 : 0,
        avgSessionPages: activeUsers > 0 ? Math.round(totalEvents / activeUsers) : 0,
      });
    } catch (err) {
      console.error('Failed to fetch journey users:', err);
    }
    setIsLoading(false);
  };

  const fetchUserEvents = async (userId: string) => {
    setIsLoadingEvents(true);
    setSelectedUserId(userId);
    try {
      let query = supabase
        .from('user_journey_events')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', subDays(new Date(), dateRange).toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (eventTypeFilter !== 'all') {
        query = query.eq('event_type', eventTypeFilter);
      }

      const { data } = await query;
      setEvents((data as JourneyEvent[]) || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
    setIsLoadingEvents(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [dateRange]);

  useEffect(() => {
    if (selectedUserId) fetchUserEvents(selectedUserId);
  }, [eventTypeFilter]);

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.referral_source || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalEvents.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Events ({dateRange}d)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{stats.activeUsers}</div>
            <div className="text-xs text-muted-foreground">Active Users</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{stats.avgSessionPages}</div>
            <div className="text-xs text-muted-foreground">Avg Events/User</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-400">{stats.errorRate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">Error Rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, ID, or referral..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={String(dateRange)} onValueChange={v => setDateRange(Number(v))}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="page_view">Page Views</SelectItem>
            <SelectItem value="feature_use">Feature Use</SelectItem>
            <SelectItem value="action">Actions</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="bot_command">Bot Commands</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchUsers} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Users ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {filteredUsers.map(u => (
                <button
                  key={u.user_id}
                  onClick={() => fetchUserEvents(u.user_id)}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors ${
                    selectedUserId === u.user_id ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{u.email}</span>
                    <Badge variant="secondary" className="text-xs">{u.event_count}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(u.last_event), { addSuffix: true })}
                    </span>
                    {u.referral_source && (
                      <Badge variant="outline" className="text-[10px] h-4">{u.referral_source}</Badge>
                    )}
                  </div>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {isLoading ? 'Loading...' : 'No journey data yet'}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Event Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {selectedUserId ? `Timeline (${events.length} events)` : 'Select a user to view timeline'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {isLoadingEvents ? (
                <div className="p-8 text-center text-muted-foreground">Loading events...</div>
              ) : events.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Time</TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="w-[120px]">Page</TableHead>
                      <TableHead className="w-[60px]">Duration</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map(evt => (
                      <TableRow key={evt.id} className="text-xs">
                        <TableCell className="font-mono text-muted-foreground">
                          {format(new Date(evt.created_at), 'MMM d HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] gap-1 ${EVENT_TYPE_COLORS[evt.event_type] || 'bg-muted text-muted-foreground'}`}>
                            {EVENT_TYPE_ICONS[evt.event_type]}
                            {evt.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{evt.event_name}</TableCell>
                        <TableCell className="text-muted-foreground truncate max-w-[120px]">
                          {evt.page_path || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {evt.duration_seconds ? `${evt.duration_seconds}s` : '—'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {evt.metadata && Object.keys(evt.metadata).length > 0
                            ? JSON.stringify(evt.metadata)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : selectedUserId ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No events found for this period</div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Click a user on the left to view their journey timeline
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
