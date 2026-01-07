import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type HolderQuality = 'good' | 'neutral' | 'bad' | null;

export interface HolderQualityResult {
  quality: HolderQuality;
  totalHolders: number;
  dustWallets: number;
  dustPercent: number;
  realBuyersCount: number; // wallets with $5+ value
  whaleCount: number; // baby whales + true whales
  summary: string;
  isLoading: boolean;
  error: string | null;
}

interface HoldersReportResponse {
  totalHolders: number;
  dustWallets: number;
  smallWallets: number;
  mediumWallets: number;
  largeWallets: number;
  realWallets: number;
  bossWallets: number;
  kingpinWallets: number;
  superBossWallets: number;
  babyWhaleWallets: number;
  trueWhaleWallets: number;
}

/**
 * Hook to quickly check holder quality for a token
 * Returns: green (good mix), amber (neutral), red (mostly dust)
 */
export function useHolderQualityCheck() {
  const [result, setResult] = useState<HolderQualityResult>({
    quality: null,
    totalHolders: 0,
    dustWallets: 0,
    dustPercent: 0,
    realBuyersCount: 0,
    whaleCount: 0,
    summary: '',
    isLoading: false,
    error: null,
  });
  
  const lastCheckedRef = useRef<string | null>(null);
  const cacheRef = useRef<Map<string, HolderQualityResult>>(new Map());

  const checkQuality = useCallback(async (tokenMint: string, forceRefresh = false) => {
    if (!tokenMint || tokenMint.length < 32) {
      setResult(prev => ({ ...prev, quality: null, isLoading: false, error: null }));
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh && cacheRef.current.has(tokenMint)) {
      setResult(cacheRef.current.get(tokenMint)!);
      return;
    }

    // Avoid duplicate requests
    if (lastCheckedRef.current === tokenMint && result.isLoading) {
      return;
    }

    lastCheckedRef.current = tokenMint;
    setResult(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
        body: { 
          tokenMint,
          manualPrice: 0 // Let it auto-discover price
        }
      });

      if (error) throw error;
      if (!data) throw new Error('No data returned');

      const report = data as HoldersReportResponse;
      
      // Calculate quality metrics
      const totalHolders = report.totalHolders || 0;
      const dustWallets = report.dustWallets || 0;
      const dustPercent = totalHolders > 0 ? (dustWallets / totalHolders) * 100 : 0;
      
      // "Real buyers" = wallets with $5+ value (large, real, boss, kingpin, super boss, baby whale, true whale)
      const realBuyersCount = (
        (report.largeWallets || 0) + 
        (report.realWallets || 0) + 
        (report.bossWallets || 0) + 
        (report.kingpinWallets || 0) + 
        (report.superBossWallets || 0) + 
        (report.babyWhaleWallets || 0) + 
        (report.trueWhaleWallets || 0)
      );
      
      const whaleCount = (report.babyWhaleWallets || 0) + (report.trueWhaleWallets || 0);
      
      // Determine quality:
      // GREEN: <40% dust AND >20 real buyers
      // RED: >70% dust OR <5 real buyers  
      // AMBER: everything else
      let quality: HolderQuality = 'neutral';
      let summary = '';
      
      if (dustPercent > 70 || realBuyersCount < 5) {
        quality = 'bad';
        summary = dustPercent > 70 
          ? `⚠️ ${dustPercent.toFixed(0)}% dust wallets` 
          : `⚠️ Only ${realBuyersCount} real buyers`;
      } else if (dustPercent < 40 && realBuyersCount > 20) {
        quality = 'good';
        summary = `✓ ${realBuyersCount} real buyers, ${whaleCount > 0 ? `${whaleCount} whales` : 'healthy mix'}`;
      } else {
        quality = 'neutral';
        summary = `${realBuyersCount} real buyers, ${dustPercent.toFixed(0)}% dust`;
      }

      const qualityResult: HolderQualityResult = {
        quality,
        totalHolders,
        dustWallets,
        dustPercent,
        realBuyersCount,
        whaleCount,
        summary,
        isLoading: false,
        error: null,
      };

      // Cache the result
      cacheRef.current.set(tokenMint, qualityResult);
      setResult(qualityResult);
      
    } catch (err: any) {
      console.error('Holder quality check failed:', err);
      setResult(prev => ({
        ...prev,
        quality: null,
        isLoading: false,
        error: err.message || 'Failed to check holder quality',
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setResult({
      quality: null,
      totalHolders: 0,
      dustWallets: 0,
      dustPercent: 0,
      realBuyersCount: 0,
      whaleCount: 0,
      summary: '',
      isLoading: false,
      error: null,
    });
    lastCheckedRef.current = null;
  }, []);

  return {
    ...result,
    checkQuality,
    reset,
  };
}
