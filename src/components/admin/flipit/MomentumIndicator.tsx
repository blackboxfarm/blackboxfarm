import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Zap, 
  Clock, 
  RefreshCw, 
  Loader2,
  ArrowUp,
  ArrowDown,
  Minus,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';

interface MomentumMetrics {
  volume_5m: number | null;
  volume_1h: number | null;
  volume_surge_ratio: number | null;
  buys_5m: number | null;
  sells_5m: number | null;
  buy_sell_ratio_5m: number | null;
  buy_sell_ratio_1h: number | null;
  price_usd: number | null;
  price_change_5m: number | null;
  price_change_1h: number | null;
  price_trend: 'surging' | 'rising' | 'stable' | 'falling' | 'crashing' | null;
  age_minutes: number | null;
  market_cap: number | null;
  liquidity_usd: number | null;
  is_fresh: boolean;
  txns_5m: number | null;
  txns_1h: number | null;
}

interface MomentumSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  signal: string;
  weight: number;
}

interface MomentumAnalysis {
  momentum_score: number;
  recommendation: 'SURGE' | 'RISING' | 'FLAT' | 'FALLING';
  action: 'BUY_NOW' | 'WATCH' | 'SKIP';
  metrics: MomentumMetrics;
  signals: MomentumSignal[];
  analyzed_at: string;
}

interface MomentumIndicatorProps {
  tokenMint: string;
  onMomentumData?: (analysis: MomentumAnalysis | null) => void;
  onRefresh?: () => void;
}

export function MomentumIndicator({ tokenMint, onMomentumData, onRefresh }: MomentumIndicatorProps) {
  const [analysis, setAnalysis] = useState<MomentumAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const isFetchingRef = React.useRef(false);

  const fetchMomentum = useCallback(async () => {
    if (!tokenMint || tokenMint.length < 32) {
      setAnalysis(null);
      setFetchError(null);
      onMomentumData?.(null);
      return;
    }

    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log('[Momentum] Skipping - already fetching');
      return;
    }

    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    isFetchingRef.current = true;
    setIsLoading(true);
    setFetchError(null);

    // 10 second timeout
    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }, 10000);

    try {
      const { data, error } = await supabase.functions.invoke('token-momentum-analyzer', {
        body: { tokenMint }
      });

      clearTimeout(timeoutId);

      if (error) throw error;

      setAnalysis(data as MomentumAnalysis);
      setLastFetched(new Date().toISOString());
      setFetchError(null);
      onMomentumData?.(data as MomentumAnalysis);
    } catch (err: any) {
      clearTimeout(timeoutId);
      
      if (err.name === 'AbortError') {
        console.log('[Momentum] Request aborted/timed out');
        setFetchError('Request timed out');
      } else {
        console.error('[Momentum] Fetch error:', err);
        setFetchError(err.message || 'Failed to analyze');
      }
      setAnalysis(null);
      onMomentumData?.(null);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [tokenMint, onMomentumData]);

  // Only fetch when user explicitly triggers or on initial valid token (with debounce)
  useEffect(() => {
    if (!tokenMint || tokenMint.length < 32) {
      setAnalysis(null);
      setFetchError(null);
      return;
    }

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [tokenMint]);

  if (!tokenMint || tokenMint.length < 32) {
    return null;
  }

  if (isLoading && !analysis) {
    return (
      <Card className="p-3 bg-muted/30 border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analyzing momentum...</span>
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => {
              if (abortControllerRef.current) {
                abortControllerRef.current.abort();
              }
              setIsLoading(false);
              isFetchingRef.current = false;
            }}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  if (fetchError) {
    return (
      <Card className="p-3 bg-destructive/10 border-destructive/30">
        <div className="flex items-center justify-between">
          <span className="text-sm text-destructive">{fetchError}</span>
          <Button size="sm" variant="ghost" onClick={fetchMomentum} disabled={isLoading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="p-3 bg-muted/30 border-border/50">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Click to analyze momentum</span>
          <Button size="sm" variant="outline" onClick={fetchMomentum} disabled={isLoading}>
            <Activity className={`h-3 w-3 mr-1`} />
            Analyze
          </Button>
        </div>
      </Card>
    );
  }

  const { momentum_score, recommendation, action, metrics, signals } = analysis;

  // Color based on score
  const getScoreColor = () => {
    if (momentum_score >= 75) return 'text-green-400';
    if (momentum_score >= 55) return 'text-blue-400';
    if (momentum_score >= 40) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getProgressColor = () => {
    if (momentum_score >= 75) return 'bg-green-500';
    if (momentum_score >= 55) return 'bg-blue-500';
    if (momentum_score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getActionBadge = () => {
    switch (action) {
      case 'BUY_NOW':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50">🚀 BUY NOW</Badge>;
      case 'WATCH':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50"><Eye className="h-3 w-3 mr-1" /> WATCH</Badge>;
      case 'SKIP':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">⚠️ SKIP</Badge>;
    }
  };

  const getRecommendationBadge = () => {
    switch (recommendation) {
      case 'SURGE':
        return <Badge variant="outline" className="border-green-500/50 text-green-400"><Zap className="h-3 w-3 mr-1" /> SURGE</Badge>;
      case 'RISING':
        return <Badge variant="outline" className="border-blue-500/50 text-blue-400"><TrendingUp className="h-3 w-3 mr-1" /> RISING</Badge>;
      case 'FLAT':
        return <Badge variant="outline" className="border-yellow-500/50 text-yellow-400"><Minus className="h-3 w-3 mr-1" /> FLAT</Badge>;
      case 'FALLING':
        return <Badge variant="outline" className="border-red-500/50 text-red-400"><TrendingDown className="h-3 w-3 mr-1" /> FALLING</Badge>;
    }
  };

  const formatNumber = (num: number | null, decimals = 0) => {
    if (num === null) return '—';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(decimals);
  };

  const formatPercent = (num: number | null) => {
    if (num === null) return '—';
    const sign = num >= 0 ? '+' : '';
    return `${sign}${num.toFixed(1)}%`;
  };

  return (
    <Card className="p-3 bg-gradient-to-r from-muted/50 to-muted/30 border-border/50">
      {/* Header Row: Score + Action */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className={`text-2xl font-bold ${getScoreColor()}`}>{momentum_score}</span>
            <span className="text-[10px] text-muted-foreground uppercase">Score</span>
          </div>
          <div className="h-10 w-px bg-border/50" />
          <div className="flex flex-col gap-1">
            {getRecommendationBadge()}
            {getActionBadge()}
          </div>
        </div>
        
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => {
            fetchMomentum();
            onRefresh?.();
          }} 
          disabled={isLoading} 
          className="h-8"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Analyzing' : 'Refresh'}
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full ${getProgressColor()} transition-all duration-500`}
            style={{ width: `${momentum_score}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>SKIP</span>
          <span>WATCH</span>
          <span>BUY NOW</span>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {/* Volume Surge */}
        <div className="p-2 rounded bg-background/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Vol Surge</span>
          </div>
          <span className={`text-sm font-bold ${
            metrics.volume_surge_ratio !== null && metrics.volume_surge_ratio >= 2 
              ? 'text-green-400' 
              : metrics.volume_surge_ratio !== null && metrics.volume_surge_ratio < 0.5
                ? 'text-red-400'
                : 'text-foreground'
          }`}>
            {metrics.volume_surge_ratio !== null ? `${metrics.volume_surge_ratio.toFixed(1)}x` : '—'}
          </span>
        </div>

        {/* Buy/Sell Ratio */}
        <div className="p-2 rounded bg-background/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            {metrics.buy_sell_ratio_5m !== null && metrics.buy_sell_ratio_5m >= 1 
              ? <ArrowUp className="h-3 w-3 text-green-400" />
              : <ArrowDown className="h-3 w-3 text-red-400" />
            }
            <span className="text-[10px] text-muted-foreground">B/S Ratio</span>
          </div>
          <span className={`text-sm font-bold ${
            metrics.buy_sell_ratio_5m !== null && metrics.buy_sell_ratio_5m >= 1.2 
              ? 'text-green-400' 
              : metrics.buy_sell_ratio_5m !== null && metrics.buy_sell_ratio_5m < 0.8
                ? 'text-red-400'
                : 'text-foreground'
          }`}>
            {metrics.buy_sell_ratio_5m !== null ? metrics.buy_sell_ratio_5m.toFixed(2) : '—'}
          </span>
        </div>

        {/* Price 5m */}
        <div className="p-2 rounded bg-background/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">5m Δ</span>
          </div>
          <span className={`text-sm font-bold ${
            metrics.price_change_5m !== null && metrics.price_change_5m >= 3 
              ? 'text-green-400' 
              : metrics.price_change_5m !== null && metrics.price_change_5m <= -3
                ? 'text-red-400'
                : 'text-foreground'
          }`}>
            {formatPercent(metrics.price_change_5m)}
          </span>
        </div>

        {/* Token Age */}
        <div className="p-2 rounded bg-background/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Age</span>
          </div>
          <span className={`text-sm font-bold ${metrics.is_fresh ? 'text-green-400' : 'text-foreground'}`}>
            {metrics.age_minutes !== null 
              ? metrics.age_minutes >= 60 
                ? `${Math.floor(metrics.age_minutes / 60)}h`
                : `${metrics.age_minutes}m`
              : '—'
            }
          </span>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Vol 5m:</span>
          <span>${formatNumber(metrics.volume_5m)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Vol 1h:</span>
          <span>${formatNumber(metrics.volume_1h)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Buys 5m:</span>
          <span className="text-green-400">{metrics.buys_5m ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sells 5m:</span>
          <span className="text-red-400">{metrics.sells_5m ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Txns 5m:</span>
          <span>{metrics.txns_5m ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">MCap:</span>
          <span>${formatNumber(metrics.market_cap)}</span>
        </div>
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase">Signals</span>
          <div className="flex flex-wrap gap-1">
            {signals.slice(0, 4).map((signal, idx) => (
              <Badge 
                key={idx}
                variant="outline"
                className={`text-[10px] py-0 ${
                  signal.type === 'bullish' 
                    ? 'border-green-500/30 text-green-400' 
                    : signal.type === 'bearish'
                      ? 'border-red-500/30 text-red-400'
                      : 'border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {signal.type === 'bullish' ? '↑' : signal.type === 'bearish' ? '↓' : '→'} {signal.signal}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Last Updated */}
      {lastFetched && (
        <div className="text-[10px] text-muted-foreground mt-2 text-right">
          Updated: {new Date(lastFetched).toLocaleTimeString()}
        </div>
      )}
    </Card>
  );
}
