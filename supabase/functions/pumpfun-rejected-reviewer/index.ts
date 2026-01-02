import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN REJECTED REVIEWER
 * 
 * Purpose: Review SOFT rejected tokens for resurrection, permanently delete old ones
 * Schedule: Every 2-5 minutes via cron
 * 
 * Logic:
 * 1. Get tokens with status 'dead', 'bombed', or 'rejected' WHERE rejection_type = 'soft'
 * 2. Fetch current metrics for each (max 50 per run)
 * 3. Resurrection check: If socials added OR holders now >= 10 OR volume now >= 0.1 SOL -> back to 'watching'
 * 4. Permanent rejection: If removed_at > 2 hours ago OR no improvement seen -> set rejection_type = 'permanent'
 * 5. Database cleanup: Delete records where rejection_type = 'permanent' AND removed_at > 24 hours
 * 
 * IMPORTANT: NEVER resurrect tokens with rejection_type = 'permanent'
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
  permanentRejectReasons: Record<string, number>;
}

// Fetch token metrics
async function fetchTokenMetrics(mint: string): Promise<{ holders: number; volumeUsd: number; hasSocials: boolean } | null> {
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
    const token = data.token || {};
    
    // Check if socials have been added
    const hasSocials = !!(token.twitter || token.telegram || token.website);
    
    return {
      holders: data.holders || 0,
      volumeUsd: pool?.volume?.h24 || 0,
      hasSocials,
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
    soft_reject_resurrection_minutes: data?.soft_reject_resurrection_minutes ?? 90,
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
    permanentRejectReasons: {},
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

  // STEP 1: Review SOFT rejected tokens for resurrection
  // Only look at tokens rejected within the resurrection window
  const reevaluateCutoff = new Date(now.getTime() - config.soft_reject_resurrection_minutes * 60 * 1000).toISOString();
  
  const { data: softRejected, error: fetchError } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['dead', 'bombed', 'rejected'])
    .eq('rejection_type', 'soft') // ONLY soft rejects can be resurrected
    .gte('removed_at', reevaluateCutoff)
    .order('removed_at', { ascending: false })
    .limit(50);

  if (fetchError) {
    console.error('Error fetching soft rejected tokens:', fetchError);
    stats.errors++;
  }

  console.log(`📋 Reviewing ${softRejected?.length || 0} SOFT rejected tokens for resurrection`);

  for (const token of (softRejected || [])) {
    try {
      stats.tokensReviewed++;

      const metrics = await fetchTokenMetrics(token.token_mint);
      if (!metrics) {
        continue; // Skip if can't fetch, might still be valid
      }

      // Small delay for rate limiting
      await new Promise(r => setTimeout(r, 50));

      const volumeSol = solPrice > 0 ? metrics.volumeUsd / solPrice : 0;
      
      // Check resurrection criteria
      // 1. Socials were added (major positive signal)
      // 2. Holders grew above threshold
      // 3. Volume grew above threshold
      // 4. Dev wallet hasn't sold (we'll check this in monitor)
      const socialsAdded = metrics.hasSocials && (token.socials_count === 0);
      const holdersGrew = metrics.holders >= config.resurrection_holder_threshold;
      const volumeGrew = volumeSol >= config.resurrection_volume_threshold_sol;
      
      if (socialsAdded || holdersGrew || volumeGrew) {
        const resurrectionReason = [
          socialsAdded ? 'socials_added' : null,
          holdersGrew ? `holders:${metrics.holders}` : null,
          volumeGrew ? `volume:${volumeSol.toFixed(2)}SOL` : null,
        ].filter(Boolean).join(', ');
        
        const { error } = await supabase
          .from('pumpfun_watchlist')
          .update({
            status: 'watching',
            rejection_type: null,
            rejection_reason: null,
            rejection_reasons: null,
            removed_at: null,
            removal_reason: null,
            last_checked_at: now.toISOString(),
            holder_count: metrics.holders,
            volume_sol: volumeSol,
            socials_count: metrics.hasSocials ? (token.socials_count || 0) + 1 : token.socials_count,
            consecutive_stale_checks: 0,
            last_processor: 'rejected-reviewer',
            metadata: { 
              ...token.metadata, 
              resurrected_at: now.toISOString(),
              resurrection_reason: resurrectionReason,
              previous_rejection_reason: token.rejection_reason,
            },
          })
          .eq('id', token.id);

        if (!error) {
          stats.resurrected++;
          stats.resurrectedTokens.push(`${token.token_symbol} (${resurrectionReason})`);
          console.log(`🔄 RESURRECTED: ${token.token_symbol} - ${resurrectionReason}`);
        }
      }
    } catch (error) {
      console.error(`Error reviewing ${token.token_symbol}:`, error);
      stats.errors++;
    }
  }

  // STEP 2: Mark old soft rejected tokens as permanently rejected
  // Soft rejects that are past the resurrection window become permanent
  const softToPermanentCutoff = new Date(now.getTime() - config.soft_reject_resurrection_minutes * 60 * 1000).toISOString();
  
  const { count: convertedToPermanent, error: convertError } = await supabase
    .from('pumpfun_watchlist')
    .update({ 
      rejection_type: 'permanent',
      last_processor: 'rejected-reviewer',
    })
    .in('status', ['dead', 'bombed', 'rejected'])
    .eq('rejection_type', 'soft')
    .lt('removed_at', softToPermanentCutoff)
    .select('id', { count: 'exact', head: true });

  if (!convertError && convertedToPermanent) {
    console.log(`📌 Converted ${convertedToPermanent} soft rejects to permanent (past resurrection window)`);
    stats.permanentRejectReasons['past_resurrection_window'] = convertedToPermanent;
  }

  // STEP 3: Mark old dead/bombed tokens (with null rejection_type) as permanently rejected
  const deadCutoff = new Date(now.getTime() - config.dead_retention_hours * 60 * 60 * 1000).toISOString();
  
  const { count: permanentlyRejected, error: rejectError } = await supabase
    .from('pumpfun_watchlist')
    .update({ 
      rejection_type: 'permanent',
      permanent_reject: true, 
      last_processor: 'rejected-reviewer' 
    })
    .in('status', ['dead', 'bombed'])
    .lt('removed_at', deadCutoff)
    .or('rejection_type.is.null,rejection_type.neq.permanent')
    .select('id', { count: 'exact', head: true });

  if (!rejectError) {
    stats.permanentlyRejected = (permanentlyRejected || 0) + (convertedToPermanent || 0);
    if (permanentlyRejected) {
      console.log(`🚫 Permanently rejected ${permanentlyRejected} old dead/bombed tokens`);
      stats.permanentRejectReasons['dead_retention_exceeded'] = permanentlyRejected;
    }
  }

  // STEP 4: Delete very old permanently rejected tokens (24+ hours)
  const deleteCutoff = new Date(now.getTime() - config.log_retention_hours * 60 * 60 * 1000).toISOString();
  
  const { count: deleted, error: deleteError } = await supabase
    .from('pumpfun_watchlist')
    .delete()
    .in('status', ['dead', 'bombed', 'removed', 'rejected'])
    .eq('rejection_type', 'permanent')
    .lt('removed_at', deleteCutoff)
    .select('id', { count: 'exact', head: true });

  if (!deleteError) {
    stats.deleted = deleted || 0;
    if (stats.deleted > 0) {
      console.log(`🗑️ Deleted ${stats.deleted} old permanently rejected tokens`);
    }
  }

  // STEP 5: Also clean old discovery logs
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
        // Get counts of soft vs permanent rejects
        const { count: softCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .in('status', ['dead', 'bombed', 'rejected'])
          .eq('rejection_type', 'soft');

        const { count: permanentCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('rejection_type', 'permanent');

        const { count: nullTypeCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .in('status', ['dead', 'bombed', 'rejected'])
          .is('rejection_type', null);

        return jsonResponse({
          success: true,
          status: 'healthy',
          softRejects: softCount || 0,
          permanentRejects: permanentCount || 0,
          unclassified: nullTypeCount || 0,
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
