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
    price: 201.00, // Default fallback
    timestamp: new Date().toISOString(),
    source: 'default',
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
    // Initial fetch
    fetchPrice();
    
    // Set up interval to refresh every 30 seconds
    const interval = setInterval(fetchPrice, 30000);
    
    return () => clearInterval(interval);
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