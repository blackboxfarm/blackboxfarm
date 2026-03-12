import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HeliusCreditSnapshot {
  totalCredits: number;
  totalCalls: number;
  callLog: { timestamp: number; endpoint: string; credits: number; responseMs: number }[];
  sessionStart: number;
  isTracking: boolean;
}

/**
 * Real-time Helius API credit tracker for the Bubble Map.
 * Polls api_usage_log for helius calls made since the session started.
 */
export function useHeliusCreditTracker() {
  const [snapshot, setSnapshot] = useState<HeliusCreditSnapshot>({
    totalCredits: 0,
    totalCalls: 0,
    callLog: [],
    sessionStart: 0,
    isTracking: false,
  });

  const sessionStartRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenIdRef = useRef<Set<string>>(new Set());

  const pollCredits = useCallback(async () => {
    if (!sessionStartRef.current) return;

    const since = new Date(sessionStartRef.current).toISOString();

    const { data, error } = await supabase
      .from('api_usage_log')
      .select('id, endpoint, credits_used, response_time_ms, timestamp')
      .eq('service_name', 'helius')
      .gte('timestamp', since)
      .order('timestamp', { ascending: true })
      .limit(500);

    if (error || !data) return;

    // Only process new entries
    const newEntries = data.filter(d => !lastSeenIdRef.current.has(d.id));
    for (const entry of data) lastSeenIdRef.current.add(entry.id);

    if (newEntries.length > 0 || data.length !== snapshot.totalCalls) {
      const callLog = data.map(d => ({
        timestamp: new Date(d.timestamp).getTime(),
        endpoint: d.endpoint || 'unknown',
        credits: d.credits_used || 1,
        responseMs: d.response_time_ms || 0,
      }));

      setSnapshot({
        totalCredits: data.reduce((sum, d) => sum + (d.credits_used || 1), 0),
        totalCalls: data.length,
        callLog,
        sessionStart: sessionStartRef.current,
        isTracking: true,
      });
    }
  }, []);

  const startTracking = useCallback(() => {
    sessionStartRef.current = Date.now();
    lastSeenIdRef.current.clear();
    setSnapshot({
      totalCredits: 0,
      totalCalls: 0,
      callLog: [],
      sessionStart: sessionStartRef.current,
      isTracking: true,
    });

    // Poll every 2 seconds
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(pollCredits, 2000);
  }, [pollCredits]);

  const stopTracking = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setSnapshot(prev => ({ ...prev, isTracking: false }));
  }, []);

  const resetTracking = useCallback(() => {
    stopTracking();
    lastSeenIdRef.current.clear();
    setSnapshot({
      totalCredits: 0,
      totalCalls: 0,
      callLog: [],
      sessionStart: 0,
      isTracking: false,
    });
  }, [stopTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  return {
    snapshot,
    startTracking,
    stopTracking,
    resetTracking,
  };
}
