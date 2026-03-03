import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export type WebTierKey = 'free' | 'auth' | 'x_subscriber' | 'pro' | 'dev' | 'enterprise';
export type AiAccessLevel = 'summary' | 'analysis' | 'overview' | 'full' | 'api';

// Tier hierarchy for comparison
const TIER_ORDER: Record<WebTierKey, number> = {
  free: 0,
  auth: 1,
  x_subscriber: 2,
  pro: 3,
  dev: 4,
  enterprise: 5,
};

export interface TierInfo {
  tierKey: WebTierKey;
  displayName: string;
  aiAccessLevel: AiAccessLevel;
  features: Record<string, boolean | number>;
  maxReportsPerDay: number;
  isXSubscriber: boolean;
  xHandleLinked: string | null;
}

const FREE_TIER: TierInfo = {
  tierKey: 'free',
  displayName: 'Free',
  aiAccessLevel: 'summary',
  features: { basic_report: true },
  maxReportsPerDay: 3,
  isXSubscriber: false,
  xHandleLinked: null,
};

const AUTH_TIER: TierInfo = {
  tierKey: 'auth',
  displayName: 'Free Account',
  aiAccessLevel: 'analysis',
  features: { basic_report: true, health_dashboard: true, whale_warnings: true, ai_panel: true },
  maxReportsPerDay: 10,
  isXSubscriber: false,
  xHandleLinked: null,
};

export function useUserTier() {
  const { user } = useAuth();
  const [tierInfo, setTierInfo] = useState<TierInfo>(FREE_TIER);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTierInfo(FREE_TIER);
      setIsLoading(false);
      return;
    }

    const fetchTier = async () => {
      setIsLoading(true);
      try {
        // Get user's active subscriptions
        const { data: subs } = await supabase
          .from('web_user_subscriptions')
          .select('tier_key, x_handle_linked, x_subscription_verified, expires_at')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (!subs || subs.length === 0) {
          setTierInfo(AUTH_TIER);
          setIsLoading(false);
          return;
        }

        // Find highest active tier
        let bestSub = subs[0];
        for (const sub of subs) {
          if (sub.expires_at && new Date(sub.expires_at) < new Date()) continue;
          const currentOrder = TIER_ORDER[sub.tier_key as WebTierKey] ?? 0;
          const bestOrder = TIER_ORDER[bestSub.tier_key as WebTierKey] ?? 0;
          if (currentOrder > bestOrder) bestSub = sub;
        }

        // Check expiry
        if (bestSub.expires_at && new Date(bestSub.expires_at) < new Date()) {
          setTierInfo(AUTH_TIER);
          setIsLoading(false);
          return;
        }

        // Get tier details
        const { data: tierData } = await supabase
          .from('web_subscription_tiers')
          .select('*')
          .eq('tier_key', bestSub.tier_key)
          .single();

        if (tierData) {
          setTierInfo({
            tierKey: tierData.tier_key as WebTierKey,
            displayName: tierData.display_name,
            aiAccessLevel: tierData.ai_access_level as AiAccessLevel,
            features: (tierData.features as Record<string, boolean | number>) || {},
            maxReportsPerDay: tierData.max_reports_per_day ?? 10,
            isXSubscriber: bestSub.x_subscription_verified ?? false,
            xHandleLinked: bestSub.x_handle_linked,
          });
        } else {
          setTierInfo(AUTH_TIER);
        }
      } catch (err) {
        console.error('Error fetching user tier:', err);
        setTierInfo(AUTH_TIER);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTier();
  }, [user]);

  const meetsMinimumTier = useCallback((requiredTier: WebTierKey): boolean => {
    return TIER_ORDER[tierInfo.tierKey] >= TIER_ORDER[requiredTier];
  }, [tierInfo.tierKey]);

  const hasFeature = useCallback((feature: string): boolean => {
    return !!tierInfo.features[feature];
  }, [tierInfo.features]);

  return {
    tierInfo,
    isLoading,
    meetsMinimumTier,
    hasFeature,
    isAnonymous: !user,
    isPro: tierInfo.tierKey === 'pro' || tierInfo.tierKey === 'dev' || tierInfo.tierKey === 'enterprise',
  };
}
