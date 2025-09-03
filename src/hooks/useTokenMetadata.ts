import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  totalSupply?: number;
  verified?: boolean;
}

interface PriceInfo {
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  dexUrl?: string;
}

interface OnChainData {
  decimals: number;
  supply: string;
  mintAuthority?: string;
  freezeAuthority?: string;
}

interface TokenData {
  metadata: TokenMetadata;
  priceInfo: PriceInfo | null;
  onChainData: OnChainData;
}

export function useTokenMetadata() {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTokenMetadata = useCallback(async (tokenMint: string) => {
    if (!tokenMint) {
      setError('Token address is required');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('token-metadata', {
        body: { tokenMint }
      });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch token metadata');
      }

      setTokenData(data);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch token metadata');
      setTokenData(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const validateTokenAddress = useCallback((address: string): boolean => {
    if (!address) return false;
    
    // Basic Solana address validation (base58, 32-44 chars)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
  }, []);

  return {
    tokenData,
    isLoading,
    error,
    fetchTokenMetadata,
    validateTokenAddress,
    clearData: () => {
      setTokenData(null);
      setError(null);
    }
  };
}