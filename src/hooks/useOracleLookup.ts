import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface OracleLookupResult {
  found: boolean;
  inputType: 'token' | 'wallet' | 'x_account' | 'unknown';
  resolvedWallet?: string;
  profile?: {
    id: string;
    displayName: string;
    masterWallet: string;
    kycVerified: boolean;
    tags: string[];
  };
  score: number;
  trafficLight: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE' | 'UNKNOWN';
  stats: {
    totalTokens: number;
    successfulTokens: number;
    failedTokens: number;
    rugPulls: number;
    slowDrains: number;
    avgLifespanHours: number;
  };
  network: {
    linkedWallets: string[];
    linkedXAccounts: string[];
    sharedMods: string[];
    relatedTokens: string[];
    devTeam?: { id: string; name: string };
  };
  blacklistStatus: {
    isBlacklisted: boolean;
    reason?: string;
    linkedEntities?: string[];
  };
  whitelistStatus: {
    isWhitelisted: boolean;
    reason?: string;
  };
  recommendation: string;
  meshLinksAdded: number;
  // New scan mode fields
  requiresScan?: boolean;
  scanMode?: 'deep' | 'quick' | 'spider';
  liveAnalysis?: {
    pattern: string;
    tokensAnalyzed: number;
    graduatedTokens: number;
    successRate: number;
  };
}

export const useOracleLookup = () => {
  const queryClient = useQueryClient();

  const lookupMutation = useMutation({
    mutationFn: async ({ input, scanMode }: { input: string; scanMode?: 'deep' | 'quick' | 'spider' }): Promise<OracleLookupResult> => {
      const { data, error } = await supabase.functions.invoke('oracle-unified-lookup', {
        body: { input, scanMode }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate mesh and classifications queries to show new data
      queryClient.invalidateQueries({ queryKey: ['oracle-mesh'] });
      queryClient.invalidateQueries({ queryKey: ['oracle-classifications'] });
    }
  });

  return {
    lookup: (input: string, scanMode?: 'deep' | 'quick' | 'spider') => lookupMutation.mutate({ input, scanMode }),
    lookupAsync: (input: string, scanMode?: 'deep' | 'quick' | 'spider') => lookupMutation.mutateAsync({ input, scanMode }),
    result: lookupMutation.data,
    isLoading: lookupMutation.isPending,
    error: lookupMutation.error,
    reset: lookupMutation.reset
  };
};

export const useOracleClassifications = (limit = 50) => {
  return useQuery({
    queryKey: ['oracle-classifications', limit],
    queryFn: async () => {
      // Get recent auto-classifications from blacklist
      const [blacklistResult, whitelistResult] = await Promise.all([
        supabase
          .from('pumpfun_blacklist')
          .select('*')
          .eq('auto_classified', true)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('pumpfun_whitelist')
          .select('*')
          .eq('auto_classified', true)
          .order('created_at', { ascending: false })
          .limit(limit)
      ]);

      const blacklist = (blacklistResult.data || []).map(entry => ({
        ...entry,
        type: 'blacklist' as const
      }));

      const whitelist = (whitelistResult.data || []).map(entry => ({
        ...entry,
        type: 'whitelist' as const
      }));

      // Combine and sort by date
      return [...blacklist, ...whitelist].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    staleTime: 30 * 1000 // 30 seconds
  });
};

export const useOracleBackfillStatus = () => {
  return useQuery({
    queryKey: ['oracle-backfill-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oracle_backfill_jobs')
        .select('*')
        .order('target_date', { ascending: false })
        .limit(30);

      if (error) throw error;
      
      // Calculate stats
      const jobs = data || [];
      const completed = jobs.filter(j => j.status === 'complete').length;
      const noArchive = jobs.filter(j => j.status === 'no_archive').length;
      const failed = jobs.filter(j => j.status === 'failed').length;
      const pending = jobs.filter(j => j.status === 'pending').length;
      const processing = jobs.filter(j => j.status === 'processing').length;
      
      const totalTokensScanned = jobs.reduce((sum, j) => sum + (j.tokens_scanned || 0), 0);
      const totalDevsDiscovered = jobs.reduce((sum, j) => sum + (j.new_devs_discovered || 0), 0);
      
      return {
        jobs,
        stats: {
          completed,
          noArchive,
          failed,
          pending,
          processing,
          totalTokensScanned,
          totalDevsDiscovered
        }
      };
    },
    refetchInterval: 60 * 1000 // Refetch every minute
  });
};

export const useOracleMesh = (entityId?: string, entityType?: string) => {
  return useQuery({
    queryKey: ['oracle-mesh', entityId, entityType],
    queryFn: async () => {
      let query = supabase
        .from('reputation_mesh')
        .select('*')
        .order('discovered_at', { ascending: false })
        .limit(100);

      if (entityId) {
        query = query.or(`source_id.eq.${entityId},linked_id.eq.${entityId}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: true,
    staleTime: 60 * 1000 // 1 minute
  });
};

export const useTriggerBackfill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { maxDaysPerRun?: number; startFromDate?: string }) => {
      const { data, error } = await supabase.functions.invoke('oracle-historical-backfill', {
        body: params
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oracle-backfill-status'] });
    }
  });
};

export const useTriggerAutoClassifier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { processNewTokens?: boolean; wallet?: string }) => {
      const { data, error } = await supabase.functions.invoke('oracle-auto-classifier', {
        body: params
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oracle-classifications'] });
    }
  });
};
