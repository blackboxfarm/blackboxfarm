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
import { Checkbox } from '@/components/ui/checkbox';
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
  Timer,
  Shield,
  ShieldOff,
  TrendingUp,
  Scissors,
  TestTube,
  DollarSign,
  Target,
  Moon,
  SearchCheck,
  Binoculars,
  RotateCcw
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

interface FantasyPosition {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  entry_price_usd: number;
  entry_amount_sol: number;
  token_amount: number;
  current_price_usd: number | null;
  unrealized_pnl_sol: number | null;
  unrealized_pnl_percent: number | null;
  status: string;
  target_multiplier: number;
  main_sold_at: string | null;
  main_realized_pnl_sol: number | null;
  moonbag_active: boolean | null;
  moonbag_current_value_sol: number | null;
  moonbag_drawdown_pct: number | null;
  exit_at: string | null;
  exit_reason: string | null;
  total_realized_pnl_sol: number | null;
  total_pnl_percent: number | null;
  peak_multiplier: number | null;
  created_at: string;
  entry_at: string | null;
  pumpfun_watchlist?: {
    first_seen_at: string;
    qualified_at: string | null;
  } | null;
}

interface FantasyStats {
  totalPositions: number;
  openPositions: number;
  moonbagPositions: number;
  closedPositions: number;
  targetsHit: number;
  winRate: number;
  totalInvested: number;
  totalRealizedPnl: number;
  unrealizedPnl: number;
  moonbagPnl: number;
  avgPnlPerTrade: number;
  targetHitRate: number;
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
  // Phase 5: Global Safeguards
  kill_switch_active?: boolean;
  kill_switch_reason?: string | null;
  kill_switch_activated_at?: string | null;
  daily_buy_cap?: number;
  daily_buys_today?: number;
  max_watchdog_count?: number;
  active_watchdog_count?: number;
  min_rolling_win_rate?: number;
  last_prune_at?: string | null;
  fantasy_mode_enabled?: boolean;
  fantasy_buy_amount_usd?: number;
  fantasy_target_multiplier?: number;
  fantasy_moonbag_percentage?: number;
  fantasy_sell_percentage?: number;
}

interface SafeguardStatus {
  killSwitchActive: boolean;
  killSwitchReason: string | null;
  dailyBuysToday: number;
  dailyBuyCap: number;
  buyingHalted: boolean;
  activeWatchdogCount: number;
  maxWatchdogCount: number;
  prunedCount: number;
  rollingWinRate: number;
  minWinRate: number;
  actions: string[];
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
  const [mainTab, setMainTab] = useState<'watchlist' | 'candidates' | 'fantasy' | 'logs'>('watchlist');
  const [watchlistFilter, setWatchlistFilter] = useState<'all' | 'watching' | 'qualified' | 'rejected' | 'dead'>('all');
  const [fantasyFilter, setFantasyFilter] = useState<'open' | 'closed' | 'all'>('open');
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
  
  // Phase 5: Safeguard status
  const [safeguardStatus, setSafeguardStatus] = useState<SafeguardStatus | null>(null);
  
  // Fantasy tracking
  const [fantasyPositions, setFantasyPositions] = useState<FantasyPosition[]>([]);
  const [fantasyStats, setFantasyStats] = useState<FantasyStats | null>(null);
  const [loadingFantasy, setLoadingFantasy] = useState(false);

  // System Reset state
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetCounts, setResetCounts] = useState<Record<string, number>>({});
  const [keepLearnings, setKeepLearnings] = useState(true);

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

  // Fetch safeguard status
  const fetchSafeguardStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('pumpfun-global-safeguards', {
        body: { action: 'check' }
      });
      if (error) throw error;
      if (data?.status) {
        setSafeguardStatus(data.status);
      }
    } catch (error) {
      console.error('Error fetching safeguard status:', error);
    }
  }, []);

  // Fetch fantasy positions and stats
  const fetchFantasyData = useCallback(async () => {
    setLoadingFantasy(true);
    try {
      // Fetch positions with watchlist join for first_seen_at and qualified_at
      // Filter by status based on fantasyFilter
      let query = supabase
        .from('pumpfun_fantasy_positions')
        .select('*, pumpfun_watchlist:watchlist_id(first_seen_at, qualified_at)')
        .order('created_at', { ascending: false })
        .limit(100);

      // Apply status filter (default to 'open' to avoid showing duplicates)
      if (fantasyFilter !== 'all') {
        query = query.eq('status', fantasyFilter);
      }

      const { data: positions, error: posError } = await query;

      if (posError) throw posError;
      setFantasyPositions((positions || []) as FantasyPosition[]);

      // Fetch stats from edge function
      const { data: statsData, error: statsError } = await supabase.functions.invoke('pumpfun-fantasy-sell-monitor', {
        body: { action: 'stats' }
      });

      if (!statsError && statsData) {
        setFantasyStats(statsData as FantasyStats);
      }
    } catch (error) {
      console.error('Error fetching fantasy data:', error);
    } finally {
      setLoadingFantasy(false);
    }
  }, [fantasyFilter]);

  // Reset kill switch
  const resetKillSwitch = async () => {
    try {
      const { error } = await supabase.functions.invoke('pumpfun-global-safeguards', {
        body: { action: 'reset_kill_switch' }
      });
      if (error) throw error;
      toast.success('Kill switch reset');
      await fetchSafeguardStatus();
      await fetchConfig();
    } catch (error) {
      console.error('Error resetting kill switch:', error);
      toast.error('Failed to reset kill switch');
    }
  };

  // Update priority scores
  const updatePriorityScores = async () => {
    try {
      const { error } = await supabase.functions.invoke('pumpfun-global-safeguards', {
        body: { action: 'update_priorities' }
      });
      if (error) throw error;
      toast.success('Priority scores updated');
      await fetchWatchlist();
    } catch (error) {
      console.error('Error updating priorities:', error);
      toast.error('Failed to update priorities');
    }
  };

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchWatchlist(), fetchCandidates(), fetchConfig(), fetchDiscoveryLogs(), fetchSafeguardStatus()]);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pumpfun_monitor_config' }, () => {
        fetchConfig();
        fetchSafeguardStatus();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWatchlist, fetchCandidates, fetchConfig, fetchDiscoveryLogs, fetchSafeguardStatus]);

  // Refetch fantasy data when filter changes
  useEffect(() => {
    if (mainTab === 'fantasy') {
      fetchFantasyData();
    }
  }, [fantasyFilter, fetchFantasyData, mainTab]);

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

  // Manual Add to Fantasy - add any token to fantasy tracking
  const [addingToFantasy, setAddingToFantasy] = useState<string | null>(null);
  const [manualMintInput, setManualMintInput] = useState('');
  
  const addToFantasy = async (tokenMint: string, tokenSymbol?: string) => {
    if (!tokenMint || tokenMint.length < 32) {
      toast.error('Invalid token mint address');
      return;
    }
    
    setAddingToFantasy(tokenMint);
    try {
      const { data, error } = await supabase.functions.invoke('pumpfun-fantasy-executor', {
        body: { action: 'manual_buy', tokenMint }
      });

      if (error) throw error;
      
      if (data?.success) {
        const usdAmount = data.position?.amountUsd || config?.fantasy_buy_amount_usd || 10;
        toast.success(`🎮 Added ${data.position?.symbol || tokenSymbol || tokenMint.slice(0, 6)} to Fantasy @ $${data.position?.entryPrice?.toFixed(8)} ($${usdAmount} position)`, {
          duration: 5000
        });
        await fetchFantasyData();
      } else {
        toast.error(data?.error || 'Failed to add to fantasy');
      }
    } catch (error) {
      console.error('Error adding to fantasy:', error);
      toast.error(`Failed: ${error}`);
    } finally {
      setAddingToFantasy(null);
    }
  };

  const handleManualFantasyAdd = async () => {
    if (!manualMintInput.trim()) {
      toast.error('Please enter a token mint address');
      return;
    }
    await addToFantasy(manualMintInput.trim());
    setManualMintInput('');
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

  // Fetch counts for reset confirmation
  const fetchResetCounts = async () => {
    try {
      const [watchlistRes, fantasyRes, candidatesRes, logsRes, learningsRes] = await Promise.all([
        supabase.from('pumpfun_watchlist').select('id', { count: 'exact', head: true }),
        supabase.from('pumpfun_fantasy_positions').select('id', { count: 'exact', head: true }),
        supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }),
        supabase.from('pumpfun_discovery_logs').select('id', { count: 'exact', head: true }),
        supabase.from('pumpfun_trade_learnings').select('id', { count: 'exact', head: true }),
      ]);
      setResetCounts({
        watchlist: watchlistRes.count || 0,
        fantasy: fantasyRes.count || 0,
        candidates: candidatesRes.count || 0,
        logs: logsRes.count || 0,
        learnings: learningsRes.count || 0,
      });
    } catch (error) {
      console.error('Error fetching reset counts:', error);
    }
  };

  // System reset - delete all Pump.fun monitoring data (preserves discovery logs)
  const handleSystemReset = async () => {
    setIsResetting(true);
    try {
      // Delete in order for foreign key constraints
      // Note: pumpfun_discovery_logs is NEVER deleted - used for historical reference & duplicate ticker detection
      await supabase.from('pumpfun_fantasy_positions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('pumpfun_fantasy_stats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('pumpfun_buy_candidates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('pumpfun_poll_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('pumpfun_daily_stats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Conditionally delete trade learnings based on user preference
      if (!keepLearnings) {
        await supabase.from('pumpfun_trade_learnings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      
      await supabase.from('pumpfun_watchlist').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      const learningsMsg = keepLearnings ? ' (learnings preserved)' : '';
      toast.success(`System reset complete!${learningsMsg} Starting fresh.`);
      
      // Refresh all data
      setWatchlist([]);
      setCandidates([]);
      setFantasyPositions([]);
      setFantasyStats(null);
      setLogsPage(0);
      setLastPollSummary(null);
      
      // Refetch to confirm
      await Promise.all([fetchWatchlist(), fetchCandidates(), fetchFantasyData(), fetchConfig(), fetchDiscoveryLogs()]);
    } catch (error) {
      console.error('System reset error:', error);
      toast.error('Reset failed: ' + (error as Error).message);
    } finally {
      setIsResetting(false);
      setShowResetDialog(false);
      setResetConfirmText('');
      setKeepLearnings(true); // Reset checkbox to default
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
          
          {/* System Reset */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              fetchResetCounts();
              setShowResetDialog(true);
            }}
            className="text-destructive border-destructive/50 hover:bg-destructive/10"
          >
            <RotateCcw className="h-4 w-4" />
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

      {/* Phase 5: Global Safeguards Panel */}
      {(safeguardStatus || config?.kill_switch_active) && (
        <Card className={`${safeguardStatus?.killSwitchActive || config?.kill_switch_active ? 'border-red-500/50 bg-red-500/5' : 'bg-muted/30'}`}>
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                {safeguardStatus?.killSwitchActive || config?.kill_switch_active ? (
                  <ShieldOff className="h-4 w-4 text-red-500" />
                ) : (
                  <Shield className="h-4 w-4 text-green-500" />
                )}
                <span className="font-medium">Safeguards</span>
              </div>

              {/* Kill Switch Status */}
              {(safeguardStatus?.killSwitchActive || config?.kill_switch_active) && (
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">🚨 KILL SWITCH ACTIVE</Badge>
                  {(safeguardStatus?.killSwitchReason || config?.kill_switch_reason) && (
                    <span className="text-xs text-red-400">{safeguardStatus?.killSwitchReason || config?.kill_switch_reason}</span>
                  )}
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={resetKillSwitch}>
                    Reset
                  </Button>
                </div>
              )}

              {/* Daily Buy Cap */}
              <div className="flex items-center gap-1">
                <ShoppingCart className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Daily:</span>
                <span className={`font-mono ${safeguardStatus?.buyingHalted ? 'text-red-500' : ''}`}>
                  {safeguardStatus?.dailyBuysToday ?? config?.daily_buys_today ?? 0}/{safeguardStatus?.dailyBuyCap ?? config?.daily_buy_cap ?? 20}
                </span>
                {safeguardStatus?.buyingHalted && (
                  <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/30">HALTED</Badge>
                )}
              </div>

              {/* Watchdog Count */}
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Watchdogs:</span>
                <span className="font-mono">
                  {safeguardStatus?.activeWatchdogCount ?? config?.active_watchdog_count ?? watchlistStats.watching}/{safeguardStatus?.maxWatchdogCount ?? config?.max_watchdog_count ?? 500}
                </span>
                {safeguardStatus?.prunedCount !== undefined && safeguardStatus.prunedCount > 0 && (
                  <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-500 border-orange-500/30">
                    <Scissors className="h-3 w-3 mr-1" />
                    {safeguardStatus.prunedCount} pruned
                  </Badge>
                )}
              </div>

              {/* Rolling Win Rate */}
              {safeguardStatus && (
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Win Rate:</span>
                  <span className={`font-mono ${safeguardStatus.rollingWinRate < safeguardStatus.minWinRate ? 'text-red-500' : 'text-green-500'}`}>
                    {(safeguardStatus.rollingWinRate * 100).toFixed(1)}%
                  </span>
                  <span className="text-xs text-muted-foreground">(min: {(safeguardStatus.minWinRate * 100).toFixed(0)}%)</span>
                </div>
              )}

              {/* Actions */}
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={updatePriorityScores}>
                  Update Priorities
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={fetchSafeguardStatus}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>
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
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/30">
                    <Switch 
                      checked={configEdits.fantasy_mode_enabled ?? true}
                      onCheckedChange={(checked) => setConfigEdits(prev => ({ ...prev, fantasy_mode_enabled: checked }))} 
                    />
                    <TestTube className="h-3 w-3 text-purple-400" />
                    <span className="text-xs font-medium text-purple-400">
                      {configEdits.fantasy_mode_enabled ? 'Fantasy Mode' : 'LIVE MODE'}
                    </span>
                  </div>
                  {/* Fantasy Config */}
                  {configEdits.fantasy_mode_enabled && (
                    <div className="flex items-center gap-3 px-2 py-1 rounded-md bg-muted/50 border border-border/50">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-green-400" />
                        <Input 
                          type="number" 
                          step="1" 
                          min="1"
                          className="w-16 h-6 text-xs" 
                          value={configEdits.fantasy_buy_amount_usd ?? 10} 
                          onChange={(e) => setConfigEdits(prev => ({ ...prev, fantasy_buy_amount_usd: parseFloat(e.target.value) || 10 }))} 
                        />
                        <span className="text-xs text-muted-foreground">USD</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Target className="h-3 w-3 text-blue-400" />
                        <Input 
                          type="number" 
                          step="0.1" 
                          min="1.1"
                          className="w-14 h-6 text-xs" 
                          value={configEdits.fantasy_target_multiplier ?? 1.5} 
                          onChange={(e) => setConfigEdits(prev => ({ ...prev, fantasy_target_multiplier: parseFloat(e.target.value) || 1.5 }))} 
                        />
                        <span className="text-xs text-muted-foreground">x</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Moon className="h-3 w-3 text-purple-400" />
                        <Input 
                          type="number" 
                          step="1" 
                          min="0"
                          max="100"
                          className="w-12 h-6 text-xs" 
                          value={configEdits.fantasy_moonbag_percentage ?? 10} 
                          onChange={(e) => setConfigEdits(prev => ({ ...prev, fantasy_moonbag_percentage: parseFloat(e.target.value) || 10 }))} 
                        />
                        <span className="text-xs text-muted-foreground">% bag</span>
                      </div>
                    </div>
                  )}
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
      <Tabs value={mainTab} onValueChange={(v) => { 
        setMainTab(v as 'watchlist' | 'candidates' | 'fantasy' | 'logs');
        if (v === 'fantasy') fetchFantasyData();
      }}>
        <TabsList>
          <TabsTrigger value="watchlist" className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            Watchlist ({watchlistStats.watching})
          </TabsTrigger>
          <TabsTrigger value="candidates" className="flex items-center gap-1">
            <Rocket className="h-3 w-3" />
            Qualified ({watchlistStats.qualified})
          </TabsTrigger>
          <TabsTrigger value="fantasy" className="flex items-center gap-1">
            <TestTube className="h-3 w-3" />
            Fantasy ({fantasyPositions.length})
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
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5 text-purple-500 hover:text-purple-400 hover:bg-purple-500/10"
                                  onClick={() => addToFantasy(item.token_mint, item.token_symbol)}
                                  disabled={addingToFantasy === item.token_mint}
                                  title="Add to Fantasy">
                                  {addingToFantasy === item.token_mint ? (
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <TestTube className="h-3 w-3" />
                                  )}
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

        {/* Fantasy Tab */}
        <TabsContent value="fantasy" className="mt-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TestTube className="h-4 w-4" />
                  Fantasy Mode Positions
                  {config?.fantasy_mode_enabled && <Badge variant="outline" className="bg-green-500/10 text-green-500">Active</Badge>}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Status filter tabs */}
                  <div className="flex items-center border rounded-md overflow-hidden">
                    <button
                      className={`px-3 py-1 text-xs font-medium transition-colors ${fantasyFilter === 'open' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                      onClick={() => setFantasyFilter('open')}
                    >
                      Open
                    </button>
                    <button
                      className={`px-3 py-1 text-xs font-medium transition-colors ${fantasyFilter === 'closed' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                      onClick={() => setFantasyFilter('closed')}
                    >
                      Closed
                    </button>
                    <button
                      className={`px-3 py-1 text-xs font-medium transition-colors ${fantasyFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                      onClick={() => setFantasyFilter('all')}
                    >
                      All
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchFantasyData} disabled={loadingFantasy}>
                    {loadingFantasy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Manual Add to Fantasy */}
              <div className="flex items-center gap-2 mb-4 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                <TestTube className="h-4 w-4 text-purple-400" />
                <span className="text-xs text-purple-400 font-medium">Add Token to Fantasy:</span>
                <Input 
                  placeholder="Paste token mint address..." 
                  className="flex-1 h-8 text-xs"
                  value={manualMintInput}
                  onChange={(e) => setManualMintInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualFantasyAdd()}
                />
                <Button 
                  size="sm" 
                  onClick={handleManualFantasyAdd}
                  disabled={!!addingToFantasy || !manualMintInput.trim()}
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  {addingToFantasy ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Add
                </Button>
              </div>

              {/* Stats Summary */}
              {fantasyStats && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4 text-sm">
                  <div className="bg-muted/30 rounded p-2">
                    <span className="text-muted-foreground text-xs">Total</span>
                    <div className="font-bold">{fantasyStats.totalPositions}</div>
                  </div>
                  <div className="bg-blue-500/10 rounded p-2">
                    <span className="text-muted-foreground text-xs">Open</span>
                    <div className="font-bold text-blue-500">{fantasyStats.openPositions}</div>
                  </div>
                  <div className="bg-purple-500/10 rounded p-2">
                    <span className="text-muted-foreground text-xs">Moonbag</span>
                    <div className="font-bold text-purple-500">{fantasyStats.moonbagPositions}</div>
                  </div>
                  <div className="bg-green-500/10 rounded p-2">
                    <span className="text-muted-foreground text-xs">Target Hit %</span>
                    <div className="font-bold text-green-500">{fantasyStats.targetHitRate?.toFixed(1) || 0}%</div>
                  </div>
                  <div className="bg-green-500/10 rounded p-2">
                    <span className="text-muted-foreground text-xs">Win Rate</span>
                    <div className="font-bold text-green-500">{fantasyStats.winRate?.toFixed(1) || 0}%</div>
                  </div>
                  <div className={`rounded p-2 ${(fantasyStats.totalRealizedPnl || 0) >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <span className="text-muted-foreground text-xs">Total P&L</span>
                    <div className={`font-bold ${(fantasyStats.totalRealizedPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(fantasyStats.totalRealizedPnl || 0) >= 0 ? '+' : ''}{(fantasyStats.totalRealizedPnl || 0).toFixed(4)} SOL
                    </div>
                  </div>
                </div>
              )}

              {/* Positions Table */}
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead compact>Symbol</TableHead>
                      <TableHead compact>Token</TableHead>
                      <TableHead compact>Entry</TableHead>
                      <TableHead compact>Current</TableHead>
                      <TableHead compact>ATH</TableHead>
                      <TableHead compact>Gain</TableHead>
                      <TableHead compact>Target</TableHead>
                      <TableHead compact>Status</TableHead>
                      <TableHead compact>P&L</TableHead>
                      <TableHead compact>Buy Time (Toronto)</TableHead>
                      <TableHead compact>Links</TableHead>
                      <TableHead compact>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fantasyPositions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                          No fantasy positions yet. Tokens reaching 'buy_now' status will appear here.
                        </TableCell>
                      </TableRow>
                    ) : (
                      fantasyPositions.map((pos) => {
                        const currentGain = pos.current_price_usd && pos.entry_price_usd ? pos.current_price_usd / pos.entry_price_usd : 0;
                        const targetMultiplier = pos.target_multiplier || 1.5;
                        const targetHit = currentGain >= targetMultiplier;
                        const pnl = pos.status === 'closed' ? pos.total_realized_pnl_sol : pos.unrealized_pnl_sol;
                        const athMultiplier = pos.peak_multiplier || currentGain;
                        return (
                          <TableRow key={pos.id}>
                            <TableCell compact className="font-medium">{pos.token_symbol || '???'}</TableCell>
                            <TableCell compact>
                              <div className="flex items-center gap-1">
                                <span className="text-primary font-mono text-xs">
                                  {pos.token_mint?.slice(0, 6)}...
                                </span>
                                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => copyToClipboard(pos.token_mint)}>
                                  <Copy className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell compact className="text-xs font-mono">${pos.entry_price_usd?.toFixed(8) || '0.00000000'}</TableCell>
                            <TableCell compact className="text-xs font-mono">${pos.current_price_usd?.toFixed(8) || '0.00000000'}</TableCell>
                            <TableCell compact className={`text-xs font-medium ${athMultiplier >= targetMultiplier ? 'text-green-500' : athMultiplier >= 1 ? 'text-yellow-500' : 'text-red-500'}`}>
                              {athMultiplier.toFixed(2)}x
                            </TableCell>
                            <TableCell compact className={`text-xs font-medium ${currentGain >= targetMultiplier ? 'text-green-500' : currentGain < 1 ? 'text-red-500' : 'text-yellow-500'}`}>
                              {currentGain.toFixed(2)}x
                            </TableCell>
                            <TableCell compact className={`text-xs font-medium ${targetHit ? 'text-green-500' : 'text-muted-foreground'}`}>
                              {targetMultiplier.toFixed(2)}x
                              {targetHit && <span className="ml-1">✓</span>}
                            </TableCell>
                            <TableCell compact>
                              <Badge variant="outline" className={
                                pos.status === 'open' ? 'bg-blue-500/10 text-blue-500' :
                                pos.status === 'moonbag' ? 'bg-purple-500/10 text-purple-500' :
                                pos.status === 'closed' ? 'bg-muted text-muted-foreground' : ''
                              }>{pos.status}</Badge>
                            </TableCell>
                            <TableCell compact className={`text-xs ${(pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {(pnl || 0) >= 0 ? '+' : ''}{(pnl || 0).toFixed(4)}
                            </TableCell>
                            <TableCell compact className="text-xs text-muted-foreground font-mono">
                              {(() => {
                                // Fantasy buy execution time (when we actually bought)
                                const buyDate = new Date(pos.created_at);
                                const buyTimeStr = buyDate.toISOString().slice(11, 19);
                                const buyDateStr = buyDate.toISOString().slice(0, 10);
                                const fullTimestamp = `${buyDateStr} ${buyTimeStr} UTC`;
                                
                                // Discovery time from watchlist (when token was first detected on Pump.fun)
                                const discoveryTime = pos.pumpfun_watchlist?.first_seen_at;
                                const discoveryDate = discoveryTime ? new Date(discoveryTime) : null;
                                const discoveryTimeStr = discoveryDate?.toISOString().slice(11, 19);
                                
                                // Qualified time (when promoted to watching)
                                const qualifiedTime = pos.pumpfun_watchlist?.qualified_at;
                                const qualifiedDate = qualifiedTime ? new Date(qualifiedTime) : null;
                                const qualifiedTimeStr = qualifiedDate?.toISOString().slice(11, 19);
                                
                                const copyTimestamp = () => {
                                  navigator.clipboard.writeText(fullTimestamp);
                                  toast.success('Timestamp copied');
                                };
                                
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    {/* 1. Found on Pump.fun - magnifying glass with check */}
                                    {discoveryTimeStr && (
                                      <div className="flex items-center gap-1" title="Found on Pump.fun">
                                        <SearchCheck className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-blue-400">{discoveryTimeStr}</span>
                                      </div>
                                    )}
                                    {/* 2. Promoted to Watching - binoculars */}
                                    {qualifiedTimeStr && (
                                      <div className="flex items-center gap-1" title="Promoted to Watching">
                                        <Binoculars className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-purple-400">{qualifiedTimeStr}</span>
                                      </div>
                                    )}
                                    {/* 3. Fantasy Buy - dollar sign + timer */}
                                    <div className="flex items-center gap-1" title="Fantasy Buy">
                                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                                      <Timer className="h-3 w-3 text-muted-foreground -ml-1" />
                                      <span className="text-yellow-500 font-semibold">{buyTimeStr}</span>
                                      <button 
                                        onClick={copyTimestamp}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        title="Copy timestamp"
                                      >
                                        <Copy className="h-3 w-3" />
                                      </button>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground/70">{buyDateStr} UTC</span>
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell compact>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                  onClick={() => window.open(`https://pump.fun/${pos.token_mint}`, '_blank')}
                                  title="View on Pump.fun">
                                  <img src="/launchpad-logos/pumpfun.png" alt="Pump.fun" className="h-4 w-4 rounded-sm" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                  onClick={() => window.open(`https://dexscreener.com/solana/${pos.token_mint}`, '_blank')}
                                  title="View on DexScreener">
                                  <img src="/launchpad-logos/dexscreener.png" alt="DexScreener" className="h-4 w-4 rounded-sm" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell compact>
                              {pos.status === 'open' && (
                                <Button 
                                  variant="destructive" 
                                  size="sm" 
                                  className="h-6 text-xs px-2"
                                  onClick={async () => {
                                    try {
                                      const { error } = await supabase
                                        .from('pumpfun_fantasy_positions')
                                        .update({ 
                                          status: 'closed',
                                          sell_type: 'manual',
                                          closed_at: new Date().toISOString(),
                                          total_realized_pnl_sol: pos.unrealized_pnl_sol
                                        })
                                        .eq('id', pos.id);
                                      if (error) throw error;
                                      toast.success(`Sold ${pos.token_symbol}`);
                                      fetchFantasyData();
                                    } catch (err: any) {
                                      toast.error(err.message);
                                    }
                                  }}
                                >
                                  Sell
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
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

      {/* System Reset Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Reset Pump.fun Monitoring System?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>This will permanently delete operational data:</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-500" />
                    <span>{resetCounts.watchlist || 0} watchlist tokens</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <TestTube className="h-4 w-4 text-purple-500" />
                    <span>{resetCounts.fantasy || 0} fantasy positions</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-green-500" />
                    <span>{resetCounts.candidates || 0} buy candidates</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span>Poll runs &amp; daily stats</span>
                  </li>
                  {!keepLearnings && (
                    <li className="flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{resetCounts.learnings || 0} trade learnings</span>
                    </li>
                  )}
                </ul>
                
                {/* Preserved data section */}
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-sm font-medium text-green-500">✓ Data preserved:</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>{resetCounts.logs || 0} discovery logs (for duplicate ticker detection)</span>
                    </li>
                    {keepLearnings && (
                      <li className="flex items-center gap-2">
                        <Binoculars className="h-4 w-4" />
                        <span>{resetCounts.learnings || 0} trade learnings</span>
                      </li>
                    )}
                    <li className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Configuration settings</span>
                    </li>
                  </ul>
                </div>
                
                {/* Keep learnings checkbox */}
                <div className="flex items-center space-x-2 border border-border rounded-md p-3 bg-muted/30">
                  <Checkbox 
                    id="keep-learnings" 
                    checked={keepLearnings}
                    onCheckedChange={(checked) => setKeepLearnings(checked === true)}
                  />
                  <label htmlFor="keep-learnings" className="text-sm cursor-pointer">
                    Keep accumulated trade learnings <span className="text-muted-foreground">(recommended)</span>
                  </label>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm">Type <code className="bg-muted px-1.5 py-0.5 rounded font-mono">RESET</code> to confirm:</p>
                  <Input 
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                    placeholder="Type RESET to confirm"
                    className="font-mono"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetConfirmText !== 'RESET' || isResetting}
              onClick={handleSystemReset}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isResetting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Everything'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
