import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClassificationResult {
  wallet: string;
  score: number;
  classification: 'blacklist' | 'whitelist' | 'neutral';
  reason: string;
  recommendation: string;
  stats: {
    totalTokens: number;
    rugPulls: number;
    slowDrains: number;
    successfulTokens: number;
    avgLifespanHours: number;
  };
}

function calculateScore(stats: ClassificationResult['stats']): number {
  let score = 50; // Base score
  
  // Negative signals
  score -= (stats.rugPulls || 0) * 30;
  score -= (stats.slowDrains || 0) * 20;
  if (stats.avgLifespanHours < 24 && stats.totalTokens > 0) score -= 15;
  if (stats.totalTokens > 0 && stats.rugPulls / stats.totalTokens > 0.5) score -= 20;
  
  // Positive signals
  score += (stats.successfulTokens || 0) * 15;
  if (stats.totalTokens > 5 && stats.successfulTokens / stats.totalTokens > 0.6) score += 20;
  if (stats.avgLifespanHours > 168) score += 10; // Week+ lifespan
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

function generateReason(stats: ClassificationResult['stats'], score: number): string {
  const reasons: string[] = [];
  
  if (stats.rugPulls > 0) reasons.push(`${stats.rugPulls} confirmed rug pulls`);
  if (stats.slowDrains > 0) reasons.push(`${stats.slowDrains} slow drain patterns`);
  if (stats.avgLifespanHours < 24 && stats.totalTokens > 2) reasons.push(`avg token lifespan ${stats.avgLifespanHours.toFixed(1)}hrs`);
  if (stats.successfulTokens > 2) reasons.push(`${stats.successfulTokens} successful tokens`);
  
  return reasons.join(', ') || 'Insufficient data';
}

function generateRecommendation(score: number, stats: ClassificationResult['stats']): string {
  if (score < 20) {
    return `🔴 SERIAL RUGGER - ${stats.rugPulls} confirmed rugs, ${stats.slowDrains} slow bleeds. AVOID at all costs.`;
  }
  if (score < 40) {
    return `🔴 HIGH RISK - ${stats.totalTokens - stats.successfulTokens} failed tokens. If you enter, treat as flip only. 2x max, exit fast.`;
  }
  if (score < 60) {
    return `🟡 CAUTION - Mixed history (${stats.successfulTokens}/${stats.totalTokens} success). Small positions, quick exit plan.`;
  }
  if (score < 80) {
    return `🟢 MODERATE TRUST - ${stats.successfulTokens} successful tokens. Standard due diligence applies.`;
  }
  return `🔵 VERIFIED BUILDER - ${stats.successfulTokens} successful tokens with ${stats.avgLifespanHours.toFixed(0)}hr avg lifespan. Lower risk.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { wallet, tokenMint, processNewTokens } = await req.json();
    
    const results: ClassificationResult[] = [];
    let walletsToProcess: string[] = [];

    if (processNewTokens) {
      // Get tokens not yet analyzed by Oracle
      const { data: unanalyzed } = await supabase
        .from('token_lifecycle')
        .select('token_mint, creator_wallet')
        .eq('oracle_analyzed', false)
        .not('creator_wallet', 'is', null)
        .limit(50);
      
      walletsToProcess = [...new Set((unanalyzed || []).map(t => t.creator_wallet).filter(Boolean))];
      console.log(`[AutoClassifier] Processing ${walletsToProcess.length} wallets from new tokens`);
    } else if (tokenMint) {
      // Get creator wallet for specific token
      const { data: lifecycle } = await supabase
        .from('token_lifecycle')
        .select('creator_wallet')
        .eq('token_mint', tokenMint)
        .single();
      
      if (lifecycle?.creator_wallet) {
        walletsToProcess = [lifecycle.creator_wallet];
      }
    } else if (wallet) {
      walletsToProcess = [wallet];
    }

    for (const walletAddress of walletsToProcess) {
      try {
        // Get developer stats
        const [profileResult, repResult, tokensResult] = await Promise.all([
          supabase
            .from('developer_profiles')
            .select('*')
            .eq('master_wallet_address', walletAddress)
            .maybeSingle(),
          supabase
            .from('dev_wallet_reputation')
            .select('*')
            .eq('wallet_address', walletAddress)
            .maybeSingle(),
          supabase
            .from('developer_tokens')
            .select('outcome, created_at')
            .eq('creator_wallet', walletAddress)
        ]);

        const profile = profileResult.data;
        const rep = repResult.data;
        const tokens = tokensResult.data || [];

        // Calculate stats
        const stats: ClassificationResult['stats'] = {
          totalTokens: profile?.total_tokens_created || tokens.length,
          rugPulls: profile?.rug_pull_count || rep?.rug_pull_count || 0,
          slowDrains: profile?.slow_drain_count || rep?.slow_drain_count || 0,
          successfulTokens: profile?.successful_tokens || tokens.filter(t => t.outcome === 'success').length,
          avgLifespanHours: profile?.avg_token_lifespan_hours || 0
        };

        const score = calculateScore(stats);
        const reason = generateReason(stats, score);
        const recommendation = generateRecommendation(score, stats);

        let classification: ClassificationResult['classification'] = 'neutral';

        // Auto-blacklist criteria
        if (score < 20 || stats.rugPulls > 0) {
          classification = 'blacklist';
          
          // Check if already blacklisted
          const { data: existing } = await supabase
            .from('pumpfun_blacklist')
            .select('id')
            .eq('wallet_address', walletAddress)
            .single();
          
          if (!existing) {
            await supabase
              .from('pumpfun_blacklist')
              .insert({
                wallet_address: walletAddress,
                entry_type: 'wallet',
                reason: reason,
                risk_level: score < 10 ? 'critical' : 'high',
                auto_classified: true,
                classification_score: score,
                recommendation_text: recommendation
              });
            console.log(`[AutoClassifier] Blacklisted wallet: ${walletAddress} (score: ${score})`);
          }
        }
        // Auto-whitelist criteria  
        else if (score > 70 && stats.successfulTokens >= 3) {
          classification = 'whitelist';
          
          // Check if already whitelisted
          const { data: existing } = await supabase
            .from('pumpfun_whitelist')
            .select('id')
            .eq('wallet_address', walletAddress)
            .single();
          
          if (!existing) {
            await supabase
              .from('pumpfun_whitelist')
              .insert({
                wallet_address: walletAddress,
                entry_type: 'wallet',
                notes: reason,
                auto_classified: true,
                classification_score: score,
                recommendation_text: recommendation
              });
            console.log(`[AutoClassifier] Whitelisted wallet: ${walletAddress} (score: ${score})`);
          }
        }

        // Update developer profile with score
        if (profile) {
          await supabase
            .from('developer_profiles')
            .update({ 
              reputation_score: score,
              updated_at: new Date().toISOString()
            })
            .eq('id', profile.id);
        }

        // Mark tokens as analyzed
        await supabase
          .from('token_lifecycle')
          .update({
            oracle_analyzed: true,
            oracle_analyzed_at: new Date().toISOString(),
            oracle_score: score
          })
          .eq('creator_wallet', walletAddress);

        results.push({
          wallet: walletAddress,
          score,
          classification,
          reason,
          recommendation,
          stats
        });

      } catch (walletError) {
        console.error(`[AutoClassifier] Error processing wallet ${walletAddress}:`, walletError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
        blacklisted: results.filter(r => r.classification === 'blacklist').length,
        whitelisted: results.filter(r => r.classification === 'whitelist').length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[AutoClassifier] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
