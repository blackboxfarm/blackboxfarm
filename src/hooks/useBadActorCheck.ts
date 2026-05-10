import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BadActorLevel = 'critical' | 'high' | 'warn' | 'clean';

export interface BadActorCheckResponse {
  isBadActor: boolean;
  level: BadActorLevel;
  headline: string;
  reasons: string[];
  subjects: Array<'token' | 'creator' | 'x_handle'>;
  tier: string;
  locked: boolean;
  details: any | null;
  counts: {
    blacklistEntries: number;
    meshLinks: number;
    recycledCommunities: number;
    launchHistory: number;
    hasDevReputation: boolean;
  };
}

export function useBadActorCheck(args: {
  tokenMint?: string | null;
  walletAddress?: string | null;
  xHandle?: string | null;
}) {
  const { tokenMint, walletAddress, xHandle } = args;
  const enabled = !!(tokenMint || walletAddress || xHandle);

  return useQuery({
    queryKey: ['bad-actor-check', tokenMint || '', walletAddress || '', xHandle || ''],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('bad-actor-check', {
        body: { tokenMint, walletAddress, xHandle },
      });
      if (error) throw error;
      return data as BadActorCheckResponse;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}