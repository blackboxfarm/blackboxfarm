import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SolPriceData {
  price: number;
  timestamp: string;
  source: string;
  isLoading: boolean;
  error: string | null;
}

export function useSolPrice() {
  const [priceData, setPriceData] = useState<SolPriceData>({
    price: 0, // No hardcoded fallback - wait for real price
    timestamp: new Date().toISOString(),
    source: 'loading',
    isLoading: true,
    error: null
  });

  const fetchPrice = useCallback(async () => {
    try {
      setPriceData(prev => ({ ...prev, isLoading: true, error: null }));
      
      const { data, error } = await supabase.functions.invoke('sol-price');
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data && typeof data.price === 'number') {
        setPriceData({
          price: data.price,
          timestamp: data.timestamp,
          source: data.source,
          isLoading: false,
          error: null
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch SOL price:', error);
      setPriceData(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to fetch price'
      }));
    }
  }, []);

  useEffect(() => {
    // Initial fetch only - no automatic refresh to save Helius credits
    fetchPrice();
  }, [fetchPrice]);

  return {
    price: priceData.price,
    timestamp: priceData.timestamp,
    source: priceData.source,
    isLoading: priceData.isLoading,
    error: priceData.error,
    refetch: fetchPrice
  };
}