import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserTier } from '@/hooks/useUserTier';

const STORAGE_KEY = 'bubble_map_usage';
const DAILY_LIMIT_ANON = 2;
const DAILY_LIMIT_FREE_AUTH = 2;

interface UsageRecord {
  date: string;
  count: number;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getUsage(): UsageRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: getTodayKey(), count: 0 };
    const parsed = JSON.parse(raw) as UsageRecord;
    if (parsed.date !== getTodayKey()) return { date: getTodayKey(), count: 0 };
    return parsed;
  } catch {
    return { date: getTodayKey(), count: 0 };
  }
}

function setUsage(record: UsageRecord) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function useBubbleMapRateLimit() {
  const { user } = useAuth();
  const { isPro } = useUserTier();
  const [usage, setUsageState] = useState<UsageRecord>(getUsage);

  // Refresh on mount
  useEffect(() => {
    const current = getUsage();
    setUsageState(current);
    console.log('[BubbleMapRateLimit] Init:', { userId: user?.id?.slice(0, 8), isPro, usage: current });
  }, []);

  const isSubscriber = isPro;
  const limit = isSubscriber ? Infinity : (user ? DAILY_LIMIT_FREE_AUTH : DAILY_LIMIT_ANON);
  const remaining = Math.max(0, limit - usage.count);
  const isLimited = !isSubscriber;
  const canSearch = remaining > 0 || isSubscriber;

  const recordSearch = useCallback(() => {
    if (isSubscriber) {
      console.log('[BubbleMapRateLimit] Subscriber — no limit tracked');
      return;
    }
    const current = getUsage();
    const updated = { date: getTodayKey(), count: current.count + 1 };
    setUsage(updated);
    setUsageState(updated);
    console.log('[BubbleMapRateLimit] Search recorded:', { count: updated.count, limit, remaining: Math.max(0, limit - updated.count) });
  }, [isSubscriber, limit]);

  return {
    canSearch,
    remaining,
    limit,
    used: usage.count,
    isSubscriber,
    isLimited,
    recordSearch,
    isAuthenticated: !!user,
  };
}
