import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  RefreshCw, 
  Loader2,
  Trophy,
  Target,
  Wallet,
  BarChart3,
  Clock,
  Trash2,
  ExternalLink,
  Activity,
  Zap,
  AlertTriangle,
  Eye,
  EyeOff,
  GitBranch,
  Shield,
  Ban,
  CheckCircle,
  Filter,
  Twitter,
  LineChart,
  Radio,
  Frown
} from 'lucide-react';
import { TokenChartModal } from './TokenChartModal';
import { FantasyDataCleanup } from './FantasyDataCleanup';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FantasyPosition {
  id: string;
  channel_config_id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  entry_price_usd: number;
  entry_amount_usd: number;
  token_amount: number | null;
  current_price_usd: number | null;
  unrealized_pnl_usd: number | null;
  unrealized_pnl_percent: number | null;
  realized_pnl_usd: number | null;
  realized_pnl_percent: number | null;
  status: string;
  caller_username: string | null;
  caller_display_name: string | null;
  channel_name: string | null;
  created_at: string;
  sold_at: string | null;
  sold_price_usd: number | null;
  is_active: boolean | null;
  target_sell_multiplier: number | null;
  stop_loss_pct: number | null;
  stop_loss_enabled: boolean | null;
  auto_sell_triggered: boolean | null;
  peak_price_usd: number | null;
  peak_price_at: string | null;
  peak_multiplier: number | null;
  // Trail tracking fields
  trail_tracking_enabled: boolean | null;
  trail_current_price_usd: number | null;
  trail_peak_price_usd: number | null;
  trail_peak_multiplier: number | null;
  trail_peak_at: string | null;
  trail_low_price_usd: number | null;
  trail_low_at: string | null;
  trail_last_updated_at: string | null;
  // Developer tracking fields
  developer_id: string | null;
  developer_risk_level: string | null;
  developer_reputation_score: number | null;
  developer_warning: string | null;
  developer_twitter_handle: string | null;
  developer_total_tokens: number | null;
  developer_rug_count: number | null;
  adjusted_by_dev_risk: boolean | null;
  original_sell_multiplier: number | null;
  // RugCheck fields
  rugcheck_score: number | null;
  rugcheck_normalised: number | null;
  rugcheck_risks: any[] | null;
  rugcheck_passed: boolean | null;
  rugcheck_checked_at: string | null;
  skip_reason: string | null;
  // Timestamp and ATH fields
  message_received_at: string | null;
  ath_price_usd: number | null;
  ath_at: string | null;
  ath_multiplier: number | null;
  ath_source: string | null;
  // Near miss and close enough tracking
  near_miss_logged: boolean | null;
  near_miss_multiplier: number | null;
  near_miss_at: string | null;
  close_enough_triggered: boolean | null;
  peak_trailing_stop_enabled: boolean | null;
  peak_trailing_stop_pct: number | null;
  peak_trailing_stop_triggered: boolean | null;
  // Exclusion from stats fields
  exclude_from_stats: boolean | null;
  exclusion_reason: string | null;
  // Whale tracking
  whale_name: string | null;
  was_first_whale: boolean | null;
}

interface PortfolioStats {
  totalPositions: number;
  openPositions: number;
  closedPositions: number;
  activePositions: number;
  totalInvested: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  winRate: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  nearTargetCount: number;
  missedOpportunities: number;
  trophyWins: number;
  trophyPnl: number;
  toiletLosses: number;
  toiletPnl: number;
  // New metrics
  avgPeakMultiplier: number;
  avgTargetProximity: number;
  nearMissCount: number;
  closeEnoughSells: number;
  trailingStopSells: number;
}

const SELL_MULTIPLIERS = [
  { value: 1.25, label: '1.25x (+25%)' },
  { value: 1.35, label: '1.35x (+35%)' },
  { value: 1.5, label: '1.5x (+50%)' },
  { value: 1.75, label: '1.75x (+75%)' },
  { value: 2, label: '2x (+100%)' },
  { value: 2.5, label: '2.5x (+150%)' },
  { value: 3, label: '3x (+200%)' },
  { value: 5, label: '5x (+400%)' },
  { value: 10, label: '10x (+900%)' },
  { value: 20, label: '20x' },
  { value: 40, label: '40x' },
];

export function FantasyPortfolioDashboard() {
  const [positions, setPositions] = useState<FantasyPosition[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [backfillingPeaks, setBackfillingPeaks] = useState(false);
  const [backfillingCalls, setBackfillingCalls] = useState(false);
  const [backfillingRugcheck, setBackfillingRugcheck] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [maintainOnClose, setMaintainOnClose] = useState(() => {
    return localStorage.getItem('fantasy_maintain_on_close') === 'true';
  });
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [serverLastUpdate, setServerLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get unique channel names for filter
  const uniqueChannels = Array.from(new Set(positions.map(p => p.channel_name).filter(Boolean))) as string[];

  // Developer risk badge component
  const DevRiskBadge = ({ pos }: { pos: FantasyPosition }) => {
    if (!pos.developer_risk_level) return null;

    const getRiskStyles = (level: string) => {
      switch (level) {
        case 'critical':
          return { icon: Ban, color: 'text-red-500 bg-red-500/10 border-red-500/30', label: 'BLACKLISTED' };
        case 'high':
          return { icon: AlertTriangle, color: 'text-orange-500 bg-orange-500/10 border-orange-500/30', label: 'High Risk' };
        case 'medium':
          return { icon: Shield, color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30', label: 'Med Risk' };
        case 'low':
          return { icon: CheckCircle, color: 'text-green-500 bg-green-500/10 border-green-500/30', label: 'Low Risk' };
        case 'verified':
          return { icon: CheckCircle, color: 'text-blue-500 bg-blue-500/10 border-blue-500/30', label: 'Verified' };
        default:
          return { icon: Shield, color: 'text-muted-foreground bg-muted/10 border-muted/30', label: 'Unknown' };
      }
    };

    const styles = getRiskStyles(pos.developer_risk_level);
    const Icon = styles.icon;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={`gap-1 text-xs ${styles.color}`}>
              <Icon className="h-3 w-3" />
              {styles.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              {pos.developer_warning && (
                <p className="text-destructive font-medium">{pos.developer_warning}</p>
              )}
              <p className="text-xs">Score: {pos.developer_reputation_score || '?'}/100</p>
              {pos.developer_total_tokens && (
                <p className="text-xs">Tokens: {pos.developer_total_tokens}</p>
              )}
              {pos.developer_rug_count && pos.developer_rug_count > 0 && (
                <p className="text-xs text-destructive">⚠️ Rugs: {pos.developer_rug_count}</p>
              )}
              {pos.developer_twitter_handle && (
                <p className="text-xs flex items-center gap-1">
                  <Twitter className="h-3 w-3" />
                  @{pos.developer_twitter_handle}
                </p>
              )}
              {pos.adjusted_by_dev_risk && pos.original_sell_multiplier && (
                <p className="text-xs text-amber-500">
                  Target adjusted: {pos.original_sell_multiplier}x → {pos.target_sell_multiplier}x
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // RugCheck badge component
  const RugCheckBadge = ({ pos }: { pos: FantasyPosition }) => {
    if (pos.rugcheck_normalised === null && pos.rugcheck_normalised === undefined) return null;

    const score = pos.rugcheck_normalised ?? 0;
    const passed = pos.rugcheck_passed ?? true;
    
    const getScoreStyles = () => {
      if (!passed) {
        return { color: 'text-red-500 bg-red-500/10 border-red-500/30', label: 'FAIL' };
      }
      if (score <= 20) {
        return { color: 'text-green-500 bg-green-500/10 border-green-500/30', label: `${score}` };
      }
      if (score <= 35) {
        return { color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30', label: `${score}` };
      }
      if (score <= 50) {
        return { color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30', label: `${score}` };
      }
      return { color: 'text-orange-500 bg-orange-500/10 border-orange-500/30', label: `${score}` };
    };

    const styles = getScoreStyles();
    const risks = pos.rugcheck_risks || [];
    const topRisks = risks.slice(0, 3);

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={`gap-1 text-xs ${styles.color}`}>
              <Shield className="h-3 w-3" />
              RC:{styles.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <div className="space-y-1">
              <p className="font-medium">RugCheck Score: {score}/100</p>
              <p className="text-xs text-muted-foreground">
                {score <= 20 ? 'Very Safe' : score <= 35 ? 'Safe' : score <= 50 ? 'Moderate Risk' : 'Higher Risk'}
              </p>
              {topRisks.length > 0 && (
                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs font-medium mb-1">Detected Risks:</p>
                  {topRisks.map((risk: any, i: number) => (
                    <p key={i} className="text-xs text-amber-500">
                      • {risk.name || risk.description || 'Unknown risk'}
                    </p>
                  ))}
                  {risks.length > 3 && (
                    <p className="text-xs text-muted-foreground">+{risks.length - 3} more</p>
                  )}
                </div>
              )}
              {pos.rugcheck_checked_at && (
                <p className="text-xs text-muted-foreground pt-1">
                  Checked: {formatDistanceToNow(new Date(pos.rugcheck_checked_at), { addSuffix: true })}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  useEffect(() => {
    loadPositions();
    loadAutoMonitorState();
    loadServerLastUpdate();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('fantasy-positions-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'telegram_fantasy_positions'
      }, () => {
        loadPositions();
        loadServerLastUpdate();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load persisted auto-monitor state from database
  const loadAutoMonitorState = async () => {
    try {
      const { data } = await supabase
        .from('telegram_channel_config')
        .select('auto_monitor_enabled')
        .eq('is_active', true)
        .limit(1)
        .single();
      
      if (data?.auto_monitor_enabled) {
        setAutoRefresh(true);
      }
    } catch (err) {
      // Ignore errors, default to false
    }
  };

  // Load the most recent position update time (from server cron)
  const loadServerLastUpdate = async () => {
    try {
      const { data } = await supabase
        .from('telegram_fantasy_positions')
        .select('updated_at')
        .eq('status', 'open')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data?.updated_at) {
        setServerLastUpdate(new Date(data.updated_at));
      }
    } catch (err) {
      // Ignore errors
    }
  };

  // Save auto-monitor state to database
  const handleAutoRefreshChange = async (checked: boolean) => {
    setAutoRefresh(checked);
    try {
      await supabase
        .from('telegram_channel_config')
        .update({ auto_monitor_enabled: checked } as any)
        .eq('is_active', true);
    } catch (err) {
      console.error('Error saving auto-monitor state:', err);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      monitorPrices();
      intervalRef.current = setInterval(() => {
        monitorPrices();
      }, 5000); // 5 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  const loadPositions = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_fantasy_positions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedPositions = (data || []) as FantasyPosition[];
      setPositions(typedPositions);
      calculateStats(typedPositions);
    } catch (err) {
      console.error('Error loading positions:', err);
      toast.error('Failed to load fantasy positions');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (positions: FantasyPosition[]) => {
    // Filter out excluded positions for stats calculations
    const statsPositions = positions.filter(p => !p.exclude_from_stats);
    
    const open = statsPositions.filter(p => p.status === 'open');
    const closed = statsPositions.filter(p => p.status === 'closed' || p.status === 'sold');
    const active = open.filter(p => p.is_active !== false); // null treated as active
    
    // Trophy wins: auto-sold with profit
    const trophyWinsArr = closed.filter(p => p.auto_sell_triggered && (p.realized_pnl_usd || 0) > 0);
    const trophyWins = trophyWinsArr.length;
    const trophyPnl = trophyWinsArr.reduce((sum, p) => sum + (p.realized_pnl_usd || 0), 0);
    
    // Toilet losses: sold at loss OR open with significant loss (>50% down)
    const toiletLossesArr = closed.filter(p => (p.realized_pnl_usd || 0) < 0);
    const toiletLosses = toiletLossesArr.length;
    const toiletPnl = toiletLossesArr.reduce((sum, p) => sum + (p.realized_pnl_usd || 0), 0);
    
    const totalInvested = statsPositions.reduce((sum, p) => sum + (p.entry_amount_usd || 0), 0);
    const totalUnrealized = open.reduce((sum, p) => sum + (p.unrealized_pnl_usd || 0), 0);
    const totalRealized = closed.reduce((sum, p) => sum + (p.realized_pnl_usd || 0), 0);
    
    const winners = closed.filter(p => (p.realized_pnl_usd || 0) > 0);
    const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : 0;

    // Find best and worst trades
    let bestTrade: { symbol: string; pnl: number } | null = null;
    let worstTrade: { symbol: string; pnl: number } | null = null;
    
    closed.forEach(p => {
      const pnl = p.realized_pnl_usd || 0;
      if (!bestTrade || pnl > bestTrade.pnl) {
        bestTrade = { symbol: p.token_symbol || 'Unknown', pnl };
      }
      if (!worstTrade || pnl < worstTrade.pnl) {
        worstTrade = { symbol: p.token_symbol || 'Unknown', pnl };
      }
    });

    // Count positions near target (>80% progress) - exclude excluded positions
    const nearTargetCount = open.filter(p => {
      if (!p.current_price_usd || !p.entry_price_usd) return false;
      const multiplier = p.current_price_usd / p.entry_price_usd;
      const target = p.target_sell_multiplier || 2;
      return (multiplier / target) >= 0.8;
    }).length;

    // Count missed opportunities - positions where peak exceeded target (excluding excluded)
    const missedOpportunities = open.filter(p => {
      const peakMult = p.peak_multiplier || 0;
      const targetMult = p.target_sell_multiplier || 2;
      return peakMult >= targetMult;
    }).length;

    // NEW METRICS: Average peak multiplier across all positions with peaks
    const positionsWithPeaks = statsPositions.filter(p => p.peak_multiplier && p.peak_multiplier > 0);
    const avgPeakMultiplier = positionsWithPeaks.length > 0 
      ? positionsWithPeaks.reduce((sum, p) => sum + (p.peak_multiplier || 0), 0) / positionsWithPeaks.length 
      : 0;

    // Average target proximity (how close positions got to target as %)
    const positionsWithProgress = statsPositions.filter(p => p.peak_multiplier && p.target_sell_multiplier);
    const avgTargetProximity = positionsWithProgress.length > 0
      ? positionsWithProgress.reduce((sum, p) => {
          const proximity = ((p.peak_multiplier || 0) / (p.target_sell_multiplier || 2)) * 100;
          return sum + Math.min(proximity, 100);
        }, 0) / positionsWithProgress.length
      : 0;

    // Near misses logged
    const nearMissCount = statsPositions.filter(p => p.near_miss_logged).length;
    
    // Close enough sells and trailing stop sells
    const closeEnoughSells = closed.filter(p => p.close_enough_triggered).length;
    const trailingStopSells = closed.filter(p => p.peak_trailing_stop_triggered).length;

    setStats({
      totalPositions: statsPositions.length,
      openPositions: open.length,
      closedPositions: closed.length,
      activePositions: active.length,
      totalInvested,
      totalUnrealizedPnl: totalUnrealized,
      totalRealizedPnl: totalRealized,
      winRate,
      bestTrade,
      worstTrade,
      nearTargetCount,
      missedOpportunities,
      trophyWins,
      trophyPnl,
      toiletLosses,
      toiletPnl,
      avgPeakMultiplier,
      avgTargetProximity,
      nearMissCount,
      closeEnoughSells,
      trailingStopSells
    });
  };

  const monitorPrices = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-fantasy-price-monitor', {});
      if (error) throw error;
      
      setLastUpdate(new Date());
      
      if (data?.autoSold > 0) {
        toast.success(`🎯 Auto-sold ${data.autoSold} position(s)!`, {
          description: data.autoSells?.map((s: any) => `${s.token}: ${s.reason === 'target_hit' ? `+${s.pnlPercent}%` : `${s.pnlPercent}%`}`).join(', ')
        });
      }
      
      await loadPositions();
    } catch (err) {
      console.error('Error monitoring prices:', err);
    }
  };

  const updatePrices = async () => {
    setUpdatingPrices(true);
    try {
      await monitorPrices();
      toast.success('Prices updated');
    } catch (err) {
      console.error('Error updating prices:', err);
      toast.error('Failed to update prices');
    } finally {
      setUpdatingPrices(false);
    }
  };

  const toggleActive = async (positionId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({ is_active: isActive })
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(isActive ? 'Position activated' : 'Position deactivated');
      await loadPositions();
    } catch (err) {
      console.error('Error toggling active:', err);
      toast.error('Failed to update position');
    }
  };

  const updateMultiplier = async (positionId: string, multiplier: number) => {
    try {
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({ target_sell_multiplier: multiplier })
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(`Target updated to ${multiplier}x`);
      await loadPositions();
    } catch (err) {
      console.error('Error updating multiplier:', err);
      toast.error('Failed to update target');
    }
  };

  const setAllActive = async (active: boolean) => {
    try {
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({ is_active: active })
        .eq('status', 'open');

      if (error) throw error;
      
      toast.success(active ? 'All positions activated' : 'All positions deactivated');
      await loadPositions();
    } catch (err) {
      console.error('Error bulk updating:', err);
      toast.error('Failed to update positions');
    }
  };

  const sellPosition = async (positionId: string) => {
    try {
      const position = positions.find(p => p.id === positionId);
      if (!position || !position.current_price_usd) {
        toast.error('Cannot sell: no current price');
        return;
      }

      const realizedPnl = (position.current_price_usd - position.entry_price_usd) * (position.token_amount || 0);
      const realizedPnlPercent = ((position.current_price_usd - position.entry_price_usd) / position.entry_price_usd) * 100;

      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({
          status: 'sold',
          sold_at: new Date().toISOString(),
          sold_price_usd: position.current_price_usd,
          realized_pnl_usd: realizedPnl,
          realized_pnl_percent: realizedPnlPercent,
          is_active: false
        })
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(`Sold ${position.token_symbol} for ${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}`);
      await loadPositions();
    } catch (err) {
      console.error('Error selling position:', err);
      toast.error('Failed to sell position');
    }
  };

  const deletePosition = async (positionId: string) => {
    try {
      const position = positions.find(p => p.id === positionId);
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .delete()
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(`Deleted ${position?.token_symbol || 'position'}`);
      await loadPositions();
    } catch (err) {
      console.error('Error deleting position:', err);
      toast.error('Failed to delete position');
    }
  };

  const toggleExcludeFromStats = async (positionId: string, exclude: boolean, reason?: string) => {
    try {
      const position = positions.find(p => p.id === positionId);
      const { error } = await supabase
        .from('telegram_fantasy_positions')
        .update({ 
          exclude_from_stats: exclude,
          exclusion_reason: exclude ? (reason || 'Manually excluded from stats') : null
        })
        .eq('id', positionId);

      if (error) throw error;
      
      toast.success(exclude 
        ? `${position?.token_symbol} excluded from stats` 
        : `${position?.token_symbol} included in stats`
      );
      await loadPositions();
    } catch (err) {
      console.error('Error toggling exclusion:', err);
      toast.error('Failed to update position');
    }
  };

  const getDexScreenerUrl = (mint: string) => `https://dexscreener.com/solana/${mint}`;

  const getProgressToTarget = (pos: FantasyPosition) => {
    if (!pos.current_price_usd || !pos.entry_price_usd) return 0;
    const multiplier = pos.current_price_usd / pos.entry_price_usd;
    const target = pos.target_sell_multiplier || 2;
    // Progress: 0% at 1x (entry), 100% at target
    // If losing (multiplier < 1), show 0%
    if (multiplier < 1) return 0;
    // Progress from 1x to target
    const progress = ((multiplier - 1) / (target - 1)) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  const getCurrentMultiplier = (pos: FantasyPosition) => {
    if (!pos.current_price_usd || !pos.entry_price_usd) return 0;
    return pos.current_price_usd / pos.entry_price_usd;
  };

  const backfillPeaks = async () => {
    try {
      setBackfillingPeaks(true);
      toast.info('Backfilling historical peaks...');
      
      const { data, error } = await supabase.functions.invoke('telegram-fantasy-peak-backfill');
      
      if (error) throw error;
      
      if (data?.missedOpportunities > 0) {
        toast.success(`Found ${data.missedOpportunities} missed opportunities! 🏆`);
      } else {
        toast.success(`Processed ${data?.updated || 0} positions`);
      }
      
      await loadPositions();
    } catch (err) {
      console.error('Error backfilling peaks:', err);
      toast.error('Failed to backfill peaks');
    } finally {
      setBackfillingPeaks(false);
    }
  };

  const backfillFromCalls = async () => {
    try {
      setBackfillingCalls(true);
      toast.info('Creating fantasy positions from existing call records...');
      
      const { data, error } = await supabase.functions.invoke('backfill-fantasy-from-calls', {
        body: { limit: 200 }
      });
      
      if (error) throw error;
      
      if (data?.created > 0) {
        toast.success(`Created ${data.created} fantasy positions!`, {
          description: data.tokens
        });
      } else {
        toast.info('All calls already have fantasy positions');
      }
      
      await loadPositions();
    } catch (err) {
      console.error('Error backfilling from calls:', err);
      toast.error('Failed to backfill from calls');
    } finally {
      setBackfillingCalls(false);
    }
  };

  const backfillRugcheck = async () => {
    try {
      setBackfillingRugcheck(true);
      toast.info('Running RugCheck analysis on existing positions (rate-limited)...');
      
      const { data, error } = await supabase.functions.invoke('rugcheck-backfill', {
        body: { limit: 100, includeProcessed: false, dryRun: false }
      });
      
      if (error) throw error;
      
      const summary = data?.summary || {};
      const badCalls = data?.badCalls || [];
      
      if (badCalls.length > 0) {
        toast.warning(`⚠️ ${summary.wouldHaveSkipped} positions would have been SKIPPED by RugCheck`, {
          description: badCalls.slice(0, 3).map((c: any) => `${c.token}: ${c.skipReason}`).join(', '),
          duration: 10000
        });
      } else {
        toast.success(`✓ Analyzed ${summary.totalProcessed} positions - all passed RugCheck!`);
      }
      
      await loadPositions();
    } catch (err) {
      console.error('Error backfilling rugcheck:', err);
      toast.error('Failed to run RugCheck backfill');
    } finally {
      setBackfillingRugcheck(false);
    }
  };

  const formatPeakDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const openPositions = positions.filter(p => p.status === 'open');
  const allClosedPositions = positions.filter(p => p.status === 'sold' || p.status === 'closed');
  
  // Separate trophy wins (auto-sold at target) from other closed positions
  const trophyPositions = allClosedPositions.filter(p => 
    p.auto_sell_triggered && (p.realized_pnl_usd || 0) > 0
  );
  
  // Toilet positions: sold at loss
  const toiletPositions = allClosedPositions.filter(p => 
    (p.realized_pnl_usd || 0) < 0
  );
  
  // Other closed: manual sells that didn't lose money
  const otherClosedPositions = allClosedPositions.filter(p => 
    !p.auto_sell_triggered && (p.realized_pnl_usd || 0) >= 0
  );
  
  // Filter open positions based on active/inactive filter AND channel filter
  const filteredOpenPositions = openPositions.filter(p => {
    // Active/Inactive filter
    if (filter === 'active' && p.is_active === false) return false;
    if (filter === 'inactive' && p.is_active !== false) return false;
    // Channel filter
    if (channelFilter !== 'all' && p.channel_name !== channelFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
        {/* Trophy Wins Card */}
        <Card className={stats?.trophyWins ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-yellow-500/5' : ''}>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <Trophy className="h-3 w-3 text-amber-500" />
              <span className="text-xs text-muted-foreground">Trophies</span>
            </div>
            <p className="text-lg font-bold text-amber-500">{stats?.trophyWins || 0}</p>
            <p className="text-xs text-green-500">+${stats?.trophyPnl?.toFixed(2) || '0.00'}</p>
          </CardContent>
        </Card>
        
        {/* Toilet Case Card */}
        <Card className={stats?.toiletLosses ? 'border-red-500/50 bg-gradient-to-br from-red-500/10 to-red-900/5' : ''}>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <Frown className="h-3 w-3 text-red-500" />
              <span className="text-xs text-muted-foreground">Toilet</span>
            </div>
            <p className="text-lg font-bold text-red-500">{stats?.toiletLosses || 0}</p>
            <p className="text-xs text-red-500">${stats?.toiletPnl?.toFixed(2) || '0.00'}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <Wallet className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Invested</span>
            </div>
            <p className="text-lg font-bold">${stats?.totalInvested.toFixed(2) || '0.00'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-green-500" />
              <span className="text-xs text-muted-foreground">Monitoring</span>
            </div>
            <p className="text-lg font-bold text-green-500">{stats?.activePositions || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Open</span>
            </div>
            <p className="text-lg font-bold">{stats?.openPositions || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Unrealized</span>
            </div>
            <p className={`text-lg font-bold ${(stats?.totalUnrealizedPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {(stats?.totalUnrealizedPnl || 0) >= 0 ? '+' : ''}${stats?.totalUnrealizedPnl?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Realized</span>
            </div>
            <p className={`text-lg font-bold ${(stats?.totalRealizedPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {(stats?.totalRealizedPnl || 0) >= 0 ? '+' : ''}${stats?.totalRealizedPnl?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <Trophy className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Win Rate</span>
            </div>
            <p className="text-lg font-bold">{stats?.winRate.toFixed(1) || 0}%</p>
          </CardContent>
        </Card>

        <Card className={stats?.nearTargetCount ? 'border-yellow-500/50 bg-yellow-500/5' : ''}>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-yellow-500" />
              <span className="text-xs text-muted-foreground">Near Target</span>
            </div>
            <p className="text-lg font-bold text-yellow-500">{stats?.nearTargetCount || 0}</p>
          </CardContent>
        </Card>

        <Card className={stats?.missedOpportunities ? 'border-amber-500/50 bg-amber-500/5' : ''}>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              <Trophy className="h-3 w-3 text-amber-500" />
              <span className="text-xs text-muted-foreground">Missed</span>
            </div>
            <p className="text-lg font-bold text-amber-500">{stats?.missedOpportunities || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Best/Worst Trades */}
      {(stats?.bestTrade || stats?.worstTrade) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats?.bestTrade && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-500">
                  <TrendingUp className="h-5 w-5" />
                  <span className="font-medium">Best Trade</span>
                </div>
                <p className="text-lg font-bold mt-1">
                  {stats.bestTrade.symbol}: +${stats.bestTrade.pnl.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          )}
          {stats?.worstTrade && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-red-500">
                  <TrendingDown className="h-5 w-5" />
                  <span className="font-medium">Worst Trade</span>
                </div>
                <p className="text-lg font-bold mt-1">
                  {stats.worstTrade.symbol}: ${stats.worstTrade.pnl.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Open Positions */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Open Positions ({filteredOpenPositions.length})
            </CardTitle>
            
            <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'active' | 'inactive')}>
              <TabsList className="h-8">
                <TabsTrigger value="active" className="text-xs">
                  <Eye className="h-3 w-3 mr-1" />
                  Active
                </TabsTrigger>
                <TabsTrigger value="inactive" className="text-xs">
                  <EyeOff className="h-3 w-3 mr-1" />
                  Inactive
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Channel Filter */}
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-8 w-48">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {uniqueChannels.map(channel => (
                  <SelectItem key={channel} value={channel}>
                    {channel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Server cron status indicator */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/30">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span className="text-xs text-green-500 font-medium">
                      Server: {serverLastUpdate ? formatDistanceToNow(serverLastUpdate, { addSuffix: true }) : 'Active'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    Server cron runs every minute, updating prices and triggering auto-sells even when your browser is closed.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Browser refresh toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={autoRefresh}
                      onCheckedChange={handleAutoRefreshChange}
                      id="auto-refresh"
                    />
                    <label htmlFor="auto-refresh" className="text-sm flex items-center gap-1 cursor-pointer">
                      {autoRefresh ? (
                        <>
                          <Activity className="h-3 w-3 text-green-500 animate-pulse" />
                          <span className="text-green-500">Browser (5s)</span>
                        </>
                      ) : (
                        <>
                          <Activity className="h-3 w-3" />
                          <span>Browser Refresh</span>
                        </>
                      )}
                    </label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    Additional browser-side refresh every 5 seconds. State is saved across page loads.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {/* Persistent cron toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={maintainOnClose}
                      onCheckedChange={async (checked) => {
                        setMaintainOnClose(checked);
                        localStorage.setItem('fantasy_maintain_on_close', checked.toString());
                        
                        // Update database flag for cron job
                        try {
                          await supabase
                            .from('telegram_channel_config')
                            .update({ persistent_monitoring: checked } as any)
                            .eq('is_active', true);
                          
                          toast.success(checked 
                            ? '🔄 Server cron enabled - prices update even when tab is closed' 
                            : 'Server cron disabled');
                        } catch (err) {
                          console.error('Error updating persistent monitoring:', err);
                        }
                      }}
                      id="maintain-on-close"
                    />
                    <label htmlFor="maintain-on-close" className="text-sm flex items-center gap-1 cursor-pointer">
                      <Radio className={`h-3 w-3 ${maintainOnClose ? 'text-cyan-500' : ''}`} />
                      <span className={maintainOnClose ? 'text-cyan-500' : ''}>
                        Server Cron
                      </span>
                    </label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    When enabled, server cron updates prices every minute even when this tab is closed. Auto-sells will still execute.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                Browser: {formatDistanceToNow(lastUpdate, { addSuffix: true })}
              </span>
            )}
            
            <Button 
              onClick={updatePrices} 
              disabled={updatingPrices}
              size="sm"
              variant="outline"
            >
              {updatingPrices ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Update Prices
            </Button>

            <Button
              onClick={() => setAllActive(true)}
              size="sm"
              variant="outline"
              className="text-green-500"
            >
              Activate All
            </Button>

            <Button
              onClick={() => setAllActive(false)}
              size="sm"
              variant="outline"
              className="text-muted-foreground"
            >
              Deactivate All
            </Button>

            <Button
              onClick={backfillPeaks}
              disabled={backfillingPeaks}
              size="sm"
              variant="outline"
              className="text-amber-500"
            >
              {backfillingPeaks ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trophy className="h-4 w-4 mr-2" />
              )}
              Backfill Peaks
            </Button>

            <Button
              onClick={backfillFromCalls}
              disabled={backfillingCalls}
              size="sm"
              variant="outline"
              className="text-cyan-500"
            >
              {backfillingCalls ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Backfill Calls
            </Button>

            <Button
              onClick={backfillRugcheck}
              disabled={backfillingRugcheck}
              size="sm"
              variant="outline"
              className="text-purple-500"
            >
              {backfillingRugcheck ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              RugCheck Backfill
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOpenPositions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {filter === 'active' ? 'No active positions being monitored' : 
               filter === 'inactive' ? 'No inactive positions' : 
               'No open positions'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead compact className="w-10">Active</TableHead>
                  <TableHead compact>Token</TableHead>
                  <TableHead compact>Channel</TableHead>
                  <TableHead compact>Heard</TableHead>
                  <TableHead compact>Entry</TableHead>
                  <TableHead compact>Current</TableHead>
                  <TableHead compact>Peak 🏆</TableHead>
                  <TableHead compact>ATH</TableHead>
                  <TableHead compact>Target</TableHead>
                  <TableHead compact className="w-24">Progress</TableHead>
                  <TableHead compact>P&L</TableHead>
                  <TableHead compact>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOpenPositions.map((pos) => {
                  const pnl = pos.unrealized_pnl_usd || 0;
                  const pnlPercent = pos.unrealized_pnl_percent || 0;
                  const progress = getProgressToTarget(pos);
                  const currentMult = getCurrentMultiplier(pos);
                  
                    return (
                      <TableRow 
                        key={pos.id} 
                        className={`${pos.is_active === false ? 'opacity-60' : ''} ${pos.exclude_from_stats ? 'bg-muted/30 line-through decoration-muted-foreground/30' : ''}`}
                      >
                        <TableCell compact>
                          <Checkbox
                            checked={pos.is_active !== false}
                            onCheckedChange={(checked) => toggleActive(pos.id, !!checked)}
                            className="h-3 w-3"
                          />
                        </TableCell>
                      <TableCell compact>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            <a 
                              href={getDexScreenerUrl(pos.token_mint)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={`font-medium hover:underline inline-flex items-center gap-0.5 text-xs ${pos.exclude_from_stats ? 'text-muted-foreground' : 'text-primary'}`}
                            >
                            {pos.token_symbol || 'Unknown'}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                            <DevRiskBadge pos={pos} />
                            <RugCheckBadge pos={pos} />
                            {pos.exclude_from_stats && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="gap-0.5 text-[10px] px-1 py-0 text-muted-foreground bg-muted/50 border-muted-foreground/30">
                                      <Ban className="h-2 w-2" />
                                      Excluded
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs max-w-xs">{pos.exclusion_reason || 'Excluded from statistics'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                            {pos.token_mint?.slice(0, 6)}...
                          </p>
                        </div>
                      </TableCell>
                      <TableCell compact>
                        <div>
                          {pos.whale_name ? (
                            <>
                              <span className="text-xs font-bold text-cyan-400">
                                🐋 {pos.whale_name}
                              </span>
                              <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                {pos.channel_name}
                              </p>
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-medium">
                                {pos.channel_name || 'Unknown'}
                              </span>
                              {pos.caller_display_name && pos.caller_display_name !== pos.channel_name && (
                                <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                  via {pos.caller_display_name}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell compact>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="text-[10px]">
                                <div className="flex items-center gap-0.5">
                                  <Radio className="h-2.5 w-2.5 text-cyan-500" />
                                  <span className="text-cyan-500 font-medium">
                                    {pos.message_received_at 
                                      ? formatDistanceToNow(new Date(pos.message_received_at), { addSuffix: true })
                                      : formatDistanceToNow(new Date(pos.created_at), { addSuffix: true })}
                                  </span>
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1 text-xs">
                                <p>Heard: {pos.message_received_at 
                                  ? new Date(pos.message_received_at).toLocaleString()
                                  : 'N/A'}</p>
                                <p>Bought: {new Date(pos.created_at).toLocaleString()}</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell compact>
                        <div>
                          <span className="text-[10px]">${pos.entry_price_usd?.toFixed(8) || '0'}</span>
                          <p className="text-[10px] text-muted-foreground">${pos.entry_amount_usd}</p>
                        </div>
                      </TableCell>
                      <TableCell compact>
                        <div>
                          <span className="text-[10px]">${pos.current_price_usd?.toFixed(8) || 'N/A'}</span>
                          <p className="text-[10px] text-muted-foreground">
                            {currentMult > 0 ? `${currentMult.toFixed(2)}x` : '-'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell compact>
                        {pos.peak_multiplier ? (
                          <div className={pos.peak_multiplier >= (pos.target_sell_multiplier || 2) ? 'text-amber-500' : 'text-muted-foreground'}>
                            <div className="flex items-center gap-0.5">
                              {pos.peak_multiplier >= (pos.target_sell_multiplier || 2) && (
                                <Trophy className="h-2.5 w-2.5" />
                              )}
                              <span className="font-medium text-[10px]">{pos.peak_multiplier.toFixed(2)}x</span>
                            </div>
                            <p className="text-[10px]">
                              {formatPeakDate(pos.peak_price_at)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell compact>
                        {pos.ath_multiplier ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="text-purple-500">
                                  <span className="font-medium text-[10px]">{pos.ath_multiplier.toFixed(2)}x</span>
                                  <p className="text-[10px]">${pos.ath_price_usd?.toFixed(6)}</p>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>ATH: ${pos.ath_price_usd?.toFixed(10)}</p>
                                <p className="text-xs">At: {pos.ath_at ? new Date(pos.ath_at).toLocaleString() : 'N/A'}</p>
                                <p className="text-xs text-muted-foreground">
                                  If held: +${((pos.ath_multiplier - 1) * pos.entry_amount_usd).toFixed(2)}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell compact>
                        <Select
                          value={String(pos.target_sell_multiplier || 2)}
                          onValueChange={(v) => updateMultiplier(pos.id, parseFloat(v))}
                        >
                          <SelectTrigger className="h-6 w-20 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SELL_MULTIPLIERS.map(m => (
                              <SelectItem key={m.value} value={String(m.value)} className="text-xs">
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell compact>
                        <div className="w-full">
                          <Progress 
                            value={progress} 
                            className={`h-1.5 ${progress >= 80 ? 'bg-yellow-200' : ''}`}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {progress.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell compact>
                        <div className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                          <span className="font-medium text-xs">
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </span>
                          <p className="text-[10px]">
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell compact>
                        <div className="flex items-center gap-0.5">
                          <TokenChartModal 
                            tokenMint={pos.token_mint} 
                            tokenSymbol={pos.token_symbol} 
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`/token-analysis?token=${pos.token_mint}`, '_blank')}
                            title="Trace Creator"
                            className="h-6 w-6 p-0"
                          >
                            <GitBranch className="h-2.5 w-2.5" />
                          </Button>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleExcludeFromStats(pos.id, !pos.exclude_from_stats)}
                                  className={`h-6 w-6 p-0 ${pos.exclude_from_stats ? 'text-amber-500' : 'text-muted-foreground'}`}
                                >
                                  {pos.exclude_from_stats ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {pos.exclude_from_stats ? 'Include in stats' : 'Exclude from stats'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sellPosition(pos.id)}
                            className="h-6 text-[10px] px-1.5"
                          >
                            Sell
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive h-6 w-6 p-0"
                            onClick={() => deletePosition(pos.id)}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Trophy Case - Successful Auto-Sells */}
      {trophyPositions.length > 0 && (
        <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-yellow-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <Trophy className="h-5 w-5" />
              Trophy Case ({trophyPositions.length})
              <Badge variant="secondary" className="ml-2 bg-amber-500/20 text-amber-500">
                Not Monitored
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Positions that hit their target and were auto-sold
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>🏆</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Sold At</TableHead>
                  <TableHead>Multiplier</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Trail 📈</TableHead>
                  <TableHead>Sold Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trophyPositions.map((pos) => {
                  const pnl = pos.realized_pnl_usd || 0;
                  const pnlPercent = pos.realized_pnl_percent || 0;
                  const multiplier = pnlPercent > 0 ? (1 + pnlPercent / 100) : 1;
                  const trailMultiplier = pos.trail_peak_multiplier || 0;
                  const soldPrice = pos.sold_price_usd || pos.current_price_usd || 0;
                  const currentTrailPrice = pos.trail_current_price_usd || 0;
                  const trailChange = soldPrice > 0 ? ((currentTrailPrice - soldPrice) / soldPrice) * 100 : 0;
                  
                  return (
                    <TableRow key={pos.id} className="bg-amber-500/5">
                      <TableCell>
                        <Trophy className="h-5 w-5 text-amber-500" />
                      </TableCell>
                      <TableCell>
                        <a 
                          href={getDexScreenerUrl(pos.token_mint)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-medium text-amber-500 hover:underline inline-flex items-center gap-1"
                        >
                          {pos.token_symbol || 'Unknown'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <div>
                          {pos.whale_name ? (
                            <>
                              <span className="text-sm font-bold text-cyan-400">
                                🐋 {pos.whale_name}
                              </span>
                              <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {pos.channel_name}
                              </p>
                            </>
                          ) : (
                            <>
                              <span className="text-sm font-medium">
                                {pos.channel_name || 'Unknown Channel'}
                              </span>
                              {pos.caller_display_name && pos.caller_display_name !== pos.channel_name && (
                                <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  via {pos.caller_display_name}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">${pos.entry_price_usd?.toFixed(8) || '0'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">${soldPrice?.toFixed(8) || 'N/A'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-amber-500 text-white">
                          {multiplier.toFixed(2)}x
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-green-500">
                          <span className="font-bold">+${pnl.toFixed(2)}</span>
                          <p className="text-xs">+{pnlPercent.toFixed(1)}%</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {pos.trail_tracking_enabled !== false && pos.trail_current_price_usd ? (
                          <div className={trailChange >= 0 ? 'text-green-500' : 'text-red-500'}>
                            <span className="text-xs font-medium">
                              {trailChange >= 0 ? '+' : ''}{trailChange.toFixed(0)}%
                            </span>
                            {trailMultiplier > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Peak: {trailMultiplier.toFixed(2)}x
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {pos.sold_at && (
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(pos.sold_at), { addSuffix: true })}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Toilet Case - Losses */}
      {toiletPositions.length > 0 && (
        <Card className="border-red-500/30 bg-gradient-to-r from-red-500/5 to-red-900/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500">
              <Frown className="h-5 w-5" />
              Toilet Case ({toiletPositions.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Positions sold at a loss
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead compact>💩</TableHead>
                  <TableHead compact>Token</TableHead>
                  <TableHead compact>Channel</TableHead>
                  <TableHead compact>Entry</TableHead>
                  <TableHead compact>Sold At</TableHead>
                  <TableHead compact>Loss</TableHead>
                  <TableHead compact>Sold Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {toiletPositions.map((pos) => {
                  const pnl = pos.realized_pnl_usd || 0;
                  const pnlPercent = pos.realized_pnl_percent || 0;
                  const soldPrice = pos.sold_price_usd || pos.current_price_usd || 0;
                  
                  return (
                    <TableRow key={pos.id} className="bg-red-500/5">
                      <TableCell compact>
                        <Frown className="h-4 w-4 text-red-500" />
                      </TableCell>
                      <TableCell compact>
                        <a 
                          href={getDexScreenerUrl(pos.token_mint)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-medium text-red-500 hover:underline inline-flex items-center gap-1 text-xs"
                        >
                          {pos.token_symbol || 'Unknown'}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </TableCell>
                      <TableCell compact>
                        {pos.whale_name ? (
                          <span className="text-xs font-bold text-cyan-400">🐋 {pos.whale_name}</span>
                        ) : (
                          <span className="text-xs">{pos.channel_name || 'Unknown'}</span>
                        )}
                      </TableCell>
                      <TableCell compact>
                        <span className="text-xs">${pos.entry_price_usd?.toFixed(8) || '0'}</span>
                      </TableCell>
                      <TableCell compact>
                        <span className="text-xs">${soldPrice?.toFixed(8) || 'N/A'}</span>
                      </TableCell>
                      <TableCell compact>
                        <div className="text-red-500">
                          <span className="font-bold text-xs">${pnl.toFixed(2)}</span>
                          <p className="text-[10px]">{pnlPercent.toFixed(1)}%</p>
                        </div>
                      </TableCell>
                      <TableCell compact>
                        {pos.sold_at && (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(pos.sold_at), { addSuffix: true })}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Other Closed Positions (Manual sells, stop-losses) */}
      {otherClosedPositions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Other Closed Trades ({otherClosedPositions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherClosedPositions.map((pos) => {
                  const pnl = pos.realized_pnl_usd || 0;
                  const pnlPercent = pos.realized_pnl_percent || 0;
                  return (
                    <TableRow key={pos.id}>
                      <TableCell>
                        <a 
                          href={getDexScreenerUrl(pos.token_mint)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {pos.token_symbol || 'Unknown'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <div>
                          {pos.whale_name ? (
                            <>
                              <span className="text-sm font-bold text-cyan-400">
                                🐋 {pos.whale_name}
                              </span>
                              <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {pos.channel_name}
                              </p>
                            </>
                          ) : (
                            <>
                              <span className="text-sm font-medium">
                                {pos.channel_name || 'Unknown Channel'}
                              </span>
                              {pos.caller_display_name && pos.caller_display_name !== pos.channel_name && (
                                <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  via {pos.caller_display_name}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">${pos.entry_price_usd?.toFixed(8) || '0'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">${pos.current_price_usd?.toFixed(8) || 'N/A'}</span>
                      </TableCell>
                      <TableCell>
                        <div className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                          <span className="font-medium">
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </span>
                          <p className="text-xs">
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {pos.sold_at && pos.created_at && (
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(pos.sold_at), { addSuffix: false })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {pos.auto_sell_triggered ? (
                          <Badge variant="secondary" className="text-xs bg-red-500/20 text-red-500">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Stop Loss
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Manual</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Data Cleanup Utility */}
      <FantasyDataCleanup />
    </div>
  );
}
