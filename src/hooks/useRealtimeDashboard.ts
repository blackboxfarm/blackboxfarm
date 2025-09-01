import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DashboardStats {
  activeCampaigns: number;
  totalTrades: number;
  successRate: number;
  dailyRevenue: number;
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: 'trade' | 'campaign_created' | 'contribution' | 'notification';
  message: string;
  timestamp: string;
  status: 'success' | 'pending' | 'failed';
}

export function useRealtimeDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    activeCampaigns: 0,
    totalTrades: 0,
    successRate: 0,
    dailyRevenue: 0,
    recentActivity: []
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    loadDashboardStats();
    setupRealtimeSubscriptions();
  }, [user]);

  const loadDashboardStats = async () => {
    if (!user) return;

    try {
      // Load active campaigns
      const { data: campaigns } = await supabase
        .from('blackbox_campaigns')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      // Load trading sessions for stats
      const { data: sessions } = await supabase
        .from('trading_sessions')
        .select('*')
        .eq('user_id', user.id)
        .limit(10);

      // Load recent trade history
      const { data: trades } = await supabase
        .from('trade_history')
        .select(`
          *,
          trading_sessions (
            user_id
          )
        `)
        .eq('trading_sessions.user_id', user.id)
        .order('executed_at', { ascending: false })
        .limit(5);

      // Calculate stats
      const activeCampaigns = campaigns?.length || 0;
      const totalTrades = trades?.length || 0;
      const successfulTrades = trades?.filter(t => t.status === 'success').length || 0;
      const successRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;

      // Generate recent activity
      const recentActivity: ActivityItem[] = [
        ...(trades?.map(trade => ({
          id: trade.id,
          type: 'trade' as const,
          message: `${trade.trade_type} ${trade.quantity_ui} tokens for $${trade.usd_amount}`,
          timestamp: trade.executed_at,
          status: trade.status === 'success' ? 'success' as const : 'failed' as const
        })) || []),
        ...(campaigns?.map(campaign => ({
          id: campaign.id,
          type: 'campaign_created' as const,
          message: `Campaign "${campaign.nickname}" created`,
          timestamp: campaign.created_at,
          status: 'success' as const
        })) || [])
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
       .slice(0, 10);

      setStats({
        activeCampaigns,
        totalTrades,
        successRate,
        dailyRevenue: 0, // Calculate from revenue_transactions if needed
        recentActivity
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to trade updates
    const tradesChannel = supabase
      .channel('dashboard-trades')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trade_history'
        },
        () => loadDashboardStats()
      )
      .subscribe();

    // Subscribe to campaign updates
    const campaignsChannel = supabase
      .channel('dashboard-campaigns')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blackbox_campaigns'
        },
        () => loadDashboardStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(campaignsChannel);
    };
  };

  return {
    stats,
    isLoading,
    refreshStats: loadDashboardStats
  };
}