import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserTier } from '@/hooks/useUserTier';
import { supabase } from '@/integrations/supabase/client';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'bubble_map_usage';
const VISITOR_ID_KEY = 'bbf_visitor_id';
const DAILY_LIMIT_ANON = 1;
const DAILY_LIMIT_FREE_AUTH = 3;

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

let fpPromise: Promise<string> | null = null;
async function getVisitorId(): Promise<string> {
  if (fpPromise) return fpPromise;
  fpPromise = (async () => {
    try {
      // Cache so we don't recompute on every interaction
      const cached = localStorage.getItem(VISITOR_ID_KEY);
      if (cached) return cached;
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      try { localStorage.setItem(VISITOR_ID_KEY, result.visitorId); } catch {}
      return result.visitorId;
    } catch {
      return 'no-fp';
    }
  })();
  return fpPromise;
}

export function useBubbleMapRateLimit() {
  const { user } = useAuth();
  const { isPro } = useUserTier();
  const [usage, setUsageState] = useState<UsageRecord>(getUsage);
  const [serverRemaining, setServerRemaining] = useState<number | null>(null);

  // Refresh on mount
  useEffect(() => {
    const current = getUsage();
    setUsageState(current);
    console.log('[BubbleMapRateLimit] Init:', { userId: user?.id?.slice(0, 8), isPro, usage: current });
  }, []);

  const isSubscriber = isPro;
  const limit = isSubscriber ? Infinity : (user ? DAILY_LIMIT_FREE_AUTH : DAILY_LIMIT_ANON);
  // Server is authoritative when available; fall back to local count.
  const localRemaining = Math.max(0, limit - usage.count);
  const remaining = serverRemaining !== null ? Math.min(localRemaining, serverRemaining) : localRemaining;
  const isLimited = !isSubscriber;
  const canSearch = remaining > 0 || isSubscriber;

  const recordSearch = useCallback(async () => {
    if (isSubscriber) {
      console.log('[BubbleMapRateLimit] Subscriber — no limit tracked');
      return;
    }
    // Server-side consume (fail-open)
    try {
      const visitorId = await getVisitorId();
      const tier: 'anon' | 'free' = user ? 'free' : 'anon';
      const { data, error } = await supabase.functions.invoke('check-bubble-quota', {
        body: { visitorId, action: 'consume', tier },
      });
      if (!error && data && typeof data.remaining === 'number') {
        setServerRemaining(Math.max(0, data.remaining));
        console.log('[BubbleMapRateLimit] Server consume:', data);
      }
    } catch (e) {
      console.warn('[BubbleMapRateLimit] Server consume failed (fail-open):', e);
    }
    // Always update local mirror
    const current = getUsage();
    const updated = { date: getTodayKey(), count: current.count + 1 };
    setUsage(updated);
    setUsageState(updated);
    console.log('[BubbleMapRateLimit] Search recorded:', { count: updated.count, limit, remaining: Math.max(0, limit - updated.count) });
  }, [isSubscriber, limit, user]);

  // On mount / tier change, ask server for current remaining (check, no consume)
  useEffect(() => {
    if (isSubscriber) { setServerRemaining(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const visitorId = await getVisitorId();
        const tier: 'anon' | 'free' = user ? 'free' : 'anon';
        const { data, error } = await supabase.functions.invoke('check-bubble-quota', {
          body: { visitorId, action: 'check', tier },
        });
        if (!cancelled && !error && data && typeof data.remaining === 'number') {
          setServerRemaining(Math.max(0, data.remaining));
        }
      } catch {/* fail-open */}
    })();
    return () => { cancelled = true; };
  }, [user?.id, isSubscriber]);

  const displayLimit = limit;
  const displayRemaining = remaining;
  const tierLabel: 'anon' | 'free' | 'pro' = isSubscriber ? 'pro' : (user ? 'free' : 'anon');

  return {
    canSearch,
    remaining: displayRemaining,
    limit: displayLimit,
    used: usage.count,
    isSubscriber,
    isLimited,
    recordSearch,
    isAuthenticated: !!user,
    tierLabel,
  };
}
