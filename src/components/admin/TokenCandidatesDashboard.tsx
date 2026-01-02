import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  RefreshCw, 
  Play, 
  Pause,
  CheckCircle, 
  XCircle, 
  Activity,
  AlertTriangle,
  Zap,
  FileText,
  ThumbsUp,
  Copy,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  Skull,
  Rocket,
  Plus,
  Minus,
  ShoppingCart,
  Timer
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
  status: 'watching' | 'qualified' | 'dead' | 'bombed' | 'removed' | 'pending_triage' | 'rejected';
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
  rejection_reason: string | null;
  removal_reason: string | null;
  qualified_at: string | null;
  removed_at: string | null;
  metadata: any;
  bonding_curve_pct: number | null;
  // Phase 1 additions
  rejection_type: 'soft' | 'permanent' | null;
  dev_sold: boolean | null;
  dev_launched_new: boolean | null;
  max_single_wallet_pct: number | null;
  has_image: boolean | null;
  socials_count: number | null;
  // Phase 4 additions
  gini_coefficient: number | null;
  linked_wallet_count: number | null;
  bundled_buy_count: number | null;
  fresh_wallet_pct: number | null;
  suspicious_wallet_pct: number | null;
  insider_activity_detected: boolean | null;
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
  // Watchlist config fields
  min_watch_time_minutes?: number;
  max_watch_time_minutes?: number;
  qualification_holder_count?: number;
  qualification_volume_sol?: number;
  dead_holder_threshold?: number;
  dead_volume_threshold_sol?: number;
  // Polling and attrition config
  polling_interval_seconds?: number;
  log_retention_hours?: number;
  dead_retention_hours?: number;
  max_reevaluate_minutes?: number;
  resurrection_holder_threshold?: number;
  resurrection_volume_threshold_sol?: number;
}

// Format price to readable decimal (max 6 decimal places)
const formatPrice = (price: number | null | undefined): string => {
  if (price === null || price === undefined || isNaN(price)) return '-';
  if (price === 0) return '-';
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  // For small prices, show exactly 6 decimal places
  return `$${price.toFixed(6)}`;
};

// Format volume with 2 decimal places
const formatVolume = (vol: number | null | undefined): string => {
  if (vol === null || vol === undefined || isNaN(vol)) return '-';
  return vol.toFixed(2);
};

// Format bonding curve percentage
const formatBondingCurve = (pct: number | null | undefined): string => {
  if (pct === null || pct === undefined || isNaN(pct)) return '-';
  return `${pct.toFixed(0)}%`;
};

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

type WatchlistSortColumn = 'token_symbol' | 'status' | 'holder_count' | 'volume_sol' | 'tx_count' | 'first_seen_at' | 'last_checked_at';
type LogsSortColumn = 'token_symbol' | 'decision' | 'rejection_reason' | 'volume_sol' | 'holder_count' | 'tx_count' | 'created_at';
type SortDirection = 'asc' | 'desc';

// Sortable table header component
const SortableHeader = ({ 
  column, 
  label, 
  currentSort, 
  direction, 
  onSort,
  compact = true 
}: { 
  column: string; 
  label: string; 
  currentSort: string; 
  direction: SortDirection; 
  onSort: (col: string) => void;
  compact?: boolean;
}) => (
  <TableHead 
    compact={compact} 
    className="cursor-pointer hover:bg-muted/50 select-none" 
    onClick={() => onSort(column)}
  >
    <div className="flex items-center gap-1">
      {label}
      {currentSort === column && (
        direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      )}
    </div>
  </TableHead>
);

export function TokenCandidatesDashboard() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [discoveryLogs, setDiscoveryLogs] = useState<DiscoveryLog[]>([]);
  const [config, setConfig] = useState<MonitorConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [mainTab, setMainTab] = useState<'watchlist' | 'candidates' | 'logs'>('watchlist');
  const [watchlistFilter, setWatchlistFilter] = useState<'all' | 'watching' | 'qualified' | 'rejected' | 'dead'>('all');
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [logsFilter, setLogsFilter] = useState<'all' | 'rejected' | 'accepted'>('all');
  const [configEdits, setConfigEdits] = useState<Partial<MonitorConfig>>({});
  const [lastPollSummary, setLastPollSummary] = useState<PollSummary | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [logsPage, setLogsPage] = useState(0);
  const [totalLogsCount, setTotalLogsCount] = useState(0);
  const LOGS_PER_PAGE = 100;

  // Sorting state
  const [watchlistSortColumn, setWatchlistSortColumn] = useState<WatchlistSortColumn>('last_checked_at');
  const [watchlistSortDirection, setWatchlistSortDirection] = useState<SortDirection>('desc');
  const [logsSortColumn, setLogsSortColumn] = useState<LogsSortColumn>('created_at');
  const [logsSortDirection, setLogsSortDirection] = useState<SortDirection>('desc');

  // Continuous polling state
  const [continuousPolling, setContinuousPolling] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(60); // seconds
  const [nextPollIn, setNextPollIn] = useState<number | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Continuous polling effect
  useEffect(() => {
    if (continuousPolling) {
      // Start countdown
      setNextPollIn(pollingInterval);
      
      // Countdown timer
      countdownTimerRef.current = setInterval(() => {
        setNextPollIn(prev => {
          if (prev === null || prev <= 1) return pollingInterval;
          return prev - 1;
        });
      }, 1000);
      
      // Poll timer - immediate first poll then interval
      const runPoll = async () => {
        if (!polling) {
          await triggerPoll();
        }
      };
      
      // Start polling after the interval
      pollingTimerRef.current = setInterval(runPoll, pollingInterval * 1000);
      
      return () => {
        if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      };
    } else {
      // Clean up timers
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setNextPollIn(null);
    }
  }, [continuousPolling, pollingInterval]);

  // Stop continuous polling when component unmounts
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  // Start/stop continuous polling
  const toggleContinuousPolling = () => {
    if (!continuousPolling) {
      // Starting - trigger immediate poll
      triggerPoll();
    }
    setContinuousPolling(!continuousPolling);
  };

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

  // Quick Buy helper - copies mint and shows toast
  const quickBuy = (mint: string, symbol: string) => {
    navigator.clipboard.writeText(mint);
    toast.success(`${symbol} mint copied! Paste in FlipIt to buy.`, { duration: 5000 });
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

  // Clear all discovery logs
  const clearLogs = async () => {
    if (!confirm(`Are you sure you want to delete all ${totalLogsCount} logs?`)) return;
    
    try {
      const { error } = await supabase
        .from('pumpfun_discovery_logs')
        .delete()
        .not('id', 'is', null);

      if (error) throw error;
      toast.success('Logs cleared');
      setDiscoveryLogs([]);
      setTotalLogsCount(0);
      setLogsPage(0);
    } catch (error) {
      console.error('Error clearing logs:', error);
      toast.error('Failed to clear logs');
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

  // Sorting handlers
  const handleWatchlistSort = (column: string) => {
    const col = column as WatchlistSortColumn;
    if (watchlistSortColumn === col) {
      setWatchlistSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setWatchlistSortColumn(col);
      setWatchlistSortDirection('desc');
    }
  };

  const handleLogsSort = (column: string) => {
    const col = column as LogsSortColumn;
    if (logsSortColumn === col) {
      setLogsSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setLogsSortColumn(col);
      setLogsSortDirection('desc');
    }
  };

  // Delta display helper - isInteger flag for holder counts
  const DeltaDisplay = ({ current, prev, suffix = '', isInteger = false }: { current: number; prev: number | null; suffix?: string; isInteger?: boolean }) => {
    const formatVal = (val: number) => {
      if (isInteger) return Math.round(val).toString();
      return val < 10 ? val.toFixed(2) : val.toFixed(0);
    };
    
    if (prev === null || prev === undefined) {
      return <span>{formatVal(current)}{suffix}</span>;
    }
    const delta = current - prev;
    if (delta === 0) return <span>{formatVal(current)}{suffix}</span>;
    return (
      <span className="flex items-center gap-1">
        {formatVal(current)}{suffix}
        <span className={delta > 0 ? 'text-green-500 text-xs' : 'text-red-500 text-xs'}>
          ({delta > 0 ? '+' : ''}{isInteger ? Math.round(delta) : (Math.abs(delta) < 10 ? delta.toFixed(2) : delta.toFixed(0))})
        </span>
      </span>
    );
  };

  // Status badge for watchlist - now includes rejection type and Phase 4 indicators
  const getWatchlistStatusBadge = (status: string, item?: WatchlistItem) => {
    // Show dev alerts as highest priority
    if (item?.dev_sold) {
      return <Badge variant="outline" className="bg-red-600/20 text-red-400 border-red-600/50 text-xs font-bold">🚨 DEV SOLD</Badge>;
    }
    if (item?.dev_launched_new) {
      return <Badge variant="outline" className="bg-orange-600/20 text-orange-400 border-orange-600/50 text-xs font-bold">⚠️ DEV NEW</Badge>;
    }
    // Phase 4: Show insider activity as high priority
    if (item?.insider_activity_detected) {
      return <Badge variant="outline" className="bg-purple-600/20 text-purple-400 border-purple-600/50 text-xs font-bold">🕵️ INSIDER</Badge>;
    }
    
    switch (status) {
      case 'watching':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">Watching</Badge>;
      case 'qualified':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">Qualified</Badge>;
      case 'pending_triage':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 text-xs">Pending</Badge>;
      case 'rejected':
        // Show rejection type for rejected tokens
        if (item?.rejection_type === 'permanent') {
          return <Badge variant="outline" className="bg-red-600/20 text-red-400 border-red-600/50 text-xs">Rejected ⛔</Badge>;
        }
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">Rejected ⏳</Badge>;
      case 'dead':
        return <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">Dead</Badge>;
      case 'bombed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">Bombed</Badge>;
      case 'buy_now':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">Buy Now</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  };

  // Phase 4 metrics tooltip
  const getPhase4Indicators = (item: WatchlistItem) => {
    const indicators: string[] = [];
    if (item.gini_coefficient !== null && item.gini_coefficient > 0.7) {
      indicators.push(`Gini:${item.gini_coefficient.toFixed(2)}`);
    }
    if (item.linked_wallet_count !== null && item.linked_wallet_count > 0) {
      indicators.push(`Linked:${item.linked_wallet_count}`);
    }
    if (item.bundled_buy_count !== null && item.bundled_buy_count > 0) {
      indicators.push(`Bundled:${item.bundled_buy_count}`);
    }
    if (item.fresh_wallet_pct !== null && item.fresh_wallet_pct > 30) {
      indicators.push(`Fresh:${item.fresh_wallet_pct.toFixed(0)}%`);
    }
    if (item.suspicious_wallet_pct !== null && item.suspicious_wallet_pct > 20) {
      indicators.push(`Suspicious:${item.suspicious_wallet_pct.toFixed(0)}%`);
    }
    return indicators;
  };

  // Filtered and sorted watchlist
  const filteredWatchlist = watchlistFilter === 'all' 
    ? watchlist 
    : watchlist.filter(w => w.status === watchlistFilter);

  const sortedWatchlist = useMemo(() => {
    return [...filteredWatchlist].sort((a, b) => {
      let aVal: any = a[watchlistSortColumn];
      let bVal: any = b[watchlistSortColumn];
      
      // Handle nulls
      if (aVal === null || aVal === undefined) aVal = watchlistSortColumn.includes('count') || watchlistSortColumn.includes('sol') ? -Infinity : '';
      if (bVal === null || bVal === undefined) bVal = watchlistSortColumn.includes('count') || watchlistSortColumn.includes('sol') ? -Infinity : '';
      
      // Handle dates
      if (watchlistSortColumn === 'first_seen_at' || watchlistSortColumn === 'last_checked_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      // Handle numbers
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return watchlistSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Handle strings
      const comparison = String(aVal).localeCompare(String(bVal));
      return watchlistSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredWatchlist, watchlistSortColumn, watchlistSortDirection]);

  const filteredCandidates = candidateFilter === 'all'
    ? candidates
    : candidates.filter(c => c.status === candidateFilter);

  const filteredLogs = logsFilter === 'all'
    ? discoveryLogs
    : discoveryLogs.filter(l => l.decision === logsFilter);

  const sortedLogs = useMemo(() => {
    return [...filteredLogs].sort((a, b) => {
      let aVal: any = a[logsSortColumn];
      let bVal: any = b[logsSortColumn];
      
      // Handle nulls
      if (aVal === null || aVal === undefined) aVal = logsSortColumn.includes('count') || logsSortColumn.includes('sol') ? -Infinity : '';
      if (bVal === null || bVal === undefined) bVal = logsSortColumn.includes('count') || logsSortColumn.includes('sol') ? -Infinity : '';
      
      // Handle dates
      if (logsSortColumn === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      // Handle numbers
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return logsSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Handle strings
      const comparison = String(aVal).localeCompare(String(bVal));
      return logsSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredLogs, logsSortColumn, logsSortDirection]);

  // Watchlist stats
  const watchlistStats = {
    total: watchlist.length,
    watching: watchlist.filter(w => w.status === 'watching').length,
    qualified: watchlist.filter(w => w.status === 'qualified').length,
    rejected: watchlist.filter(w => w.status === 'rejected').length,
    rejectedPermanent: watchlist.filter(w => w.status === 'rejected' && w.rejection_type === 'permanent').length,
    rejectedSoft: watchlist.filter(w => w.status === 'rejected' && w.rejection_type === 'soft').length,
    dead: watchlist.filter(w => w.status === 'dead' || w.status === 'bombed').length,
    devSold: watchlist.filter(w => w.dev_sold).length,
    devLaunchedNew: watchlist.filter(w => w.dev_launched_new).length,
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
          <XCircle className="h-4 w-4 text-red-500" />
          <span className="text-muted-foreground">Rejected:</span>
          <span className="font-bold text-red-500">
            {watchlistStats.rejected}
            {watchlistStats.rejectedPermanent > 0 && (
              <span className="text-xs ml-1">(⛔{watchlistStats.rejectedPermanent})</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Skull className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Dead:</span>
          <span className="font-bold">{watchlistStats.dead}</span>
        </div>
        {(watchlistStats.devSold > 0 || watchlistStats.devLaunchedNew > 0) && (
          <div className="flex items-center gap-2 text-orange-500">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">
              {watchlistStats.devSold > 0 && `${watchlistStats.devSold} dev sold`}
              {watchlistStats.devSold > 0 && watchlistStats.devLaunchedNew > 0 && ' · '}
              {watchlistStats.devLaunchedNew > 0 && `${watchlistStats.devLaunchedNew} dev new`}
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Polling interval selector */}
          <div className="flex items-center gap-1">
            <Timer className="h-3 w-3 text-muted-foreground" />
            <Select 
              value={pollingInterval.toString()} 
              onValueChange={(v) => setPollingInterval(parseInt(v))}
              disabled={continuousPolling}
            >
              <SelectTrigger className="h-7 w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15s</SelectItem>
                <SelectItem value="30">30s</SelectItem>
                <SelectItem value="60">1m</SelectItem>
                <SelectItem value="120">2m</SelectItem>
                <SelectItem value="300">5m</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Auto-poll toggle */}
          <Button 
            variant={continuousPolling ? "destructive" : "default"} 
            size="sm" 
            onClick={toggleContinuousPolling}
            className="min-w-[90px]"
          >
            {continuousPolling ? (
              <>
                <Pause className="h-3 w-3 mr-1" />
                {nextPollIn !== null ? `${nextPollIn}s` : 'Stop'}
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" />
                Auto
              </>
            )}
          </Button>
          
          {/* Manual poll */}
          <Button variant="outline" size="sm" onClick={triggerPoll} disabled={polling}>
            {polling ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="ml-1">Poll</span>
          </Button>
          
          <span className="text-xs text-muted-foreground">
            {config?.last_poll_at ? formatDistanceToNow(new Date(config.last_poll_at), { addSuffix: true }) : 'Never'}
          </span>
          
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
            Watchlist ({watchlistStats.watching})
          </TabsTrigger>
          <TabsTrigger value="candidates" className="flex items-center gap-1">
            <Rocket className="h-3 w-3" />
            Qualified ({watchlistStats.qualified})
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
                  {(['all', 'watching', 'qualified', 'rejected', 'dead'] as const).map((f) => (
                    <Button key={f} variant={watchlistFilter === f ? 'default' : 'ghost'} size="sm"
                      onClick={() => setWatchlistFilter(f)}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                      {f !== 'all' && ` (${f === 'dead' ? watchlistStats.dead : f === 'rejected' ? watchlistStats.rejected : watchlist.filter(w => w.status === f).length})`}
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
                      <SortableHeader column="token_symbol" label="Symbol" currentSort={watchlistSortColumn} direction={watchlistSortDirection} onSort={handleWatchlistSort} />
                      <TableHead compact>Mint</TableHead>
                      <SortableHeader column="holder_count" label="Holders" currentSort={watchlistSortColumn} direction={watchlistSortDirection} onSort={handleWatchlistSort} />
                      <SortableHeader column="volume_sol" label="Vol (SOL)" currentSort={watchlistSortColumn} direction={watchlistSortDirection} onSort={handleWatchlistSort} />
                      <TableHead compact>BC%</TableHead>
                      <TableHead compact>Price</TableHead>
                      <TableHead compact>ATH</TableHead>
                      <SortableHeader column="first_seen_at" label="Age" currentSort={watchlistSortColumn} direction={watchlistSortDirection} onSort={handleWatchlistSort} />
                      <SortableHeader column="status" label="Status" currentSort={watchlistSortColumn} direction={watchlistSortDirection} onSort={handleWatchlistSort} />
                      <TableHead compact>Reason</TableHead>
                      <TableHead compact>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedWatchlist.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                          No tokens in watchlist
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedWatchlist.map((item) => (
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
                                <span className="text-primary font-mono text-xs">
                                  {item.token_mint?.slice(0, 6)}...
                                </span>
                                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => copyToClipboard(item.token_mint)}>
                                  <Copy className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell compact>
                              <DeltaDisplay current={item.holder_count} prev={item.holder_count_prev} isInteger />
                            </TableCell>
                            <TableCell compact className="text-xs">
                              {formatVolume(Number(item.volume_sol))}
                            </TableCell>
                            <TableCell compact className="text-xs text-cyan-400">
                              {formatBondingCurve(item.bonding_curve_pct)}
                            </TableCell>
                            <TableCell compact className="text-xs">
                              {formatPrice(item.price_usd)}
                            </TableCell>
                            <TableCell compact className="text-xs text-green-500">
                              {formatPrice(item.price_ath_usd)}
                            </TableCell>
                            <TableCell compact className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.first_seen_at), { addSuffix: false })}
                            </TableCell>
                            <TableCell compact>{getWatchlistStatusBadge(item.status, item)}</TableCell>
                            <TableCell compact className="text-xs max-w-[120px] truncate" title={item.qualification_reason || item.rejection_reason || item.removal_reason || ''}>
                              {item.qualification_reason ? (
                                <span className="text-green-500">{item.qualification_reason}</span>
                              ) : item.rejection_reason ? (
                                <span className="text-red-500">{item.rejection_reason}</span>
                              ) : item.removal_reason ? (
                                <span className="text-orange-500">{item.removal_reason}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell compact>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                  onClick={() => window.open(`https://pump.fun/${item.token_mint}`, '_blank')}
                                  title="View on Pump.fun">
                                  <img src="/launchpad-logos/pumpfun.png" alt="Pump.fun" className="h-4 w-4 rounded-sm" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                  onClick={() => window.open(`https://dexscreener.com/solana/${item.token_mint}`, '_blank')}
                                  title="View on DexScreener">
                                  <img src="/launchpad-logos/dexscreener.png" alt="DexScreener" className="h-4 w-4 rounded-sm" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-green-500"
                                  onClick={() => quickBuy(item.token_mint, item.token_symbol || '???')}
                                  title="Quick Buy (copy mint)">
                                  <ShoppingCart className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {/* Expanded Row */}
                          {expandedRows.has(item.id) && (
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={12} className="py-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  <div><span className="text-muted-foreground">Name:</span> {item.token_name}</div>
                                  <div><span className="text-muted-foreground">Market Cap:</span> {item.market_cap_usd ? `$${Number(item.market_cap_usd).toLocaleString()}` : '-'}</div>
                                  <div><span className="text-muted-foreground">Bundle Score:</span> <span className={item.bundle_score && item.bundle_score >= 50 ? 'text-red-500' : ''}>{item.bundle_score ?? '-'}</span></div>
                                  <div><span className="text-muted-foreground">Peak Holders:</span> {item.holder_count_peak ?? '-'}</div>
                                  <div><span className="text-muted-foreground">TXs:</span> {item.tx_count}</div>
                                  <div><span className="text-muted-foreground">Creator:</span> <span className="font-mono">{item.creator_wallet?.slice(0, 8)}...</span></div>
                                  <div><span className="text-muted-foreground">Bonding Curve:</span> <span className="text-cyan-400">{formatBondingCurve(item.bonding_curve_pct)}</span></div>
                                  {item.qualification_reason && <div className="col-span-2 text-green-500"><span className="text-muted-foreground">Qualified:</span> {item.qualification_reason}</div>}
                                  {item.rejection_reason && <div className="col-span-2 text-red-500"><span className="text-muted-foreground">Rejected:</span> {item.rejection_reason}</div>}
                                  {item.removal_reason && <div className="col-span-2 text-orange-500"><span className="text-muted-foreground">Removed:</span> {item.removal_reason}</div>}
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

        {/* Qualified Tab - Shows watchlist items with status='qualified' */}
        <TabsContent value="candidates" className="mt-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Qualified Tokens</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead compact>Symbol</TableHead>
                      <TableHead compact>Mint</TableHead>
                      <TableHead compact>Holders</TableHead>
                      <TableHead compact>Vol (SOL)</TableHead>
                      <TableHead compact>BC%</TableHead>
                      <TableHead compact>Price</TableHead>
                      <TableHead compact>Qualified</TableHead>
                      <TableHead compact>Reason</TableHead>
                      <TableHead compact>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {watchlist.filter(w => w.status === 'qualified').length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No qualified tokens yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      watchlist.filter(w => w.status === 'qualified').map((item) => (
                        <TableRow key={item.id}>
                          <TableCell compact className="font-medium">{item.token_symbol || '???'}</TableCell>
                          <TableCell compact>
                            <div className="flex items-center gap-1">
                              <span className="text-primary font-mono text-xs">
                                {item.token_mint?.slice(0, 6)}...
                              </span>
                              <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => copyToClipboard(item.token_mint)}>
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell compact>{item.holder_count}</TableCell>
                          <TableCell compact className="text-xs">{formatVolume(Number(item.volume_sol))}</TableCell>
                          <TableCell compact className="text-xs text-cyan-400">{formatBondingCurve(item.bonding_curve_pct)}</TableCell>
                          <TableCell compact className="text-xs">{formatPrice(item.price_usd)}</TableCell>
                          <TableCell compact className="text-xs text-muted-foreground">
                            {item.qualified_at ? formatDistanceToNow(new Date(item.qualified_at), { addSuffix: true }) : '-'}
                          </TableCell>
                          <TableCell compact className="text-xs max-w-[150px] truncate text-green-500" title={item.qualification_reason || ''}>
                            {item.qualification_reason || '-'}
                          </TableCell>
                          <TableCell compact>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                onClick={() => window.open(`https://pump.fun/${item.token_mint}`, '_blank')}
                                title="View on Pump.fun">
                                <img src="/launchpad-logos/pumpfun.png" alt="Pump.fun" className="h-4 w-4 rounded-sm" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                onClick={() => window.open(`https://dexscreener.com/solana/${item.token_mint}`, '_blank')}
                                title="View on DexScreener">
                                <img src="/launchpad-logos/dexscreener.png" alt="DexScreener" className="h-4 w-4 rounded-sm" />
                              </Button>
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
                  <Button variant="ghost" size="sm" onClick={clearLogs} className="text-red-500 hover:text-red-400 hover:bg-red-500/10">
                    <XCircle className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader column="token_symbol" label="Symbol" currentSort={logsSortColumn} direction={logsSortDirection} onSort={handleLogsSort} />
                      <TableHead compact>Mint</TableHead>
                      <SortableHeader column="decision" label="Decision" currentSort={logsSortColumn} direction={logsSortDirection} onSort={handleLogsSort} />
                      <SortableHeader column="rejection_reason" label="Reason" currentSort={logsSortColumn} direction={logsSortDirection} onSort={handleLogsSort} />
                      <SortableHeader column="volume_sol" label="Vol" currentSort={logsSortColumn} direction={logsSortDirection} onSort={handleLogsSort} />
                      <SortableHeader column="holder_count" label="Holders" currentSort={logsSortColumn} direction={logsSortDirection} onSort={handleLogsSort} />
                      <SortableHeader column="tx_count" label="Txs" currentSort={logsSortColumn} direction={logsSortDirection} onSort={handleLogsSort} />
                      <SortableHeader column="created_at" label="Age" currentSort={logsSortColumn} direction={logsSortDirection} onSort={handleLogsSort} />
                      <TableHead compact>Links</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No logs
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedLogs.map((log) => (
                        <TableRow key={log.id} className={log.should_have_bought ? 'bg-orange-500/5' : ''}>
                          <TableCell compact className="font-medium">
                            {log.token_symbol || '???'}
                            {log.should_have_bought && <ThumbsUp className="h-3 w-3 text-orange-500 inline ml-1" />}
                          </TableCell>
                          <TableCell compact>
                            <div className="flex items-center gap-1">
                              <span className="text-primary font-mono text-xs">
                                {log.token_mint?.slice(0, 6)}...
                              </span>
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
                              <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                onClick={() => window.open(`https://pump.fun/${log.token_mint}`, '_blank')}
                                title="View on Pump.fun">
                                <img src="/launchpad-logos/pumpfun.png" alt="Pump.fun" className="h-4 w-4 rounded-sm" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                onClick={() => window.open(`https://dexscreener.com/solana/${log.token_mint}`, '_blank')}
                                title="View on DexScreener">
                                <img src="/launchpad-logos/dexscreener.png" alt="DexScreener" className="h-4 w-4 rounded-sm" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
              {sortedLogs.length > 0 && sortedLogs.length < totalLogsCount && (
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
