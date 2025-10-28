import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DeveloperReputationResponse {
  found: boolean;
  message?: string;
  walletAddress?: string;
  profile?: {
    id: string;
    displayName: string;
    masterWallet: string;
    kycVerified: boolean;
    tags: string[];
  };
  risk?: {
    level: 'unknown' | 'verified' | 'low' | 'medium' | 'high' | 'critical';
    color: string;
    score: number;
    trustLevel: string;
    canTrade: boolean;
    warning: string;
  };
  stats?: {
    totalTokens: number;
    successfulTokens: number;
    failedTokens: number;
    rugPulls: number;
    slowDrains: number;
    reputationScore: number;
    trustLevel: string;
  };
  lastAnalyzed?: string;
  canTrade?: boolean;
  riskLevel?: string;
}

export const useDeveloperReputation = (walletAddress?: string) => {
  return useQuery({
    queryKey: ['developer-reputation', walletAddress],
    queryFn: async () => {
      if (!walletAddress) {
        return null;
      }

      const { data, error } = await supabase.functions.invoke('developer-reputation', {
        body: { walletAddress }
      });

      if (error) {
        console.error('Error fetching developer reputation:', error);
        throw error;
      }

      return data as DeveloperReputationResponse;
    },
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000 // 10 minutes
  });
};
