import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { 
  Coins, TrendingUp, TrendingDown, Bot, Wallet, 
  GitBranch, Clock, DollarSign, RefreshCw, Zap,
  Target, ArrowRight, Percent, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';

interface TokenAlert {
  id: string;
  alert_type: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  amount_sol: number | null;
  detected_at: string;
  funding_chain: any;
  metadata: any;
  market_cap_at_detection: number | null;
}

interface AutoTrade {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  trade_type: string;
  status: string;
  amount_sol: number | null;
  buys_detected: number;
  buys_required: number;
  executed_at: string | null;
  execution_price: number | null;
  tokens_received: number | null;
  buyability_score: number | null;
  rejection_reason: string | null;
  created_at: string;
}

interface StoryEvent {
  timestamp: string;
  type: 'mint' | 'whale_buy' | 'mini_buy' | 'system_buy' | 'system_sell' | 'spawn' | 'decision';
  icon: React.ReactNode;
  title: string;
  description: string;
  details?: string;
  highlight?: 'success' | 'warning' | 'error' | 'info';
}

interface Props {
  megaWhaleId: string | null;
  userId: string;
}

export function FantasyTradeStory({ megaWhaleId, userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<TokenAlert[]>([]);
  const [autoTrades, setAutoTrades] = useState<AutoTrade[]>([]);
  const [storyEvents, setStoryEvents] = useState<StoryEvent[]>([]);

  useEffect(() => {
    loadData();
  }, [megaWhaleId, userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load token alerts (mints, buys, sells)
      let alertsQuery = supabase
        .from('mega_whale_token_alerts')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(100);
      
      if (megaWhaleId) {
        alertsQuery = alertsQuery.eq('mega_whale_id', megaWhaleId);
      }
      
      const { data: alertsData } = await alertsQuery;
      setAlerts(alertsData || []);

      // Load auto trades
      let tradesQuery = supabase
        .from('mega_whale_auto_trades')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (megaWhaleId) {
        tradesQuery = tradesQuery.eq('mega_whale_id', megaWhaleId);
      }

      const { data: tradesData } = await tradesQuery;
      setAutoTrades(tradesData || []);

      // Build story timeline
      buildStoryTimeline(alertsData || [], tradesData || []);
    } catch (error) {
      console.error('Failed to load fantasy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildStoryTimeline = (alerts: TokenAlert[], trades: AutoTrade[]) => {
    const events: StoryEvent[] = [];

    // Process mints
    alerts.filter(a => a.alert_type === 'token_mint').forEach(alert => {
      events.push({
        timestamp: alert.detected_at,
        type: 'mint',
        icon: <Coins className="h-4 w-4 text-yellow-500" />,
        title: `🔨 NEW TOKEN MINTED: $${alert.token_symbol || 'UNKNOWN'}`,
        description: `Offspring wallet created ${alert.token_name || 'new token'}`,
        details: alert.funding_chain ? `Funding chain: ${JSON.stringify(alert.funding_chain).slice(0, 100)}...` : undefined,
        highlight: 'warning'
      });
    });

    // Process buys from whales
    alerts.filter(a => a.alert_type === 'token_buy').forEach(alert => {
      const isBigBuy = (alert.amount_sol || 0) >= 1;
      events.push({
        timestamp: alert.detected_at,
        type: isBigBuy ? 'whale_buy' : 'mini_buy',
        icon: <TrendingUp className="h-4 w-4 text-green-500" />,
        title: isBigBuy 
          ? `🐋 WHALE BUY: ${alert.amount_sol?.toFixed(2)} SOL` 
          : `🐟 Mini-whale bought ${alert.amount_sol?.toFixed(3)} SOL`,
        description: `$${alert.token_symbol || 'TOKEN'} @ MC $${(alert.market_cap_at_detection || 0).toLocaleString()}`,
        highlight: isBigBuy ? 'success' : 'info'
      });
    });

    // Process sells
    alerts.filter(a => a.alert_type === 'token_sell').forEach(alert => {
      events.push({
        timestamp: alert.detected_at,
        type: 'system_sell',
        icon: <TrendingDown className="h-4 w-4 text-red-500" />,
        title: `📤 SELL: ${alert.amount_sol?.toFixed(3)} SOL`,
        description: `$${alert.token_symbol || 'TOKEN'} sold`,
        highlight: 'error'
      });
    });

    // Process auto trades with decision logic
    trades.forEach(trade => {
      if (trade.status === 'executed') {
        events.push({
          timestamp: trade.executed_at || trade.created_at,
          type: 'system_buy',
          icon: <Bot className="h-4 w-4 text-primary" />,
          title: `🤖 SYSTEM ${trade.trade_type.toUpperCase()}: ${trade.amount_sol?.toFixed(3)} SOL`,
          description: `$${trade.token_symbol || 'TOKEN'} - Buyability Score: ${trade.buyability_score || 'N/A'}`,
          details: `Trigger: ${trade.buys_detected}/${trade.buys_required} whale buys detected. Price: ${trade.execution_price?.toFixed(8) || 'N/A'}`,
          highlight: 'success'
        });
      } else if (trade.status === 'rejected') {
        events.push({
          timestamp: trade.created_at,
          type: 'decision',
          icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
          title: `⛔ REJECTED: $${trade.token_symbol || 'TOKEN'}`,
          description: trade.rejection_reason || 'Did not meet criteria',
          details: `Score: ${trade.buyability_score}, Buys: ${trade.buys_detected}/${trade.buys_required}`,
          highlight: 'warning'
        });
      } else if (trade.status === 'monitoring') {
        events.push({
          timestamp: trade.created_at,
          type: 'decision',
          icon: <Clock className="h-4 w-4 text-blue-500" />,
          title: `👁️ WATCHING: $${trade.token_symbol || 'TOKEN'}`,
          description: `Waiting for ${trade.buys_required - trade.buys_detected} more whale buys`,
          highlight: 'info'
        });
      }
    });

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setStoryEvents(events);
  };

  const getHighlightClass = (highlight?: string) => {
    switch (highlight) {
      case 'success': return 'border-l-green-500 bg-green-500/5';
      case 'warning': return 'border-l-yellow-500 bg-yellow-500/5';
      case 'error': return 'border-l-red-500 bg-red-500/5';
      case 'info': return 'border-l-blue-500 bg-blue-500/5';
      default: return 'border-l-border';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Fantasy Trade Story
            </CardTitle>
            <CardDescription>
              Live narrative of whale activity and system decisions
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-lg border bg-card">
            <div className="text-xl font-bold text-yellow-500">
              {alerts.filter(a => a.alert_type === 'token_mint').length}
            </div>
            <div className="text-xs text-muted-foreground">Mints Detected</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="text-xl font-bold text-green-500">
              {alerts.filter(a => a.alert_type === 'token_buy').length}
            </div>
            <div className="text-xs text-muted-foreground">Whale Buys</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="text-xl font-bold text-primary">
              {autoTrades.filter(t => t.status === 'executed').length}
            </div>
            <div className="text-xs text-muted-foreground">System Trades</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="text-xl font-bold text-orange-500">
              {autoTrades.filter(t => t.status === 'rejected').length}
            </div>
            <div className="text-xs text-muted-foreground">Rejected</div>
          </div>
        </div>

        {/* Story Timeline */}
        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {storyEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No activity recorded yet. Waiting for whale movements...
              </div>
            ) : (
              storyEvents.map((event, idx) => (
                <div 
                  key={idx}
                  className={`p-3 border-l-4 rounded-r-lg ${getHighlightClass(event.highlight)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{event.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{event.title}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(event.timestamp), 'HH:mm:ss')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                      {event.details && (
                        <p className="text-xs text-muted-foreground/70 mt-1 font-mono">
                          {event.details}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
