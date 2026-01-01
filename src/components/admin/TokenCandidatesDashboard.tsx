import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  RefreshCw, 
  Play, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Clock,
  Zap,
  ExternalLink,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Copy,
  ChevronDown,
  ChevronRight,
  Eye,
  Skull,
  Rocket,
  Plus,
  Minus
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Watchlist item from pumpfun_watchlist table
interface WatchlistItem {
  id: string;
  token_mint: string;
  token_symbol: string;
  token_name: string;
  first_seen_at: string;
  last_checked_at: string;
  status: 'watching' | 'qualified' | 'dead' | 'bombed' | 'removed';
  check_count: number;
  holder_count: number;
  holder_count_prev: number | null;
  volume_sol: number;
  volume_sol_prev: number | null;
  price_usd: number | null;
  price_usd_prev: number | null;
  price_ath_usd: number | null;
  holder_count_peak: number | null;
  tx_count: number;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  bundle_score: number | null;
  social_score: number | null;
  creator_wallet: string | null;
  qualification_reason: string | null;
  removal_reason: string | null;
  qualified_at: string | null;
  removed_at: string | null;
  metadata: any;
}

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
  price_usd: number | null;
  market_cap_usd: number | null;
  should_have_bought: boolean | null;
  manual_review_at: string | null;
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
  // New watchlist config fields
  min_watch_time_minutes?: number;
  max_watch_time_minutes?: number;
  qualification_holder_count?: number;
  qualification_volume_sol?: number;
  dead_holder_threshold?: number;
  dead_volume_threshold_sol?: number;
}

interface PollSummary {
  tokensScanned: number;
  watchlistSize: number;
  newlyAdded: number;
  newlyQualified: number;
  removedDead: number;
  removedBombed: number;
  stillWatching: number;
  updated: number;
  qualifiedTokens: Array<{ mint: string; symbol: string; reason: string }>;
  removedTokens: Array<{ mint: string; symbol: string; reason: string }>;
  durationMs?: number;
  pollRunId?: string;
}

export function TokenCandidatesDashboard() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [discoveryLogs, setDiscoveryLogs] = useState<DiscoveryLog[]>([]);
  const [config, setConfig] = useState<MonitorConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [mainTab, setMainTab] = useState<'watchlist' | 'candidates' | 'logs'>('watchlist');
  const [watchlistFilter, setWatchlistFilter] = useState<'all' | 'watching' | 'qualified' | 'dead'>('all');
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [logsFilter, setLogsFilter] = useState<'all' | 'rejected' | 'accepted'>('all');
  const [configEdits, setConfigEdits] = useState<Partial<MonitorConfig>>({});
  const [lastPollSummary, setLastPollSummary] = useState<PollSummary | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [logsPage, setLogsPage] = useState(0);
  const [totalLogsCount, setTotalLogsCount] = useState(0);
  const LOGS_PER_PAGE = 100;

  // Fetch watchlist
  const fetchWatchlist = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pumpfun_watchlist')
        .select('*')
        .order('last_checked_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setWatchlist((data || []) as WatchlistItem[]);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
    }
  }, []);

  // Fetch candidates
  const fetchCandidates = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pumpfun_buy_candidates')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(100);

      setCandidates(data || []);
    } catch (error) {
      console.error('Error fetching candidates:', error);
    }
  }, []);

  // Fetch discovery logs with pagination
  const fetchDiscoveryLogs = useCallback(async () => {
    try {
      const { count } = await supabase
        .from('pumpfun_discovery_logs')
        .select('id', { count: 'exact', head: true });
      setTotalLogsCount(count || 0);

      const { data, error } = await supabase
        .from('pumpfun_discovery_logs')
        .select('id, token_mint, token_symbol, token_name, decision, rejection_reason, volume_sol, volume_usd, tx_count, bundle_score, holder_count, age_minutes, created_at, price_usd, market_cap_usd, should_have_bought, manual_review_at, metadata')
        .order('created_at', { ascending: false })
        .range(logsPage * LOGS_PER_PAGE, (logsPage + 1) * LOGS_PER_PAGE - 1);

      if (error) throw error;
      setDiscoveryLogs((data || []) as DiscoveryLog[]);
    } catch (error) {
      console.error('Error fetching discovery logs:', error);
    }
  }, [logsPage]);

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pumpfun_monitor_config')
        .select('*')
        .limit(1)
        .single();

      if (data) {
        setConfig(data);
        setConfigEdits(data);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchWatchlist(), fetchCandidates(), fetchConfig(), fetchDiscoveryLogs()]);
      setLoading(false);
    };
    load();

    // Realtime subscription
    const channel = supabase
      .channel('pumpfun-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pumpfun_watchlist' }, () => {
        fetchWatchlist();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pumpfun_buy_candidates' }, () => {
        fetchCandidates();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWatchlist, fetchCandidates, fetchConfig, fetchDiscoveryLogs]);

  // Poll trigger with new watchlist model
  const triggerPoll = async () => {
    setPolling(true);
    const startTime = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('pumpfun-new-token-monitor', {
        body: { action: 'poll' },
      });

      if (error) throw error;

      const results = data?.results || {};
      const durationMs = Date.now() - startTime;
      
      setLastPollSummary({
        tokensScanned: results.tokensScanned || 0,
        watchlistSize: results.watchlistSize || 0,
        newlyAdded: results.newlyAdded || 0,
        newlyQualified: results.newlyQualified || 0,
        removedDead: results.removedDead || 0,
        removedBombed: results.removedBombed || 0,
        stillWatching: results.stillWatching || 0,
        updated: results.updated || 0,
        qualifiedTokens: results.qualifiedTokens || [],
        removedTokens: results.removedTokens || [],
        durationMs,
        pollRunId: data?.pollRunId,
      });

      const totalRemoved = (results.removedDead || 0) + (results.removedBombed || 0);
      toast.success(
        `Poll: +${results.newlyAdded || 0} watching, +${results.newlyQualified || 0} qualified, -${totalRemoved} removed`,
        { duration: 10000 }
      );
      
      await Promise.all([fetchWatchlist(), fetchCandidates(), fetchConfig()]);
    } catch (error) {
      console.error('Poll error:', error);
      toast.error('Failed to poll');
    } finally {
      setPolling(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  // Save config
  const saveConfig = async () => {
    try {
      const { error } = await supabase
        .from('pumpfun_monitor_config')
        .update({ ...configEdits, updated_at: new Date().toISOString() })
        .not('id', 'is', null);

      if (error) throw error;
      toast.success('Config saved');
      await fetchConfig();
    } catch (error) {
      toast.error('Failed to save config');
    }
  };

  // Toggle row expansion
  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Delta display helper
  const DeltaDisplay = ({ current, prev, suffix = '' }: { current: number; prev: number | null; suffix?: string }) => {
    if (prev === null || prev === undefined) {
      return <span>{current?.toFixed?.(current < 10 ? 2 : 0) ?? current}{suffix}</span>;
    }
    const delta = current - prev;
    if (delta === 0) return <span>{current?.toFixed?.(current < 10 ? 2 : 0) ?? current}{suffix}</span>;
    return (
      <span className="flex items-center gap-1">
        {current?.toFixed?.(current < 10 ? 2 : 0) ?? current}{suffix}
        <span className={delta > 0 ? 'text-green-500 text-xs' : 'text-red-500 text-xs'}>
          ({delta > 0 ? '+' : ''}{delta?.toFixed?.(delta < 10 && delta > -10 ? 2 : 0) ?? delta})
        </span>
      </span>
    );
  };

  // Status badge for watchlist
  const getWatchlistStatusBadge = (status: string) => {
    switch (status) {
      case 'watching':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">Watching</Badge>;
      case 'qualified':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">Qualified</Badge>;
      case 'dead':
        return <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">Dead</Badge>;
      case 'bombed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">Bombed</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  };

  // Filtered data
  const filteredWatchlist = watchlistFilter === 'all' 
    ? watchlist 
    : watchlist.filter(w => w.status === watchlistFilter);

  const filteredCandidates = candidateFilter === 'all'
    ? candidates
    : candidates.filter(c => c.status === candidateFilter);

  const filteredLogs = logsFilter === 'all'
    ? discoveryLogs
    : discoveryLogs.filter(l => l.decision === logsFilter);

  // Watchlist stats
  const watchlistStats = {
    total: watchlist.length,
    watching: watchlist.filter(w => w.status === 'watching').length,
    qualified: watchlist.filter(w => w.status === 'qualified').length,
    dead: watchlist.filter(w => w.status === 'dead' || w.status === 'bombed').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Stats Row */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-blue-500" />
          <span className="text-muted-foreground">Watching:</span>
          <span className="font-bold">{watchlistStats.watching}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-muted-foreground">Qualified:</span>
          <span className="font-bold text-green-500">{watchlistStats.qualified}</span>
        </div>
        <div className="flex items-center gap-2">
          <Skull className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Dead:</span>
          <span className="font-bold">{watchlistStats.dead}</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-500" />
          <span className="text-muted-foreground">Candidates:</span>
          <span className="font-bold">{candidates.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Last poll: {config?.last_poll_at ? formatDistanceToNow(new Date(config.last_poll_at), { addSuffix: true }) : 'Never'}
          </span>
          <Button variant="outline" size="sm" onClick={triggerPoll} disabled={polling}>
            {polling ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="ml-1">Poll</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { fetchWatchlist(); fetchCandidates(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Poll Results Summary - Delta Focused */}
      {lastPollSummary && (
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-medium">Last Poll ({(lastPollSummary.durationMs! / 1000).toFixed(1)}s):</span>
              <div className="flex items-center gap-1">
                <Plus className="h-3 w-3 text-blue-500" />
                <span>{lastPollSummary.newlyAdded} watching</span>
              </div>
              <div className="flex items-center gap-1">
                <Rocket className="h-3 w-3 text-green-500" />
                <span className="text-green-500">{lastPollSummary.newlyQualified} qualified</span>
              </div>
              <div className="flex items-center gap-1">
                <Minus className="h-3 w-3 text-red-500" />
                <span className="text-red-500">{lastPollSummary.removedDead + lastPollSummary.removedBombed} removed</span>
              </div>
              <span className="text-muted-foreground">| {lastPollSummary.updated} updated | {lastPollSummary.stillWatching} still watching</span>
            </div>
            {/* Show qualified/removed token lists if any */}
            {lastPollSummary.qualifiedTokens.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-xs text-green-500">Qualified:</span>
                {lastPollSummary.qualifiedTokens.map((t, i) => (
                  <Badge key={i} variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">
                    {t.symbol || t.mint.slice(0, 6)}
                  </Badge>
                ))}
              </div>
            )}
            {lastPollSummary.removedTokens.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="text-xs text-red-500">Removed:</span>
                {lastPollSummary.removedTokens.slice(0, 10).map((t, i) => (
                  <Badge key={i} variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">
                    {t.symbol || t.mint.slice(0, 6)} ({t.reason})
                  </Badge>
                ))}
                {lastPollSummary.removedTokens.length > 10 && (
                  <span className="text-xs text-muted-foreground">+{lastPollSummary.removedTokens.length - 10} more</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Config Panel - Compact */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              Configuration
            </span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Min Vol (SOL)</Label>
                  <Input type="number" step="0.1" value={configEdits.min_volume_sol_5m ?? ''} 
                    onChange={(e) => setConfigEdits(prev => ({ ...prev, min_volume_sol_5m: parseFloat(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Min Txs</Label>
                  <Input type="number" value={configEdits.min_transactions ?? ''} 
                    onChange={(e) => setConfigEdits(prev => ({ ...prev, min_transactions: parseInt(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Min Watch (min)</Label>
                  <Input type="number" value={configEdits.min_watch_time_minutes ?? 5} 
                    onChange={(e) => setConfigEdits(prev => ({ ...prev, min_watch_time_minutes: parseInt(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Watch (min)</Label>
                  <Input type="number" value={configEdits.max_watch_time_minutes ?? 60} 
                    onChange={(e) => setConfigEdits(prev => ({ ...prev, max_watch_time_minutes: parseInt(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qual. Holders</Label>
                  <Input type="number" value={configEdits.qualification_holder_count ?? 10} 
                    onChange={(e) => setConfigEdits(prev => ({ ...prev, qualification_holder_count: parseInt(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qual. Vol (SOL)</Label>
                  <Input type="number" step="0.1" value={configEdits.qualification_volume_sol ?? 1} 
                    onChange={(e) => setConfigEdits(prev => ({ ...prev, qualification_volume_sol: parseFloat(e.target.value) }))} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={configEdits.auto_scalp_enabled ?? false}
                      onCheckedChange={(checked) => setConfigEdits(prev => ({ ...prev, auto_scalp_enabled: checked }))} />
                    <span className="text-xs">Auto Scalp</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={configEdits.is_enabled ?? true}
                      onCheckedChange={(checked) => setConfigEdits(prev => ({ ...prev, is_enabled: checked }))} />
                    <span className="text-xs">Enabled</span>
                  </div>
                </div>
                <Button onClick={saveConfig} size="sm">Save</Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'watchlist' | 'candidates' | 'logs')}>
        <TabsList>
          <TabsTrigger value="watchlist" className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            Watchlist ({watchlistStats.total})
          </TabsTrigger>
          <TabsTrigger value="candidates" className="flex items-center gap-1">
            <Rocket className="h-3 w-3" />
            Candidates ({candidates.length})
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Logs ({totalLogsCount})
          </TabsTrigger>
        </TabsList>

        {/* Watchlist Tab - Compact Table */}
        <TabsContent value="watchlist" className="mt-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Token Watchlist</CardTitle>
                <div className="flex gap-1">
                  {(['all', 'watching', 'qualified', 'dead'] as const).map((f) => (
                    <Button key={f} variant={watchlistFilter === f ? 'default' : 'ghost'} size="sm"
                      onClick={() => setWatchlistFilter(f)}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                      {f !== 'all' && ` (${f === 'dead' ? watchlistStats.dead : watchlist.filter(w => w.status === f).length})`}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead compact className="w-8"></TableHead>
                      <TableHead compact>Symbol</TableHead>
                      <TableHead compact>Mint</TableHead>
                      <TableHead compact>Holders</TableHead>
                      <TableHead compact>Vol (SOL)</TableHead>
                      <TableHead compact>Price</TableHead>
                      <TableHead compact>ATH</TableHead>
                      <TableHead compact>Age</TableHead>
                      <TableHead compact>Checks</TableHead>
                      <TableHead compact>Status</TableHead>
                      <TableHead compact>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWatchlist.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                          No tokens in watchlist
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredWatchlist.map((item) => (
                        <React.Fragment key={item.id}>
                          <TableRow className="hover:bg-muted/30">
                            <TableCell compact>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => toggleExpand(item.id)}>
                                {expandedRows.has(item.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </Button>
                            </TableCell>
                            <TableCell compact className="font-medium">{item.token_symbol || '???'}</TableCell>
                            <TableCell compact>
                              <div className="flex items-center gap-1">
                                <a href={`https://pump.fun/${item.token_mint}`} target="_blank" rel="noopener noreferrer"
                                  className="text-primary hover:underline font-mono text-xs">
                                  {item.token_mint?.slice(0, 6)}...
                                </a>
                                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => copyToClipboard(item.token_mint)}>
                                  <Copy className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell compact>
                              <DeltaDisplay current={item.holder_count} prev={item.holder_count_prev} />
                            </TableCell>
                            <TableCell compact>
                              <DeltaDisplay current={Number(item.volume_sol)} prev={item.volume_sol_prev ? Number(item.volume_sol_prev) : null} />
                            </TableCell>
                            <TableCell compact className="text-xs">
                              {item.price_usd ? `$${Number(item.price_usd).toExponential(2)}` : '-'}
                            </TableCell>
                            <TableCell compact className="text-xs text-green-500">
                              {item.price_ath_usd ? `$${Number(item.price_ath_usd).toExponential(2)}` : '-'}
                            </TableCell>
                            <TableCell compact className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.first_seen_at), { addSuffix: false })}
                            </TableCell>
                            <TableCell compact className="text-xs">{item.check_count}</TableCell>
                            <TableCell compact>{getWatchlistStatusBadge(item.status)}</TableCell>
                            <TableCell compact>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-5 w-5"
                                  onClick={() => window.open(`https://pump.fun/${item.token_mint}`, '_blank')}>
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5"
                                  onClick={() => window.open(`https://dexscreener.com/solana/${item.token_mint}`, '_blank')}>
                                  <TrendingUp className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {/* Expanded Row */}
                          {expandedRows.has(item.id) && (
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={11} className="py-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  <div><span className="text-muted-foreground">Name:</span> {item.token_name}</div>
                                  <div><span className="text-muted-foreground">Market Cap:</span> {item.market_cap_usd ? `$${Number(item.market_cap_usd).toLocaleString()}` : '-'}</div>
                                  <div><span className="text-muted-foreground">Liquidity:</span> {item.liquidity_usd ? `$${Number(item.liquidity_usd).toLocaleString()}` : '-'}</div>
                                  <div><span className="text-muted-foreground">Bundle Score:</span> <span className={item.bundle_score && item.bundle_score >= 50 ? 'text-red-500' : ''}>{item.bundle_score ?? '-'}</span></div>
                                  <div><span className="text-muted-foreground">Peak Holders:</span> {item.holder_count_peak ?? '-'}</div>
                                  <div><span className="text-muted-foreground">TXs:</span> {item.tx_count}</div>
                                  <div><span className="text-muted-foreground">Creator:</span> <span className="font-mono">{item.creator_wallet?.slice(0, 8)}...</span></div>
                                  {item.qualification_reason && <div className="col-span-2 text-green-500"><span className="text-muted-foreground">Qualified:</span> {item.qualification_reason}</div>}
                                  {item.removal_reason && <div className="col-span-2 text-red-500"><span className="text-muted-foreground">Removed:</span> {item.removal_reason}</div>}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Candidates Tab - Compact */}
        <TabsContent value="candidates" className="mt-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Qualified Candidates</CardTitle>
                <div className="flex gap-1">
                  {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                    <Button key={f} variant={candidateFilter === f ? 'default' : 'ghost'} size="sm"
                      onClick={() => setCandidateFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead compact>Symbol</TableHead>
                      <TableHead compact>Mint</TableHead>
                      <TableHead compact>Vol (SOL)</TableHead>
                      <TableHead compact>Holders</TableHead>
                      <TableHead compact>Txs</TableHead>
                      <TableHead compact>Bundle</TableHead>
                      <TableHead compact>Status</TableHead>
                      <TableHead compact>Age</TableHead>
                      <TableHead compact>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCandidates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No candidates
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCandidates.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell compact className="font-medium">{c.token_symbol || '???'}</TableCell>
                          <TableCell compact>
                            <div className="flex items-center gap-1">
                              <a href={`https://pump.fun/${c.token_mint}`} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline font-mono text-xs">
                                {c.token_mint?.slice(0, 6)}...
                              </a>
                              <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => copyToClipboard(c.token_mint)}>
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell compact className={c.volume_sol_5m >= 5 ? 'text-green-500 font-medium' : ''}>
                            {c.volume_sol_5m?.toFixed(2)}
                          </TableCell>
                          <TableCell compact>{c.holder_count}</TableCell>
                          <TableCell compact>{c.transaction_count}</TableCell>
                          <TableCell compact>
                            <span className={c.bundle_score >= 50 ? 'text-red-500' : c.bundle_score >= 30 ? 'text-yellow-500' : 'text-green-500'}>
                              {c.bundle_score}
                            </span>
                            {c.is_bundled && <AlertTriangle className="h-3 w-3 text-red-500 inline ml-1" />}
                          </TableCell>
                          <TableCell compact>
                            <Badge variant="outline" className={
                              c.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                              c.status === 'approved' ? 'bg-green-500/10 text-green-500 border-green-500/30' :
                              c.status === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                              ''
                            }>{c.status}</Badge>
                          </TableCell>
                          <TableCell compact className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(c.detected_at), { addSuffix: false })}
                          </TableCell>
                          <TableCell compact>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-5 w-5"
                                onClick={() => window.open(`https://pump.fun/${c.token_mint}`, '_blank')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              {c.status === 'pending' && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-5 w-5 text-green-500">
                                    <CheckCircle className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-5 w-5 text-red-500">
                                    <XCircle className="h-3 w-3" />
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab - Compact */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Discovery Logs</CardTitle>
                <div className="flex gap-1">
                  {(['all', 'accepted', 'rejected'] as const).map((f) => (
                    <Button key={f} variant={logsFilter === f ? 'default' : 'ghost'} size="sm"
                      onClick={() => setLogsFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => fetchDiscoveryLogs()}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead compact>Symbol</TableHead>
                      <TableHead compact>Mint</TableHead>
                      <TableHead compact>Decision</TableHead>
                      <TableHead compact>Reason</TableHead>
                      <TableHead compact>Vol</TableHead>
                      <TableHead compact>Holders</TableHead>
                      <TableHead compact>Txs</TableHead>
                      <TableHead compact>Age</TableHead>
                      <TableHead compact>Links</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No logs
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log) => (
                        <TableRow key={log.id} className={log.should_have_bought ? 'bg-orange-500/5' : ''}>
                          <TableCell compact className="font-medium">
                            {log.token_symbol || '???'}
                            {log.should_have_bought && <ThumbsUp className="h-3 w-3 text-orange-500 inline ml-1" />}
                          </TableCell>
                          <TableCell compact>
                            <div className="flex items-center gap-1">
                              <a href={`https://pump.fun/${log.token_mint}`} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline font-mono text-xs">
                                {log.token_mint?.slice(0, 6)}...
                              </a>
                              <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => copyToClipboard(log.token_mint)}>
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell compact>
                            <Badge variant="outline" className={
                              log.decision === 'accepted' ? 'bg-green-500/10 text-green-500 border-green-500/30' :
                              log.decision === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                              'bg-muted'
                            }>{log.decision}</Badge>
                          </TableCell>
                          <TableCell compact className="text-xs text-muted-foreground max-w-[150px] truncate" title={log.rejection_reason || ''}>
                            {log.rejection_reason || '-'}
                          </TableCell>
                          <TableCell compact className="text-xs">{Number(log.volume_sol).toFixed(2)}</TableCell>
                          <TableCell compact className="text-xs">{log.holder_count ?? '-'}</TableCell>
                          <TableCell compact className="text-xs">{log.tx_count}</TableCell>
                          <TableCell compact className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: false })}
                          </TableCell>
                          <TableCell compact>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-5 w-5"
                                onClick={() => window.open(`https://pump.fun/${log.token_mint}`, '_blank')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5"
                                onClick={() => window.open(`https://dexscreener.com/solana/${log.token_mint}`, '_blank')}>
                                <TrendingUp className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
              {filteredLogs.length > 0 && filteredLogs.length < totalLogsCount && (
                <div className="p-2 border-t text-center">
                  <Button variant="outline" size="sm" onClick={() => setLogsPage(p => p + 1)}>
                    Load More ({totalLogsCount - (logsPage + 1) * LOGS_PER_PAGE} remaining)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
