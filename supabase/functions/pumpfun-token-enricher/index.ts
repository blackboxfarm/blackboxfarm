import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2000;

interface WatchlistToken {
  id: string;
  token_mint: string;
  token_symbol: string;
  status: string;
  holder_count: number | null;
  bundle_score: number | null;
  bonding_curve_pct: number | null;
  market_cap_sol: number | null;
}

// Analyze token risk (bundle detection)
async function analyzeTokenRisk(mint: string): Promise<{ bundleScore: number; details: any }> {
  try {
    const response = await fetch(`https://data.solanatracker.io/tokens/${mint}/holders`);
    if (!response.ok) {
      return { bundleScore: 0, details: { error: 'Failed to fetch holders' } };
    }
    
    const data = await response.json();
    const holders = Array.isArray(data) ? data : (data.holders || []);
    
    if (!Array.isArray(holders) || holders.length === 0) {
      return { bundleScore: 0, details: { holderCount: 0 } };
    }
    
    // Calculate supply concentration
    const totalSupply = holders.reduce((sum: number, h: any) => sum + (h.amount || 0), 0);
    const top5Holdings = holders.slice(0, 5).reduce((sum: number, h: any) => sum + (h.amount || 0), 0);
    const top5Percent = totalSupply > 0 ? (top5Holdings / totalSupply) * 100 : 0;
    
    // High concentration = higher bundle score
    let bundleScore = 0;
    if (top5Percent > 80) bundleScore = 90;
    else if (top5Percent > 60) bundleScore = 70;
    else if (top5Percent > 40) bundleScore = 50;
    else if (top5Percent > 20) bundleScore = 30;
    else bundleScore = 10;
    
    return {
      bundleScore,
      details: {
        holderCount: holders.length,
        top5Percent: top5Percent.toFixed(2),
      }
    };
  } catch (error) {
    console.error(`Error analyzing risk for ${mint}:`, error);
    return { bundleScore: 0, details: { error: String(error) } };
  }
}

// Fetch token data from Solana Tracker
async function fetchTokenData(mint: string): Promise<any> {
  try {
    const response = await fetch(`https://data.solanatracker.io/tokens/${mint}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error fetching token data for ${mint}:`, error);
    return null;
  }
}

// Fetch token data from pump.fun API for price/volume
async function fetchPumpFunData(mint: string): Promise<any> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error fetching pump.fun data for ${mint}:`, error);
    return null;
  }
}

// Get config from database
async function getConfig(supabase: any) {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
    
  return {
    max_bundle_score: data?.max_bundle_score ?? 70,
    min_holder_count: data?.min_holder_count ?? 10,
    max_token_age_minutes: data?.max_token_age_minutes ?? 60,
    bonding_curve_min: data?.bonding_curve_min ?? 5,
    bonding_curve_max: data?.bonding_curve_max ?? 95,
  };
}

// Process a batch of pending tokens
async function enrichTokenBatch(
  supabase: any,
  tokens: WatchlistToken[],
  config: any
): Promise<{ enriched: number; promoted: number; rejected: number }> {
  let enriched = 0;
  let promoted = 0;
  let rejected = 0;
  
  for (const token of tokens) {
    console.log(`\n📊 Enriching: ${token.token_symbol} (${token.token_mint.slice(0, 8)}...)`);
    
    // Fetch current token data from both APIs
    const tokenData = await fetchTokenData(token.token_mint);
    const pumpData = await fetchPumpFunData(token.token_mint);
    
    // Extract price/volume from pump.fun API
    const priceUsd = pumpData?.usd_market_cap && pumpData?.total_supply 
      ? pumpData.usd_market_cap / (pumpData.total_supply / 1e6) 
      : null;
    const volumeSol = pumpData?.volume_24h || 0;
    const marketCapUsd = pumpData?.usd_market_cap || null;
    const liquidityUsd = pumpData?.virtual_sol_reserves 
      ? (pumpData.virtual_sol_reserves / 1e9) * (pumpData?.sol_price || 150) 
      : null;
    
    console.log(`   Price: $${priceUsd?.toFixed(8) || 'N/A'}, Volume: ${volumeSol} SOL, MCap: $${marketCapUsd || 'N/A'}`);
    
    // Check token age if we have blockchain creation time
    const createdAt = tokenData?.events?.createdAt || (pumpData?.created_timestamp ? pumpData.created_timestamp / 1000 : null);
    if (createdAt) {
      const ageMinutes = (Date.now() - createdAt * 1000) / 60000;
      if (ageMinutes > config.max_token_age_minutes) {
        console.log(`   ⏭️ Token too old: ${ageMinutes.toFixed(0)}m (max: ${config.max_token_age_minutes}m)`);
        
        await supabase
          .from('pumpfun_watchlist')
          .update({
            status: 'rejected',
            rejection_reason: 'token_too_old',
            removed_at: new Date().toISOString(),
            price_usd: priceUsd,
            volume_sol: volumeSol,
            market_cap_usd: marketCapUsd,
            liquidity_usd: liquidityUsd,
            last_checked_at: new Date().toISOString(),
          })
          .eq('id', token.id);
          
        rejected++;
        continue;
      }
    }
    
    // Analyze bundle risk
    const { bundleScore, details } = await analyzeTokenRisk(token.token_mint);
    console.log(`   Bundle Score: ${bundleScore} (${JSON.stringify(details)})`);
    
    // Extract data
    const holderCount = tokenData?.holders || details.holderCount || token.holder_count || 0;
    const marketCapSol = tokenData?.pools?.[0]?.marketCap?.quote || token.market_cap_sol || 0;
    const bondingCurve = pumpData?.bonding_curve_progress 
      ? pumpData.bonding_curve_progress * 100 
      : (tokenData?.pools?.[0]?.curvePercentage || token.bonding_curve_pct || 0);
    
    // Check rejection criteria
    let shouldReject = false;
    let rejectionReason = '';
    
    if (bundleScore > config.max_bundle_score) {
      shouldReject = true;
      rejectionReason = `bundle_score_${bundleScore}`;
      console.log(`   ❌ Bundle score too high: ${bundleScore} > ${config.max_bundle_score}`);
    }
    
    if (shouldReject) {
      await supabase
        .from('pumpfun_watchlist')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          bundle_score: bundleScore,
          holder_count: holderCount,
          market_cap_sol: marketCapSol,
          bonding_curve_pct: bondingCurve,
          price_usd: priceUsd,
          price_ath_usd: priceUsd, // Set ATH to current price on first check
          volume_sol: volumeSol,
          market_cap_usd: marketCapUsd,
          liquidity_usd: liquidityUsd,
          removed_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', token.id);
        
      rejected++;
    } else {
      // Promote to watching
      await supabase
        .from('pumpfun_watchlist')
        .update({
          status: 'watching',
          bundle_score: bundleScore,
          holder_count: holderCount,
          market_cap_sol: marketCapSol,
          bonding_curve_pct: bondingCurve,
          price_usd: priceUsd,
          price_start_usd: priceUsd, // Set start price when entering watching
          price_ath_usd: priceUsd, // Set ATH to current price on first check
          volume_sol: volumeSol,
          market_cap_usd: marketCapUsd,
          liquidity_usd: liquidityUsd,
          last_checked_at: new Date().toISOString(),
          created_at_blockchain: createdAt ? new Date(createdAt * 1000).toISOString() : null,
        })
        .eq('id', token.id);
        
      console.log(`   ✅ Promoted to watching`);
      promoted++;
    }
    
    enriched++;
    
    // Small delay between tokens
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return { enriched, promoted, rejected };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'enrich';

    if (action === 'enrich') {
      console.log('🔄 Starting token enrichment...');
      
      const config = await getConfig(supabase);
      console.log('Config:', config);
      
      // Get pending_triage tokens
      const { data: pendingTokens, error } = await supabase
        .from('pumpfun_watchlist')
        .select('id, token_mint, token_symbol, status, holder_count, bundle_score, bonding_curve_pct, market_cap_sol')
        .eq('status', 'pending_triage')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);
        
      if (error) {
        throw new Error(`Failed to fetch pending tokens: ${error.message}`);
      }
      
      if (!pendingTokens || pendingTokens.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No pending tokens to enrich',
          stats: { enriched: 0, promoted: 0, rejected: 0 }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`Found ${pendingTokens.length} pending tokens`);
      
      const stats = await enrichTokenBatch(supabase, pendingTokens, config);
      
      console.log('\n📊 Enrichment Summary:');
      console.log(`   Enriched: ${stats.enriched}`);
      console.log(`   Promoted: ${stats.promoted}`);
      console.log(`   Rejected: ${stats.rejected}`);
      
      return new Response(JSON.stringify({
        success: true,
        stats
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'status') {
      // Get counts by status
      const { data: statusCounts } = await supabase
        .from('pumpfun_watchlist')
        .select('status')
        .in('status', ['pending_triage', 'watching', 'rejected', 'qualified', 'dead']);
        
      const counts = {
        pending_triage: 0,
        watching: 0,
        rejected: 0,
        qualified: 0,
        dead: 0,
      };
      
      statusCounts?.forEach((row: any) => {
        if (row.status in counts) {
          counts[row.status as keyof typeof counts]++;
        }
      });
      
      return new Response(JSON.stringify({
        success: true,
        counts
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Unknown action',
      validActions: ['enrich', 'status']
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
