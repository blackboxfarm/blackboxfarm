import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  RefreshCw, 
  Play, 
  Pause, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  Activity,
  AlertTriangle,
  Clock,
  Zap,
  Eye,
  ExternalLink
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
  const [config, setConfig] = useState<MonitorConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
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
      await Promise.all([fetchCandidates(), fetchConfigAndStats()]);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCandidates, fetchConfigAndStats]);

  // Manual poll trigger
  const triggerPoll = async () => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke('pumpfun-new-token-monitor', {
        body: { action: 'poll' },
      });

      if (error) throw error;

      toast.success(`Poll complete! Found ${data.results?.candidatesAdded || 0} new candidates`);
      await fetchCandidates();
      await fetchConfigAndStats();
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

  const filteredCandidates = activeTab === 'all' 
    ? candidates 
    : candidates.filter(c => c.status === activeTab);

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

      {/* Candidates Table */}
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
    </div>
  );
}
