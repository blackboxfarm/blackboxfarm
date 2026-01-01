import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  RefreshCw, 
  Play, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  Activity,
  AlertTriangle,
  Clock,
  Zap,
  ExternalLink,
  FileText,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Star
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Candidate {
  id: string;
  token_mint: string;
  token_name: string;
  token_symbol: string;
  creator_wallet: string;
  detected_at: string;
  volume_sol_5m: number;
  volume_usd_5m: number;
  bonding_curve_pct: number;
  market_cap_usd: number;
  holder_count: number;
  transaction_count: number;
  bundle_score: number;
  is_bundled: boolean;
  scalp_approved: boolean;
  status: string;
  rejection_reason: string;
  metadata: any;
}

interface DiscoveryLog {
  id: string;
  token_mint: string;
  token_symbol: string;
  token_name: string;
  decision: 'accepted' | 'rejected' | 'error';
  rejection_reason: string | null;
  volume_sol: number;
  volume_usd: number;
  tx_count: number;
  bundle_score: number | null;
  holder_count: number | null;
  age_minutes: number | null;
  created_at: string;
  metadata: any;
  // New detailed columns for learning
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  bonding_curve_pct: number | null;
  top5_holder_pct: number | null;
  top10_holder_pct: number | null;
  buys_count: number | null;
  sells_count: number | null;
  buy_sell_ratio: number | null;
  creator_wallet: string | null;
  creator_integrity_score: number | null;
  passed_filters: string[] | null;
  failed_filters: string[] | null;
  acceptance_reasoning: { reasons?: string[]; summary?: string } | null;
  score_breakdown: Record<string, number | null> | null;
  config_snapshot: Record<string, any> | null;
  // Manual review columns
  should_have_bought: boolean | null;
  manual_review_notes: string | null;
  manual_review_at: string | null;
  actual_outcome: 'pumped' | 'dumped' | 'sideways' | 'unknown' | null;
  actual_roi_pct: number | null;
  reviewed_by: string | null;
}

interface MonitorConfig {
  min_volume_sol_5m: number;
  min_transactions: number;
  max_token_age_minutes: number;
  max_bundle_score: number;
  auto_scalp_enabled: boolean;
  scalp_test_mode: boolean;
  is_enabled: boolean;
  last_poll_at: string;
  tokens_processed_count: number;
  candidates_found_count: number;
}

interface Stats {
  totalCandidates: number;
  pendingCandidates: number;
  approvedCandidates: number;
  candidatesLastHour: number;
  lastPollAt: string;
  config: MonitorConfig;
}

export function TokenCandidatesDashboard() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [discoveryLogs, setDiscoveryLogs] = useState<DiscoveryLog[]>([]);
  const [config, setConfig] = useState<MonitorConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [mainTab, setMainTab] = useState<'candidates' | 'logs'>('candidates');
  const [logsFilter, setLogsFilter] = useState<'all' | 'rejected' | 'accepted' | 'reviewed' | 'should_have_bought'>('all');
  const [configEdits, setConfigEdits] = useState<Partial<MonitorConfig>>({});

  // Fetch candidates
  const fetchCandidates = useCallback(async (status?: string) => {
    try {
      const url = new URL('https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-new-token-monitor');
      url.searchParams.set('action', 'candidates');
      if (status && status !== 'all') {
        url.searchParams.set('status', status);
      }
      url.searchParams.set('limit', '100');

      const { data, error } = await supabase.functions.invoke('pumpfun-new-token-monitor', {
        body: null,
        method: 'GET',
      });

      // Fallback to direct query
      const { data: candidatesData } = await supabase
        .from('pumpfun_buy_candidates')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(100);

      setCandidates(candidatesData || []);
    } catch (error) {
      console.error('Error fetching candidates:', error);
      toast.error('Failed to fetch candidates');
    }
  }, []);

  // Fetch discovery logs
  const fetchDiscoveryLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pumpfun_discovery_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setDiscoveryLogs((data || []) as DiscoveryLog[]);
    } catch (error) {
      console.error('Error fetching discovery logs:', error);
    }
  }, []);

  // Fetch config and stats
  const fetchConfigAndStats = useCallback(async () => {
    try {
      const { data: configData } = await supabase
        .from('pumpfun_monitor_config')
        .select('*')
        .limit(1)
        .single();

      if (configData) {
        setConfig(configData);
        setConfigEdits(configData);
      }

      // Get stats
      const [total, pending, approved, hourly] = await Promise.all([
        supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }),
        supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }).eq('scalp_approved', true),
        supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }).gte('detected_at', new Date(Date.now() - 3600000).toISOString()),
      ]);

      setStats({
        totalCandidates: total.count || 0,
        pendingCandidates: pending.count || 0,
        approvedCandidates: approved.count || 0,
        candidatesLastHour: hourly.count || 0,
        lastPollAt: configData?.last_poll_at,
        config: configData,
      });
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchCandidates(), fetchConfigAndStats(), fetchDiscoveryLogs()]);
      setLoading(false);
    };
    load();

    // Set up realtime subscription
    const channel = supabase
      .channel('pumpfun-candidates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pumpfun_buy_candidates' }, () => {
        fetchCandidates();
        fetchConfigAndStats();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pumpfun_discovery_logs' }, () => {
        fetchDiscoveryLogs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCandidates, fetchConfigAndStats, fetchDiscoveryLogs]);

  // Manual poll trigger
  const triggerPoll = async () => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke('pumpfun-new-token-monitor', {
        body: { action: 'poll' },
      });

      if (error) throw error;

      const results = data.results;
      toast.success(
        `Scanned ${results?.tokensScanned || 0} tokens: ${results?.candidatesAdded || 0} added, ${results?.skippedLowVolume || 0} low vol, ${results?.skippedOld || 0} old`
      );
      await Promise.all([fetchCandidates(), fetchConfigAndStats(), fetchDiscoveryLogs()]);
    } catch (error) {
      console.error('Poll error:', error);
      toast.error('Failed to poll for tokens');
    } finally {
      setPolling(false);
    }
  };

  // Update config
  const saveConfig = async () => {
    try {
      const { error } = await supabase
        .from('pumpfun_monitor_config')
        .update({
          ...configEdits,
          updated_at: new Date().toISOString(),
        })
        .not('id', 'is', null);

      if (error) throw error;

      toast.success('Configuration saved');
      await fetchConfigAndStats();
    } catch (error) {
      console.error('Config save error:', error);
      toast.error('Failed to save configuration');
    }
  };

  // Approve candidate
  const approveCandidate = async (candidateId: string) => {
    try {
      const { error } = await supabase
        .from('pumpfun_buy_candidates')
        .update({
          status: 'approved',
          scalp_approved: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId);

      if (error) throw error;

      toast.success('Candidate approved');
      await fetchCandidates();
    } catch (error) {
      toast.error('Failed to approve candidate');
    }
  };

  // Reject candidate
  const rejectCandidate = async (candidateId: string) => {
    try {
      const { error } = await supabase
        .from('pumpfun_buy_candidates')
        .update({
          status: 'rejected',
          rejection_reason: 'Manually rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId);

      if (error) throw error;

      toast.success('Candidate rejected');
      await fetchCandidates();
    } catch (error) {
      toast.error('Failed to reject candidate');
    }
  };

  const getStatusBadge = (status: string, scalpApproved?: boolean) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">Rejected</Badge>;
      case 'bought':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">Bought</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Manual review - mark log as "should have bought"
  const markShouldHaveBought = async (logId: string, shouldHaveBought: boolean, notes?: string, outcome?: string) => {
    try {
      const { error } = await supabase
        .from('pumpfun_discovery_logs')
        .update({
          should_have_bought: shouldHaveBought,
          manual_review_notes: notes || null,
          actual_outcome: outcome || null,
          manual_review_at: new Date().toISOString(),
        })
        .eq('id', logId);

      if (error) throw error;

      toast.success(shouldHaveBought ? 'Marked as missed opportunity' : 'Review saved');
      await fetchDiscoveryLogs();
    } catch (error) {
      console.error('Review error:', error);
      toast.error('Failed to save review');
    }
  };

  const filteredCandidates = activeTab === 'all' 
    ? candidates 
    : candidates.filter(c => c.status === activeTab);

  // Filter discovery logs
  const filteredLogs = discoveryLogs.filter(log => {
    if (logsFilter === 'all') return true;
    if (logsFilter === 'rejected') return log.decision === 'rejected';
    if (logsFilter === 'accepted') return log.decision === 'accepted';
    if (logsFilter === 'reviewed') return log.manual_review_at !== null;
    if (logsFilter === 'should_have_bought') return log.should_have_bought === true;
    return true;
  });

  // Stats for discovery logs
  const logStats = {
    total: discoveryLogs.length,
    accepted: discoveryLogs.filter(l => l.decision === 'accepted').length,
    rejected: discoveryLogs.filter(l => l.decision === 'rejected').length,
    reviewed: discoveryLogs.filter(l => l.manual_review_at !== null).length,
    shouldHaveBought: discoveryLogs.filter(l => l.should_have_bought === true).length,
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
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Candidates</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.totalCandidates || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Pending</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-yellow-500">{stats?.pendingCandidates || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Scalp Approved</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-500">{stats?.approvedCandidates || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Last Hour</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-500">{stats?.candidatesLastHour || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Last Poll</span>
            </div>
            <p className="text-sm font-medium mt-1">
              {stats?.lastPollAt 
                ? formatDistanceToNow(new Date(stats.lastPollAt), { addSuffix: true })
                : 'Never'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-orange-500" />
                Pump.fun Token Monitor
              </CardTitle>
              <CardDescription>
                Monitors new pump.fun tokens and filters by volume surge
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={triggerPoll}
                disabled={polling}
              >
                {polling ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Poll Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchCandidates();
                  fetchConfigAndStats();
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Min Volume (SOL)</Label>
              <Input
                type="number"
                step="0.1"
                value={configEdits.min_volume_sol_5m ?? ''}
                onChange={(e) => setConfigEdits(prev => ({ ...prev, min_volume_sol_5m: parseFloat(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Min Transactions</Label>
              <Input
                type="number"
                value={configEdits.min_transactions ?? ''}
                onChange={(e) => setConfigEdits(prev => ({ ...prev, min_transactions: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max Age (min)</Label>
              <Input
                type="number"
                value={configEdits.max_token_age_minutes ?? ''}
                onChange={(e) => setConfigEdits(prev => ({ ...prev, max_token_age_minutes: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max Bundle Score</Label>
              <Input
                type="number"
                max={100}
                value={configEdits.max_bundle_score ?? ''}
                onChange={(e) => setConfigEdits(prev => ({ ...prev, max_bundle_score: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Auto Scalp</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={configEdits.auto_scalp_enabled ?? false}
                  onCheckedChange={(checked) => setConfigEdits(prev => ({ ...prev, auto_scalp_enabled: checked }))}
                />
                <span className="text-xs text-muted-foreground">
                  {configEdits.auto_scalp_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Monitor Enabled</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={configEdits.is_enabled ?? true}
                  onCheckedChange={(checked) => setConfigEdits(prev => ({ ...prev, is_enabled: checked }))}
                />
                <span className="text-xs text-muted-foreground">
                  {configEdits.is_enabled ? 'Active' : 'Paused'}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={saveConfig} size="sm">
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs: Candidates vs Discovery Logs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'candidates' | 'logs')}>
        <TabsList className="mb-4">
          <TabsTrigger value="candidates" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Candidates ({candidates.length})
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Discovery Logs ({discoveryLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* Candidates Tab */}
        <TabsContent value="candidates">
          <Card>
            <CardHeader>
              <CardTitle>Token Candidates</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">All ({candidates.length})</TabsTrigger>
                  <TabsTrigger value="pending">Pending ({candidates.filter(c => c.status === 'pending').length})</TabsTrigger>
                  <TabsTrigger value="approved">Approved ({candidates.filter(c => c.status === 'approved').length})</TabsTrigger>
                  <TabsTrigger value="rejected">Rejected ({candidates.filter(c => c.status === 'rejected').length})</TabsTrigger>
                </TabsList>
                
                <TabsContent value={activeTab} className="mt-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Token</TableHead>
                          <TableHead>Volume (SOL)</TableHead>
                          <TableHead>Holders</TableHead>
                          <TableHead>Txs</TableHead>
                          <TableHead>Bundle Score</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Detected</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCandidates.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                              No candidates found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredCandidates.map((candidate) => (
                            <TableRow key={candidate.id}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium">{candidate.token_symbol || 'Unknown'}</span>
                                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                    {candidate.token_mint?.slice(0, 8)}...
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className={candidate.volume_sol_5m >= 5 ? 'text-green-500 font-medium' : ''}>
                                  {candidate.volume_sol_5m?.toFixed(2)}
                                </span>
                              </TableCell>
                              <TableCell>{candidate.holder_count}</TableCell>
                              <TableCell>{candidate.transaction_count}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className={candidate.bundle_score >= 50 ? 'text-red-500' : candidate.bundle_score >= 30 ? 'text-yellow-500' : 'text-green-500'}>
                                    {candidate.bundle_score}
                                  </span>
                                  {candidate.is_bundled && (
                                    <AlertTriangle className="h-3 w-3 text-red-500" />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{getStatusBadge(candidate.status, candidate.scalp_approved)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(candidate.detected_at), { addSuffix: true })}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => window.open(`https://pump.fun/${candidate.token_mint}`, '_blank')}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                  {candidate.status === 'pending' && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-600"
                                        onClick={() => approveCandidate(candidate.id)}
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-600"
                                        onClick={() => rejectCandidate(candidate.id)}
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discovery Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Discovery Logs - Learning & Backtesting
                  </CardTitle>
                  <CardDescription>
                    Detailed reasoning for all token decisions. Mark rejected tokens as "should've bought" for learning.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchDiscoveryLogs}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filter Tabs and Stats */}
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant={logsFilter === 'all' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setLogsFilter('all')}
                  >
                    All ({logStats.total})
                  </Button>
                  <Button 
                    variant={logsFilter === 'rejected' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setLogsFilter('rejected')}
                  >
                    Rejected ({logStats.rejected})
                  </Button>
                  <Button 
                    variant={logsFilter === 'accepted' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setLogsFilter('accepted')}
                  >
                    Accepted ({logStats.accepted})
                  </Button>
                  <Button 
                    variant={logsFilter === 'reviewed' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setLogsFilter('reviewed')}
                  >
                    <Star className="h-3 w-3 mr-1" />
                    Reviewed ({logStats.reviewed})
                  </Button>
                  <Button 
                    variant={logsFilter === 'should_have_bought' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setLogsFilter('should_have_bought')}
                    className={logsFilter === 'should_have_bought' ? '' : 'text-orange-500 border-orange-500/30 hover:bg-orange-500/10'}
                  >
                    <ThumbsUp className="h-3 w-3 mr-1" />
                    Should've Bought ({logStats.shouldHaveBought})
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {filteredLogs.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 border rounded-md">
                      {logsFilter === 'all' 
                        ? 'No discovery logs yet. Click "Poll Now" to scan for tokens.'
                        : `No logs match the "${logsFilter}" filter.`}
                    </div>
                  ) : (
                    filteredLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className={`border rounded-lg p-4 space-y-3 ${
                          log.should_have_bought === true ? 'bg-orange-500/10 border-orange-500/40 ring-1 ring-orange-500/30' :
                          log.decision === 'accepted' ? 'bg-green-500/5 border-green-500/30' : 
                          log.decision === 'error' ? 'bg-red-500/5 border-red-500/30' : 
                          log.manual_review_at ? 'bg-purple-500/5 border-purple-500/30' :
                          'bg-muted/30'
                        }`}
                      >
                        {/* Header Row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-lg">{log.token_symbol || 'Unknown'}</span>
                                {log.decision === 'accepted' ? (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    ACCEPTED
                                  </Badge>
                                ) : log.decision === 'error' ? (
                                  <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    ERROR
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    {log.rejection_reason?.replace(/_/g, ' ').toUpperCase() || 'REJECTED'}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>{log.token_mint?.slice(0, 16)}...</span>
                                <span>•</span>
                                <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => window.open(`https://pump.fun/${log.token_mint}`, '_blank')}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Volume</div>
                            <div className={Number(log.volume_sol) >= 0.1 ? 'text-green-500 font-medium' : 'text-muted-foreground'}>
                              {Number(log.volume_sol).toFixed(3)} SOL
                            </div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Transactions</div>
                            <div className="font-medium">{log.tx_count || 0}</div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Bundle Score</div>
                            <div className={`font-medium ${
                              log.bundle_score !== null ? (
                                log.bundle_score >= 50 ? 'text-red-500' : 
                                log.bundle_score >= 30 ? 'text-yellow-500' : 'text-green-500'
                              ) : ''
                            }`}>
                              {log.bundle_score !== null ? log.bundle_score : '-'}
                            </div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Age</div>
                            <div className="font-medium">{log.age_minutes ? `${Math.round(log.age_minutes)}m` : '-'}</div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Holders</div>
                            <div className="font-medium">{log.holder_count || '-'}</div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Buy/Sell</div>
                            <div className={`font-medium ${
                              log.buy_sell_ratio !== null ? (
                                log.buy_sell_ratio >= 2 ? 'text-green-500' : 
                                log.buy_sell_ratio >= 1 ? 'text-yellow-500' : 'text-red-500'
                              ) : ''
                            }`}>
                              {log.buys_count || 0}/{log.sells_count || 0}
                              {log.buy_sell_ratio !== null && ` (${Number(log.buy_sell_ratio).toFixed(1)}x)`}
                            </div>
                          </div>
                        </div>

                        {/* Extended Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Market Cap</div>
                            <div className="font-medium">
                              {log.market_cap_usd ? `$${Number(log.market_cap_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '-'}
                            </div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Liquidity</div>
                            <div className="font-medium">
                              {log.liquidity_usd ? `$${Number(log.liquidity_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '-'}
                            </div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Top 5 Holdings</div>
                            <div className={`font-medium ${
                              log.top5_holder_pct !== null ? (
                                log.top5_holder_pct >= 60 ? 'text-red-500' : 
                                log.top5_holder_pct >= 40 ? 'text-yellow-500' : 'text-green-500'
                              ) : ''
                            }`}>
                              {log.top5_holder_pct !== null ? `${Number(log.top5_holder_pct).toFixed(1)}%` : '-'}
                            </div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Top 10 Holdings</div>
                            <div className={`font-medium ${
                              log.top10_holder_pct !== null ? (
                                log.top10_holder_pct >= 80 ? 'text-red-500' : 
                                log.top10_holder_pct >= 60 ? 'text-yellow-500' : 'text-green-500'
                              ) : ''
                            }`}>
                              {log.top10_holder_pct !== null ? `${Number(log.top10_holder_pct).toFixed(1)}%` : '-'}
                            </div>
                          </div>
                        </div>

                        {/* Filters Passed/Failed */}
                        <div className="flex flex-wrap gap-2">
                          {log.passed_filters?.map((filter, i) => (
                            <Badge key={`pass-${i}`} variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                              ✓ {filter}
                            </Badge>
                          ))}
                          {log.failed_filters?.map((filter, i) => (
                            <Badge key={`fail-${i}`} variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">
                              ✗ {filter}
                            </Badge>
                          ))}
                        </div>

                        {/* Acceptance Reasoning (for accepted tokens) */}
                        {log.decision === 'accepted' && log.acceptance_reasoning && (
                          <div className="bg-green-500/10 rounded p-3 border border-green-500/20">
                            <div className="text-xs font-medium text-green-600 mb-2">Why this token was accepted:</div>
                            <div className="text-sm text-green-700 dark:text-green-400">
                              {log.acceptance_reasoning.summary}
                            </div>
                            {log.acceptance_reasoning.reasons && log.acceptance_reasoning.reasons.length > 0 && (
                              <ul className="mt-2 text-xs text-green-600 dark:text-green-500 space-y-1">
                                {log.acceptance_reasoning.reasons.map((reason, i) => (
                                  <li key={i}>• {reason}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* Config Snapshot (collapsible) */}
                        {log.config_snapshot && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer hover:text-foreground">Config at scan time</summary>
                            <pre className="mt-1 p-2 bg-muted/50 rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.config_snapshot, null, 2)}
                            </pre>
                          </details>
                        )}

                        {/* Manual Review Section */}
                        <div className={`rounded p-3 border ${
                          log.should_have_bought === true ? 'bg-orange-500/10 border-orange-500/30' :
                          log.manual_review_at ? 'bg-purple-500/10 border-purple-500/30' :
                          'bg-muted/20 border-border'
                        }`}>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">Learning Review:</span>
                              {log.should_have_bought === true && (
                                <Badge variant="outline" className="bg-orange-500/20 text-orange-600 border-orange-500/40">
                                  <ThumbsUp className="h-3 w-3 mr-1" />
                                  SHOULD'VE BOUGHT
                                </Badge>
                              )}
                              {log.should_have_bought === false && log.manual_review_at && (
                                <Badge variant="outline" className="bg-muted text-muted-foreground">
                                  <ThumbsDown className="h-3 w-3 mr-1" />
                                  Correctly Skipped
                                </Badge>
                              )}
                              {log.actual_outcome && (
                                <Badge 
                                  variant="outline" 
                                  className={
                                    log.actual_outcome === 'pumped' ? 'bg-green-500/20 text-green-600 border-green-500/40' :
                                    log.actual_outcome === 'dumped' ? 'bg-red-500/20 text-red-600 border-red-500/40' :
                                    'bg-muted text-muted-foreground'
                                  }
                                >
                                  {log.actual_outcome.charAt(0).toUpperCase() + log.actual_outcome.slice(1)}
                                  {log.actual_roi_pct !== null && ` (${log.actual_roi_pct > 0 ? '+' : ''}${log.actual_roi_pct}%)`}
                                </Badge>
                              )}
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex items-center gap-2">
                              {log.decision === 'rejected' && !log.should_have_bought && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-orange-500 border-orange-500/30 hover:bg-orange-500/10"
                                  onClick={() => markShouldHaveBought(log.id, true)}
                                >
                                  <ThumbsUp className="h-3 w-3 mr-1" />
                                  Should've Bought
                                </Button>
                              )}
                              {log.should_have_bought === true && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground"
                                  onClick={() => markShouldHaveBought(log.id, false)}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Undo
                                </Button>
                              )}
                              {!log.manual_review_at && log.decision !== 'rejected' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground"
                                  onClick={() => markShouldHaveBought(log.id, false, 'Confirmed correct decision')}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Confirm OK
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {/* Review Notes */}
                          {log.manual_review_notes && (
                            <div className="mt-2 text-xs text-muted-foreground flex items-start gap-1">
                              <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span>{log.manual_review_notes}</span>
                            </div>
                          )}
                          
                          {log.manual_review_at && (
                            <div className="mt-1 text-xs text-muted-foreground/60">
                              Reviewed {formatDistanceToNow(new Date(log.manual_review_at), { addSuffix: true })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
