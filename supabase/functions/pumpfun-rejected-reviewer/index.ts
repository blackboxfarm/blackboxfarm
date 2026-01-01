import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN REJECTED REVIEWER
 * 
 * Purpose: Review rejected tokens for resurrection, permanently delete old ones
 * Schedule: Every 2-5 minutes via cron
 * 
 * Logic:
 * 1. Get tokens with status 'dead' or 'bombed' where removed_at is within last 30 minutes
 * 2. Fetch current metrics for each (max 50 per run)
 * 3. Resurrection check: If holders now >= 10 OR volume now >= 0.1 SOL -> back to 'watching'
 * 4. Permanent rejection: If removed_at > 2 hours ago -> set permanent_reject = true
 * 5. Database cleanup: Delete records where permanent_reject = true AND removed_at > 24 hours
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

interface ReviewerStats {
  tokensReviewed: number;
  resurrected: number;
  permanentlyRejected: number;
  deleted: number;
  errors: number;
  durationMs: number;
  resurrectedTokens: string[];
}

// Fetch token metrics
async function fetchTokenMetrics(mint: string): Promise<{ holders: number; volumeUsd: number } | null> {
  const apiKey = Deno.env.get('SOLANA_TRACKER_API_KEY');
  
  try {
    const response = await fetch(
      `https://data.solanatracker.io/tokens/${mint}`,
      {
        headers: {
          'x-api-key': apiKey || '',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const pool = data.pools?.[0];
    
    return {
      holders: data.holders || 0,
      volumeUsd: pool?.volume?.h24 || 0,
    };
  } catch (error) {
    console.error(`Error fetching metrics for ${mint}:`, error);
    return null;
  }
}

// Get current SOL price
async function getSolPrice(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from('sol_price_cache')
      .select('price_usd')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    return data?.price_usd || 200;
  } catch {
    return 200;
  }
}

// Get config
async function getConfig(supabase: any) {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .single();

  return {
    is_enabled: data?.is_enabled ?? true,
    log_retention_hours: data?.log_retention_hours ?? 24,
    dead_retention_hours: data?.dead_retention_hours ?? 2,
    max_reevaluate_minutes: data?.max_reevaluate_minutes ?? 30,
    resurrection_holder_threshold: data?.resurrection_holder_threshold ?? 10,
    resurrection_volume_threshold_sol: data?.resurrection_volume_threshold_sol ?? 0.1,
  };
}

// Main review logic
async function reviewRejectedTokens(supabase: any): Promise<ReviewerStats> {
  const startTime = Date.now();
  const stats: ReviewerStats = {
    tokensReviewed: 0,
    resurrected: 0,
    permanentlyRejected: 0,
    deleted: 0,
    errors: 0,
    durationMs: 0,
    resurrectedTokens: [],
  };

  console.log('🔄 REJECTED REVIEWER: Starting review cycle...');

  const config = await getConfig(supabase);
  if (!config.is_enabled) {
    console.log('⏸️ Monitor disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  const solPrice = await getSolPrice(supabase);
  const now = new Date();

  // STEP 1: Review recently dead/bombed tokens for resurrection
  const reevaluateCutoff = new Date(now.getTime() - config.max_reevaluate_minutes * 60 * 1000).toISOString();
  
  const { data: recentlyDead, error: fetchError } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['dead', 'bombed'])
    .eq('permanent_reject', false)
    .gte('removed_at', reevaluateCutoff)
    .order('removed_at', { ascending: false })
    .limit(50);

  if (fetchError) {
    console.error('Error fetching recently dead tokens:', fetchError);
    stats.errors++;
  }

  console.log(`📋 Reviewing ${recentlyDead?.length || 0} recently rejected tokens`);

  for (const token of (recentlyDead || [])) {
    try {
      stats.tokensReviewed++;

      const metrics = await fetchTokenMetrics(token.token_mint);
      if (!metrics) {
        continue; // Skip if can't fetch, might still be valid
      }

      // Small delay for rate limiting
      await new Promise(r => setTimeout(r, 50));

      const volumeSol = solPrice > 0 ? metrics.volumeUsd / solPrice : 0;

      // Resurrection check
      if (metrics.holders >= config.resurrection_holder_threshold || volumeSol >= config.resurrection_volume_threshold_sol) {
        const { error } = await supabase
          .from('pumpfun_watchlist')
          .update({
            status: 'watching',
            removed_at: null,
            removal_reason: null,
            last_checked_at: now.toISOString(),
            holder_count: metrics.holders,
            volume_sol: volumeSol,
            consecutive_stale_checks: 0,
            last_processor: 'rejected-reviewer',
            metadata: { 
              ...token.metadata, 
              resurrected_at: now.toISOString(),
              resurrection_reason: `Holders: ${metrics.holders}, Volume: ${volumeSol.toFixed(2)} SOL`
            },
          })
          .eq('id', token.id);

        if (!error) {
          stats.resurrected++;
          stats.resurrectedTokens.push(`${token.token_symbol} (${metrics.holders} holders, ${volumeSol.toFixed(2)} SOL)`);
          console.log(`🔄 RESURRECTED: ${token.token_symbol} - ${metrics.holders} holders, ${volumeSol.toFixed(2)} SOL`);
        }
      }
    } catch (error) {
      console.error(`Error reviewing ${token.token_symbol}:`, error);
      stats.errors++;
    }
  }

  // STEP 2: Mark old dead tokens as permanently rejected
  const deadCutoff = new Date(now.getTime() - config.dead_retention_hours * 60 * 60 * 1000).toISOString();
  
  const { count: permanentlyRejected, error: rejectError } = await supabase
    .from('pumpfun_watchlist')
    .update({ permanent_reject: true, last_processor: 'rejected-reviewer' })
    .in('status', ['dead', 'bombed'])
    .lt('removed_at', deadCutoff)
    .eq('permanent_reject', false)
    .select('id', { count: 'exact', head: true });

  if (!rejectError) {
    stats.permanentlyRejected = permanentlyRejected || 0;
    if (stats.permanentlyRejected > 0) {
      console.log(`🚫 Permanently rejected ${stats.permanentlyRejected} old tokens`);
    }
  }

  // STEP 3: Delete very old permanently rejected tokens (24+ hours)
  const deleteCutoff = new Date(now.getTime() - config.log_retention_hours * 60 * 60 * 1000).toISOString();
  
  const { count: deleted, error: deleteError } = await supabase
    .from('pumpfun_watchlist')
    .delete()
    .in('status', ['dead', 'bombed', 'removed'])
    .eq('permanent_reject', true)
    .lt('removed_at', deleteCutoff)
    .select('id', { count: 'exact', head: true });

  if (!deleteError) {
    stats.deleted = deleted || 0;
    if (stats.deleted > 0) {
      console.log(`🗑️ Deleted ${stats.deleted} old permanently rejected tokens`);
    }
  }

  // STEP 4: Also clean old discovery logs
  const logCutoff = new Date(now.getTime() - config.log_retention_hours * 60 * 60 * 1000).toISOString();
  await supabase
    .from('pumpfun_discovery_logs')
    .delete()
    .lt('created_at', logCutoff);

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 REVIEWER COMPLETE: ${stats.tokensReviewed} reviewed, ${stats.resurrected} resurrected, ${stats.permanentlyRejected} permanent, ${stats.deleted} deleted (${stats.durationMs}ms)`);

  return stats;
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
    const action = url.searchParams.get('action') || 'review';

    console.log(`🎯 pumpfun-rejected-reviewer action: ${action}`);

    switch (action) {
      case 'review': {
        const stats = await reviewRejectedTokens(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'status': {
        const { count: deadCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .in('status', ['dead', 'bombed'])
          .eq('permanent_reject', false);

        const { count: permanentCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('permanent_reject', true);

        return jsonResponse({
          success: true,
          status: 'healthy',
          pendingReview: deadCount || 0,
          permanentlyRejected: permanentCount || 0,
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-rejected-reviewer:', error);
    return errorResponse(String(error), 500);
  }
});
