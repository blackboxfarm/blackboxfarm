import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN LIFECYCLE MONITOR
 * 
 * Purpose: Track rejected tokens for 24 hours to identify missed opportunities
 * Schedule: Run every 5-10 minutes via cron
 * 
 * Actions:
 * - monitor: Check all recently rejected tokens for price changes
 * - stats: Get missed opportunity statistics
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

interface MonitorStats {
  tokensChecked: number;
  spikedCount: number;
  diedCount: number;
  missedOpportunities: number;
  updatedCount: number;
  errors: string[];
  durationMs: number;
}

// Batch fetch prices from Jupiter
async function batchFetchPrices(mints: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  
  if (mints.length === 0) return priceMap;

  try {
    const batchSize = 100;
    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize);
      const response = await fetch(`https://api.jup.ag/price/v2?ids=${batch.join(',')}`);
      const data = await response.json();
      
      for (const mint of batch) {
        if (data?.data?.[mint]?.price) {
          priceMap.set(mint, data.data[mint].price);
        }
      }
      
      if (i + batchSize < mints.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } catch (error) {
    console.error('Error batch fetching prices:', error);
  }

  return priceMap;
}

// Check liquidity status
async function checkLiquidity(mint: string): Promise<{ liquidityUsd: number | null; lpRemoved: boolean }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const data = await response.json();
    const pair = data?.pairs?.[0];
    
    if (!pair) {
      return { liquidityUsd: null, lpRemoved: true };
    }

    const liquidityUsd = pair.liquidity?.usd || 0;
    const lpRemoved = liquidityUsd < 500;
    
    return { liquidityUsd, lpRemoved };
  } catch {
    return { liquidityUsd: null, lpRemoved: false };
  }
}

// Main monitoring function
async function monitorRejectedTokens(supabase: any): Promise<MonitorStats> {
  const startTime = Date.now();
  const stats: MonitorStats = {
    tokensChecked: 0,
    spikedCount: 0,
    diedCount: 0,
    missedOpportunities: 0,
    updatedCount: 0,
    errors: [],
    durationMs: 0,
  };

  console.log('[Lifecycle Monitor] Starting rejected token monitoring...');

  // Get rejected tokens from last 24 hours that haven't been fully processed
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data: trackedTokens, error } = await supabase
    .from('token_lifecycle_tracking')
    .select('*, pumpfun_watchlist:token_mint(token_symbol, price_usd, creator_wallet, metadata)')
    .eq('our_decision', 'rejected')
    .is('outcome_type', null)
    .gte('our_decision_at', cutoffTime)
    .limit(50);

  if (error) {
    console.error('[Lifecycle Monitor] Fetch error:', error);
    stats.errors.push(error.message);
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  if (!trackedTokens?.length) {
    console.log('[Lifecycle Monitor] No rejected tokens to monitor');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  console.log(`[Lifecycle Monitor] Checking ${trackedTokens.length} rejected tokens`);

  // Batch fetch current prices
  const mints = trackedTokens.map((t: any) => t.token_mint);
  const priceMap = await batchFetchPrices(mints);

  for (const tracked of trackedTokens) {
    stats.tokensChecked++;

    try {
      const currentPrice = priceMap.get(tracked.token_mint);
      const priceAtDecision = tracked.price_at_decision || 0;

      if (!currentPrice || !priceAtDecision) {
        continue;
      }

      const priceChangeRatio = currentPrice / priceAtDecision;
      const timeElapsedMins = Math.floor((Date.now() - new Date(tracked.our_decision_at).getTime()) / 60000);

      let outcomeType: string | null = null;
      let wasMissedOpportunity = false;
      let peakPrice = tracked.price_at_peak || currentPrice;

      // Update peak price
      if (currentPrice > peakPrice) {
        peakPrice = currentPrice;
      }

      // Check for spike (2x+ from decision price)
      if (priceChangeRatio >= 2) {
        outcomeType = 'spiked';
        wasMissedOpportunity = true;
        stats.spikedCount++;
        stats.missedOpportunities++;
        console.log(`🚀 MISSED: ${tracked.pumpfun_watchlist?.token_symbol || tracked.token_mint.slice(0, 6)} went ${priceChangeRatio.toFixed(1)}x!`);
      }
      // Check for death (LP removed or < 10% of decision price)
      else if (priceChangeRatio < 0.1) {
        outcomeType = 'died';
        stats.diedCount++;
        console.log(`💀 DIED: ${tracked.pumpfun_watchlist?.token_symbol || tracked.token_mint.slice(0, 6)}`);

        // Update dev reputation for rug
        if (tracked.dev_wallet) {
          await supabase.functions.invoke('pumpfun-dev-tracker', {
            body: {
              action: 'update_on_rug',
              devWallet: tracked.dev_wallet,
              tokenMint: tracked.token_mint,
            }
          });
        }
      } else {
        // Check liquidity for potential LP removal
        const { lpRemoved } = await checkLiquidity(tracked.token_mint);
        if (lpRemoved) {
          outcomeType = 'died';
          stats.diedCount++;
          console.log(`🚰 LP REMOVED: ${tracked.pumpfun_watchlist?.token_symbol || tracked.token_mint.slice(0, 6)}`);
        }
      }

      // Calculate missed gain percentage
      const missedGainPct = wasMissedOpportunity ? ((peakPrice - priceAtDecision) / priceAtDecision * 100) : null;

      // Update tracking record
      const updateData: any = {
        price_at_peak: peakPrice,
        time_to_outcome_mins: outcomeType ? timeElapsedMins : null,
        updated_at: new Date().toISOString(),
      };

      if (outcomeType) {
        updateData.outcome_type = outcomeType;
        updateData.outcome_detected_at = new Date().toISOString();
        updateData.was_missed_opportunity = wasMissedOpportunity;
        updateData.missed_gain_pct = missedGainPct;
        updateData.price_at_death = outcomeType === 'died' ? currentPrice : null;
      }

      await supabase
        .from('token_lifecycle_tracking')
        .update(updateData)
        .eq('id', tracked.id);

      stats.updatedCount++;

    } catch (err) {
      console.error(`[Lifecycle Monitor] Error processing ${tracked.token_mint}:`, err);
      stats.errors.push(`${tracked.token_mint}: ${String(err)}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 100));
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`[Lifecycle Monitor] Complete: ${stats.tokensChecked} checked, ${stats.spikedCount} spiked, ${stats.diedCount} died, ${stats.missedOpportunities} missed (${stats.durationMs}ms)`);

  return stats;
}

// Get missed opportunity statistics
async function getMissedStats(supabase: any): Promise<any> {
  // Get recent missed opportunities
  const { data: missed, error } = await supabase
    .from('token_lifecycle_tracking')
    .select('*, pumpfun_watchlist:token_mint(token_symbol, token_name)')
    .eq('was_missed_opportunity', true)
    .order('missed_gain_pct', { ascending: false })
    .limit(20);

  if (error) {
    return { error: error.message };
  }

  // Calculate aggregate stats
  const { data: stats } = await supabase
    .from('token_lifecycle_tracking')
    .select('outcome_type, was_missed_opportunity')
    .not('outcome_type', 'is', null);

  const spikedCount = (stats || []).filter((s: any) => s.outcome_type === 'spiked').length;
  const diedCount = (stats || []).filter((s: any) => s.outcome_type === 'died').length;
  const missedCount = (stats || []).filter((s: any) => s.was_missed_opportunity).length;
  const totalTracked = (stats || []).length;

  const avgMissedGain = missed?.length > 0
    ? (missed.reduce((sum: number, m: any) => sum + (m.missed_gain_pct || 0), 0) / missed.length)
    : 0;

  return {
    totalTracked,
    spikedCount,
    diedCount,
    missedCount,
    avgMissedGainPct: avgMissedGain.toFixed(1),
    topMissed: missed?.slice(0, 10).map((m: any) => ({
      mint: m.token_mint,
      symbol: m.pumpfun_watchlist?.token_symbol,
      missedGainPct: m.missed_gain_pct?.toFixed(1),
      decisionReason: m.decision_reason,
    })),
  };
}

// Track a new rejected token
async function trackRejection(
  supabase: any,
  tokenMint: string,
  reason: string,
  priceAtDecision: number,
  devWallet: string
): Promise<any> {
  console.log(`[Lifecycle Monitor] Tracking rejection: ${tokenMint}, reason: ${reason}`);

  const { data, error } = await supabase
    .from('token_lifecycle_tracking')
    .upsert({
      token_mint: tokenMint,
      our_decision: 'rejected',
      decision_reason: reason,
      our_decision_at: new Date().toISOString(),
      price_at_decision: priceAtDecision,
      dev_wallet: devWallet,
    }, { onConflict: 'token_mint' })
    .select()
    .single();

  if (error) {
    console.error('[Lifecycle Monitor] Track error:', error);
    return { error: error.message };
  }

  return { success: true, tracked: data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'monitor';
    
    // Also accept action from body
    let bodyAction = action;
    let bodyData: any = {};
    try {
      bodyData = await req.json();
      if (bodyData.action) {
        bodyAction = bodyData.action;
      }
    } catch {
      // No body
    }

    console.log(`[Lifecycle Monitor] Action: ${bodyAction}`);

    let result;
    switch (bodyAction) {
      case 'monitor': {
        const stats = await monitorRejectedTokens(supabase);
        result = { success: true, stats };
        break;
      }

      case 'stats': {
        result = await getMissedStats(supabase);
        break;
      }

      case 'track_rejection': {
        const { tokenMint, reason, priceAtDecision, devWallet } = bodyData;
        if (!tokenMint) {
          return errorResponse('Missing tokenMint');
        }
        result = await trackRejection(supabase, tokenMint, reason, priceAtDecision || 0, devWallet);
        break;
      }

      default:
        return errorResponse(`Unknown action: ${bodyAction}`);
    }

    return jsonResponse(result);
  } catch (error) {
    console.error('[Lifecycle Monitor] Error:', error);
    return errorResponse(String(error), 500);
  }
});
