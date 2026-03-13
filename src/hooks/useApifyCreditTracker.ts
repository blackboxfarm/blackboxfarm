import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ApifyCreditSnapshot {
  totalCredits: number;
  totalCalls: number;
  callLog: { timestamp: number; endpoint: string; credits: number; responseMs: number; functionName: string }[];
  sessionStart: number;
  isTracking: boolean;
  estimatedCostUsd: number;
}

/**
 * Real-time Apify API credit tracker for the Bubble Map.
 * Polls api_usage_log for apify calls made since the session started.
 */
export function useApifyCreditTracker() {
  const [snapshot, setSnapshot] = useState<ApifyCreditSnapshot>({
    totalCredits: 0,
    totalCalls: 0,
    callLog: [],
    sessionStart: 0,
    isTracking: false,
    estimatedCostUsd: 0,
  });

  const sessionStartRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenIdRef = useRef<Set<string>>(new Set());

  const pollCredits = useCallback(async () => {
    if (!sessionStartRef.current) return;

    const since = new Date(sessionStartRef.current).toISOString();

    const { data, error } = await supabase
      .from('api_usage_log')
      .select('id, endpoint, credits_used, response_time_ms, timestamp, function_name')
      .eq('service_name', 'apify')
      .gte('timestamp', since)
      .order('timestamp', { ascending: true })
      .limit(500);

    if (error || !data) return;

    for (const entry of data) lastSeenIdRef.current.add(entry.id);

    const callLog = data.map(d => ({
      timestamp: new Date(d.timestamp).getTime(),
      endpoint: d.endpoint || 'unknown',
      credits: d.credits_used || 1,
      responseMs: d.response_time_ms || 0,
      functionName: d.function_name || 'unknown',
    }));

    setSnapshot({
      totalCredits: data.reduce((sum, d) => sum + (d.credits_used || 1), 0),
      totalCalls: data.length,
      callLog,
      sessionStart: sessionStartRef.current,
      isTracking: true,
      estimatedCostUsd: data.length * 0.50, // ~$0.50 per Apify actor run avg
    });
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
      estimatedCostUsd: 0,
    });

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(pollCredits, 3000);
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
      estimatedCostUsd: 0,
    });
  }, [stopTracking]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  return { snapshot, startTracking, stopTracking, resetTracking };
}
