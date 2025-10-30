import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface IntegrityStats {
  tokensInTop10: number;
  tokensInTop50: number;
  tokensInTop200: number;
  avgRankAchieved: number | null;
  avgTimeInRankingsHours: number;
  integrityScore: number;
  trustLevel: string;
  totalTokensCreated: number;
  rugPullCount: number;
  failedTokens: number;
}

export const useDeveloperIntegrity = (developerId?: string) => {
  return useQuery({
    queryKey: ['developer-integrity', developerId],
    queryFn: async () => {
      if (!developerId) return null;

      const { data, error } = await supabase
        .from('developer_profiles')
        .select(`
          id,
          display_name,
          master_wallet_address,
          tokens_in_top_10_count,
          tokens_in_top_50_count,
          tokens_in_top_200_count,
          avg_token_rank_achieved,
          avg_time_in_rankings_hours,
          integrity_score,
          trust_level,
          total_tokens_created,
          rug_pull_count,
          failed_tokens,
          last_analysis_at
        `)
        .eq('id', developerId)
        .single();

      if (error) throw error;

      return {
        ...data,
        tokensInTop10: data.tokens_in_top_10_count || 0,
        tokensInTop50: data.tokens_in_top_50_count || 0,
        tokensInTop200: data.tokens_in_top_200_count || 0,
        avgRankAchieved: data.avg_token_rank_achieved,
        avgTimeInRankingsHours: data.avg_time_in_rankings_hours || 0,
        integrityScore: data.integrity_score || 50,
        trustLevel: data.trust_level || 'neutral',
        totalTokensCreated: data.total_tokens_created || 0,
        rugPullCount: data.rug_pull_count || 0,
        failedTokens: data.failed_tokens || 0
      } as IntegrityStats & typeof data;
    },
    enabled: !!developerId,
    staleTime: 5 * 60 * 1000
  });
};

export const useTopDevelopers = (limit = 20) => {
  return useQuery({
    queryKey: ['top-developers', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('developer_profiles')
        .select('*')
        .order('integrity_score', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000
  });
};
