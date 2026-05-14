import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getTierKeyFromProductId } from '@/config/stripeTiers';

export type WebTierKey = 'free' | 'auth' | 'x_subscriber' | 'pro' | 'dev' | 'enterprise';
export type AiAccessLevel = 'summary' | 'analysis' | 'overview' | 'full' | 'api';

const TIER_ORDER: Record<WebTierKey, number> = {
  free: 0, auth: 1, x_subscriber: 2, pro: 3, dev: 4, enterprise: 5,
};

export interface TierInfo {
  tierKey: WebTierKey;
  displayName: string;
  aiAccessLevel: AiAccessLevel;
  features: Record<string, boolean | number>;
  maxReportsPerDay: number;
  isXSubscriber: boolean;
  xHandleLinked: string | null;
  subscriptionEnd: string | null;
}

const FREE_TIER: TierInfo = {
  tierKey: 'free', displayName: 'Free', aiAccessLevel: 'summary',
  features: { basic_report: true }, maxReportsPerDay: 3,
  isXSubscriber: false, xHandleLinked: null, subscriptionEnd: null,
};

const AUTH_TIER: TierInfo = {
  tierKey: 'auth', displayName: 'Free Account', aiAccessLevel: 'analysis',
  features: { basic_report: true, health_dashboard: true, security_alerts_critical: true },
  maxReportsPerDay: 10, isXSubscriber: false, xHandleLinked: null, subscriptionEnd: null,
};

// ===== Module-level shared store =====
type StoreState = { tierInfo: TierInfo; isLoading: boolean };
let state: StoreState = { tierInfo: FREE_TIER, isLoading: true };
let currentUserId: string | null = null;
let fetchPromise: Promise<void> | null = null;
let lastFetchAt = 0;
const STALE_MS = 30_000;
const POLL_MS = 60_000;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let refCount = 0;
const listeners = new Set<() => void>();

function setState(next: Partial<StoreState>) {
  state = { ...state, ...next };
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

async function doFetch(userId: string): Promise<void> {
  // Phase 1: DB tier lookup
  let nextTier: TierInfo = AUTH_TIER;
  try {
    const { data: subs } = await supabase
      .from('web_user_subscriptions')
      .select('tier_key, x_handle_linked, x_subscription_verified, expires_at')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (subs && subs.length > 0) {
      let bestSub = subs[0];
      for (const sub of subs) {
        if (sub.expires_at && new Date(sub.expires_at) < new Date()) continue;
        const currentOrder = TIER_ORDER[sub.tier_key as WebTierKey] ?? 0;
        const bestOrder = TIER_ORDER[bestSub.tier_key as WebTierKey] ?? 0;
        if (currentOrder > bestOrder) bestSub = sub;
      }
      if (!bestSub.expires_at || new Date(bestSub.expires_at) >= new Date()) {
        const { data: tierData } = await supabase
          .from('web_subscription_tiers')
          .select('*')
          .eq('tier_key', bestSub.tier_key)
          .single();
        if (tierData) {
          nextTier = {
            tierKey: tierData.tier_key as WebTierKey,
            displayName: tierData.display_name,
            aiAccessLevel: tierData.ai_access_level as AiAccessLevel,
            features: (tierData.features as Record<string, boolean | number>) || {},
            maxReportsPerDay: tierData.max_reports_per_day ?? 10,
            isXSubscriber: bestSub.x_subscription_verified ?? false,
            xHandleLinked: bestSub.x_handle_linked,
            subscriptionEnd: bestSub.expires_at,
          };
        }
      }
    }
  } catch (err) {
    console.error('Error fetching user tier:', err);
  }

  // Phase 2: Stripe check (may upgrade)
  try {
    const { data, error } = await supabase.functions.invoke('check-subscription');
    if (!error && data?.subscribed && data?.product_id) {
      const stripeTier = getTierKeyFromProductId(data.product_id);
      if (stripeTier && TIER_ORDER[stripeTier as WebTierKey] > TIER_ORDER[nextTier.tierKey]) {
        const tierMap: Record<string, Omit<TierInfo, 'subscriptionEnd'>> = {
          pro: { tierKey: 'pro', displayName: 'Pro', aiAccessLevel: 'full', features: { basic_report: true, health_dashboard: true, whale_warnings: true, ai_panel: true, full_ai: true, charts: true, csv_export: true, comparisons: true, extended_analysis: true, risk_assessment: true, dev_reputation: true, ad_free: true }, maxReportsPerDay: 100, isXSubscriber: false, xHandleLinked: null },
          dev: { tierKey: 'dev', displayName: 'Developer', aiAccessLevel: 'api', features: { basic_report: true, health_dashboard: true, whale_warnings: true, ai_panel: true, full_ai: true, charts: true, csv_export: true, comparisons: true, api_access: true, ad_free: true }, maxReportsPerDay: 200, isXSubscriber: false, xHandleLinked: null },
          enterprise: { tierKey: 'enterprise', displayName: 'Enterprise', aiAccessLevel: 'api', features: { basic_report: true, health_dashboard: true, whale_warnings: true, ai_panel: true, full_ai: true, charts: true, csv_export: true, comparisons: true, api_access: true, team_seats: true, ad_free: true }, maxReportsPerDay: 500, isXSubscriber: false, xHandleLinked: null },
        };
        const mapped = tierMap[stripeTier];
        if (mapped) nextTier = { ...mapped, subscriptionEnd: data.subscription_end };
      }
    }
  } catch (err) {
    console.error('Error invoking check-subscription:', err);
  }

  setState({ tierInfo: nextTier, isLoading: false });
  lastFetchAt = Date.now();
}

function ensureFetch(userId: string, force = false): Promise<void> {
  if (!force && fetchPromise) return fetchPromise;
  if (!force && Date.now() - lastFetchAt < STALE_MS) return Promise.resolve();
  fetchPromise = doFetch(userId).finally(() => { fetchPromise = null; });
  return fetchPromise;
}

function resetForUser(userId: string | null) {
  currentUserId = userId;
  lastFetchAt = 0;
  fetchPromise = null;
  if (!userId) {
    setState({ tierInfo: FREE_TIER, isLoading: false });
  } else {
    setState({ tierInfo: FREE_TIER, isLoading: true });
    ensureFetch(userId);
  }
}

function startPolling() {
  if (pollInterval || !currentUserId) return;
  pollInterval = setInterval(() => {
    if (currentUserId) ensureFetch(currentUserId, true);
  }, POLL_MS);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

const getSnapshot = () => state;

export function useUserTier() {
  const { user } = useAuth();
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Sync user changes into the store
  useEffect(() => {
    const uid = user?.id ?? null;
    if (uid !== currentUserId) resetForUser(uid);
  }, [user?.id]);

  // Refcount mount/unmount → one shared poller
  useEffect(() => {
    refCount++;
    if (refCount === 1 && currentUserId) startPolling();
    return () => {
      refCount--;
      if (refCount === 0) stopPolling();
    };
  }, []);

  const checkSubscription = useCallback(async () => {
    if (currentUserId) await ensureFetch(currentUserId, true);
  }, []);

  const meetsMinimumTier = useCallback((requiredTier: WebTierKey): boolean => {
    return TIER_ORDER[store.tierInfo.tierKey] >= TIER_ORDER[requiredTier];
  }, [store.tierInfo.tierKey]);

  const hasFeature = useCallback((feature: string): boolean => {
    return !!store.tierInfo.features[feature];
  }, [store.tierInfo.features]);

  return {
    tierInfo: store.tierInfo,
    isLoading: store.isLoading,
    meetsMinimumTier,
    hasFeature,
    isAnonymous: !user,
    isPro: store.tierInfo.tierKey === 'pro' || store.tierInfo.tierKey === 'dev' || store.tierInfo.tierKey === 'enterprise',
    checkSubscription,
  };
}

// Silence unused import warning if useState ever gets dropped
void useState;
