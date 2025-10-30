import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { developerId, recalculateAll } = await req.json();

    console.log('[Integrity] Calculating developer integrity scores');

    let developers = [];

    if (recalculateAll) {
      const { data } = await supabase
        .from('developer_profiles')
        .select('id, master_wallet_address');
      developers = data || [];
    } else if (developerId) {
      const { data } = await supabase
        .from('developer_profiles')
        .select('id, master_wallet_address')
        .eq('id', developerId);
      developers = data || [];
    }

    console.log(`[Integrity] Processing ${developers.length} developers`);

    for (const dev of developers) {
      try {
        // Get all tokens for this developer from token_lifecycle
        const { data: lifecycleTokens } = await supabase
          .from('token_lifecycle')
          .select('*')
          .eq('developer_id', dev.id);

        const tokens = lifecycleTokens || [];

        // Calculate stats
        const stats = {
          total: tokens.length,
          top10: tokens.filter(t => t.highest_rank && t.highest_rank <= 10).length,
          top50: tokens.filter(t => t.highest_rank && t.highest_rank <= 50).length,
          top200: tokens.filter(t => t.highest_rank && t.highest_rank <= 200).length,
          avgRank: tokens.length > 0 
            ? tokens.reduce((sum, t) => sum + (t.highest_rank || 200), 0) / tokens.length 
            : null,
          avgHours: tokens.length > 0
            ? tokens.reduce((sum, t) => sum + (t.total_hours_in_top_200 || 0), 0) / tokens.length
            : 0
        };

        // Get rug pull and failure data from developer_tokens
        const { data: devTokens } = await supabase
          .from('developer_tokens')
          .select('outcome, rug_pull_evidence')
          .eq('developer_id', dev.id);

        const rugPulls = (devTokens || []).filter(t => 
          t.outcome === 'rug_pull' || (t.rug_pull_evidence && Object.keys(t.rug_pull_evidence).length > 0)
        ).length;

        const failed = (devTokens || []).filter(t => 
          t.outcome === 'failed' || !t.is_active
        ).length;

        // Calculate integrity score (0-100)
        let score = 50; // Start neutral

        // Positive signals
        score += stats.top10 * 15;  // Each top 10 token: +15
        score += stats.top50 * 8;   // Each top 50 token: +8
        score += stats.top200 * 3;  // Each top 200 token: +3
        score += Math.min(stats.avgHours / 24, 20); // Up to +20 for longevity

        // Negative signals
        score -= rugPulls * 30;     // Each rug pull: -30
        score -= failed * 5;         // Each failed token: -5

        // Consistency bonus
        const successRate = stats.total > 0 ? stats.top200 / stats.total : 0;
        if (successRate > 0.5) score += 15;
        if (successRate > 0.75) score += 10;

        // Clamp to 0-100
        score = Math.max(0, Math.min(100, score));

        // Determine trust level
        let trustLevel = 'neutral';
        if (score >= 80) trustLevel = 'trusted';
        else if (score >= 60) trustLevel = 'verified';
        else if (score < 40) trustLevel = 'suspicious';
        if (rugPulls > 0 || score < 20) trustLevel = 'scammer';

        // Update developer profile
        await supabase
          .from('developer_profiles')
          .update({
            tokens_in_top_10_count: stats.top10,
            tokens_in_top_50_count: stats.top50,
            tokens_in_top_200_count: stats.top200,
            avg_token_rank_achieved: stats.avgRank,
            avg_time_in_rankings_hours: stats.avgHours,
            integrity_score: score,
            trust_level: trustLevel,
            total_tokens_created: stats.total,
            rug_pull_count: rugPulls,
            failed_tokens: failed,
            last_analysis_at: new Date().toISOString()
          })
          .eq('id', dev.id);

        console.log(`[Integrity] Updated ${dev.master_wallet_address.slice(0, 8)}: score=${score}, level=${trustLevel}`);

      } catch (error) {
        console.error(`[Integrity] Error processing developer ${dev.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: developers.length,
        message: 'Integrity scores calculated'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[Integrity] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
