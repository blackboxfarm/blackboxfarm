import { useState, useCallback } from 'react';
import React from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  totalSupply?: number;
  verified?: boolean;
  image?: string;
  description?: string;
  uri?: string;
  isPumpFun?: boolean;
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

  const validateTokenAddress = useCallback((address: string): boolean => {
    if (!address) return false;
    
    // Basic Solana address validation (base58, 32-44 chars)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
  }, []);

  const fetchTokenMetadata = useCallback(async (tokenMint: string, forceRefresh = false) => {
    if (!tokenMint) {
      setError('Token address is required');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching token metadata for:', tokenMint);
      
      const { data, error: fetchError } = await supabase.functions.invoke('token-metadata', {
        body: { tokenMint }
      });

      if (fetchError) {
        console.error('Supabase function invoke error:', fetchError);
        throw new Error(fetchError.message || 'Failed to connect to metadata service');
      }

      if (!data?.success) {
        console.error('Token metadata error:', data?.error);
        
        // Provide better error messages for common issues
        if (data?.error?.includes('Memory limit exceeded')) {
          setError('Token metadata service is temporarily overloaded. This may be a pump.fun token - please try again in a moment.');
        } else if (data?.error?.includes('timeout')) {
          setError('Request timed out. The token may be on pump.fun bonding curve or network is slow.');
        } else if (data?.error?.includes('not found')) {
          setError('Token not found on Solana blockchain. Please verify the address.');
        } else {
          setError(data?.error || 'Failed to fetch token metadata');
        }
        
        // For valid addresses, still allow with fallback
        if (validateTokenAddress(tokenMint)) {
          console.log('Using fallback metadata for valid address');
          setTokenData({
            metadata: {
              mint: tokenMint,
              name: 'Unknown Token',
              symbol: 'UNK',
              decimals: 9,
              verified: false
            },
            priceInfo: null,
            onChainData: {
              decimals: 9,
              supply: '0'
            }
          });
          return true;
        }
        
        throw new Error(data?.error || 'Failed to fetch token metadata');
      }

      // Check if this is a pump.fun token and add appropriate messaging
      if (data.metadata?.isPumpFun || data.onChainData?.isPumpFun) {
        console.log('Detected pump.fun token');
        setTokenData({
          ...data,
          metadata: {
            ...data.metadata,
            isPumpFun: true
          }
        });
      } else {
        setTokenData(data);
      }
      
      return true;
    } catch (err: any) {
      console.error('Token metadata fetch error:', err);
      
      // More specific error handling
      if (err.message?.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else if (err.message?.includes('timeout')) {
        setError('Request timed out. Please try again.');
      } else {
        setError(err.message || 'Failed to fetch token metadata');
      }
      
      setTokenData(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [validateTokenAddress]);


  const refreshTokenMetadata = useCallback((tokenMint: string) => {
    return fetchTokenMetadata(tokenMint, true);
  }, [fetchTokenMetadata]);

  return {
    tokenData,
    isLoading,
    error,
    fetchTokenMetadata,
    refreshTokenMetadata,
    validateTokenAddress,
    clearData: () => {
      setTokenData(null);
      setError(null);
    }
  };
}