import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Background data collection hook - triggers snapshot capture for any token query
 * This builds historical data for premium features (movements, retention analysis)
 * without blocking the UI or requiring authentication
 */
export const useTokenDataCollection = (tokenMint: string | null, holders?: any[], price?: number) => {
  const lastCapturedRef = useRef<string | null>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only trigger if we have valid data and haven't captured this token recently
    if (!tokenMint || !holders || holders.length === 0) return;
    if (lastCapturedRef.current === tokenMint) return;

    // Debounce to avoid hammering the API
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
    }

    captureTimerRef.current = setTimeout(() => {
      // Background snapshot capture - fire and forget
      supabase.functions.invoke('capture-holder-snapshot', {
        body: { 
          token_mint: tokenMint,
          holders: holders.map(h => ({
            address: h.owner,
            balance: h.balance,
            usdValue: h.usdValue,
            tier: getTier(h.usdValue)
          })),
          price: price || 0
        }
      }).catch(err => console.log('[Background] Snapshot capture queued:', tokenMint.slice(0, 8)));

      // Track movements in background (this will also run async)
      supabase.functions.invoke('track-holder-movements', {
        body: { token_mint: tokenMint }
      }).catch(err => console.log('[Background] Movement tracking queued:', tokenMint.slice(0, 8)));

      lastCapturedRef.current = tokenMint;
    }, 2000); // 2 second debounce

    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
      }
    };
  }, [tokenMint, holders, price]);
};

// Helper to determine holder tier
const getTier = (usdValue: number): string => {
  if (usdValue >= 5000) return 'Whale';
  if (usdValue >= 2000) return 'Baby Whale';
  if (usdValue >= 1000) return 'Super Boss';
  if (usdValue >= 500) return 'Kingpin';
  if (usdValue >= 200) return 'Boss';
  if (usdValue >= 50) return 'Real';
  if (usdValue >= 5) return 'Large';
  if (usdValue >= 1) return 'Medium';
  return 'Small';
};
