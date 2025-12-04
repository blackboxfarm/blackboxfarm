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
  token_mint: string;
  token_symbol?: string;
  token_image?: string;
  amount_sol?: number;
  timestamp: string;
  whale_count?: number;
}

interface FrenzyActivityFeedProps {
  userId: string;
  minWhalesForFrenzy: number;
  onFrenzyDetected?: (tokenMint: string) => void;
}

export function FrenzyActivityFeed({ 
  userId, 
  minWhalesForFrenzy,
  onFrenzyDetected 
}: FrenzyActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [tokenProgress, setTokenProgress] = useState<Map<string, number>>(new Map());

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
          // Extract wallet info from participating_wallets JSON
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
              amount_sol: event.auto_buy_amount_sol,
              timestamp: event.detected_at
            };
            setActivities(prev => [autoBuyActivity, ...prev].slice(0, 50));
          }
          
          onFrenzyDetected?.(event.token_mint);
        }
      )
      .subscribe();

    // Load recent frenzy events
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
      .limit(20);

    if (data) {
      const newActivities: ActivityItem[] = [];
      data.forEach(event => {
        // Extract wallet info from participating_wallets JSON
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
            amount_sol: event.auto_buy_amount_sol,
            timestamp: event.detected_at
          });
        }
      });
      
      setActivities(newActivities);
    }
  };

  const getActivityIcon = (activity: ActivityItem) => {
    if (activity.type === 'auto_buy') {
      return <Zap className="h-4 w-4 text-yellow-500" />;
    }
    // Icon based on whale count
    const count = activity.whale_count || 1;
    if (count >= minWhalesForFrenzy) return <span className="text-lg">🔥</span>;
    if (count >= 2) return <span className="text-lg">👀</span>;
    return <span className="text-lg">🐋</span>;
  };

  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'whale_buy':
        return 'text-blue-500';
      case 'frenzy_detected':
        return 'text-orange-500';
      case 'auto_buy':
        return 'text-green-500';
    }
  };

  const getActivityLabel = (activity: ActivityItem) => {
    if (activity.type === 'auto_buy') {
      return { label: 'AUTO-BUY', className: 'text-green-500' };
    }
    // Label based on whale count
    const count = activity.whale_count || 1;
    if (count >= minWhalesForFrenzy) return { label: '🔥 FRENZY!', className: 'text-orange-500' };
    if (count >= 3) return { label: 'Triple Buy', className: 'text-amber-500' };
    if (count === 2) return { label: 'Double Buy', className: 'text-yellow-500' };
    return { label: 'Whale Buy', className: 'text-blue-400' };
  };

  const getWalletDisplay = (activity: ActivityItem) => {
    if (activity.wallet_nickname) return activity.wallet_nickname;
    if (activity.wallet_address) return activity.wallet_address.slice(0, 4) + '...' + activity.wallet_address.slice(-4);
    return 'Unknown';
  };

  const getActivityMessage = (activity: ActivityItem) => {
    const { label, className } = getActivityLabel(activity);
    const tokenDisplay = activity.token_symbol ? `$${activity.token_symbol}` : activity.token_mint.slice(0, 6) + '...';
    const walletDisplay = getWalletDisplay(activity);
    
    if (activity.type === 'auto_buy') {
      return (
        <>
          <span className={`font-bold ${className}`}>{label}</span>
          {': '}
          <span className="font-medium">{activity.amount_sol} SOL</span>
          {' → '}
          <span className="font-semibold text-primary">{tokenDisplay}</span>
        </>
      );
    }
    
    const count = activity.whale_count || 1;
    return (
      <>
        <span className="text-muted-foreground">{walletDisplay}</span>
        {' '}
        <span className={`font-bold ${className}`}>{label}</span>
        {count > 1 && (
          <span className="text-muted-foreground"> ({count} whales)</span>
        )}
        {' → '}
        <span className="font-semibold text-primary">{tokenDisplay}</span>
      </>
    );
  };

  const getActivityBorderColor = (activity: ActivityItem) => {
    if (activity.type === 'auto_buy') return 'border-l-green-500 bg-green-500/5';
    const count = activity.whale_count || 1;
    if (count >= minWhalesForFrenzy) return 'border-l-orange-500 bg-orange-500/10';
    if (count >= 3) return 'border-l-amber-500 bg-amber-500/5';
    if (count === 2) return 'border-l-yellow-500 bg-yellow-500/5';
    return 'border-l-blue-400 bg-blue-500/5';
  };

  // Calculate urgency based on recent activity
  const recentFrenzies = activities.filter(
    a => a.type === 'frenzy_detected' && 
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

        {/* Activity list */}
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-2">
            {activities.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Waiting for whale activity...</p>
              </div>
            ) : (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`flex items-start gap-2 p-2 rounded-lg bg-muted/50 border-l-2 ${getActivityBorderColor(activity)}`}
                >
                  {/* Token image */}
                  {activity.token_image ? (
                    <img 
                      src={activity.token_image} 
                      alt={activity.token_symbol || 'Token'} 
                      className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      {getActivityIcon(activity)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-tight">
                      {getActivityMessage(activity)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(activity.timestamp), 'HH:mm:ss')}
                    </p>
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
