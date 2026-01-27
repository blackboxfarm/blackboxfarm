import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  Globe, 
  Link2, 
  Image, 
  Clock, 
  TrendingUp, 
  Monitor, 
  Smartphone,
  Tablet,
  RefreshCw,
  ExternalLink,
  Share2,
  Search,
  FileText,
  Eye,
  UserCheck,
  UserX,
  BarChart3
} from 'lucide-react';
import { format, subDays, subHours, startOfDay, endOfDay } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';

interface VisitRecord {
  id: string;
  created_at: string;
  session_id: string;
  visitor_fingerprint: string | null;
  ip_address: string | null;
  user_agent: string | null;
  user_id: string | null;
  referrer: string | null;
  referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  token_preloaded: string | null;
  version_param: string | null;
  has_og_image: boolean;
  full_url: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  time_on_page_seconds: number | null;
  reports_generated: number;
  tokens_analyzed: string[] | null;
  is_authenticated: boolean | null;
  auth_method: string | null;
  page_name: string | null;
}

interface AggregatedStats {
  totalVisits: number;
  uniqueVisitors: number;
  uniqueIPs: number;
  withTokenPreloaded: number;
  fromOgShare: number;
  directTraffic: number;
  avgTimeOnPage: number;
  totalReportsGenerated: number;
  deviceBreakdown: { name: string; value: number }[];
  browserBreakdown: { name: string; value: number }[];
  referrerBreakdown: { domain: string; count: number }[];
  hourlyVisits: { hour: string; visits: number }[];
  topTokens: { token: string; count: number }[];
  // New auth tracking
  authenticatedVisits: number;
  anonymousVisits: number;
  authMethodBreakdown: { method: string; count: number }[];
  // Tokens per session breakdown
  tokensPerSession: { range: string; count: number }[];
  avgTokensPerSession: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function HoldersVisitorsDashboard() {
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [pageFilter, setPageFilter] = useState<'all' | 'home' | 'holders' | 'admin'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchVisits = async () => {
    setRefreshing(true);
    
    let startDate: Date;
    switch (timeRange) {
      case '1h':
        startDate = subHours(new Date(), 1);
        break;
      case '24h':
        startDate = subHours(new Date(), 24);
        break;
      case '7d':
        startDate = subDays(new Date(), 7);
        break;
      case '30d':
        startDate = subDays(new Date(), 30);
        break;
    }

    let query = supabase
      .from('holders_page_visits')
      .select('*')
      .gte('created_at', startDate.toISOString());
    
    // Apply page filter if not 'all'
    if (pageFilter !== 'all') {
      query = query.eq('page_name', pageFilter);
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!error && data) {
      setVisits(data);
    }
    
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchVisits();
  }, [timeRange, pageFilter]);

  const stats = useMemo<AggregatedStats>(() => {
    if (visits.length === 0) {
      return {
        totalVisits: 0,
        uniqueVisitors: 0,
        uniqueIPs: 0,
        withTokenPreloaded: 0,
        fromOgShare: 0,
        directTraffic: 0,
        avgTimeOnPage: 0,
        totalReportsGenerated: 0,
        deviceBreakdown: [],
        browserBreakdown: [],
        referrerBreakdown: [],
        hourlyVisits: [],
        topTokens: [],
        authenticatedVisits: 0,
        anonymousVisits: 0,
        authMethodBreakdown: [],
        tokensPerSession: [],
        avgTokensPerSession: 0,
      };
    }

    const uniqueFingerprints = new Set(visits.map(v => v.visitor_fingerprint).filter(Boolean));
    const uniqueIPs = new Set(visits.map(v => v.ip_address).filter(Boolean));
    const withToken = visits.filter(v => v.token_preloaded);
    const fromOg = visits.filter(v => v.has_og_image);
    const direct = visits.filter(v => !v.referrer && !v.utm_source);
    
    const timesOnPage = visits.filter(v => v.time_on_page_seconds).map(v => v.time_on_page_seconds!);
    const avgTime = timesOnPage.length > 0 
      ? Math.round(timesOnPage.reduce((a, b) => a + b, 0) / timesOnPage.length)
      : 0;

    const totalReports = visits.reduce((sum, v) => sum + (v.reports_generated || 0), 0);

    // Auth status tracking
    const authenticatedVisits = visits.filter(v => v.is_authenticated).length;
    const anonymousVisits = visits.filter(v => !v.is_authenticated).length;

    // Auth method breakdown
    const authMethodCounts: Record<string, number> = {};
    visits.forEach(v => {
      const method = v.auth_method || 'anonymous';
      authMethodCounts[method] = (authMethodCounts[method] || 0) + 1;
    });
    const authMethodBreakdown = Object.entries(authMethodCounts)
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);

    // Tokens per session breakdown
    const tokenCountsPerSession = visits.map(v => v.tokens_analyzed?.length || 0);
    const avgTokensPerSession = tokenCountsPerSession.length > 0
      ? Math.round((tokenCountsPerSession.reduce((a, b) => a + b, 0) / tokenCountsPerSession.length) * 100) / 100
      : 0;
    
    // Group sessions by token count ranges
    const tokensPerSessionRanges: Record<string, number> = {
      '0': 0,
      '1': 0,
      '2-3': 0,
      '4-5': 0,
      '6+': 0,
    };
    tokenCountsPerSession.forEach(count => {
      if (count === 0) tokensPerSessionRanges['0']++;
      else if (count === 1) tokensPerSessionRanges['1']++;
      else if (count <= 3) tokensPerSessionRanges['2-3']++;
      else if (count <= 5) tokensPerSessionRanges['4-5']++;
      else tokensPerSessionRanges['6+']++;
    });
    const tokensPerSession = Object.entries(tokensPerSessionRanges)
      .map(([range, count]) => ({ range, count }));

    // Device breakdown
    const deviceCounts: Record<string, number> = {};
    visits.forEach(v => {
      const device = v.device_type || 'unknown';
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    });
    const deviceBreakdown = Object.entries(deviceCounts).map(([name, value]) => ({ name, value }));

    // Browser breakdown
    const browserCounts: Record<string, number> = {};
    visits.forEach(v => {
      const browser = v.browser || 'unknown';
      browserCounts[browser] = (browserCounts[browser] || 0) + 1;
    });
    const browserBreakdown = Object.entries(browserCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Referrer breakdown
    const referrerCounts: Record<string, number> = {};
    visits.forEach(v => {
      const domain = v.referrer_domain || 'Direct';
      referrerCounts[domain] = (referrerCounts[domain] || 0) + 1;
    });
    const referrerBreakdown = Object.entries(referrerCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Hourly visits
    const hourCounts: Record<string, number> = {};
    visits.forEach(v => {
      const hour = format(new Date(v.created_at), 'HH:00');
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const hourlyVisits = Object.entries(hourCounts)
      .map(([hour, visits]) => ({ hour, visits }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Top tokens analyzed
    const tokenCounts: Record<string, number> = {};
    visits.forEach(v => {
      if (v.tokens_analyzed) {
        v.tokens_analyzed.forEach(token => {
          tokenCounts[token] = (tokenCounts[token] || 0) + 1;
        });
      }
    });
    const topTokens = Object.entries(tokenCounts)
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalVisits: visits.length,
      uniqueVisitors: uniqueFingerprints.size,
      uniqueIPs: uniqueIPs.size,
      withTokenPreloaded: withToken.length,
      fromOgShare: fromOg.length,
      directTraffic: direct.length,
      avgTimeOnPage: avgTime,
      totalReportsGenerated: totalReports,
      deviceBreakdown,
      browserBreakdown,
      referrerBreakdown,
      hourlyVisits,
      topTokens,
      authenticatedVisits,
      anonymousVisits,
      authMethodBreakdown,
      tokensPerSession,
      avgTokensPerSession,
    };
  }, [visits]);

  const getDeviceIcon = (type: string | null) => {
    switch (type) {
      case 'mobile': return <Smartphone className="h-4 w-4" />;
      case 'tablet': return <Tablet className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  const getSourceBadge = (visit: VisitRecord) => {
    if (visit.has_og_image) {
      return <Badge variant="secondary" className="bg-purple-500/20 text-purple-400">OG Share</Badge>;
    }
    if (visit.token_preloaded) {
      return <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">Token Link</Badge>;
    }
    if (visit.utm_source) {
      return <Badge variant="secondary" className="bg-green-500/20 text-green-400">{visit.utm_source}</Badge>;
    }
    if (visit.referrer_domain) {
      return <Badge variant="outline">{visit.referrer_domain}</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Direct</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Page Visitors Analytics</h2>
          <p className="text-muted-foreground">
            Track visitor sources, engagement, and behavior across all pages
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={pageFilter} onValueChange={(v: any) => setPageFilter(v)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pages</SelectItem>
              <SelectItem value="home">Home (/)</SelectItem>
              <SelectItem value="holders">Holders</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchVisits} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-xs">Total Visits</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalVisits.toLocaleString()}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Unique Visitors</span>
            </div>
            <p className="text-2xl font-bold">{stats.uniqueVisitors.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Globe className="h-4 w-4" />
              <span className="text-xs">Unique IPs</span>
            </div>
            <p className="text-2xl font-bold">{stats.uniqueIPs.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Link2 className="h-4 w-4" />
              <span className="text-xs">Token Links</span>
            </div>
            <p className="text-2xl font-bold">{stats.withTokenPreloaded.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Image className="h-4 w-4" />
              <span className="text-xs">OG Shares</span>
            </div>
            <p className="text-2xl font-bold">{stats.fromOgShare.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Share2 className="h-4 w-4" />
              <span className="text-xs">Direct Traffic</span>
            </div>
            <p className="text-2xl font-bold">{stats.directTraffic.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Avg Time</span>
            </div>
            <p className="text-2xl font-bold">{Math.floor(stats.avgTimeOnPage / 60)}m {stats.avgTimeOnPage % 60}s</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-xs">Reports Gen</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalReportsGenerated.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Auth & Engagement Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <UserCheck className="h-4 w-4 text-green-500" />
              <span className="text-xs">Logged In</span>
            </div>
            <p className="text-2xl font-bold">{stats.authenticatedVisits.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {stats.totalVisits > 0 ? Math.round((stats.authenticatedVisits / stats.totalVisits) * 100) : 0}% of visits
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <UserX className="h-4 w-4 text-orange-500" />
              <span className="text-xs">Anonymous</span>
            </div>
            <p className="text-2xl font-bold">{stats.anonymousVisits.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {stats.totalVisits > 0 ? Math.round((stats.anonymousVisits / stats.totalVisits) * 100) : 0}% of visits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs">Avg Tokens/Session</span>
            </div>
            <p className="text-2xl font-bold">{stats.avgTokensPerSession}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Conversion Rate</span>
            </div>
            <p className="text-2xl font-bold">
              {stats.totalVisits > 0 ? Math.round((stats.totalReportsGenerated / stats.totalVisits) * 100) : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Reports / Visits</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Traffic */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Traffic Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.hourlyVisits}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="visits" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Device Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Device Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.deviceBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {stats.deviceBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="referrers" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="referrers">Top Referrers</TabsTrigger>
          <TabsTrigger value="tokens">Top Tokens</TabsTrigger>
          <TabsTrigger value="session-tokens">Tokens/Session</TabsTrigger>
          <TabsTrigger value="auth-methods">Auth Methods</TabsTrigger>
          <TabsTrigger value="browsers">Browsers</TabsTrigger>
          <TabsTrigger value="recent">Recent Visits</TabsTrigger>
        </TabsList>

        <TabsContent value="referrers">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Traffic Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.referrerBreakdown} layout="vertical">
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="domain" width={150} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Most Analyzed Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token Mint</TableHead>
                    <TableHead className="text-right">Times Analyzed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topTokens.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">
                        {item.token.slice(0, 8)}...{item.token.slice(-6)}
                      </TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                    </TableRow>
                  ))}
                  {stats.topTokens.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground">
                        No tokens analyzed yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="session-tokens">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tokens Analyzed Per Session</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.tokensPerSession}>
                    <XAxis dataKey="range" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <p>Average: <span className="font-semibold text-foreground">{stats.avgTokensPerSession}</span> tokens per session</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth-methods">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Authentication Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.authMethodBreakdown.map(item => ({ name: item.method, value: item.count }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {stats.authMethodBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.authMethodBreakdown.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="capitalize">{item.method}</TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {stats.totalVisits > 0 ? Math.round((item.count / stats.totalVisits) * 100) : 0}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="browsers">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Browser Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.browserBreakdown}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Recent Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Auth</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Reports</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visits.slice(0, 20).map((visit) => (
                    <TableRow key={visit.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(visit.created_at), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell>{getSourceBadge(visit)}</TableCell>
                      <TableCell>
                        {visit.is_authenticated ? (
                          <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-xs">
                            {visit.auth_method || 'logged in'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs">anon</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getDeviceIcon(visit.device_type)}
                          <span className="text-xs text-muted-foreground">{visit.browser}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {visit.tokens_analyzed?.length || 0}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {visit.time_on_page_seconds 
                          ? `${Math.floor(visit.time_on_page_seconds / 60)}:${(visit.time_on_page_seconds % 60).toString().padStart(2, '0')}`
                          : '—'
                        }
                      </TableCell>
                      <TableCell className="text-right">{visit.reports_generated || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
