import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DevProfileDossier {
  wallet: string;
  verdict: string;
  tier: number | null;
  identity: {
    displayName: string | null;
    xHandle: string | null;
    xFollowers: number | null;
    xVerified: boolean;
    handleHistory: string[];
    nameHistory: string[];
    linkedTokenCount: number | null;
    knownAliases: string[];
  };
  walletGraph: {
    masterWallet: string;
    kycRootWallet: string | null;
    familySize: number;
    familyWallets: string[];
    linkedWallets: string[];
    upstreamWallets: string[];
    downstreamWallets: string[];
  };
  bestTokens: Array<{
    mint: string;
    symbol: string;
    name: string;
    tier: number | null;
    athMcap: number | null;
    athAt: string | null;
    mintedAt: string | null;
    isTierDefining: boolean;
  }>;
  careerStats: {
    totalLaunched: number | null;
    successful: number | null;
    graduated: number | null;
    rugged: number | null;
    abandoned: number | null;
    successRatePct: number | null;
    avgPeakMcapUsd: number | null;
    avgLifespanMins: number | null;
    typicalSellPct: number | null;
    trustLevel: string;
    reputationScore: number | null;
    compositeScore: number | null;
    archetype: string | null;
    patterns: Record<string, boolean>;
    flags: Record<string, boolean>;
  };
  social: {
    twitterAccounts: string[];
    telegramGroups: string[];
    discordServers: string[];
  };
  launchpadProfiles: Array<{
    platform: string;
    username: string | null;
    profileUrl: string | null;
    tokensCreated: number | null;
    tokensGraduated: number | null;
    tokensRugged: number | null;
    linkedX: string | null;
  }>;
  kolscan: { handle: string; url: string } | null;
  meta: {
    firstSeenAt: string | null;
    lastActivityAt: string | null;
    lastAnalyzedAt: string | null;
    lastAuditAt: string | null;
  };
}

export function useDevProfileCard(wallet?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['dev-profile-card', wallet],
    enabled: !!wallet && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('dev-profile-card', {
        body: { wallet },
      });
      if (error) throw error;
      return data as DevProfileDossier;
    },
  });
}