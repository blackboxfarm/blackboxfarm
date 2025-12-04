import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Bell, TrendingUp, Zap } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'whale_buy' | 'frenzy_detected' | 'auto_buy';
  wallet_address?: string;
  wallet_nickname?: string;
  wallet_avatar?: string;
  token_mint: string;
  token_symbol?: string;
  token_image?: string;
  sol_amount?: number;
  token_amount?: number;
  price_per_token?: number;
  timestamp: string;
  whale_count?: number;
}

interface FrenzyActivityFeedProps {
  userId: string;
  minWhalesForFrenzy: number;
  onFrenzyDetected?: (tokenMint: string) => void;
}

// Format price in readable format (handles very small numbers)
const formatPrice = (price: number | undefined): string => {
  if (!price || price === 0) return '-';
  if (price < 0.000001) return price.toExponential(2);
  if (price < 0.0001) return price.toFixed(8);
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
};

// Format SOL amount
const formatSol = (amount: number | undefined): string => {
  if (!amount || amount === 0) return '-';
  if (amount < 0.01) return amount.toFixed(4);
  if (amount < 1) return amount.toFixed(3);
  return amount.toFixed(2);
};

export function FrenzyActivityFeed({ 
  userId, 
  minWhalesForFrenzy,
  onFrenzyDetected 
}: FrenzyActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    // Subscribe to real-time whale_frenzy_events
    const channel = supabase
      .channel('frenzy-activity')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whale_frenzy_events',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const event = payload.new as any;
          const wallets = event.participating_wallets as any[] || [];
          const firstWallet = wallets[0] || {};
          
          const newActivity: ActivityItem = {
            id: event.id,
            type: 'frenzy_detected',
            token_mint: event.token_mint,
            token_symbol: event.token_symbol,
            token_image: event.token_image,
            wallet_address: firstWallet.address,
            wallet_nickname: firstWallet.nickname,
            wallet_avatar: firstWallet.avatar_url,
            sol_amount: firstWallet.sol_amount,
            token_amount: firstWallet.token_amount,
            price_per_token: firstWallet.price_per_token,
            timestamp: event.detected_at,
            whale_count: event.whale_count
          };
          
          setActivities(prev => [newActivity, ...prev].slice(0, 50));
          
          if (event.auto_buy_executed) {
            const autoBuyActivity: ActivityItem = {
              id: `${event.id}-autobuy`,
              type: 'auto_buy',
              token_mint: event.token_mint,
              token_symbol: event.token_symbol,
              token_image: event.token_image,
              sol_amount: event.auto_buy_amount_sol,
              timestamp: event.detected_at
            };
            setActivities(prev => [autoBuyActivity, ...prev].slice(0, 50));
          }
          
          onFrenzyDetected?.(event.token_mint);
        }
      )
      .subscribe();

    loadRecentEvents();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const loadRecentEvents = async () => {
    const { data } = await supabase
      .from('whale_frenzy_events')
      .select('*')
      .eq('user_id', userId)
      .order('detected_at', { ascending: false })
      .limit(30);

    if (data) {
      const newActivities: ActivityItem[] = [];
      data.forEach(event => {
        const wallets = event.participating_wallets as any[] || [];
        const firstWallet = wallets[0] || {};
        
        newActivities.push({
          id: event.id,
          type: 'frenzy_detected',
          token_mint: event.token_mint,
          token_symbol: event.token_symbol,
          token_image: event.token_image,
          wallet_address: firstWallet.address,
          wallet_nickname: firstWallet.nickname,
          wallet_avatar: firstWallet.avatar_url,
          sol_amount: firstWallet.sol_amount,
          token_amount: firstWallet.token_amount,
          price_per_token: firstWallet.price_per_token,
          timestamp: event.detected_at,
          whale_count: event.whale_count
        });
        
        if (event.auto_buy_executed) {
          newActivities.push({
            id: `${event.id}-autobuy`,
            type: 'auto_buy',
            token_mint: event.token_mint,
            token_symbol: event.token_symbol,
            token_image: event.token_image,
            sol_amount: event.auto_buy_amount_sol,
            timestamp: event.detected_at
          });
        }
      });
      
      setActivities(newActivities);
    }
  };

  const getActivityBadge = (activity: ActivityItem) => {
    if (activity.type === 'auto_buy') {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">AUTO-BUY</Badge>;
    }
    const count = activity.whale_count || 1;
    if (count >= minWhalesForFrenzy) {
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 animate-pulse">🔥 FRENZY</Badge>;
    }
    if (count >= 3) {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Triple</Badge>;
    }
    if (count === 2) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Double</Badge>;
    }
    return <Badge variant="outline" className="text-blue-400 border-blue-400/30">Buy</Badge>;
  };

  const getWalletDisplay = (activity: ActivityItem) => {
    if (activity.wallet_nickname) return activity.wallet_nickname;
    if (activity.wallet_address) return activity.wallet_address.slice(0, 4) + '...' + activity.wallet_address.slice(-4);
    return '-';
  };

  const getRowBgColor = (activity: ActivityItem) => {
    if (activity.type === 'auto_buy') return 'bg-green-500/5 hover:bg-green-500/10';
    const count = activity.whale_count || 1;
    if (count >= minWhalesForFrenzy) return 'bg-orange-500/10 hover:bg-orange-500/15';
    if (count >= 3) return 'bg-amber-500/5 hover:bg-amber-500/10';
    if (count === 2) return 'bg-yellow-500/5 hover:bg-yellow-500/10';
    return 'hover:bg-muted/50';
  };

  // Calculate urgency based on recent activity
  const recentFrenzies = activities.filter(
    a => a.whale_count && a.whale_count >= minWhalesForFrenzy && 
    new Date(a.timestamp).getTime() > Date.now() - 60000
  ).length;
  const urgencyLevel = Math.min(recentFrenzies * 33, 100);

  return (
    <Card className="bg-card/50 backdrop-blur h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Activity Feed
          </div>
          {urgencyLevel > 0 && (
            <Badge variant={urgencyLevel > 66 ? 'destructive' : urgencyLevel > 33 ? 'default' : 'secondary'}>
              {urgencyLevel > 66 ? '🔥 HOT' : urgencyLevel > 33 ? '⚡ Active' : 'Normal'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Urgency meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Activity Level</span>
            <span>{urgencyLevel}%</span>
          </div>
          <Progress 
            value={urgencyLevel} 
            className={`h-2 ${urgencyLevel > 66 ? '[&>div]:bg-destructive' : urgencyLevel > 33 ? '[&>div]:bg-orange-500' : ''}`}
          />
        </div>

        {/* Activity table */}
        <ScrollArea className="h-[400px]">
          {activities.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Waiting for whale activity...</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Header row */}
              <div className="grid grid-cols-[40px_40px_120px_140px_80px_100px_90px_70px_50px] gap-2 px-2 py-1 text-xs font-medium text-muted-foreground border-b border-border/50">
                <div>Whale</div>
                <div>Token</div>
                <div>Whale</div>
                <div>Ticker</div>
                <div className="text-right">SOL</div>
                <div className="text-right">Price</div>
                <div>Type</div>
                <div className="text-right">Time</div>
                <div></div>
              </div>
              
              {/* Activity rows */}
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`grid grid-cols-[40px_40px_120px_140px_80px_100px_90px_70px_50px] gap-2 px-2 py-2 rounded-lg items-center transition-colors ${getRowBgColor(activity)}`}
                >
                  {/* Whale avatar */}
                  <div className="flex-shrink-0">
                    {activity.wallet_avatar ? (
                      <img 
                        src={activity.wallet_avatar} 
                        alt={activity.wallet_nickname || 'Whale'} 
                        className="w-8 h-8 rounded-full object-cover border border-border"
                        onError={(e) => { 
                          e.currentTarget.onerror = null;
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm ${activity.wallet_avatar ? 'hidden' : ''}`}>
                      🐋
                    </div>
                  </div>

                  {/* Token image */}
                  <div className="flex-shrink-0">
                    {activity.token_image ? (
                      <img 
                        src={activity.token_image} 
                        alt={activity.token_symbol || 'Token'} 
                        className="w-8 h-8 rounded-full object-cover border border-border"
                        onError={(e) => { 
                          e.currentTarget.onerror = null;
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-mono ${activity.token_image ? 'hidden' : ''}`}>
                      {activity.token_symbol?.slice(0, 2) || '??'}
                    </div>
                  </div>

                  {/* Whale name */}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate text-foreground">
                      {getWalletDisplay(activity)}
                    </div>
                  </div>

                  {/* Token ticker - linked */}
                  <div className="min-w-0">
                    <a 
                      href={`https://trade.padre.gg/${activity.token_mint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline truncate block"
                    >
                      {activity.token_symbol ? (
                        `$${activity.token_symbol}`
                      ) : (
                        <span className="font-mono text-xs">
                          {activity.token_mint.slice(0, 8)}...
                        </span>
                      )}
                    </a>
                  </div>

                  {/* SOL Amount */}
                  <div className="text-right">
                    <span className="text-sm font-medium text-foreground">
                      {formatSol(activity.sol_amount)}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="text-right font-mono text-xs text-muted-foreground">
                    {formatPrice(activity.price_per_token)}
                  </div>

                  {/* Type badge */}
                  <div>
                    {getActivityBadge(activity)}
                  </div>

                  {/* Time */}
                  <div className="text-right text-xs text-muted-foreground">
                    {format(new Date(activity.timestamp), 'HH:mm:ss')}
                  </div>

                  {/* Whale count indicator */}
                  <div className="text-right">
                    {activity.whale_count && activity.whale_count > 1 && (
                      <span className="text-xs text-muted-foreground">
                        {activity.whale_count}🐋
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
